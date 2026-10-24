// Mireweather Hut's small interior (M25): Gytha's cauldron, her shelf of old salves and the herb rack. Local metres from the
// door, yaw 0 faces -Z. Never locked.
import type { InteriorDef } from '../interiors/types';
import { rect } from './interiorKit';
import { SITES } from './sites';

export const HUT_ID = 'greyfen-hut';
export const HUT_DOOR_ID = 'greyfen-hut';

export const HUT_DEF: InteriorDef = {
  id: HUT_ID,
  site: SITES.hutDoor,
  rooms: [{ id: 'hut', x0: -6, z0: -7.5, x1: 6, z1: 1.5, height: 4 }],
  pillars: [],
  props: [
    { id: 'cauldron', rect: rect(-0.6, -5.6, 0.6, -4.4), height: 0.9 },
    { id: 'shelf', rect: rect(-5.9, -5, -5.1, -2), height: 1.8 },
    { id: 'herb-rack', rect: rect(5.1, -5, 5.9, -2), height: 1.8 },
    { id: 'bed', rect: rect(3.5, -7.4, 5.9, -5.8), height: 0.5 },
    { id: 'table', rect: rect(-5.5, -7.3, -3.5, -6.1), height: 0.8 },
  ],
  blockers: [],
  torches: [
    { x: -5.9, y: 2.2, z: -1 },
    { x: 5.9, y: 2.2, z: -1 },
  ],
  anchors: [
    { id: 'greyfen.hut.entry', x: 0, z: -1, yaw: 0 },
    { id: 'greyfen.hut.exit', x: 0, z: 0.5, yaw: 180 },
    { id: 'npc-post.gytha.inside', x: -2, z: -6.2, facing: { x: 0, z: -5 } },
    { id: 'greyfen.m25.cauldron', x: 0, z: -3.6, facing: { x: 0, z: -5 } },
    { id: 'greyfen.m25.shelf', x: -4.4, z: -3.5, facing: { x: -5.5, z: -3.5 } },
  ],
  triggers: [],
  doors: [{ doorId: HUT_DOOR_ID, outside: 'greyfen.hut.door', inside: 'greyfen.hut.entry', exit: 'greyfen.hut.exit' }],
  environment: {
    fogColor: 0x1a1612,
    fogNear: 6,
    fogFar: 30,
    skyColor: 0x9a8a6a,
    groundColor: 0x1a140e,
    ambientIntensity: 0.55,
    lightColor: 0xffc890,
    lightIntensity: 8,
    lightDistance: 12,
  },
};

export const HUT_STRINGS_EN: Record<string, string> = {
  [`interior.enter.${HUT_DOOR_ID}`]: '{key} Enter Mireweather Hut',
  [`interior.exit.${HUT_DOOR_ID}`]: '{key} Leave the hut',
};
