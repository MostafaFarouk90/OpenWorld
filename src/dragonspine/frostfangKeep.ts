// The Frostfang keep's interior (D06, PR 2), greybox: a porch, the great hall with the map table, Skarl's study through a door on
// the west (his desk; Skarl's orders, the buyer's ledger and Vey's letter are its searches) and the cell on the east (the captive
// hunter). It floats over K1's `frostfang-keep` pad, an exactly flat pad on the Aerie shelf inside the summit box, so its area is
// `dragonspine-summit` (KEEP_AREA) and the summit hole is open whenever the keep is reachable (the summit opens before D06).
// The door opens on `story.d06.started` (K13). Local metres from the door, yaw 0 faces -Z.
import type { AreaId } from '../region/areas';
import type { InteriorDef, LocalRect } from '../interiors/types';
import { INTERIOR_EDGE, INTERIOR_ENTRY, type InteriorPad } from './inputs';

export const FROSTFANG_KEEP_ID = 'frostfang-keep';
export const FROSTFANG_KEEP_DOOR_ID = 'frostfang-keep';
/** Spawners K13 or K8 put in the keep pass this as `SpawnerDef.area`. */
export const KEEP_AREA: AreaId = 'dragonspine-summit';

const rect = (x0: number, z0: number, x1: number, z1: number): LocalRect => ({ x0, z0, x1, z1 });
const EDGE = INTERIOR_EDGE;
/** The keep needs the pad to reach this far each side of the door and this far south of it. */
const MIN_HALF_WIDTH = 15;
const MIN_DEPTH = 28;
const HALL_END = -26;
/** Heights inside the interior, metres above its own floor (local, not terrain). */
const TORCH_H = 3.6;
const TRIGGER_CENTRE_H = 3;
const TRIGGER_HALF_H = 4.5;

export function buildKeepDef(pad: InteriorPad): InteriorDef {
  const lx0 = pad.footprint.minX - pad.site.x + EDGE;
  const lx1 = pad.footprint.maxX - pad.site.x - EDGE;
  const lz0 = pad.footprint.minZ - pad.site.z + EDGE;
  const lz1 = pad.footprint.maxZ - pad.site.z - EDGE;
  const north = Math.min(lz1, INTERIOR_ENTRY);
  if (north < INTERIOR_ENTRY) throw new Error(`dragonspine: the frostfang-keep pad is too small: its entry reaches only ${north} m past the origin`);
  if (-lx0 < MIN_HALF_WIDTH || lx1 < MIN_HALF_WIDTH || -lz0 < MIN_DEPTH) {
    throw new Error(`dragonspine: the frostfang-keep pad is too small for the keep (${lx1 - lx0} m wide, ${-lz0} m deep; needs ${2 * MIN_HALF_WIDTH} x ${MIN_DEPTH})`);
  }
  const sx0 = Math.max(lx0, -17);
  const cx1 = Math.min(lx1, 17);
  return {
    id: FROSTFANG_KEEP_ID,
    site: { x: pad.site.x, z: pad.site.z },
    rooms: [
      { id: 'porch', x0: -3, z0: -4, x1: 3, z1: north, height: 4 },
      { id: 'hall', x0: -9, z0: HALL_END, x1: 9, z1: -4, height: 8 },
      { id: 'study-door', x0: -11, z0: -18, x1: -9, z1: -15, height: 3 },
      { id: 'study', x0: sx0, z0: -28, x1: -11, z1: -10, height: 4.5 },
      { id: 'cell-door', x0: 9, z0: -18, x1: 11, z1: -15, height: 3 },
      { id: 'cell', x0: 11, z0: -24, x1: cx1, z1: -12, height: 4 },
    ],
    pillars: [rect(-6, -12, -5, -11), rect(5, -12, 6, -11), rect(-6, -20, -5, -19), rect(5, -20, 6, -19)],
    props: [
      { id: 'desk.1', rect: rect(sx0 + 0.5, -23, sx0 + 2.5, -20), height: 0.9 },
      { id: 'map-table.1', rect: rect(-2, -21, 2, -18), height: 0.9 },
      { id: 'cot.1', rect: rect(cx1 - 2, -23, cx1 - 0.5, -20), height: 0.5 },
    ],
    blockers: [],
    torches: [
      { x: -8.9, y: TORCH_H, z: -8 },
      { x: 8.9, y: TORCH_H, z: -8 },
      { x: -8.9, y: TORCH_H, z: -22 },
      { x: 8.9, y: TORCH_H, z: -22 },
      { x: sx0 + 0.1, y: TORCH_H - 1, z: -14 },
      { x: cx1 - 0.1, y: TORCH_H - 1, z: -16 },
    ],
    anchors: [
      { id: 'dragonspine.keep.inside', x: 0, z: -1, yaw: 0 },
      { id: 'dragonspine.keep.exit', x: 0, z: 0.5, yaw: 180 },
      { id: 'dragonspine.keep.hall', x: 0, z: -14, yaw: 0 },
      { id: 'dragonspine.keep.study', x: -13.5, z: -14, facing: { x: sx0 + 1.5, z: -21 } },
      { id: 'dragonspine.keep.captive', x: (11 + cx1) / 2, z: -15, facing: { x: 9, z: -16.5 } },
      // Searches: Skarl's orders (the desk), the buyer's ledger (the map table), Vey's letter (the study's far wall).
      { id: 'dragonspine.keep.search.1', x: sx0 + 3.8, z: -21.5, facing: { x: sx0 + 1.5, z: -21.5 } },
      { id: 'dragonspine.keep.search.2', x: 0, z: -16.5, facing: { x: 0, z: -19.5 } },
      { id: 'dragonspine.keep.search.3', x: -13.5, z: -26.5, facing: { x: -13.5, z: -28 } },
    ],
    triggers: [{ id: 'trg.dragonspine.keep.interior', center: { x: 0, y: TRIGGER_CENTRE_H, z: (-28 + north) / 2 }, half: { x: Math.max(-sx0, cx1), y: TRIGGER_HALF_H, z: (north + 28) / 2 } }],
    doors: [
      {
        doorId: FROSTFANG_KEEP_DOOR_ID,
        outside: 'dragonspine.aerie.keep.door',
        inside: 'dragonspine.keep.inside',
        exit: 'dragonspine.keep.exit',
      },
    ],
    environment: {
      fogColor: 0x101216,
      fogNear: 12,
      fogFar: 70,
      skyColor: 0x7a8492,
      groundColor: 0x16130f,
      ambientIntensity: 0.45,
      lightColor: 0xffbf80,
      lightIntensity: 13,
      lightDistance: 26,
    },
  };
}

export const FROSTFANG_KEEP_STRINGS_EN: Record<string, string> = {
  [`interior.enter.${FROSTFANG_KEEP_DOOR_ID}`]: '{key} Enter the Frostfang keep',
  [`interior.exit.${FROSTFANG_KEEP_DOOR_ID}`]: '{key} Leave the keep',
};
