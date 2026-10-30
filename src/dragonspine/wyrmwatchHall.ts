// Wyrmwatch Hall (greybox): one long room with a dais, Thorgar's table, a cold hearth (lit in PR 2), a trophy wall and two side
// benches. It floats over K1's `wyrmwatch-hall` pad (an exactly flat pad on the lodge plateau), laid out from the pad's own
// footprint so the rooms always stand over it. Local metres from the door, yaw 0 faces -Z.
import type { InteriorDef, LocalRect } from '../interiors/types';
import { INTERIOR_EDGE, INTERIOR_ENTRY, type InteriorPad } from './inputs';

export const WYRMWATCH_HALL_ID = 'wyrmwatch-hall';
export const WYRMWATCH_HALL_DOOR_ID = 'wyrmwatch-hall';

const rect = (x0: number, z0: number, x1: number, z1: number): LocalRect => ({ x0, z0, x1, z1 });
/** Margin kept between the rooms and the pad's edge (the ground range is read 1 m beyond the rooms). */
const EDGE = INTERIOR_EDGE;
/** The hall must be at least this wide and deep, or the pad is too small for it. */
const MIN_HALL_WIDTH = 14;
const MIN_HALL_DEPTH = 9;
/** Heights inside the interior, metres above its own floor (local, not terrain). */
const TORCH_H = 3.4;
const PORCH_TORCH_H = 2.6;
const TRIGGER_CENTRE_H = 3;
const TRIGGER_HALF_H = 4;

export function buildHallDef(pad: InteriorPad): InteriorDef {
  const lx0 = pad.footprint.minX - pad.site.x + EDGE;
  const lx1 = pad.footprint.maxX - pad.site.x - EDGE;
  const lz0 = pad.footprint.minZ - pad.site.z + EDGE;
  const lz1 = pad.footprint.maxZ - pad.site.z - EDGE;
  const x0 = Math.max(lx0, -9);
  const x1 = Math.min(lx1, 9);
  const z0 = Math.max(lz0, -34);
  const porchZ1 = Math.min(lz1, INTERIOR_ENTRY);
  const hallZ1 = -3;
  if (porchZ1 < INTERIOR_ENTRY) throw new Error(`dragonspine: the wyrmwatch-hall pad is too small: its entry reaches only ${porchZ1} m past the origin`);
  if (x1 - x0 < MIN_HALL_WIDTH || hallZ1 - z0 < MIN_HALL_DEPTH) {
    throw new Error(`dragonspine: the wyrmwatch-hall pad is too small for the hall (${x1 - x0} m wide, ${hallZ1 - z0} m deep; needs ${MIN_HALL_WIDTH} x ${MIN_HALL_DEPTH})`);
  }
  const mid = (z0 + hallZ1) / 2;
  const hearthZ0 = hallZ1 - 3.6;
  return {
    id: WYRMWATCH_HALL_ID,
    site: { x: pad.site.x, z: pad.site.z },
    rooms: [
      { id: 'porch', x0: -4, z0: hallZ1, x1: 4, z1: porchZ1, height: 4 },
      { id: 'hall', x0, z0, x1, z1: hallZ1, height: 7 },
    ],
    pillars: [],
    props: [
      { id: 'dais.1', rect: rect(-5, z0, 5, z0 + 3), height: 0.4, walkable: true },
      { id: 'table.1', rect: rect(-1.4, z0 + 3.6, 1.4, z0 + 5.8), height: 0.9 },
      { id: 'hearth.1', rect: rect(-1.5, hearthZ0, 1.5, hearthZ0 + 2), height: 0.5 },
      { id: 'bench.1', rect: rect(x0 + 0.4, mid - 4, x0 + 1.6, mid + 4), height: 0.5 },
      { id: 'bench.2', rect: rect(x1 - 1.6, mid - 4, x1 - 0.4, mid + 4), height: 0.5 },
      { id: 'trophy.1', rect: rect(-6, z0 + 0.1, 6, z0 + 0.6), height: 2.4 },
    ],
    blockers: [],
    torches: [
      ...[mid - 3.5, mid + 1.5].flatMap((z) => [
        { x: x0 + 0.1, y: TORCH_H, z },
        { x: x1 - 0.1, y: TORCH_H, z },
      ]),
      { x: -3.9, y: PORCH_TORCH_H, z: hallZ1 + 1.5 },
      { x: 3.9, y: PORCH_TORCH_H, z: hallZ1 + 1.5 },
    ],
    anchors: [
      { id: 'dragonspine.hall.inside', x: 0, z: -1, yaw: 0 },
      { id: 'dragonspine.hall.exit', x: 0, z: 0.5, yaw: 180 },
      { id: 'dragonspine.hall.dais', x: 0, z: z0 + 1.5, yaw: 180 },
      { id: 'dragonspine.hall.hearth', x: 0, z: hallZ1 + 0.4, facing: { x: 0, z: hearthZ0 + 1 } },
      { id: 'dragonspine.hall.hunter.1', x: x0 + 3, z: mid + 2, facing: { x: 0, z: mid } },
      { id: 'dragonspine.hall.hunter.2', x: x1 - 3, z: mid + 2, facing: { x: 0, z: mid } },
    ],
    triggers: [{ id: 'trg.dragonspine.hall.interior', center: { x: 0, y: TRIGGER_CENTRE_H, z: (z0 + porchZ1) / 2 }, half: { x: (x1 - x0) / 2, y: TRIGGER_HALF_H, z: (porchZ1 - z0) / 2 } }],
    doors: [
      {
        doorId: WYRMWATCH_HALL_DOOR_ID,
        outside: 'dragonspine.lodge.hall.door',
        inside: 'dragonspine.hall.inside',
        exit: 'dragonspine.hall.exit',
      },
    ],
    environment: {
      fogColor: 0x14161a,
      fogNear: 14,
      fogFar: 80,
      skyColor: 0x8a94a0,
      groundColor: 0x1a1612,
      ambientIntensity: 0.5,
      lightColor: 0xffc890,
      lightIntensity: 14,
      lightDistance: 28,
    },
  };
}

export const WYRMWATCH_HALL_STRINGS_EN: Record<string, string> = {
  [`interior.enter.${WYRMWATCH_HALL_DOOR_ID}`]: '{key} Enter Wyrmwatch Hall',
  [`interior.exit.${WYRMWATCH_HALL_DOOR_ID}`]: '{key} Leave Wyrmwatch Hall',
};
