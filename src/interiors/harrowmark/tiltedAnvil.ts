import type { InteriorDef } from '../types';
import { HARROWMARK_SITES } from './sites';

export const TILTED_ANVIL_ID = 'tilted-anvil';
/** Closes the corridor to the rented back room. */
export const TILTED_ANVIL_BACKROOM_GATE = 'tilted-anvil.backroom.gate';

/**
 * The Tilted Anvil inn (greybox), 22 x 16 m. The front door (onto Forge Row) opens at +Z into the common room: a hearth on the
 * east wall, Aldith's counter along the west wall, five tables. A 2 m corridor at the north wall leads to the rented back room
 * (a bed), whose far wall holds the back door onto the Bastion yard. The gate closes the corridor.
 */
export const TILTED_ANVIL_DEF: InteriorDef = {
  id: TILTED_ANVIL_ID,
  site: { ...HARROWMARK_SITES['tilted-anvil'] },
  rooms: [
    { id: 'common', x0: -11, z0: -7.5, x1: 11, z1: 1.5, height: 4.5 },
    { id: 'corridor', x0: 4, z0: -10.5, x1: 6, z1: -7.5, height: 4.5 },
    { id: 'backroom', x0: 3, z0: -14.5, x1: 11, z1: -10.5, height: 4.5 },
  ],
  pillars: [],
  props: [
    { id: 'counter.1', rect: { x0: -9, z0: -6, x1: -8, z1: 0 }, height: 1.1 },
    { id: 'hearth.1', rect: { x0: 10, z0: -3.5, x1: 11, z1: -0.5 }, height: 0.5 },
    { id: 'table.1', rect: { x0: -5, z0: -5.5, x1: -2.5, z1: -4.5 }, height: 0.9 },
    { id: 'table.2', rect: { x0: -5, z0: -2.5, x1: -2.5, z1: -1.5 }, height: 0.9 },
    { id: 'table.3', rect: { x0: 1, z0: -5.5, x1: 3.5, z1: -4.5 }, height: 0.9 },
    { id: 'table.4', rect: { x0: 1, z0: -2.5, x1: 3.5, z1: -1.5 }, height: 0.9 },
    { id: 'table.5', rect: { x0: 7, z0: -5.5, x1: 9.5, z1: -4.5 }, height: 0.9 },
    { id: 'bed.1', rect: { x0: 8.5, z0: -14, x1: 10.5, z1: -12 }, height: 0.6 },
  ],
  blockers: [{ id: TILTED_ANVIL_BACKROOM_GATE, rect: { x0: 4, z0: -9.5, x1: 6, z1: -8.5 }, height: 4.5 }],
  torches: [
    { x: 10.9, y: 2.4, z: -3 },
    { x: 10.9, y: 2.6, z: -2 },
    { x: 10.9, y: 2.4, z: -1 },
    { x: -10.9, y: 2.5, z: -6.5 },
    { x: -10.9, y: 2.5, z: 0.5 },
    { x: -3, y: 2.5, z: -7.4 },
    { x: 2, y: 2.5, z: 1.4 },
    { x: 10.9, y: 2.3, z: -12.5 },
    { x: 7, y: 2.3, z: -14.4 },
  ],
  anchors: [
    { id: 'harrowmark.tilted-anvil.entry', x: 0, z: -1, yaw: 0 },
    { id: 'harrowmark.tilted-anvil.exit', x: 0, z: 0.5, yaw: 180 },
    { id: 'harrowmark.tilted-anvil-back.entry', x: 5, z: -11.75, yaw: 180 },
    { id: 'harrowmark.tilted-anvil-back.exit', x: 5, z: -13.25, yaw: 0 },
    { id: 'inn.aldith', x: -6.5, z: -3.25, facing: { x: -8.5, z: -3.25 } },
    { id: 'inn.room', x: 7, z: -12.5, yaw: 270 },
    { id: 'npc-post.aldith.inside', x: -10, z: -3.25, facing: { x: 0, z: -3.25 } },
    { id: 'npc-post.tobb.tilted-anvil', x: 8, z: -2, facing: { x: 11, z: -2 } },
    // Act 2 (A5): where an inactive companion waits by the hearth.
    { id: 'npc-post.hrolf.tilted-anvil', x: 8.2, z: -4, facing: { x: 11, z: -2 } },
    { id: 'npc-post.aelfreda.tilted-anvil', x: 8.2, z: 0, facing: { x: 11, z: -2 } },
  ],
  triggers: [],
  doors: [
    {
      doorId: 'tilted-anvil',
      outside: 'harrowmark.tilted-anvil.door',
      inside: 'harrowmark.tilted-anvil.entry',
      exit: 'harrowmark.tilted-anvil.exit',
    },
    {
      doorId: 'tilted-anvil-back',
      outside: 'harrowmark.tilted-anvil-back.door',
      inside: 'harrowmark.tilted-anvil-back.entry',
      exit: 'harrowmark.tilted-anvil-back.exit',
    },
  ],
  environment: {
    fogColor: 0x1a0e07,
    fogNear: 8,
    fogFar: 45,
    skyColor: 0xb07a4a,
    groundColor: 0x2a1a0e,
    ambientIntensity: 0.6,
    lightColor: 0xffa84f,
    lightIntensity: 16,
    lightDistance: 16,
  },
};
