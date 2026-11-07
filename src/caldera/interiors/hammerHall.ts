// The Foundry Approach and the Hammer Hall (Act 5 N2, M54, M55, D10 phase 1), greybox, one interior. The Approach (four mural walls,
// four dormant forge-thralls, Alric) leads through a gate to the ring hall (the trial floor). The hall's centre is a pit bridged by
// the floor blocker `hammer.floor` (closed = a flat floor). N3's BreakingFloor piece opens it for the drop; this thread owns the
// base state and resets it on leaving, on a load and when Ulthred's fight ends. The pit is 3 m deep with a stepped south side, so a
// player who falls and finds the teleport has failed walks out. Entered only by the Foundry's link. Local metres, rooms run +Z.
import { LINK_ONLY_EXIT } from '../../harrowmark/act4/sites';
import type { InteriorDef, SunkenDef } from '../../interiors/types';
import { BLOCKERS, CALDERA_INTERIOR_SITES, DOOR_FOUNDRY, HAMMER_HALL_DOOR_ID, HAMMER_HALL_FLOOR, HAMMER_HALL_ID, HAMMER_MURALS, HAMMER_PIT, INT_ANCHOR, INT_TRIGGER, rectOf as rect } from './sites';

const P = `${INT_ANCHOR}.hammer`;
const T = `${INT_TRIGGER}.hammer`;
export const HAMMER_LINK_ANCHOR = `${P}.link.foundry`;
/** Local z of the entry anchor (the plugin's pit check reads the player's local position from it). */
export const HAMMER_ENTRY_Z = 3;
export const HAMMER_PIT_TRIGGER = `${T}.pit`;
const STEP = 0.3;
/** Eight hammer-slam sites on a ring of radius 14 about the pit's centre (0, 56). */
const SLAMS = Array.from({ length: 8 }, (_, k) => ({ n: k + 1, x: Math.round(14 * Math.sin((k * Math.PI) / 4) * 100) / 100, z: Math.round((56 - 14 * Math.cos((k * Math.PI) / 4)) * 100) / 100 }));

/** The pit's stepped side: ten 0.3 m steps from the rim at z 47 down to 3 m at z 57, across the whole pit width. */
const PIT_STEPS: SunkenDef[] = Array.from({ length: 10 }, (_, i) => ({ id: `pit-step.${i + 1}`, rect: rect(HAMMER_PIT.x0, 47 + i, HAMMER_PIT.x1, 48 + i), depth: Math.round((i + 1) * STEP * 100) / 100, stairs: true }));

export const HAMMER_HALL_DEF: InteriorDef = {
  id: HAMMER_HALL_ID,
  site: { ...CALDERA_INTERIOR_SITES[HAMMER_HALL_ID] },
  rooms: [
    { id: 'approach', x0: -8, z0: -1.5, x1: 8, z1: 30, height: 9 },
    { id: 'hall-gate', x0: -4, z0: 30, x1: 4, z1: 34, height: 6 },
    { id: 'hall', ...HAMMER_HALL_FLOOR, height: 12 },
  ],
  // Six hall columns clear of the lanes along the walls and of the pit.
  pillars: [-17, 17].flatMap((x) => [42, 56, 70].map((z) => rect(x - 0.6, z - 0.6, x + 0.6, z + 0.6))),
  props: [],
  sunken: [...PIT_STEPS, { id: 'pit', rect: rect(HAMMER_PIT.x0, 57, HAMMER_PIT.x1, HAMMER_PIT.z1), depth: 3, stairs: true }],
  blockers: [
    { id: BLOCKERS.hammerHallGate, rect: rect(-4, 31.75, 4, 32.25), height: 6, startClosed: true },
    // The v0.7 bridge deck over the pit: closed is a flat floor; N3's piece opens it for the drop.
    { id: BLOCKERS.hammerFloor, rect: HAMMER_PIT, height: 0.5, base: -0.5, startClosed: true },
  ],
  torches: [
    { x: -7.9, y: 4, z: 8 },
    { x: 7.9, y: 4, z: 8 },
    { x: -7.9, y: 4, z: 20 },
    { x: 7.9, y: 4, z: 20 },
    ...[40, 56, 72].flatMap((z) => [
      { x: -21.9, y: 6, z },
      { x: 21.9, y: 6, z },
    ]),
  ],
  anchors: [
    { id: `${P}.entry`, x: 0, z: HAMMER_ENTRY_Z, yaw: 180 },
    { id: HAMMER_LINK_ANCHOR, x: 0, z: 0.6, yaw: 180 },
    { id: `${P}.checkpoint.1`, x: 0, z: 5, yaw: 180 },
    { id: `${P}.alric`, x: 0, z: 26, yaw: 0 },
    ...HAMMER_MURALS.map((m) => ({ id: `${P}.mural.${m.n}`, x: m.wall === 'west' ? -6.5 : 6.5, z: (m.z0 + m.z1) / 2, facing: { x: m.wall === 'west' ? -8 : 8, z: (m.z0 + m.z1) / 2 } })),
    ...[
      [-5, 12],
      [5, 12],
      [-5, 25],
      [5, 25],
    ].map(([x, z], i) => ({ id: `${P}.thrall.${i + 1}`, x: x!, z: z!, facing: { x: 0, z: 0 } })),
    { id: `${P}.mouth`, x: 0, z: 36, yaw: 180 },
    { id: `${P}.checkpoint.2`, x: 2, z: 36, yaw: 180 },
    { id: `${P}.parley`, x: 4, z: 40, facing: { x: 0, z: 74 } },
    { id: `${P}.ulthred`, x: 0, z: 74, facing: { x: 0, z: 34 } },
    ...SLAMS.map((s) => ({ id: `${P}.slam.${s.n}`, x: s.x, z: s.z, yaw: 180 })),
  ],
  triggers: [
    { id: `${T}.approach`, center: { x: 0, y: 3, z: 14 }, half: { x: 8, y: 3, z: 16 } },
    { id: `${T}.hall`, center: { x: 0, y: 3, z: 56 }, half: { x: 22, y: 4, z: 22 } },
    { id: HAMMER_PIT_TRIGGER, center: { x: 0, y: -1, z: 56 }, half: { x: 9, y: 3, z: 9 } },
  ],
  doors: [{ doorId: HAMMER_HALL_DOOR_ID, outside: DOOR_FOUNDRY, inside: `${P}.entry`, exit: LINK_ONLY_EXIT, outsideInteractable: false }],
  environment: {
    fogColor: 0x1a0a06,
    fogNear: 12,
    fogFar: 70,
    skyColor: 0x8a4a30,
    groundColor: 0x201008,
    ambientIntensity: 0.55,
    lightColor: 0xffa050,
    lightIntensity: 16,
    lightDistance: 22,
  },
};
