// The collapsed cave (R16), greybox: an entry passage, a rockfall blocker that stays closed until `story.r16.rockfallCleared`,
// the axe chamber with the dig spot and six search anchors. It floats over K1's `collapsed-cave` pad: an off-site flat pad inside
// the lower-slopes box, so `areaAt` of the float is `dragonspine-lower` (`CAVE_AREA`) and the summit hole is never in play.
// Local metres from the door, yaw 0 faces -Z.
import type { AreaId } from '../region/areas';
import type { InteriorDef, LocalRect } from '../interiors/types';
import type { InteriorPad } from './inputs';

export const COLLAPSED_CAVE_ID = 'collapsed-cave';
export const COLLAPSED_CAVE_DOOR_ID = 'collapsed-cave';
/** Any spawner K13 puts in the cave passes this as `SpawnerDef.area` (the float is not under the mouth). */
export const CAVE_AREA: AreaId = 'dragonspine-lower';
/** The blocker's id in the interior (the flag blockers map it to `story.r16.rockfallCleared`). */
export const ROCKFALL_BLOCKER_ID = 'dragonspine.cave.rockfall';

const rect = (x0: number, z0: number, x1: number, z1: number): LocalRect => ({ x0, z0, x1, z1 });
const EDGE = 2;
const PASSAGE_END = -16;
/** Heights inside the interior, metres above its own floor (local, not terrain). */
const PASSAGE_TORCH_H = 2.4;
const CHAMBER_TORCH_H = 2.8;
const TRIGGER_CENTRE_H = 2.5;
const TRIGGER_HALF_H = 3;

export function buildCaveDef(pad: InteriorPad): InteriorDef {
  const lx0 = pad.footprint.minX - pad.site.x + EDGE;
  const lx1 = pad.footprint.maxX - pad.site.x - EDGE;
  const lz0 = pad.footprint.minZ - pad.site.z + EDGE;
  const lz1 = pad.footprint.maxZ - pad.site.z - EDGE;
  const cx0 = Math.max(lx0, -10);
  const cx1 = Math.min(lx1, 10);
  const cz0 = Math.max(lz0, -34);
  const mid = (cz0 + PASSAGE_END) / 2;
  const north = Math.min(lz1, 1.5);
  return {
    id: COLLAPSED_CAVE_ID,
    site: { x: pad.site.x, z: pad.site.z },
    rooms: [
      { id: 'passage', x0: -2.5, z0: PASSAGE_END, x1: 2.5, z1: north, height: 3.5 },
      { id: 'chamber', x0: cx0, z0: cz0, x1: cx1, z1: PASSAGE_END, height: 5 },
    ],
    pillars: [],
    props: [
      { id: 'rock.1', rect: rect(cx0 + 0.5, cz0 + 0.5, cx0 + 3, cz0 + 3), height: 1.2 },
      { id: 'rock.2', rect: rect(cx1 - 3.5, mid - 1, cx1 - 1, mid + 2), height: 1.4 },
      { id: 'dig.1', rect: rect(-1.5, mid - 1.5, 1.5, mid + 1.5), height: 0.3, walkable: true },
    ],
    // Closed at setup; the flag blocker (interiors plugin) opens it when the rockfall is cleared.
    blockers: [{ id: ROCKFALL_BLOCKER_ID, rect: rect(-2.5, -13, 2.5, -11.5), height: 3.5, startClosed: true }],
    torches: [
      { x: -2.4, y: PASSAGE_TORCH_H, z: -4 },
      { x: 2.4, y: PASSAGE_TORCH_H, z: -4 },
      { x: cx0 + 0.1, y: CHAMBER_TORCH_H, z: mid },
      { x: cx1 - 0.1, y: CHAMBER_TORCH_H, z: mid },
    ],
    anchors: [
      { id: 'dragonspine.cave.inside', x: 0, z: -1, yaw: 0 },
      { id: 'dragonspine.cave.exit', x: 0, z: 0.5, yaw: 180 },
      { id: 'dragonspine.cave.rockfall', x: 0, z: -9.5, facing: { x: 0, z: -12 } },
      { id: 'dragonspine.cave.axe', x: 0, z: mid - 2.5, facing: { x: 0, z: mid } },
      // Six searches: cave-in markers and a hunter's bones in the passage, then the chamber's scabbard, dragon scratch, old campfire and Eadgyth's initials.
      { id: 'dragonspine.cave.search.1', x: -1.6, z: -4.5, facing: { x: -2.5, z: -4.5 } },
      { id: 'dragonspine.cave.search.2', x: 1.5, z: -7, facing: { x: 2.5, z: -7 } },
      { id: 'dragonspine.cave.search.3', x: cx0 + 4, z: PASSAGE_END - 3, facing: { x: cx0, z: PASSAGE_END - 3 } },
      { id: 'dragonspine.cave.search.4', x: cx1 - 4, z: PASSAGE_END - 3, facing: { x: cx1, z: PASSAGE_END - 3 } },
      { id: 'dragonspine.cave.search.5', x: cx0 + 4, z: mid - 4, facing: { x: cx0, z: mid - 4 } },
      { id: 'dragonspine.cave.search.6', x: cx1 - 4, z: cz0 + 3, facing: { x: cx1, z: cz0 + 3 } },
    ],
    triggers: [{ id: 'trg.dragonspine.cave.interior', center: { x: 0, y: TRIGGER_CENTRE_H, z: (cz0 + north) / 2 }, half: { x: Math.max(cx1, 2.5), y: TRIGGER_HALF_H, z: (north - cz0) / 2 } }],
    doors: [
      {
        doorId: COLLAPSED_CAVE_DOOR_ID,
        outside: 'dragonspine.cave.mouth',
        inside: 'dragonspine.cave.inside',
        exit: 'dragonspine.cave.exit',
      },
    ],
    environment: {
      fogColor: 0x080a0c,
      fogNear: 8,
      fogFar: 46,
      skyColor: 0x4a5560,
      groundColor: 0x121416,
      ambientIntensity: 0.4,
      lightColor: 0xffb070,
      lightIntensity: 12,
      lightDistance: 20,
    },
  };
}

export const COLLAPSED_CAVE_STRINGS_EN: Record<string, string> = {
  [`interior.enter.${COLLAPSED_CAVE_DOOR_ID}`]: '{key} Enter the collapsed cave',
  [`interior.exit.${COLLAPSED_CAVE_DOOR_ID}`]: '{key} Leave the cave',
};
