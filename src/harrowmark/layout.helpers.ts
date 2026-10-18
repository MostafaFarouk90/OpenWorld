import type { AnchorSpec, StructureSpec } from '../region/layoutTypes';

/** Anchor with a compass heading (0 faces north/+Z, 90 east/+X); stored as the engine yaw (heading + 180). */
export const a = (id: string, x: number, z: number, heading: number, tags: string[] = [], rest: Partial<AnchorSpec> = {}): AnchorSpec => ({
  id,
  x,
  z,
  yawDeg: (heading + 180) % 360,
  tags,
  ...rest,
});

/** A solid, axis-aligned building. */
export const solid = (id: string, kind: StructureSpec['kind'], x: number, z: number, w: number, d: number, height: number, yawDeg = 0): StructureSpec => ({
  id,
  kind,
  x,
  z,
  yawDeg,
  footprint: [w, d],
  mode: 'solid',
  height,
});

/** Decoration with no collider (columns, fences). */
export const open = (id: string, kind: StructureSpec['kind'], x: number, z: number, w: number, d: number, height: number, yawDeg = 0): StructureSpec => ({
  ...solid(id, kind, x, z, w, d, height, yawDeg),
  mode: 'open',
});

/** Points (x, z) as numbered anchors `<prefix>.<n>` starting at 1. */
export function numbered(prefix: string, pts: ReadonlyArray<readonly [number, number]>, tags: string[] = [], heading = 0, rest: Partial<AnchorSpec> = {}): AnchorSpec[] {
  return pts.map(([x, z], i) => a(`${prefix}.${i + 1}`, x, z, heading, tags, rest));
}

/**
 * A flight of steps climbing `rise` metres over `steps` boxes of depth `run` along +dir (dir 'N','S','E','W' is the
 * direction of travel upward). The first step is at (x, z); each step is a solid box as high as the stairs have climbed.
 * Rises of at most 0.36 m are walked by the controller's auto-step.
 */
export function stairs(id: string, x: number, z: number, dir: 'N' | 'S' | 'E' | 'W', rise: number, width: number, run = 1): StructureSpec[] {
  const n = Math.ceil(rise / 0.36);
  const out: StructureSpec[] = [];
  const dx = dir === 'E' ? run : dir === 'W' ? -run : 0;
  const dz = dir === 'N' ? run : dir === 'S' ? -run : 0;
  for (let k = 1; k <= n; k++) {
    const alongX = dir === 'E' || dir === 'W';
    out.push(solid(`${id}.${k}`, 'stair-step', x + dx * (k - 1), z + dz * (k - 1), alongX ? run : width, alongX ? width : run, (rise * k) / n));
  }
  return out;
}
