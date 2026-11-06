// Harrowmark in Act 4 (L2; plans/act4-L2.md sections 2, 3, 5, 6, 7): the always-present anchors of Act 4's city (the new
// doors, the gate faces, the checkpoints, the Act 4 NPC posts, R20's huts) and the new cast's NPC specs, folded into
// HARROWMARK_LAYOUT by one spread so validateCity and the anchors docs see them. The checkpoint barricades and the huts are
// built by the Act 4 plugin from flags (ashState.ts, r20Huts.ts), not here, so nothing stands in the streets before Act 4.
// Engine metres, +Z north; compass headings as in harrowmark.layout.ts.
import { gatePosition, outward } from '../city';
import { gateBearing, GATE_NAMES } from '../city';
import type { AnchorSpec, LayoutData, NpcSpec } from '../../region/layoutTypes';
import { a } from '../layout.helpers';
import { A4_FLAG, CHAMBER_DOOR, DEEP_RUN_EXIT, CHECKPOINTS, CRUCIBLE_DOOR, GATE_FACE_OUT, gateFaceAnchor, OCCUPIED_FLAG, R20_HUTS, RING_FACE_RADIUS, WORKING_GATES } from './sites';

const P = 'harrowmark.a4';

/** Act 4 posts of the existing cast (moved by ACT4_POST_RULES) and of the new cast (their layout home). */
export const ACT4_POSTS = {
  wystan: { x: 8488, z: 2566, heading: 180 },
  'wystan.bastion': { x: 8214, z: 1738, heading: 180 },
  merrin: { x: 8780, z: 1996, heading: 270 },
  wenna: { x: 8704, z: 1562, heading: 0 },
  edric: { x: 8508, z: 2566, heading: 180 },
  'grisel-steward': { ...round(gatePosition('river', 712)), heading: Math.round(gateBearing(GATE_NAMES.indexOf('river'))) },
  'aldric-cole': { x: 8186, z: 1732, heading: 180 },
  'wilmot-penn': { x: 8800, z: 2086, heading: 270 },
  'captain-hesketh': { ...round(gatePosition('west', 712)), heading: 90 },
  'captain-morwen': { x: 8236, z: 1730, heading: 180 },
  'captain-bran': { x: 8652, z: 1382, heading: 180 },
  'captain-tolly': { x: 8386, z: 2168, heading: 270 },
  'witness-barracks': { x: 8366, z: 1390, heading: 180 },
  'witness-gatehouse': { x: 8522, z: 1300, heading: 180 },
  'witness-chapel': { x: 8382, z: 2140, heading: 270 },
  'witness-anvil': { x: 8232, z: 1662, heading: 90 },
  'witness-stables': { x: 8628, z: 1386, heading: 180 },
} as const;

function round(p: { x: number; z: number }): { x: number; z: number } {
  return { x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 };
}

export const postAnchor = (id: keyof typeof ACT4_POSTS): string => `${P}.post.${id}`;

/** The two Vey guards of each checkpoint stand 5 m either side of its pass, just past the rail ends. */
export function guardSpots(c: (typeof CHECKPOINTS)[number]): { x: number; z: number }[] {
  const h = (c.heading * Math.PI) / 180;
  // The rail runs across the street: along (cos h, -sin h) for a compass heading h (the barricade's local x).
  const ax = Math.cos(h);
  const az = -Math.sin(h);
  return [-5, 5].map((s) => round({ x: c.x + ax * s, z: c.z + az * s }));
}
export const guardId = (c: (typeof CHECKPOINTS)[number], k: number): string => `vey-guard-${c.id}-${k}`;

/**
 * Spawn points of the Act 4 street groups (section 4; the groups are in act4/spawners.ts and activate on L10's flags).
 * Picked by a clearance probe: 1 m off every structure, 1.8 m off every environment prop, 1.5 m off every other anchor.
 */
export const ACT4_SPAWN_POINTS: Readonly<Record<string, readonly (readonly [number, number])[]>> = {
  'm35.ambush.1': [[9172.5, 2153.5], [9174.5, 2153.5], [9173.5, 2155.5]],
  'm35.ambush.2': [[9143.5, 2147], [9145.5, 2147], [9144, 2149]],
  'm36.rooftops': [[8897, 2290], [8897, 2292], [8897, 2288]],
  'm36.daggerman': [[8850, 2215], [8852, 2215], [8850.5, 2217], [8848.5, 2216.5]],
  'r19.deserters.1': [[8857.5, 1381], [8859.5, 1381], [8857.5, 1383]],
  'r19.deserters.2': [[8420, 2150], [8422, 2150], [8420.5, 2152]],
  'r20.cp.1': [[9182.5, 2156], [9184.5, 2156], [9182.5, 2158]],
  'r20.cp.2': [[9336.5, 2191], [9338.5, 2191], [9337, 2193]],
  'r20.cp.3': [[9473, 2222], [9475, 2222], [9474, 2224]],
  'r21.cellars': [[8870, 1630], [8872, 1630], [8870.5, 1632], [8868.5, 1631.5]],
  'r23.forger': [[8530, 1325], [8532, 1325]],
};
/** M36's rooftop watch walks the Rooftop Ward's street at x 8897, between the crowd lane's points (at least 4 m off each). */
export const M36_PATROL: readonly (readonly [number, number])[] = [[8897, 2280], [8897, 2345], [8897, 2405], [8897, 2455]];
export const spawnAnchor = (group: string, k: number): string => `${P}.spawn.${group}.${k}`;
export const M36_PATROL_ANCHOR = (k: number): string => `${P}.patrol.m36.${k}`;

const anchors: AnchorSpec[] = [
  // The doors: the chamber's on the Keep's south face, the Crucible's inside the Smelter gate.
  a(CHAMBER_DOOR.anchor, CHAMBER_DOOR.x, CHAMBER_DOOR.z, CHAMBER_DOOR.heading, ['poi', 'door']),
  a(CRUCIBLE_DOOR.anchor, CRUCIBLE_DOOR.x, CRUCIBLE_DOOR.z, CRUCIBLE_DOOR.heading, ['poi', 'door']),
  // The deep run's grate outside the north wall (both of its doors land here).
  a(DEEP_RUN_EXIT.anchor, DEEP_RUN_EXIT.x, DEEP_RUN_EXIT.z, DEEP_RUN_EXIT.heading, ['poi', 'door']),
  // The occupied city's faces, one outside each working gate, facing out (L0's HARROWMARK_GATE_FACES reads them).
  ...WORKING_GATES.map((g) => {
    const b = gateBearing(GATE_NAMES.indexOf(g));
    const p = round(gatePosition(g, RING_FACE_RADIUS));
    return a(gateFaceAnchor(g), p.x, p.z, outward(b), ['gate', 'fog']);
  }),
  // The checkpoints and their guards' posts.
  ...CHECKPOINTS.map((c) => a(`${P}.checkpoint.${c.id}`, c.x, c.z, c.heading, ['poi', 'checkpoint'])),
  ...CHECKPOINTS.flatMap((c) => guardSpots(c).map((s, k) => a(`npc-post.${guardId(c, k + 1)}`, s.x, s.z, c.heading, ['npc-post']))),
  // Act 4 posts.
  ...(Object.keys(ACT4_POSTS) as (keyof typeof ACT4_POSTS)[]).map((id) => {
    const p = ACT4_POSTS[id];
    return a(postAnchor(id), p.x, p.z, p.heading, ['npc-post']);
  }),
  // The street groups' spawn points and M36's patrol.
  ...Object.entries(ACT4_SPAWN_POINTS).flatMap(([g, pts]) => pts.map(([x, z], i) => a(spawnAnchor(g, i + 1), x, z, 0, ['spawn']))),
  ...M36_PATROL.map(([x, z], i) => a(M36_PATROL_ANCHOR(i + 1), x, z, 0, ['patrol'])),
  // R20's two checkpoint huts in the farm-ring outside the River Gate.
  ...R20_HUTS.map((h) => a(h.id, Math.round(h.x * 100) / 100, Math.round(h.z * 100) / 100, outward(gateBearing(GATE_NAMES.indexOf('river'))), ['poi'])),
];

/** The new cast (npcDefs.ts ACT4_NPC_DEFS): in the city from Act 4's start until the city is Vey's. */
const present = { presentWhen: A4_FLAG, absentWhen: OCCUPIED_FLAG } as const;
const NEW_CAST: (keyof typeof ACT4_POSTS)[] = [
  'aldric-cole',
  'wilmot-penn',
  'captain-hesketh',
  'captain-morwen',
  'captain-bran',
  'captain-tolly',
  'witness-barracks',
  'witness-gatehouse',
  'witness-chapel',
  'witness-anvil',
  'witness-stables',
];
const npcs: NpcSpec[] = [
  ...NEW_CAST.map((id) => ({ id, post: postAnchor(id), ...present })),
  ...CHECKPOINTS.flatMap((c) => [1, 2].map((k) => ({ id: guardId(c, k), post: `npc-post.${guardId(c, k)}`, ...present }))),
];

export const ACT4_LAYOUT_HM: LayoutData = { anchors, triggers: [], structures: [], patrols: [], npcs, fields: [] };
export { GATE_FACE_OUT };
