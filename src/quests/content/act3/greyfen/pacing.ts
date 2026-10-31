// Pacing rows for the nine Greyfen quests (plans/act3-K12.md section 4), measured on K3's real anchors (`greyfen.layout.ts`, its
// interiors' local anchors) and K1's sites through them; positions are never written down here. The shape is K16's `Act3PaceRow`
// (coordinator 2026-10-30): `quest`, `design`, `route` (anchor ids), `legs` (one explicit mode per leg), `nodes`, `beats`. The
// published src/integration/act3Timing.ts does not exist yet, so the type is kept here, field for field.
//
// estimate = (min(travel, 3/7 x talkAndBeats) + talkAndBeats) / 60, talkAndBeats = nodes x 20 s + the beats' seconds.
// Speeds: ride 9, foot 4.5, wade 2.5 (3.5 after the Fen Boots, M23's reward, so every quest after M23), ferry 5, glide 10,
// follow 2 m/s, a door costs nothing. A dive segment is a 30 s beat: its leg is a `door` leg (the beat prices the swim). Each
// quest starts where a waystone fast travel leaves the player (the Mere stone opens when M26 starts, K9), so no long walk
// is charged for reaching the first giver.
import { ACT2_BEAT_S, ROUTE_FOLLOW_MPS, RIDE_MPS, TALK_NODE_S, WALK_MPS, cappedTravelS } from '../../../../integration/timing';
import { CHAPEL_DEF } from '../../../../greyfen/chapelInterior';
import { DEEPS_DEF } from '../../../../greyfen/deepsInterior';
import { HUT_DEF } from '../../../../greyfen/hutInterior';
import { GREYFEN_LAYOUT } from '../../../../greyfen/greyfen.layout';
import { greyfenXZ } from './extraAnchors';

/** 'door' = an interior or dive-space frame change, 0 distance. */
export type Act3Leg = 'ride' | 'foot' | 'wade' | 'glide' | 'ferry' | 'follow' | 'door';
export type Act3Beat = 'killUnit' | 'search' | 'interact' | 'set' | 'stealthSection' | 'dive' | 'rhythm' | 'boss';
type Act3LegMode = Act3Leg;
type Act3BeatKind = Act3Beat;
/** A leg with its measured distance (derived, never stored on the row). */
export interface Act3PaceLeg { mode: Act3Leg; from: string; to: string; metres: number }

export interface Act3PaceRow {
  quest: string;
  /** design minutes (plan Part 7.1) */
  design: number;
  /** anchor ids in walking order */
  route: string[];
  /** legs[i] is route[i] to route[i+1] */
  legs: Act3Leg[];
  /** dialogue nodes on the shortest branch */
  nodes: number;
  /** counts per kind; seconds per kind are in `ACT3_BEAT_S` */
  beats: Partial<Record<Act3BeatKind, number>>;
}

export const ACT3_BEAT_S: Readonly<Record<Act3BeatKind, number>> = {
  killUnit: ACT2_BEAT_S.killUnit, search: ACT2_BEAT_S.search, interact: ACT2_BEAT_S.interact, set: ACT2_BEAT_S.set,
  stealthSection: ACT2_BEAT_S.stealthSection, dive: 30, rhythm: ACT2_BEAT_S.rhythm, boss: ACT2_BEAT_S.boss,
};

export const ACT3_SPEED_MPS = { ride: RIDE_MPS, foot: WALK_MPS, wade: 2.5, wadeBoots: 3.5, glide: 10, ferry: 5, follow: ROUTE_FOLLOW_MPS } as const;
/** The block's Part 7.1 design minutes (420) and K16's gate. */
export const BLOCK_GATE = 0.52;
export const ROW_GATE = 0.45;

type Space = 'world' | 'greyfen-chapel' | 'greyfen-deeps' | 'greyfen-hut';
interface At { space: Space; x: number; z: number }

const interior = (space: Space, def: { anchors: readonly { id: string; x: number; z: number }[] }): Array<[string, At]> =>
  def.anchors.map((a) => [a.id, { space, x: a.x, z: a.z }]);
const INTERIOR_AT = new Map<string, At>([
  ...interior('greyfen-chapel', CHAPEL_DEF), ...interior('greyfen-deeps', DEEPS_DEF), ...interior('greyfen-hut', HUT_DEF),
]);
const TRIGGER_AT = new Map(GREYFEN_LAYOUT.triggers.filter((t) => t.shape === 'sphere').map((t) => [t.id, { x: (t as { x: number }).x, z: (t as { z: number }).z }]));

/** Where an anchor or trigger is: the layout (and the extras) outdoors, an interior's local metres inside. Throws on an unknown id. */
export function paceAt(id: string): At {
  const inside = INTERIOR_AT.get(id);
  if (inside) return inside;
  const t = TRIGGER_AT.get(id);
  if (t) return { space: 'world', x: t.x, z: t.z };
  const w = greyfenXZ(id);
  if (!w) throw new Error(`greyfen pacing: unknown anchor ${id}`);
  return { space: 'world', x: w.x, z: w.z };
}

type Step = readonly [Act3LegMode, string];
const R = (to: string): Step => ['ride', to];
const F = (to: string): Step => ['foot', to];
const W = (to: string): Step => ['wade', to];
const D = (to: string): Step => ['door', to];
const B = (to: string): Step => ['ferry', to];

/** The legs of a row with their measured metres, from the anchors (K3's layout, the extras, the interiors' local anchors). */
export function paceLegs(row: Act3PaceRow): Act3PaceLeg[] {
  return row.legs.map((mode, i): Act3PaceLeg => {
    const from = row.route[i];
    const to = row.route[i + 1];
    if (mode === 'door') return { mode, from, to, metres: 0 };
    const a = paceAt(from);
    const b = paceAt(to);
    if (a.space !== b.space) throw new Error(`greyfen pacing ${row.quest}: ${from} to ${to} crosses a door but is a ${mode} leg`);
    return { mode, from, to, metres: Math.round(Math.hypot(b.x - a.x, b.z - a.z) * 10) / 10 };
  });
}

function build(quest: string, design: number, start: string, steps: readonly Step[], nodes: number, beats: Act3PaceRow['beats']): Act3PaceRow {
  const route = [start, ...steps.map((s) => s[1])];
  const legs = steps.map((s) => s[0]);
  const row: Act3PaceRow = { quest, design, route, legs, nodes, beats };
  paceLegs(row); // throws on an unknown anchor or a leg that crosses a door
  return row;
}

const REED = 'greyfen.reedgate.folk.';
const KNOT = (k: number): string => `greyfen.spawn.m23.knot.${k}.2`;
const TORCH = (n: number): string => `greyfen.r12.bed.${n}.torch`;

export const GREYFEN_PACE: readonly Act3PaceRow[] = [
  // M23: Leofa, the folk and the causeway ranger; the causeway ridden to the Mere (cart, knot 1, marker, bridge 1, pack, knot 2, bridge 2, knot 3), the first sight, the shore
  build('m23', 45, 'npc-post.leofa.reedgate', [
    F(`${REED}1`), F(`${REED}2`), F(`${REED}3`), F('npc-post.ranger.causeway'),
    R('greyfen.m23.search.1'), R(KNOT(1)), R('greyfen.m23.search.2'), R('greyfen.m23.bridge.1'), R('greyfen.m23.bridge.1.far'), R('greyfen.m23.search.3'),
    R(KNOT(2)), R('greyfen.m23.bridge.2'), R('greyfen.m23.bridge.2.far'), R(KNOT(3)), R('trg.greyfen.mere.first-sight'),
    W('greyfen.m23.search.4'), F('npc-post.leofa.mere'),
  ], 32, { killUnit: 9, search: 4, interact: 2, set: 1 }),
  // M24: the ferry folk, five soundings in the flats and the wreck's leeches (wading), the pool dived twice, the horn blown, the first run to the Mere and back
  build('m24', 40, 'npc-post.dudda.ferry', [
    F('npc-post.hild.ferry'), F('greyfen.ferry.hand.1'), F('greyfen.ferry.hand.2'), F('npc-post.widow.ferry'),
    W('greyfen.m24.sound.1'), W('greyfen.m24.sound.2'), W('greyfen.m24.sound.3'), W('greyfen.m24.sound.4'), W('greyfen.m24.sound.5'),
    W('greyfen.spawn.m24.wreck.1'), W('greyfen.m24.pool.entry'), D('greyfen.m24.pool.horn'), D('greyfen.m24.pool.entry'), F('greyfen.m24.horn.blow'),
    F('greyfen.ferry.reedgate'), B('greyfen.ferry.mere'), B('greyfen.ferry.reedgate'), F('npc-post.dudda.ferry'),
  ], 33, { search: 5, dive: 2, killUnit: 4, interact: 2 }),
  // R12 (the torch branch, the shorter): the cutters, the three tallies, five beds torched, back to Dudda
  build('r12', 35, 'npc-post.dudda.ferry', [
    R('greyfen.r12.cutter.1'), W(TORCH(1)), F('greyfen.r12.search.1'), R('greyfen.r12.cutter.2'), W(TORCH(4)), W(TORCH(5)), F('greyfen.r12.search.3'),
    R(TORCH(3)), F('greyfen.r12.search.2'), W(TORCH(2)), R('npc-post.dudda.ferry'),
  ], 28, { interact: 5, killUnit: 6, search: 3 }),
  // M25: the hut and its beds; the shelf, the cauldron and Gytha are indoors (doors cost nothing)
  build('m25', 50, 'npc-post.gytha.hut', [
    F('greyfen.m25.cutter'), F('greyfen.hut.door'), D('greyfen.hut.entry'), F('greyfen.m25.shelf'), F('npc-post.gytha.inside'), D('greyfen.hut.door'),
    F('greyfen.m25.herb.1'), F('greyfen.m25.herb.1.pick'), F('greyfen.m25.herb.2'), F('greyfen.m25.herb.2.pick'), F('greyfen.m25.herb.3'), F('greyfen.m25.herb.3.pick'),
    F('greyfen.spawn.m25.herbs.1'), F('greyfen.hut.door'), D('greyfen.hut.entry'), F('greyfen.m25.cauldron'), F('npc-post.gytha.inside'),
  ], 47, { search: 4, killUnit: 6, interact: 6 }),
  // R14: Greywatch, the four posts in order, the deserter's camp and back
  build('r14', 45, 'npc-post.leofa.greywatch', [
    R('greyfen.r14.sign.1.1'), F('greyfen.r14.sign.1.2'), F('greyfen.r14.ranger.1'),
    R('greyfen.r14.sign.2.1'), F('greyfen.r14.sign.2.2'), F('greyfen.r14.ranger.2'),
    R('greyfen.r14.sign.3.1'), F('greyfen.r14.sign.3.2'), F('greyfen.r14.tied'),
    R('greyfen.r14.sign.4.1'), F('greyfen.r14.sign.4.2'), F('greyfen.spawn.r14.leech.1'), F('greyfen.spawn.r14.post4.1'), F('npc-post.deserter.camp'),
    R('npc-post.leofa.greywatch'),
  ], 36, { search: 8, killUnit: 7, interact: 1 }),
  // R13: from the Greywatch stone to the chapel door, the nave's pockets and searches (dives are door legs, priced by the beats), the altar, Gytha
  build('r13', 45, 'greyfen.r13.gytha', [
    F('npc-post.bell-keeper.door'), D('greyfen.chapel.entry'), F('greyfen.r13.search.1'), F('greyfen.r13.search.2'),
    D('greyfen.r13.pocket.1'), D('greyfen.r13.pocket.2'), D('greyfen.r13.pocket.3'), F('greyfen.r13.search.3'), F('greyfen.spawn.r13.nave.4'), D('greyfen.r13.altar'),
    F('greyfen.r13.search.5'), F('greyfen.r13.search.4'), F('greyfen.r13.altar'), D('greyfen.chapel.door'), F('npc-post.bell-keeper.door'), F('greyfen.r13.gytha'),
  ], 34, { dive: 4, search: 5, killUnit: 5, rhythm: 2 }),
  // M26: the Mere shore (wading), nets, searches and the rite at the stone
  build('m26', 55, 'waystone.hathrens-mere', [
    F('greyfen.m26.gytha'), F('npc-post.leofa.mere'), W('greyfen.mere.shore'), W('greyfen.spawn.m26.nets.1'), W('greyfen.spawn.m26.nets.5'), W('greyfen.spawn.m26.nets.7'),
    W('greyfen.m26.search.1'), W('greyfen.m26.search.2'), W('greyfen.m26.search.3'), W('greyfen.m26.search.4'), W('greyfen.m26.search.5'),
    W('greyfen.mere.net.1'), W('greyfen.mere.net.2'), W('greyfen.mere.net.3'), W('greyfen.mere.net.4'), F('greyfen.mere.shrine'), W('greyfen.m26.scale-bed'), F('greyfen.m26.gytha'),
  ], 41, { killUnit: 8, search: 5, interact: 5, set: 2 }),
  // M27 (the stealth branch, pack 1 unfought): the blinds crept through, pack 2 fought at the cages, the brood freed
  build('m27', 45, 'npc-post.leofa.mere', [
    F('greyfen.m27.keeper'), W('greyfen.m27.search.1'), W('greyfen.m27.blind.1'), W('greyfen.m27.blind.4'), W('greyfen.m27.search.2'), W('greyfen.m27.search.3'),
    W('greyfen.spawn.m27.pack.2.1'), W('greyfen.m27.search.4'), W('greyfen.m27.brood.1'), W('greyfen.m27.brood.2'), W('greyfen.m27.brood.3'), F('npc-post.leofa.mere'),
  ], 33, { stealthSection: 1, killUnit: 4, search: 4, interact: 3 }),
  // D05: Gytha at the Deeps door, four dives through the Deeps (door legs), the sluices, the arena
  build('d05', 60, 'waystone.hathrens-mere', [
    R('greyfen.d05.gytha'), F('greyfen.deeps.door'), D('greyfen.deeps.entry'), D('greyfen.d05.pocket.1'), F('greyfen.d05.search.1'), F('greyfen.spawn.d05.cell-1.1'),
    D('greyfen.d05.pocket.2'), F('npc-post.monk-echo.deeps'), F('greyfen.d05.sluice.1'), F('greyfen.spawn.d05.sluice-1.1'), F('greyfen.d05.search.2'),
    D('greyfen.d05.pocket.3'), F('greyfen.spawn.d05.cell-3.1'), F('greyfen.d05.search.3'), D('greyfen.d05.pocket.4'), F('greyfen.spawn.d05.sluice-2.1'),
    F('greyfen.d05.sluice.2'), F('greyfen.d05.search.4'), F('greyfen.d05.arena.centre'),
  ], 28, { dive: 4, killUnit: 12, search: 4, interact: 2, boss: 1 }),
];

export interface Act3PaceResult { quest: string; minutes: number; travelS: number; cappedTravelS: number; talkAndBeatsS: number; share: number }

const legSpeed = (leg: Act3PaceLeg, quest: string): number =>
  leg.mode === 'wade' ? (quest === 'm23' ? ACT3_SPEED_MPS.wade : ACT3_SPEED_MPS.wadeBoots) : leg.mode === 'door' ? Infinity : ACT3_SPEED_MPS[leg.mode];

/** One row's estimate: travel at its legs' speeds, capped at 3/7 of talk-and-beats; `share` is minutes over the design minutes. */
export function paceRow(row: Act3PaceRow, over: { nodes?: number } = {}): Act3PaceResult {
  const travelS = paceLegs(row).reduce((s, l) => s + l.metres / legSpeed(l, row.quest), 0);
  const beatS = (Object.entries(row.beats) as [Act3BeatKind, number][]).reduce((s, [k, n]) => s + ACT3_BEAT_S[k] * n, 0);
  const talkAndBeatsS = (over.nodes ?? row.nodes) * TALK_NODE_S + beatS;
  const capped = cappedTravelS(travelS, talkAndBeatsS);
  const minutes = (capped + talkAndBeatsS) / 60;
  return { quest: row.quest, minutes, travelS, cappedTravelS: capped, talkAndBeatsS, share: minutes / row.design };
}

/** The block: the nine rows' minutes over their design minutes (the K16 gate is 52%). */
export function paceBlock(rows: readonly Act3PaceRow[] = GREYFEN_PACE): { minutes: number; design: number; share: number } {
  const minutes = rows.reduce((s, r) => s + paceRow(r).minutes, 0);
  const design = rows.reduce((s, r) => s + r.design, 0);
  return { minutes, design, share: minutes / design };
}
