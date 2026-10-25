// Fits against the shaped ground (K1's heightfield): the sub-sites K1 gave no pad (the Greywatch posts' ladders, the M24
// mud flats, the ferry jetties, the Mere shore) are found once at module load by deterministic searches, so they follow
// K1's fit when it changes. `fit.test.ts` re-checks every result on the real ground.
import { heightAt } from '../terrain/heightfield';
import type { XZ } from './sites';

export type HeightFn = (x: number, z: number) => number;

/** Largest minus smallest ground height under a w x d axis box centred on (x, z), sampled every `step` m. */
export function footprintSpread(h: HeightFn, x: number, z: number, w: number, d: number, step = 1): number {
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

/** Candidates on rings round `from`, nearest first (4 m apart along each ring). */
function* spiral(from: XZ, maxR: number, minR = 0, step = 4): Generator<XZ> {
  if (minR === 0) yield { x: from.x, z: from.z };
  for (let r = Math.max(step, minR); r <= maxR; r += step) {
    const n = Math.max(6, Math.round((2 * Math.PI * r) / step));
    for (let k = 0; k < n; k++) {
      const t = (k / n) * Math.PI * 2;
      yield { x: Math.round(from.x + Math.cos(t) * r), z: Math.round(from.z + Math.sin(t) * r) };
    }
  }
}

/** The nearest w x d box to `want` whose ground spread is at most `maxSpread` and whose ground passes `accept`. */
export function fitFlat(want: XZ, w: number, d: number, opts: { maxSpread?: number; maxR?: number; accept?: (y: number) => boolean; h?: HeightFn } = {}): XZ {
  const h = opts.h ?? heightAt;
  const maxSpread = opts.maxSpread ?? 0.2;
  for (const p of spiral(want, opts.maxR ?? 80)) {
    if (opts.accept && !opts.accept(h(p.x, p.z))) continue;
    if (footprintSpread(h, p.x, p.z, w, d) <= maxSpread) return p;
  }
  throw new Error(`greyfen: no ${w} x ${d} m flat ground near (${want.x}, ${want.z})`);
}

/** Up to `n` spots `minGap` apart, nearest `from` first, each a flat `size` box whose ground passes `accept`. */
export function fitSpots(from: XZ, n: number, size: number, accept: (y: number) => boolean, opts: { minGap?: number; minR?: number; maxR?: number; maxSpread?: number; h?: HeightFn } = {}): XZ[] {
  const h = opts.h ?? heightAt;
  const out: XZ[] = [];
  for (const p of spiral(from, opts.maxR ?? 250, opts.minR ?? 0)) {
    if (!accept(h(p.x, p.z))) continue;
    if (out.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < (opts.minGap ?? 10))) continue;
    if (footprintSpread(h, p.x, p.z, size, size) > (opts.maxSpread ?? 0.3)) continue;
    out.push(p);
    if (out.length === n) return out;
  }
  throw new Error(`greyfen: found ${out.length} of ${n} spots near (${from.x}, ${from.z})`);
}

/** The first point from `from` towards `to` (0.5 m steps, at most `max` m) whose ground passes `test`, or null. */
export function firstAlong(from: XZ, to: XZ, test: (y: number) => boolean, max = 200, h: HeightFn = heightAt): (XZ & { s: number }) | null {
  const len = Math.hypot(to.x - from.x, to.z - from.z);
  const ux = (to.x - from.x) / len;
  const uz = (to.z - from.z) / len;
  for (let s = 0; s <= Math.min(max, len); s += 0.5) {
    const x = from.x + ux * s;
    const z = from.z + uz * s;
    if (test(h(x, z))) return { x, z, s };
  }
  return null;
}

export interface JettyFit {
  /** The landward end: the ground there is at the deck height. */
  land: XZ;
  /** The water end: at least `minDepth` of water under it. */
  water: XZ;
  /** Unit direction from land to water. */
  dir: XZ;
  length: number;
}

/**
 * A jetty for a ferry stop. A stop in the water runs a jetty from it to the first ground at the deck height towards
 * `land`; a stop on dry ground runs one out towards `seaward` until the water is `minDepth` deep.
 */
export function fitJetty(stop: XZ, land: XZ, seaward: XZ, deck: number, waterY: number, minDepth: number, h: HeightFn = heightAt): JettyFit {
  const wet = h(stop.x, stop.z) <= waterY - minDepth;
  let landEnd: XZ;
  let waterEnd: XZ;
  if (wet) {
    const shore = firstAlong(stop, land, (y) => y >= deck, 80, h);
    if (!shore) throw new Error(`greyfen: no shore within 80 m of the ferry stop (${stop.x}, ${stop.z})`);
    landEnd = shore;
    waterEnd = stop;
  } else {
    const edge = firstAlong(stop, seaward, (y) => y < deck - 0.05, 120, h);
    const deep = edge && firstAlong(edge, seaward, (y) => y <= waterY - minDepth, 80, h);
    if (!edge || !deep) throw new Error(`greyfen: no water within reach of the ferry stop (${stop.x}, ${stop.z})`);
    landEnd = edge;
    const ux = (seaward.x - stop.x) / Math.hypot(seaward.x - stop.x, seaward.z - stop.z);
    const uz = (seaward.z - stop.z) / Math.hypot(seaward.x - stop.x, seaward.z - stop.z);
    waterEnd = { x: deep.x + ux * 2, z: deep.z + uz * 2 };
  }
  const length = Math.hypot(waterEnd.x - landEnd.x, waterEnd.z - landEnd.z);
  return { land: landEnd, water: waterEnd, dir: { x: (waterEnd.x - landEnd.x) / length, z: (waterEnd.z - landEnd.z) / length }, length };
}
