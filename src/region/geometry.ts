// Footprint maths shared by the validator and the structure builder, so what the validator proves
// walkable is exactly what gets built.
import type { StructureSpec } from './layoutTypes';

export const WALL_THICKNESS = 0.6;
const DEG = Math.PI / 180;

export interface Box2 {
  cx: number;
  cz: number;
  hx: number;
  hz: number;
}

export function footprintBox(s: StructureSpec): Box2 {
  return { cx: s.x, cz: s.z, hx: s.footprint[0] / 2, hz: s.footprint[1] / 2 };
}

/** True when (x, z) is inside the structure's (possibly rotated) footprint grown by `margin`. */
export function pointInFootprint(s: StructureSpec, x: number, z: number, margin = 0): boolean {
  const yaw = s.yawDeg * DEG;
  const dx = x - s.x;
  const dz = z - s.z;
  // Local axes: +x rotates with yaw about Y (yaw 0 faces +Z, local x is world +X).
  const c = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const lx = dx * c - dz * sn;
  const lz = dx * sn + dz * c;
  return Math.abs(lx) <= s.footprint[0] / 2 + margin && Math.abs(lz) <= s.footprint[1] / 2 + margin;
}

export function footprintCorners(s: StructureSpec): Array<[number, number]> {
  const yaw = s.yawDeg * DEG;
  const c = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const hx = s.footprint[0] / 2;
  const hz = s.footprint[1] / 2;
  return ([[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]] as Array<[number, number]>).map(([lx, lz]) => [
    s.x + lx * c + lz * sn,
    s.z - lx * sn + lz * c,
  ]);
}

/** Separating-axis test between two rotated footprints (touching edges do not overlap). */
export function footprintsOverlap(a: StructureSpec, b: StructureSpec): boolean {
  const ca = footprintCorners(a);
  const cb = footprintCorners(b);
  const axes: Array<[number, number]> = [];
  for (const [s, ang] of [[a, a.yawDeg * DEG], [b, b.yawDeg * DEG]] as const) {
    void s;
    axes.push([Math.cos(ang), -Math.sin(ang)], [Math.sin(ang), Math.cos(ang)]);
  }
  for (const [ax, az] of axes) {
    const pa = ca.map(([x, z]) => x * ax + z * az);
    const pb = cb.map(([x, z]) => x * ax + z * az);
    if (Math.max(...pa) <= Math.min(...pb) + 1e-9 || Math.max(...pb) <= Math.min(...pa) + 1e-9) return false;
  }
  return true;
}

/** True when every corner of `inner` lies inside `outer`. */
export function footprintWithin(inner: StructureSpec, outer: StructureSpec): boolean {
  return footprintCorners(inner).every(([x, z]) => pointInFootprint(outer, x, z, 1e-9));
}

/** World position of the doorway centre in an enterable structure's wall (yaw 0 only). */
export function doorCentre(s: StructureSpec): { x: number; z: number } | null {
  if (!s.door) return null;
  const { hx, hz } = footprintBox(s);
  switch (s.door.side) {
    case 'W':
      return { x: s.x - hx, z: s.z };
    case 'E':
      return { x: s.x + hx, z: s.z };
    case 'S':
      return { x: s.x, z: s.z - hz };
    case 'N':
      return { x: s.x, z: s.z + hz };
  }
}

/** Wall segments of an enterable structure with the doorway left open (axis aligned, yaw 0). */
export function wallBoxes(s: StructureSpec): Box2[] {
  if (s.mode !== 'enterable') return [];
  const { cx, cz, hx, hz } = footprintBox(s);
  const t = WALL_THICKNESS / 2;
  const doorSide = s.door?.side;
  const half = (s.door?.width ?? 0) / 2;
  const walls: Box2[] = [];
  const horizontal = (side: 'N' | 'S') => {
    const z = side === 'N' ? cz + hz - t : cz - hz + t;
    if (doorSide === side) {
      const w = hx - half;
      walls.push({ cx: cx - half - w / 2, cz: z, hx: w / 2, hz: t }, { cx: cx + half + w / 2, cz: z, hx: w / 2, hz: t });
    } else walls.push({ cx, cz: z, hx, hz: t });
  };
  const vertical = (side: 'E' | 'W') => {
    const x = side === 'E' ? cx + hx - t : cx - hx + t;
    if (doorSide === side) {
      const d = hz - half;
      walls.push({ cx: x, cz: cz - half - d / 2, hx: t, hz: d / 2 }, { cx: x, cz: cz + half + d / 2, hx: t, hz: d / 2 });
    } else walls.push({ cx: x, cz, hx: t, hz });
  };
  horizontal('N');
  horizontal('S');
  vertical('E');
  vertical('W');
  return walls;
}

/** The box the Door collider fills while the door is shut (same thickness as the walls). */
export function doorFillBox(s: StructureSpec): Box2 | null {
  const c = doorCentre(s);
  if (!c || !s.door) return null;
  const half = s.door.width / 2;
  const t = WALL_THICKNESS / 2;
  const alongX = s.door.side === 'N' || s.door.side === 'S';
  const inset = s.door.side === 'E' ? -t : s.door.side === 'W' ? t : 0;
  const insetZ = s.door.side === 'N' ? -t : s.door.side === 'S' ? t : 0;
  return alongX
    ? { cx: c.x, cz: c.z + insetZ, hx: half, hz: t }
    : { cx: c.x + inset, cz: c.z, hx: t, hz: half };
}
