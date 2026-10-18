import type { InteriorDef, LocalRect } from '../types';
import { HARROWMARK_SITES } from './sites';

export const KEEP_HALL_ID = 'keep-hall';

const PILLAR_HALF = 0.6;
const pillar = (x: number, z: number): LocalRect => ({ x0: x - PILLAR_HALF, z0: z - PILLAR_HALF, x1: x + PILLAR_HALF, z1: z + PILLAR_HALF });
const PILLAR_ROWS = [-5, -10, -15, -20];

/**
 * The Bastion keep hall (greybox), 14 x 30 m. The door is at +Z; two rows of four 1.2 m columns line the nave; a 10 x 4 m dais
 * (0.4 m, no ramp) stands flush against the far wall where Edric and Vey hold court. The M08 trigger spans the hall 3 m before it.
 */
export const KEEP_HALL_DEF: InteriorDef = {
  id: KEEP_HALL_ID,
  site: { ...HARROWMARK_SITES['keep-hall'] },
  rooms: [{ id: 'hall', x0: -7, z0: -28.5, x1: 7, z1: 1.5, height: 8 }],
  pillars: [...PILLAR_ROWS.map((z) => pillar(-3.5, z)), ...PILLAR_ROWS.map((z) => pillar(3.5, z))],
  props: [{ id: 'dais.1', rect: { x0: -5, z0: -28.5, x1: 5, z1: -24.5 }, height: 0.4, walkable: true }],
  blockers: [],
  torches: [
    ...[-4, -10, -16, -22].flatMap((z) => [
      { x: -6.9, y: 3, z },
      { x: 6.9, y: 3, z },
    ]),
    { x: -4, y: 3, z: -28.4 },
    { x: 4, y: 3, z: -28.4 },
  ],
  anchors: [
    { id: 'harrowmark.keep-hall.entry', x: 0, z: -1, yaw: 0 },
    { id: 'harrowmark.keep-hall.exit', x: 0, z: 0.5, yaw: 180 },
    { id: 'npc-post.edric.hall', x: 0, z: -26.5, yaw: 180 },
    { id: 'npc-post.vey.hall', x: 2.5, z: -26.5, yaw: 180 },
    { id: 'm08.keep-hall', x: 0, z: -21.5, facing: { x: 0, z: -26.5 } },
  ],
  triggers: [{ id: 'trg.harrowmark.keep-hall', center: { x: 0, y: 2, z: -21.5 }, half: { x: 7, y: 2, z: 1.5 } }],
  doors: [
    {
      doorId: 'keep-hall',
      outside: 'harrowmark.keep-hall.door',
      inside: 'harrowmark.keep-hall.entry',
      exit: 'harrowmark.keep-hall.exit',
    },
  ],
  environment: {
    fogColor: 0x0b0e13,
    fogNear: 10,
    fogFar: 55,
    skyColor: 0x7d8a9c,
    groundColor: 0x15181d,
    ambientIntensity: 0.5,
    lightColor: 0xbcd0ff,
    lightIntensity: 12,
    lightDistance: 18,
  },
};
