// The flatness search behind `sitesFit.ts`: sub-sites that A1 gave no plateau (the hunters' camp, the hound den, the Kindling
// Dell, the fog hollows) are picked once, against the real `heightAt`, by `tools/fit-cinderreach-sites.ts`, and the winners are
// committed. Pure and deterministic: the same ground gives the same answer. `sitesFit.test.ts` re-checks every committed result.
export type HeightFn = (x: number, z: number) => number;
export interface Pt {
  x: number;
  z: number;
}
export interface Avoid extends Pt {
  r: number;
}

/** Largest minus smallest ground height under a w x d axis-aligned footprint centred on (x, z), sampled every `step` m. */
export function footprintSpread(h: HeightFn, x: number, z: number, w: number, d: number, step = 2): number {
  let lo = Infinity;
  let hi = -Infinity;
  const nx = Math.max(1, Math.ceil(w / step));
  const nz = Math.max(1, Math.ceil(d / step));
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= nz; j++) {
      const y = h(x - w / 2 + (w * i) / nx, z - d / 2 + (d * j) / nz);
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
  }
  return hi - lo;
}

export interface FlatQuery {
  prefer: Pt;
  radius: number;
  size: [number, number];
  maxSpread: number;
  /** Keep the whole footprint (plus this margin) at least this far from every avoided circle. */
  avoid?: Avoid[];
  /** Search box (inclusive); candidates outside it are skipped. */
  within?: { minX: number; maxX: number; minZ: number; maxZ: number };
  step?: number;
}

/** The candidate nearest `prefer` whose footprint spread is within `maxSpread`; null when none is. Ties go to the lowest x then z. */
export function findFlat(h: HeightFn, q: FlatQuery): Pt | null {
  const step = q.step ?? 5;
  const reach = Math.hypot(q.size[0], q.size[1]) / 2;
  let best: Pt | null = null;
  let bestD = Infinity;
  for (let dx = -q.radius; dx <= q.radius; dx += step) {
    for (let dz = -q.radius; dz <= q.radius; dz += step) {
      const x = q.prefer.x + dx;
      const z = q.prefer.z + dz;
      const dist = Math.hypot(dx, dz);
      if (dist > q.radius || dist >= bestD) continue;
      const w = q.within;
      if (w && (x - q.size[0] / 2 < w.minX || x + q.size[0] / 2 > w.maxX || z - q.size[1] / 2 < w.minZ || z + q.size[1] / 2 > w.maxZ)) continue;
      if (q.avoid?.some((a) => Math.hypot(x - a.x, z - a.z) < a.r + reach)) continue;
      if (footprintSpread(h, x, z, q.size[0], q.size[1]) > q.maxSpread) continue;
      best = { x, z };
      bestD = dist;
    }
  }
  return best;
}

/** How far below its surroundings a point sits: mean ground height on a ring of `radius` minus the ground at the point. */
export function dipDepth(h: HeightFn, x: number, z: number, radius: number): number {
  let sum = 0;
  const n = 12;
  for (let k = 0; k < n; k++) sum += h(x + radius * Math.cos((k * 2 * Math.PI) / n), z + radius * Math.sin((k * 2 * Math.PI) / n));
  return sum / n - h(x, z);
}

export interface DipQuery {
  box: { minX: number; maxX: number; minZ: number; maxZ: number };
  count: number;
  /** Chosen dips are at least this far apart. */
  minSeparation: number;
  radius: number;
  step?: number;
  avoid?: Avoid[];
  /** When set, the footprint (w, d) under the dip must also be this flat. */
  flat?: { size: [number, number]; maxSpread: number };
}

/** The `count` deepest dips in the box, deepest first, kept `minSeparation` apart. Fewer when the box has no more. */
export function findDips(h: HeightFn, q: DipQuery): Array<Pt & { depth: number }> {
  const step = q.step ?? 10;
  const cands: Array<Pt & { depth: number }> = [];
  for (let x = q.box.minX + q.radius; x <= q.box.maxX - q.radius; x += step) {
    for (let z = q.box.minZ + q.radius; z <= q.box.maxZ - q.radius; z += step) {
      if (q.avoid?.some((a) => Math.hypot(x - a.x, z - a.z) < a.r)) continue;
      if (q.flat && footprintSpread(h, x, z, q.flat.size[0], q.flat.size[1]) > q.flat.maxSpread) continue;
      cands.push({ x, z, depth: dipDepth(h, x, z, q.radius) });
    }
  }
  cands.sort((a, b) => b.depth - a.depth || a.x - b.x || a.z - b.z);
  const out: Array<Pt & { depth: number }> = [];
  for (const c of cands) {
    if (out.length >= q.count) break;
    if (out.every((o) => Math.hypot(o.x - c.x, o.z - c.z) >= q.minSeparation)) out.push(c);
  }
  return out;
}

/** How many cells of a disc (every `cell` m) can hold a `size` x `size` footprint spread within `maxSpread`. */
export function flatCells(h: HeightFn, c: Pt, radius: number, size: number, maxSpread: number, cell = 8): number {
  let n = 0;
  for (let dx = -radius; dx <= radius; dx += cell) {
    for (let dz = -radius; dz <= radius; dz += cell) {
      if (Math.hypot(dx, dz) <= radius && footprintSpread(h, c.x + dx, c.z + dz, size, size) <= maxSpread) n++;
    }
  }
  return n;
}

/** The centre in a search disc with the most flat cells in a disc of `radius` (ties: nearest `prefer`). For scatters of small props. */
export function findScatterCentre(h: HeightFn, prefer: Pt, searchRadius: number, radius: number, size: number, maxSpread: number, step = 20): Pt & { cells: number } {
  let best: (Pt & { cells: number }) | null = null;
  let bestDist = Infinity;
  for (let dx = -searchRadius; dx <= searchRadius; dx += step) {
    for (let dz = -searchRadius; dz <= searchRadius; dz += step) {
      const dist = Math.hypot(dx, dz);
      if (dist > searchRadius) continue;
      const c = { x: prefer.x + dx, z: prefer.z + dz };
      const cells = flatCells(h, c, radius, size, maxSpread);
      if (!best || cells > best.cells || (cells === best.cells && dist < bestDist)) {
        best = { ...c, cells };
        bestDist = dist;
      }
    }
  }
  return best!;
}
