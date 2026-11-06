// The Keep stairs (Act 4, L2; plans/act4-L2.md section 5.2), greybox: the M39 stand. A straight stairwell under the chamber:
// the top landing (floor 0), flight 1 down to landing 1 (-3 m), flight 2 to landing 2 (-6 m, the wave arena), flight 3 to the
// foot (-9 m) and the deep run's door. Steps are 0.3 m, stair-flagged sunken cells (v0.8, `SunkenDef.stairs`), so enemies and
// the escort path down them. Reached only from the chamber (L0's interior link); no outside prompt.
import { ACT4_SITES, CHAMBER_DOOR, LINK_ONLY_EXIT, STAIRS_ID } from '../../../harrowmark/act4/sites';
import type { InteriorDef, SunkenDef } from '../../types';

export { STAIRS_ID };
export const STAIRS_DOOR_ID = 'keep-stairs';
/** Where a link back from the deep run lands, at the foot. */
export const STAIRS_FOOT_DOOR_ID = 'keep-stairs-foot';
/** L0's link back up to the chamber stands here, on the top landing. */
export const STAIRS_CHAMBER_LINK_ANCHOR = 'harrowmark.a4.stairs.chamber';
/** The barricade across the head of flight 3 (open by default; L10 closes it when Cael builds it). */
export const STAIRS_BARRICADE = 'stairs.barricade';
/** L0's interior link to the deep run stands here, at the foot. */
export const STAIRS_DEEP_RUN_LINK_ANCHOR = 'harrowmark.a4.stairs.deeprun';
/** L0's respawn port: M39 sets its checkpoint here (L10). */
export const STAIRS_CHECKPOINT_ANCHOR = 'harrowmark.a4.stairs.checkpoint';

const P = 'harrowmark.a4.stairs';
export const STAIR_STEP = 0.3;
const STEPS_PER_FLIGHT = 10;
/** Each step is 1 m long; the flights run along -Z. */
const STEP_LENGTH = 1;
export const LANDING_DEPTH = { top: 0, one: 3, two: 6, foot: 9 } as const;

const round = (n: number) => Math.round(n * 100) / 100;

/** A flight of STEPS_PER_FLIGHT steps from local z `zTop` going -Z, from depth `from`, across x -3..3. */
function flight(id: string, zTop: number, from: number): SunkenDef[] {
  return Array.from({ length: STEPS_PER_FLIGHT }, (_, i) => ({
    id: `${id}.${i + 1}`,
    rect: { x0: -3, z0: zTop - (i + 1) * STEP_LENGTH, x1: 3, z1: zTop - i * STEP_LENGTH },
    depth: round(from + (i + 1) * STAIR_STEP),
    stairs: true,
  }));
}

/** Local z of each part (the door is at +Z). */
export const STAIRS_Z = {
  top: { z0: -4, z1: 1.5 },
  flight1: { z0: -14, z1: -4 },
  landing1: { z0: -20, z1: -14 },
  flight2: { z0: -30, z1: -20 },
  landing2: { z0: -42, z1: -30 },
  flight3: { z0: -52, z1: -42 },
  foot: { z0: -58, z1: -52 },
} as const;

export const KEEP_STAIRS_DEF: InteriorDef = {
  id: STAIRS_ID,
  site: { ...ACT4_SITES[STAIRS_ID] },
  rooms: [
    { id: 'well', x0: -3, z0: STAIRS_Z.foot.z0, x1: 3, z1: STAIRS_Z.top.z1, height: 5 },
    // The wave arena widens landing 2 to 14 x 12 m.
    { id: 'landing-2', x0: -7, z0: STAIRS_Z.landing2.z0, x1: 7, z1: STAIRS_Z.landing2.z1, height: 5 },
  ],
  pillars: [],
  props: [],
  sunken: [
    ...flight('flight-1', STAIRS_Z.flight1.z1, LANDING_DEPTH.top),
    { id: 'landing-1', rect: { x0: -3, ...STAIRS_Z.landing1, x1: 3 }, depth: LANDING_DEPTH.one, stairs: true },
    ...flight('flight-2', STAIRS_Z.flight2.z1, LANDING_DEPTH.one),
    { id: 'landing-2', rect: { x0: -7, ...STAIRS_Z.landing2, x1: 7 }, depth: LANDING_DEPTH.two, stairs: true },
    ...flight('flight-3', STAIRS_Z.flight3.z1, LANDING_DEPTH.two),
    { id: 'foot', rect: { x0: -3, ...STAIRS_Z.foot, x1: 3 }, depth: LANDING_DEPTH.foot, stairs: true },
  ],
  blockers: [
    // A waist-high barricade of benches and a door across the head of flight 3, standing on landing 2's floor.
    { id: STAIRS_BARRICADE, rect: { x0: -3, z0: -42.5, x1: 3, z1: -42 }, height: 1.4, base: -LANDING_DEPTH.two },
  ],
  torches: [
    { x: -2.9, y: 2.4, z: -2 },
    { x: 2.9, y: 2.4, z: -2 },
    { x: -2.9, y: -0.6, z: -17 },
    { x: 2.9, y: -0.6, z: -17 },
    ...[-33, -39].flatMap((z) => [
      { x: -6.9, y: -3.6, z },
      { x: 6.9, y: -3.6, z },
    ]),
    { x: -2.9, y: -6.6, z: -55 },
    { x: 2.9, y: -6.6, z: -55 },
  ],
  anchors: [
    { id: `${P}.entry`, x: 0, z: -1.5, yaw: 0 },
    { id: STAIRS_CHAMBER_LINK_ANCHOR, x: 0, z: 0.8, yaw: 180 },
    { id: `${P}.from-deeprun`, x: 0, z: -55, yaw: 0 },
    { id: STAIRS_CHECKPOINT_ANCHOR, x: 0, z: -40.5, yaw: 0 },
    { id: `${P}.barricade`, x: 0, z: -41, yaw: 180 },
    { id: `${P}.gaut`, x: -2, z: -38, yaw: 0 },
    { id: `${P}.champion`, x: 0, z: -2, yaw: 180 },
    { id: `${P}.sword`, x: -1.5, z: -39.5, yaw: 0 },
    { id: `${P}.edric`, x: 0, z: -55.5, yaw: 0 },
    { id: `${P}.rook`, x: 1.5, z: -55, yaw: 0 },
    // Wave spawn points: the top landing (wave entry from the chamber), landing 1 and the head of landing 2.
    ...[1, 2, 3, 4].map((n) => ({ id: `${P}.wave.top.${n}`, x: -2.25 + (n - 1) * 1.5, z: -2.5, yaw: 0 })),
    ...[1, 2, 3, 4].map((n) => ({ id: `${P}.wave.one.${n}`, x: -2.25 + (n - 1) * 1.5, z: -17, yaw: 0 })),
    ...[1, 2, 3, 4].map((n) => ({ id: `${P}.wave.two.${n}`, x: -4.5 + (n - 1) * 3, z: -31, yaw: 0 })),
    { id: STAIRS_DEEP_RUN_LINK_ANCHOR, x: 0, z: -57.3, yaw: 0 },
  ],
  triggers: [
    { id: 'trg.harrowmark.a4.stairs.landing2', center: { x: 0, y: -4, z: -36 }, half: { x: 7, y: 2, z: 6 } },
  ],
  doors: [
    // Entered only through the chamber's link; its outside anchor is the chamber's door, so a stale-load rescue goes through
    // the waystones' placement rules (L0's no-strand rule moves it out of the walls after M38).
    { doorId: STAIRS_DOOR_ID, outside: CHAMBER_DOOR.anchor, inside: `${P}.entry`, exit: LINK_ONLY_EXIT, outsideInteractable: false },
    { doorId: STAIRS_FOOT_DOOR_ID, outside: CHAMBER_DOOR.anchor, inside: `${P}.from-deeprun`, exit: LINK_ONLY_EXIT, outsideInteractable: false },
  ],
  environment: {
    fogColor: 0x0a0a0d,
    fogNear: 8,
    fogFar: 40,
    skyColor: 0x6a6a74,
    groundColor: 0x121216,
    ambientIntensity: 0.45,
    lightColor: 0xffc890,
    lightIntensity: 12,
    lightDistance: 16,
  },
};
