// The Great Council Chamber (Act 4, L2; plans/act4-L2.md section 5.1), greybox. Its own door on the Keep's south face: the
// shipped Keep hall is pinned and keeps its M22 use. Local metres from the door (+Z wall), yaw 0 faces -Z.
import { ACT4_SITES, CHAMBER_DOOR, CHAMBER_ID, LINK_ONLY_EXIT } from '../../../harrowmark/act4/sites';
import type { InteriorDef, LocalRect } from '../../types';

export { CHAMBER_ID };
export const CHAMBER_DOOR_ID = 'council-chamber';
/** Where a link back up from the Keep stairs lands (link-only: no exit interactable of its own). */
export const CHAMBER_BACK_DOOR_ID = 'council-chamber-back';
/** L10 writes it when M38 starts; the door refuses before it ("The Council has not been called."). */
export const CHAMBER_LOCK_FLAG = 'story.m38.started';
/** The two side doors the Charred Footmen pour through in M38's betrayal (built closed; the scene opens them). */
export const CHAMBER_SIDE_DOORS = ['chamber.side.w', 'chamber.side.e'] as const;
/** L0's interior-to-interior link to the Keep stairs stands here, behind the dais. */
export const CHAMBER_STAIRS_LINK_ANCHOR = 'harrowmark.a4.chamber.stairs';

const P = 'harrowmark.a4.chamber';
const PILLAR_HALF = 0.7;
const pillar = (x: number, z: number): LocalRect => ({ x0: x - PILLAR_HALF, z0: z - PILLAR_HALF, x1: x + PILLAR_HALF, z1: z + PILLAR_HALF });
/** Two rows of five columns at x = +-8 split the nave from the galleries. */
const PILLAR_Z = [-6, -13, -20, -27, -34];
/** The houses' seats: each delegate stands on the won side (Cael's, east) or the lost side (Vey's, west). */
const HOUSES = ['halvard', 'oswin', 'grisel'] as const;

export const COUNCIL_CHAMBER_DEF: InteriorDef = {
  id: CHAMBER_ID,
  site: { ...ACT4_SITES[CHAMBER_ID] },
  rooms: [
    { id: 'nave', x0: -12, z0: -40, x1: 12, z1: 1.5, height: 11 },
    // The side-door vestibules, west and east, open onto the galleries.
    { id: 'side.w', x0: -16, z0: -22, x1: -12, z1: -18, height: 4 },
    { id: 'side.e', x0: 12, z0: -22, x1: 16, z1: -18, height: 4 },
    // The stair passage behind the dais.
    { id: 'stair-passage', x0: -1.5, z0: -44, x1: 1.5, z1: -40, height: 4 },
  ],
  pillars: [...PILLAR_Z.map((z) => pillar(-8, z)), ...PILLAR_Z.map((z) => pillar(8, z))],
  props: [
    // The dais across the north end (0.4 m, walkable), the throne and the regent's seat on it.
    { id: 'dais', rect: { x0: -6, z0: -40, x1: 6, z1: -35 }, height: 0.4, walkable: true },
    { id: 'throne', rect: { x0: -0.7, z0: -39.6, x1: 0.7, z1: -38.4 }, height: 1.6 },
    { id: 'seat.regent', rect: { x0: 2.3, z0: -39.4, x1: 3.3, z1: -38.4 }, height: 1.1 },
    { id: 'seat.aldous', rect: { x0: -3.3, z0: -39.4, x1: -2.3, z1: -38.4 }, height: 1.1 },
    // The case table before the dais and the Council clerk's desk.
    { id: 'case-table', rect: { x0: -2, z0: -31, x1: 2, z1: -29.5 }, height: 0.9 },
    { id: 'clerk-desk', rect: { x0: 5, z0: -33.5, x1: 6.8, z1: -32 }, height: 0.9 },
    // Benches in two blocks with a 5 m aisle.
    ...[-24, -19, -14, -9].flatMap((z) => [
      { id: `bench.w${-z}`, rect: { x0: -6.5, z0: z - 0.4, x1: -2.5, z1: z + 0.4 }, height: 0.5 },
      { id: `bench.e${-z}`, rect: { x0: 2.5, z0: z - 0.4, x1: 6.5, z1: z + 0.4 }, height: 0.5 },
    ]),
  ],
  blockers: [
    { id: CHAMBER_SIDE_DOORS[0], rect: { x0: -12.5, z0: -22, x1: -12, z1: -18 }, height: 4, startClosed: true },
    { id: CHAMBER_SIDE_DOORS[1], rect: { x0: 12, z0: -22, x1: 12.5, z1: -18 }, height: 4, startClosed: true },
  ],
  torches: [
    ...[-3, -10, -17, -24, -31, -38].flatMap((z) => [
      { x: -11.9, y: 3.2, z },
      { x: 11.9, y: 3.2, z },
    ]),
    { x: -4, y: 3.6, z: -39.9 },
    { x: 4, y: 3.6, z: -39.9 },
  ],
  anchors: [
    { id: `${P}.entry`, x: 0, z: -1, yaw: 0 },
    { id: `${P}.exit`, x: 0, z: 0.8, yaw: 180 },
    // Seats on the dais and before it (L10's M38 scene).
    { id: `${P}.seat.edric`, x: 0, z: -37.8, yaw: 180 },
    { id: `${P}.seat.vey`, x: 2.8, z: -37.8, yaw: 180 },
    { id: `${P}.seat.aldous`, x: -2.8, z: -37.8, yaw: 180 },
    { id: `${P}.seat.wystan`, x: 9.8, z: -30, facing: { x: 0, z: -30 } },
    { id: `${P}.seat.merrin`, x: 9.8, z: -26, facing: { x: 0, z: -26 } },
    { id: `${P}.seat.wenna`, x: -9.8, z: -30, facing: { x: 0, z: -30 } },
    ...HOUSES.flatMap((h, i) => [
      { id: `${P}.delegate.${h}.won`, x: 10, z: -12 - i * 4, facing: { x: 0, z: -12 - i * 4 } },
      { id: `${P}.delegate.${h}.lost`, x: -10, z: -12 - i * 4, facing: { x: 0, z: -12 - i * 4 } },
    ]),
    // Witnesses stand along the east gallery's south end, facing the dais.
    ...[1, 2, 3, 4, 5, 6].map((n) => ({ id: `${P}.witness.${n}`, x: 9 + (n % 2) * 2, z: -2 - Math.ceil(n / 2) * 2, facing: { x: 0, z: -36 } })),
    { id: `${P}.podium`, x: 0, z: -27.5, facing: { x: 0, z: -37 } },
    { id: `${P}.evidence`, x: 0, z: -29, facing: { x: 0, z: -31 } },
    { id: `${P}.clerk`, x: 5.9, z: -34.2, facing: { x: 0, z: -30 } },
    // The betrayal: three Footmen through each side door.
    ...[1, 2, 3].flatMap((n) => [
      { id: `${P}.footman.w${n}`, x: -14, z: -22 + n, yaw: 270 },
      { id: `${P}.footman.e${n}`, x: 14, z: -22 + n, yaw: 90 },
    ]),
    // Camera anchors for the scene (L0 sequencer shots).
    { id: `${P}.shot.1`, x: 0, z: -4, facing: { x: 0, z: -38 } },
    { id: `${P}.shot.2`, x: -9, z: -33, facing: { x: 0, z: -28 } },
    { id: `${P}.shot.3`, x: 9, z: -20, facing: { x: -12, z: -20 } },
    { id: `${P}.shot.4`, x: 0, z: -36, facing: { x: 0, z: -10 } },
    // The link to the Keep stairs and where a transfer back lands.
    { id: CHAMBER_STAIRS_LINK_ANCHOR, x: 0, z: -42.5, yaw: 0 },
    { id: `${P}.from-stairs`, x: 0, z: -41, yaw: 180 },
  ],
  triggers: [{ id: 'trg.harrowmark.a4.chamber.floor', center: { x: 0, y: 2, z: -20 }, half: { x: 12, y: 2, z: 20 } }],
  doors: [
    { doorId: CHAMBER_DOOR_ID, outside: CHAMBER_DOOR.anchor, inside: `${P}.entry`, exit: `${P}.exit` },
    { doorId: CHAMBER_BACK_DOOR_ID, outside: CHAMBER_DOOR.anchor, inside: `${P}.from-stairs`, exit: LINK_ONLY_EXIT, outsideInteractable: false },
  ],
  environment: {
    fogColor: 0x0d0c10,
    fogNear: 14,
    fogFar: 70,
    skyColor: 0x8a8070,
    groundColor: 0x16130f,
    ambientIntensity: 0.5,
    lightColor: 0xffd8a8,
    lightIntensity: 12,
    lightDistance: 20,
  },
};
