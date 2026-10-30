// Harrowmark's ring wall: a circle of 56 chords around the city centre, seven gates, five of them plugged and two with shutters.
// Plain data and maths only (no THREE), so the layout, the validator and the tests share it.
import type { StructureSpec } from '../region/layoutTypes';

export const CENTER = { x: 8500, z: 2000 } as const;
/** Wall centreline radius: the South Gate sits at (8500, 1250), on the plateau's south edge. */
export const RING_RADIUS = 750;
export const WALL_THICKNESS = 4;
export const WALL_HEIGHT = 9;
export const TOWER_HEIGHT = 12;
/** Nothing of the city may stand beyond this radius (the wall's outer face is 752). */
export const MAX_STRUCTURE_RADIUS = 756;
export const CHORDS = 56;
export const GATE_GAP = 12;
/** Chord vertices lie on this circle, so each chord's midpoint (where a gate sits) is exactly RING_RADIUS out. */
const VERTEX_RADIUS = RING_RADIUS / Math.cos(Math.PI / 56);
export const GATE_COUNT = 7;

/** Gate ids by bearing step from south; `south` is the only through-way. */
export const GATE_NAMES = ['south', 'smelter', 'west', 'northwest', 'northeast', 'river', 'guild'] as const;
export type GateName = (typeof GATE_NAMES)[number];

/** Compass bearing (0 = north/+Z, 90 = east/+X) of a gate seen from the centre. */
export const gateBearing = (i: number): number => 180 + (i * 360) / GATE_COUNT;

/** Point at `bearing` degrees and radius `r` from the centre. */
export function polar(bearing: number, r: number): { x: number; z: number } {
  const b = (bearing * Math.PI) / 180;
  return { x: CENTER.x + r * Math.sin(b), z: CENTER.z + r * Math.cos(b) };
}

/** Compass heading that faces away from the centre at `bearing` (outward) or towards it (inward). */
export const outward = (bearing: number): number => ((bearing % 360) + 360) % 360;
export const inward = (bearing: number): number => (((bearing + 180) % 360) + 360) % 360;

/** yawDeg for a box whose local x runs from (ax, az) to (bx, bz): local x is world (cos yaw, -sin yaw). */
export function yawAlong(ax: number, az: number, bx: number, bz: number): number {
  const deg = (Math.atan2(-(bz - az), bx - ax) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

export const gatePosition = (name: GateName, r = RING_RADIUS): { x: number; z: number } =>
  polar(gateBearing(GATE_NAMES.indexOf(name)), r);

const round = (n: number) => Math.round(n * 100) / 100;

/** The wall pieces, gate towers, the five plugs and the two shutters. Structure ids: `wall.<n>`, `tower.<gate>-l|r`, `plug.<gate>`, `portcullis.south|river`. */
export function wallStructures(): StructureSpec[] {
  const out: StructureSpec[] = [];
  const step = 360 / CHORDS;
  // Gates are on chord midpoints: chord k spans half a step either side of bearing 180 + k * step, and 56 / 7 = 8.
  const gateAt = new Map<number, GateName>();
  GATE_NAMES.forEach((g, i) => gateAt.set((i * CHORDS) / GATE_COUNT, g));
  for (let k = 0; k < CHORDS; k++) {
    const b0 = 180 + (k - 0.5) * step;
    const b1 = b0 + step;
    const p0 = polar(b0, VERTEX_RADIUS);
    const p1 = polar(b1, VERTEX_RADIUS);
    const len = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    const yaw = yawAlong(p0.x, p0.z, p1.x, p1.z);
    const gate = gateAt.get(k);
    const piece = (id: string, from: number, to: number) => {
      const t0 = from / len;
      const t1 = to / len;
      const ax = p0.x + (p1.x - p0.x) * t0;
      const az = p0.z + (p1.z - p0.z) * t0;
      const bx = p0.x + (p1.x - p0.x) * t1;
      const bz = p0.z + (p1.z - p0.z) * t1;
      out.push({ id, kind: 'wall', x: round((ax + bx) / 2), z: round((az + bz) / 2), yawDeg: round(yaw), footprint: [round(to - from), WALL_THICKNESS], mode: 'solid', height: WALL_HEIGHT });
    };
    if (!gate) {
      piece(`wall.${k}`, 0, len);
      continue;
    }
    const half = len / 2;
    const towerW = 8;
    piece(`wall.${k}a`, 0, half - GATE_GAP / 2 - towerW);
    piece(`wall.${k}b`, half + GATE_GAP / 2 + towerW, len);
    const mid = gatePosition(gate);
    const dirx = (p1.x - p0.x) / len;
    const dirz = (p1.z - p0.z) / len;
    const off = GATE_GAP / 2 + towerW / 2;
    for (const [side, s] of [['l', -1], ['r', 1]] as const) {
      out.push({
        id: `tower.${gate}-${side}`,
        kind: 'tower',
        x: round(mid.x + dirx * off * s),
        z: round(mid.z + dirz * off * s),
        yawDeg: round(yaw),
        footprint: [towerW, 7],
        mode: 'solid',
        height: TOWER_HEIGHT,
      });
    }
    // The South Gate's passage is the portcullis (gate.ts) and the River Gate's the second shutter (opens at the end of Act 1);
    // Act 3 (K1) gives the North-west Gate a shutter onto the Fen Road (opens with Act 3); the other four are plugged for good.
    const shutter = gate === 'south' ? PORTCULLIS_ID : gate === 'river' ? RIVER_PORTCULLIS_ID : gate === 'northwest' ? NORTHWEST_PORTCULLIS_ID : null;
    out.push({
      id: shutter ?? `plug.${gate}`,
      kind: shutter ? 'gate' : 'wall',
      x: round(mid.x),
      z: round(mid.z),
      yawDeg: round(yaw),
      footprint: [GATE_GAP, 2.4],
      mode: 'solid',
      height: 6,
    });
  }
  return out;
}

export const PORTCULLIS_ID = 'portcullis.south';
export const RIVER_PORTCULLIS_ID = 'portcullis.river';
/** Act 3 (K1): the Fen Road's gate. */
export const NORTHWEST_PORTCULLIS_ID = 'portcullis.northwest';
/** The gate pieces with a switch (cityBuild's setShutter). */
export const SHUTTER_IDS: readonly string[] = [PORTCULLIS_ID, RIVER_PORTCULLIS_ID, NORTHWEST_PORTCULLIS_ID];
