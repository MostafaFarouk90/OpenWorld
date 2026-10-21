// Small layout builders (same shapes as src/harrowmark/layout.helpers.ts, copied so nothing here imports Harrowmark's code).
import type { AnchorSpec, StructureSpec, TriggerSpec } from '../region/layoutTypes';

const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Anchor with a compass heading (0 faces north/+Z, 90 east/+X); stored as the engine yaw (heading + 180). */
export const a = (id: string, x: number, z: number, heading = 0, tags: string[] = [], rest: Partial<AnchorSpec> = {}): AnchorSpec => ({
  id,
  x: r2(x),
  z: r2(z),
  yawDeg: (heading + 180) % 360,
  tags,
  ...rest,
});

/** Points as numbered anchors `<prefix>.<n>` from 1. */
export const numbered = (prefix: string, pts: ReadonlyArray<readonly [number, number]>, tags: string[] = [], heading = 0, rest: Partial<AnchorSpec> = {}): AnchorSpec[] =>
  pts.map(([x, z], i) => a(`${prefix}.${i + 1}`, x, z, heading, tags, rest));

export const solid = (id: string, kind: StructureSpec['kind'], x: number, z: number, w: number, d: number, height?: number, yawDeg = 0): StructureSpec => ({
  id,
  kind,
  x: r2(x),
  z: r2(z),
  yawDeg,
  footprint: [w, d],
  mode: 'solid',
  ...(height === undefined ? {} : { height }),
});

/** Decoration with no collider. */
export const open = (id: string, kind: StructureSpec['kind'], x: number, z: number, w: number, d: number, height?: number, yawDeg = 0): StructureSpec => ({
  ...solid(id, kind, x, z, w, d, height, yawDeg),
  mode: 'open',
});

/** A Leap ledge: a solid rock column 1.8 m above the highest ground within 1 m, 6 x 5 on top. */
export const ledge = (id: string, x: number, z: number, yawDeg = 0): StructureSpec => ({
  id,
  kind: 'rock',
  x: r2(x),
  z: r2(z),
  yawDeg,
  footprint: [6, 5],
  mode: 'solid',
  height: 1.8,
  role: 'ledge',
});

export const sphere = (id: string, x: number, z: number, radius: number, once = false): TriggerSpec => ({ id, shape: 'sphere', x: r2(x), z: r2(z), radius, ...(once ? { once } : {}) });
export const box = (id: string, x: number, z: number, hx: number, hy: number, hz: number, yawDeg = 0): TriggerSpec => ({
  id,
  shape: 'box',
  x: r2(x),
  z: r2(z),
  half: [hx, hy, hz],
  ...(yawDeg ? { yawDeg } : {}),
});

/** A point `dist` m from (x, z) along compass `heading`. */
export const polar = (x: number, z: number, heading: number, dist: number): readonly [number, number] => {
  const r = (heading * Math.PI) / 180;
  return [x + dist * Math.sin(r), z + dist * Math.cos(r)];
};

/** `n` points evenly on a circle of `radius` round (x, z), starting at compass `from`. */
export const ring = (x: number, z: number, radius: number, n: number, from = 0): Array<readonly [number, number]> =>
  Array.from({ length: n }, (_, i) => polar(x, z, from + (360 * i) / n, radius));
