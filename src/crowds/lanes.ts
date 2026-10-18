// Lane geometry: thread 17's CROWD_LANES resolved through the anchor registry, sampled every metre with the free
// lateral space left after keep-out circles and structure footprints. Pure; no three.js scene work.
import type { Anchor } from '../region/coreTypes';
import type { StructureSpec } from '../region/layoutTypes';
import type { CrowdLane } from '../harrowmark/harrowmark.layout';
import { CROWD_TUNING } from './tuning';

export type Interval = [number, number];

export type Obstacle =
  | { kind: 'circle'; id: string; x: number; z: number; r: number }
  /** Footprint box; `yaw` in radians like three's rotation.y. */
  | { kind: 'box'; id: string; x: number; z: number; hx: number; hz: number; yaw: number };

export interface LaneSample {
  x: number;
  y: number;
  z: number;
  /** Unit tangent in the lane's forward direction. */
  tx: number;
  tz: number;
  /**
   * Unit normal to the lane's right as seen on screen. three.js is right-handed with y up, so a figure facing north (+Z)
   * has its right hand on -X: the normal is (-tz, tx).
   */
  nx: number;
  nz: number;
  /** Free lateral intervals (metres along the normal), already smoothed over neighbouring samples. */
  free: Interval[];
}

export interface Lane {
  id: string;
  /** The `<name>` in `harrowmark.lane.<name>`. */
  name: string;
  loop: boolean;
  halfWidth: number;
  length: number;
  samples: LaneSample[];
  /** Arc lengths (sample indices) with no free lateral space: the lane clips a building or a keep-out. */
  blocked: number[];
}

export const laneName = (id: string): string => id.replace(/^harrowmark\.lane\./, '');

/** Lateral interval of the line `c + n l` inside the obstacle grown by `pad`, or null. */
export function blockedInterval(o: Obstacle, cx: number, cz: number, nx: number, nz: number, pad: number): Interval | null {
  if (o.kind === 'circle') {
    const dx = cx - o.x;
    const dz = cz - o.z;
    const b = dx * nx + dz * nz;
    const r = o.r + pad;
    const disc = b * b - (dx * dx + dz * dz) + r * r;
    if (disc <= 0) return null;
    const s = Math.sqrt(disc);
    return [-b - s, -b + s];
  }
  // Into the box's frame (inverse of three's rotation.y).
  const c = Math.cos(o.yaw);
  const s = Math.sin(o.yaw);
  const dx = cx - o.x;
  const dz = cz - o.z;
  const px = dx * c - dz * s;
  const pz = dx * s + dz * c;
  const vx = nx * c - nz * s;
  const vz = nx * s + nz * c;
  let lo = -Infinity;
  let hi = Infinity;
  const slab = (p: number, v: number, h: number): boolean => {
    if (Math.abs(v) < 1e-9) return Math.abs(p) < h;
    let t0 = (-h - p) / v;
    let t1 = (h - p) / v;
    if (t0 > t1) [t0, t1] = [t1, t0];
    lo = Math.max(lo, t0);
    hi = Math.min(hi, t1);
    return lo < hi;
  };
  if (!slab(px, vx, o.hx + pad) || !slab(pz, vz, o.hz + pad)) return null;
  return [lo, hi];
}

/** `[lo, hi]` minus the union of `cuts`, sorted. */
export function subtract(lo: number, hi: number, cuts: Interval[]): Interval[] {
  const sorted = cuts.filter((c) => c[1] > lo && c[0] < hi).sort((a, b) => a[0] - b[0]);
  const out: Interval[] = [];
  let at = lo;
  for (const [a, b] of sorted) {
    if (a > at) out.push([at, Math.min(a, hi)]);
    at = Math.max(at, b);
    if (at >= hi) break;
  }
  if (at < hi) out.push([at, hi]);
  return out.filter((i) => i[1] - i[0] > 1e-6);
}

export function intersect(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const lo = Math.max(a[i][0], b[j][0]);
    const hi = Math.min(a[i][1], b[j][1]);
    if (hi > lo) out.push([lo, hi]);
    if (a[i][1] < b[j][1]) i++;
    else j++;
  }
  return out;
}

/** The value inside `free` nearest to `v`; `v` itself when free is empty. */
export function clampToFree(free: readonly Interval[], v: number): number {
  let best = v;
  let bestD = Infinity;
  for (const [lo, hi] of free) {
    if (v >= lo && v <= hi) return v;
    const c = v < lo ? lo : hi;
    const d = Math.abs(c - v);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** Keep-out circles from tagged anchors (elevated anchors stand on roofs and never block a street). */
export function anchorObstacles(find: (tag: string) => Anchor[], radii: Record<string, number> = CROWD_TUNING.keepOut): Obstacle[] {
  const out = new Map<string, Obstacle>();
  for (const [tag, r] of Object.entries(radii)) {
    for (const a of find(tag)) {
      if (a.tags?.includes('elevated')) continue;
      const prev = out.get(a.id);
      if (prev && prev.kind === 'circle' && prev.r >= r) continue;
      out.set(a.id, { kind: 'circle', id: a.id, x: a.position.x, z: a.position.z, r });
    }
  }
  return [...out.values()];
}

/** Every structure footprint blocks; structures standing on a roof (`inside`) do not reach the street. */
export function structureObstacles(structures: readonly StructureSpec[]): Obstacle[] {
  return structures
    .filter((s) => !s.inside)
    .map((s) => ({ kind: 'box', id: s.id, x: s.x, z: s.z, hx: s.footprint[0] / 2, hz: s.footprint[1] / 2, yaw: (s.yawDeg * Math.PI) / 180 }));
}

/** M06's stealth ground: the checkpoint boxes and the M06 patrol nodes. Enforced only while the gate is guarded. */
export function guardedObstacles(find: (tag: string) => Anchor[]): Obstacle[] {
  const g = CROWD_TUNING.guardedKeepOut;
  const out: Obstacle[] = [];
  for (const a of find('stealth')) out.push({ kind: 'box', id: a.id, x: a.position.x, z: a.position.z, hx: g.stealthHalf, hz: g.stealthHalf, yaw: 0 });
  for (const a of find('patrol')) if (a.id.startsWith(g.patrolPrefix)) out.push({ kind: 'circle', id: a.id, x: a.position.x, z: a.position.z, r: g.patrolRadius });
  return out;
}

const obstacleReach = (o: Obstacle): number => (o.kind === 'circle' ? o.r : Math.hypot(o.hx, o.hz));

/**
 * Resolves and samples one lane. Throws on a missing anchor (the lane belongs to thread 17's layout; a missing point is
 * a layout bug, not something to walk around).
 */
export function buildLane(
  def: CrowdLane,
  findAnchor: (id: string) => Anchor | undefined,
  obstacles: readonly Obstacle[],
  heightAt: (x: number, z: number) => number,
): Lane {
  const t = CROWD_TUNING;
  const pts = def.points.map((id) => {
    const a = findAnchor(id);
    if (!a) throw new Error(`crowds: lane ${def.id} needs anchor "${id}"`);
    return { x: a.position.x, z: a.position.z };
  });
  if (pts.length < 2) throw new Error(`crowds: lane ${def.id} has fewer than two points`);
  if (def.loop) pts.push(pts[0]);
  const segLen: number[] = [];
  let length = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    segLen.push(l);
    length += l;
  }
  // Only obstacles that can reach the lane's band.
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const near = obstacles.filter((o) => {
    const m = obstacleReach(o) + def.halfWidth + t.bodyRadius;
    return o.x >= minX - m && o.x <= maxX + m && o.z >= minZ - m && o.z <= maxZ + m;
  });

  const lim = def.halfWidth - t.laneEdgeMargin;
  const count = def.loop ? Math.max(1, Math.round(length / t.sampleStep)) : Math.max(1, Math.round(length / t.sampleStep)) + 1;
  const step = def.loop ? length / count : length / (count - 1);
  const raw: Array<Omit<LaneSample, 'free'> & { free: Interval[] }> = [];
  let seg = 0;
  let segStart = 0;
  for (let k = 0; k < count; k++) {
    const s = Math.min(k * step, length);
    while (seg < segLen.length - 1 && s > segStart + segLen[seg]) {
      segStart += segLen[seg];
      seg++;
    }
    const a = pts[seg];
    const b = pts[seg + 1];
    const u = segLen[seg] > 0 ? (s - segStart) / segLen[seg] : 0;
    const x = a.x + (b.x - a.x) * u;
    const z = a.z + (b.z - a.z) * u;
    const tx = (b.x - a.x) / (segLen[seg] || 1);
    const tz = (b.z - a.z) / (segLen[seg] || 1);
    const nx = -tz;
    const nz = tx;
    const cuts: Interval[] = [];
    for (const o of near) {
      const c = blockedInterval(o, x, z, nx, nz, t.bodyRadius);
      if (c) cuts.push(c);
    }
    raw.push({ x, y: heightAt(x, z), z, tx, tz, nx, nz, free: subtract(-lim, lim, cuts) });
  }
  const samples: LaneSample[] = raw.map((r, k) => {
    let free = r.free;
    for (let d = -t.smoothSamples; d <= t.smoothSamples && free.length; d++) {
      if (d === 0) continue;
      let j = k + d;
      if (def.loop) j = (j + count) % count;
      else if (j < 0 || j >= count) continue;
      const f = intersect(free, raw[j].free);
      // Narrow passages keep the raw free space rather than closing: the hard clamp still uses it.
      if (f.length) free = f;
    }
    return { ...r, free };
  });
  const blocked = samples.map((s, k) => (s.free.length ? -1 : k)).filter((k) => k >= 0);
  return { id: def.id, name: laneName(def.id), loop: def.loop, halfWidth: def.halfWidth, length, samples, blocked };
}

/** Index of the sample at arc length `s` (clamped or wrapped). */
export function sampleIndex(lane: Lane, s: number): number {
  const n = lane.samples.length;
  const step = lane.loop ? lane.length / n : lane.length / Math.max(1, n - 1);
  if (!(step > 0)) return 0;
  let k = Math.round(s / step);
  if (lane.loop) k = ((k % n) + n) % n;
  else k = Math.max(0, Math.min(n - 1, k));
  return k;
}

/** World position at arc length `s` and lateral `l` (writes into `out`). */
export function lanePoint(lane: Lane, s: number, l: number, out: { x: number; y: number; z: number }): typeof out {
  const n = lane.samples.length;
  const step = lane.loop ? lane.length / n : lane.length / Math.max(1, n - 1);
  let f = step > 0 ? s / step : 0;
  if (lane.loop) f = ((f % n) + n) % n;
  else f = Math.max(0, Math.min(n - 1, f));
  const i = Math.floor(f);
  const j = lane.loop ? (i + 1) % n : Math.min(n - 1, i + 1);
  const u = f - i;
  const a = lane.samples[i];
  const b = lane.samples[j];
  const nx = a.nx + (b.nx - a.nx) * u;
  const nz = a.nz + (b.nz - a.nz) * u;
  const nl = Math.hypot(nx, nz) || 1;
  out.x = a.x + (b.x - a.x) * u + (nx / nl) * l;
  out.z = a.z + (b.z - a.z) * u + (nz / nl) * l;
  out.y = a.y + (b.y - a.y) * u;
  return out;
}
