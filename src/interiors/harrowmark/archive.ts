import type { InteriorDef } from '../types';
import { HARROWMARK_SITES } from './sites';

export const ARCHIVE_ID = 'archive';

/**
 * The Harrowmark archive (greybox), 18 x 20 m. A reading room by the door (four tables, Whitlock's lectern at the far side) opens
 * through a 6 m arch into the shelf stacks behind.
 */
export const ARCHIVE_DEF: InteriorDef = {
  id: ARCHIVE_ID,
  site: { ...HARROWMARK_SITES.archive },
  rooms: [
    { id: 'reading', x0: -9, z0: -9.5, x1: 9, z1: 1.5, height: 6 },
    { id: 'arch', x0: -3, z0: -11.5, x1: 3, z1: -9.5, height: 6 },
    { id: 'stacks', x0: -9, z0: -18.5, x1: 9, z1: -11.5, height: 6 },
  ],
  pillars: [],
  props: [
    { id: 'lectern.1', rect: { x0: -0.5, z0: -8.5, x1: 0.5, z1: -7.5 }, height: 1.1 },
    { id: 'table.1', rect: { x0: -6, z0: -6, x1: -3.5, z1: -5 }, height: 0.9 },
    { id: 'table.2', rect: { x0: 3.5, z0: -6, x1: 6, z1: -5 }, height: 0.9 },
    { id: 'table.3', rect: { x0: -6, z0: -3, x1: -3.5, z1: -2 }, height: 0.9 },
    { id: 'table.4', rect: { x0: 3.5, z0: -3, x1: 6, z1: -2 }, height: 0.9 },
    { id: 'shelf.1', rect: { x0: -7.5, z0: -17.5, x1: -7, z1: -12.5 }, height: 3 },
    { id: 'shelf.2', rect: { x0: -4.5, z0: -17.5, x1: -4, z1: -12.5 }, height: 3 },
    { id: 'shelf.3', rect: { x0: 4, z0: -17.5, x1: 4.5, z1: -12.5 }, height: 3 },
    { id: 'shelf.4', rect: { x0: 7, z0: -17.5, x1: 7.5, z1: -12.5 }, height: 3 },
    { id: 'shelf.5', rect: { x0: -3, z0: -18.5, x1: 3, z1: -18 }, height: 3 },
  ],
  blockers: [],
  torches: [
    { x: -8.9, y: 3, z: -2 },
    { x: 8.9, y: 3, z: -2 },
    { x: -8.9, y: 3, z: -7 },
    { x: 8.9, y: 3, z: -7 },
    { x: -2.9, y: 3, z: -10.5 },
    { x: 2.9, y: 3, z: -10.5 },
    { x: -8.9, y: 3, z: -15 },
    { x: 8.9, y: 3, z: -15 },
  ],
  anchors: [
    { id: 'harrowmark.archive.entry', x: 0, z: -1, yaw: 0 },
    { id: 'harrowmark.archive.exit', x: 0, z: 0.5, yaw: 180 },
    { id: 'npc-post.whitlock.inside', x: 0, z: -9.25, yaw: 180 },
  ],
  triggers: [],
  doors: [
    {
      doorId: 'archive',
      outside: 'harrowmark.archive.door',
      inside: 'harrowmark.archive.entry',
      exit: 'harrowmark.archive.exit',
    },
  ],
  environment: {
    fogColor: 0x0a0d12,
    fogNear: 8,
    fogFar: 50,
    skyColor: 0x6f7f95,
    groundColor: 0x14181d,
    ambientIntensity: 0.5,
    lightColor: 0xa9c4ff,
    lightIntensity: 11,
    lightDistance: 15,
  },
};
