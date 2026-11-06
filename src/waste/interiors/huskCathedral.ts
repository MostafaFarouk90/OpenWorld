// The Husk Cathedral's nave and crypt (Act 4 L1 PR 2, plans/act4-L1.md section 16 item 6), greybox: D08's interior. Local
// metres from the door, the building runs along +Z: the narthex (14 x 10 m, D08's two Husk Knight groups, L11), then the nave
// (Eormen's arena, flat, 30 x 40 m, the altar and the Last Gong side by side at the far end); the crypt opens off the
// narthex's east side behind a gate that opens once Eormen's outcome is set, so it is never part of the arena. It floats 150 m over the plateau north of its door, inside the open Waste and never over the Caldera hole.
// L6 PR 2 builds Eormen, the gong's behaviour and BossArena on the ids named here (agreed with L6, 2026-11-06).
import type { InteriorDef, LocalRect } from '../../interiors/types';
import { CATHEDRAL } from '../wasteSites';

export const HUSK_CATHEDRAL_ID = 'husk-cathedral';
export const HUSK_CATHEDRAL_DOOR_ID = 'husk-cathedral';
/** The door's outside anchor (PR 1's, at the rope's end). */
export const HUSK_CATHEDRAL_OUTSIDE = 'waste.husk-cathedral.entry';
/** L11 writes it when Wulfhild gives D08; the door refuses before it. */
export const HUSK_CATHEDRAL_LOCK_FLAG = 'story.d08.started';
/** The arena's gate between the narthex and the nave: built open, with no flag (L6's BossArena drives it). */
export const HUSK_CATHEDRAL_ARENA_GATE = 'husk-cathedral.arena.gate';
/** The crypt's gate: built closed, open once `boss.eormen.outcome` is set (any outcome; re-derived on a load). */
export const HUSK_CATHEDRAL_CRYPT_GATE = 'husk-cathedral.crypt.gate';
export const HUSK_CATHEDRAL_CRYPT_GATE_FLAG = 'boss.eormen.outcome';

const P = 'waste.cathedral';
const rect = (x0: number, z0: number, x1: number, z1: number): LocalRect => ({ x0, z0, x1, z1 });

/** The nave's floor (local), the boss arena. */
export const HUSK_CATHEDRAL_ARENA = rect(-15, 8.5, 15, 48.5);
/** Where the husks rise: ash.1 to ash.3 by the apse (Eormen's adds, L6), ash.4 to ash.6 down the aisles (L5's night husks). */
export const HUSK_CATHEDRAL_ASH = [
  { n: 1, x: -10, z: 40 },
  { n: 2, x: 0, z: 36 },
  { n: 3, x: 10, z: 40 },
  { n: 4, x: -11, z: 18 },
  { n: 5, x: 11, z: 18 },
  { n: 6, x: 0, z: 14 },
] as const;
export const HUSK_CATHEDRAL_GONG = { x: 7, z: 45.5 } as const;
export const HUSK_CATHEDRAL_ALTAR = { x: 0, z: 46 } as const;

export const HUSK_CATHEDRAL_DEF: InteriorDef = {
  id: HUSK_CATHEDRAL_ID,
  site: { x: CATHEDRAL.floatSite[0], z: CATHEDRAL.floatSite[1] },
  rooms: [
    { id: 'narthex', x0: -7, z0: -1.5, x1: 7, z1: 8.5, height: 8 },
    { id: 'nave', ...HUSK_CATHEDRAL_ARENA, height: 14 },
    { id: 'crypt-passage', x0: 7, z0: 2, x1: 10, z1: 5, height: 4 },
    { id: 'crypt', x0: 10, z0: -8, x1: 22, z1: 8, height: 4.5 },
  ],
  // Two rows of nave columns, clear of the aisles' ash piles and of the arena's middle.
  pillars: [14, 22, 30, 38].flatMap((z) => [rect(-13.5, z - 0.6, -12.3, z + 0.6), rect(12.3, z - 0.6, 13.5, z + 0.6)]),
  props: [
    { id: 'altar', rect: rect(-2, 46.6, 2, 48), height: 1.1 },
    { id: 'gong-frame', rect: rect(HUSK_CATHEDRAL_GONG.x - 1.6, 47.2, HUSK_CATHEDRAL_GONG.x + 1.6, 47.9), height: 3.2 },
    // The narthex's bone heap (L11's search) against the west wall.
    { id: 'bones', rect: rect(-6.8, 3, -5.2, 5), height: 0.6 },
    // The crypt: three tombs and the reward niche.
    { id: 'tomb.1', rect: rect(12, 3, 14, 6.5), height: 0.9 },
    { id: 'tomb.2', rect: rect(15, 3, 17, 6.5), height: 0.9 },
    { id: 'tomb.3', rect: rect(18, 3, 20, 6.5), height: 0.9 },
  ],
  blockers: [
    { id: HUSK_CATHEDRAL_ARENA_GATE, rect: rect(-2, 8, 2, 8.5), height: 5, startClosed: false },
    { id: HUSK_CATHEDRAL_CRYPT_GATE, rect: rect(7, 2, 7.5, 5), height: 4, startClosed: true },
  ],
  torches: [
    { x: -6.9, y: 2.6, z: 7 },
    { x: 6.9, y: 2.6, z: 7 },
    ...[12, 26, 42].flatMap((z) => [
      { x: -14.9, y: 4, z },
      { x: 14.9, y: 4, z },
    ]),
    { x: 21.9, y: 2.2, z: 0 },
    { x: 10.1, y: 2.2, z: -6 },
  ],
  anchors: [
    { id: `${P}.entry`, x: 0, z: 1.5, yaw: 180 },
    { id: `${P}.exit`, x: 0, z: -0.8, yaw: 0 },
    // L11's narthex: the two Husk Knight groups, the bone heap and the gong's bell-rope.
    { id: `${P}.narthex.knight-1`, x: -4, z: 5, facing: { x: 0, z: 1.5 } },
    { id: `${P}.narthex.knight-2`, x: 4, z: 6, facing: { x: 0, z: 1.5 } },
    { id: `${P}.narthex.bones`, x: -4.6, z: 4, facing: { x: -6, z: 4 } },
    { id: `${P}.narthex.gong-rope`, x: 5.8, z: 0.5, facing: { x: 7, z: 0.5 } },
    // L6's arena (ids agreed): a reload inside restarts at the mouth, in the narthex.
    { id: `${P}.nave.mouth`, x: 0, z: 6.5, yaw: 180 },
    { id: `${P}.nave.entry`, x: 0, z: 11, yaw: 180 },
    { id: `${P}.nave.eormen`, x: 0, z: 32, facing: { x: 0, z: 11 } },
    { id: `${P}.nave.gong`, x: HUSK_CATHEDRAL_GONG.x, z: HUSK_CATHEDRAL_GONG.z, facing: { x: HUSK_CATHEDRAL_GONG.x, z: 48 } },
    { id: `${P}.nave.altar`, x: HUSK_CATHEDRAL_ALTAR.x, z: HUSK_CATHEDRAL_ALTAR.z - 1.2, facing: { x: 0, z: 48 } },
    ...HUSK_CATHEDRAL_ASH.map((a) => ({ id: `${P}.nave.ash.${a.n}`, x: a.x, z: a.z, yaw: 180 })),
    // The crypt: the D08 reward and a lore note on its own spot (never on a prop's anchor).
    { id: `${P}.crypt.reward`, x: 16, z: -6, facing: { x: 16, z: -8 } },
    { id: `${P}.crypt.note`, x: 21, z: 2, facing: { x: 22, z: 2 } },
  ],
  triggers: [{ id: 'trg.waste.cathedral.nave', center: { x: 0, y: 2, z: 28.5 }, half: { x: 15, y: 2, z: 20 } }],
  doors: [{ doorId: HUSK_CATHEDRAL_DOOR_ID, outside: HUSK_CATHEDRAL_OUTSIDE, inside: `${P}.entry`, exit: `${P}.exit` }],
  environment: {
    fogColor: 0x1a1a1c,
    fogNear: 12,
    fogFar: 60,
    skyColor: 0x8c8f99,
    groundColor: 0x201d1a,
    ambientIntensity: 0.45,
    lightColor: 0xcfd8ff,
    lightIntensity: 11,
    lightDistance: 18,
  },
};
