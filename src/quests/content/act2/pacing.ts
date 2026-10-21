// Phase C pacing evidence (plans/act2-A12.md section 5): a pure estimate of each Cinderreach quest's play time from the
// same formula as src/integration/TIMING.md (travel at walking pace, 20 s a dialogue node, beat seconds), with the route
// read from real layout anchors. A16 owns the act-wide estimator; this table lets the quests be checked against their
// design floors without it.
import { ACT2_BEAT_S, RIDE_MPS, TALK_NODE_S, WALK_MPS, cappedTravelS } from '../../../integration/timing';

export { ACT2_BEAT_S };

export type Act2Beat = keyof typeof ACT2_BEAT_S;

export interface PaceRow {
  quest: string;
  /** design minutes (Part 7) and the floor under which the quest is too short */
  design: number;
  floor: number;
  /** anchor ids, in the order the player walks them; `rideFrom` is how many legs from the start are mounted */
  route: string[];
  rideLegs?: number;
  /** dialogue nodes on the shortest branch */
  nodes: number;
  beats: Partial<Record<Act2Beat, number>>;
}

export const ACT2_PACE: readonly PaceRow[] = [
  {
    quest: 'm11', design: 31.7, floor: 18, rideLegs: 1, nodes: 34,
    route: ['harrowmark.gate.river.inside', 'cinderreach.m11.ambush.1', 'cinderreach.m11.search.1', 'cinderreach.m11.search.2', 'cinderreach.m11.search.3', 'cinderreach.m11.search.4', 'cinderreach.m11.bloom.1', 'npc-post.gaut.cinder-road'],
    beats: { killUnit: 11, interact: 4, note: 4, set: 1 },
  },
  {
    quest: 'm12', design: 27.6, floor: 20, rideLegs: 1, nodes: 22,
    route: ['npc-post.gaut.cinder-road', 'npc-post.osgar.barricade', 'cinderreach.m12.prep.1', 'cinderreach.m12.prep.3', 'cinderreach.m12.wounded.1', 'cinderreach.m12.refuge.dropoff', 'cinderreach.m12.wounded.2', 'cinderreach.m12.refuge.dropoff', 'cinderreach.m12.wounded.3', 'cinderreach.m12.wounded.4', 'npc-post.osgar.barricade'],
    beats: { waveEnemy: 21, interact: 5, structure: 2, note: 4, carry: 2 },
  },
  {
    quest: 'r06', design: 19.1, floor: 16, nodes: 40,
    route: ['npc-post.maud.refuge', 'cinderreach.r06.sample.1', 'cinderreach.r06.sample.3', 'cinderreach.r06.wellhouse.1', 'npc-post.household-1', 'npc-post.household-2', 'npc-post.household-3', 'npc-post.household-4', 'npc-post.maud.refuge', 'cinderreach.r06.household.1', 'cinderreach.r06.cart', 'cinderreach.r06.household.4', 'cinderreach.r06.cart', 'cinderreach.r06.well', 'npc-post.maud.refuge'],
    beats: { interact: 4, note: 4, carry: 4 },
  },
  {
    quest: 'r05', design: 20.1, floor: 14, nodes: 26,
    route: ['npc-post.ketta.pasture', 'cinderreach.pasture.hollow.1', 'cinderreach.pasture.hollow.2', 'cinderreach.pasture.hollow.3', 'cinderreach.r05.track.1', 'cinderreach.r05.track.2', 'cinderreach.r05.track.3', 'cinderreach.r05.fox.1', 'cinderreach.r05.fox.2', 'cinderreach.r05.fox.3', 'cinderreach.r05.fox.4', 'cinderreach.r05.home', 'npc-post.ketta.pasture'],
    beats: { interact: 11, killUnit: 3, herd: 4 },
  },
  {
    quest: 'm13', design: 22.1, floor: 20, nodes: 38,
    route: ['npc-post.hrolf', 'cinderreach.m13.hall.1', 'cinderreach.m13.log.1', 'cinderreach.stonefold.ring.centre', 'cinderreach.m13.log.2', 'cinderreach.stonefold.ring.centre', 'cinderreach.m13.log.3', 'cinderreach.stonefold.ring.centre', 'cinderreach.m13.boulder', 'cinderreach.m13.hall.3', 'cinderreach.stonefold.ring.centre', 'npc-post.hrolf'],
    beats: { carry: 3, structure: 1, bout: 3, note: 3 },
  },
  {
    quest: 'r07', design: 16.9, floor: 14, nodes: 24,
    route: ['npc-post.ketta.stonefold', 'cinderreach.r07.sign.1', 'cinderreach.r07.sign.2', 'cinderreach.r07.sign.3', 'cinderreach.r07.sign.4', 'cinderreach.r07.sign.5', 'cinderreach.spawn.houndden.1', 'cinderreach.r07.pup.1', 'npc-post.ketta.stonefold'],
    beats: { interact: 7, killUnit: 4 },
  },
  {
    quest: 'r11', design: 19.0, floor: 16, nodes: 32,
    route: ['npc-post.hrolf', 'cinderreach.r11.camp.1', 'cinderreach.r11.camp.2', 'cinderreach.r11.camp.3', 'cinderreach.den.ledge.1', 'cinderreach.den.ledge.2', 'cinderreach.den.wyrm.rest', 'cinderreach.r11.axe', 'npc-post.hrolf'],
    beats: { note: 3, leap: 2, killUnit: 5, interact: 1 },
  },
  {
    quest: 'm14', design: 25.3, floor: 22, nodes: 38,
    route: ['npc-post.aelfreda.anvil', 'cinderreach.hushed-anvil.ledge.1', 'cinderreach.hushed-anvil.ledge.2', 'cinderreach.hushed-anvil.ledge.3', 'cinderreach.hushed-anvil.site', 'npc-post.lantern-keeper.anvil', 'cinderreach.hushed-anvil.site', 'npc-post.aelfreda.anvil'],
    beats: { leap: 3, killUnit: 5, interact: 4, rhythm: 2, set: 1 },
  },
  {
    quest: 'm15', design: 26.0, floor: 20, nodes: 30,
    route: ['npc-post.osgar.camp', 'cinderreach.m15.search.1', 'cinderreach.m15.search.2', 'cinderreach.m15.search.3', 'cinderreach.m15.search.4', 'cinderreach.m15.carter', 'cinderreach.m15.cage', 'npc-post.osgar.camp'],
    beats: { stealthSection: 1, killUnit: 8, interact: 6, set: 1 },
  },
  {
    quest: 'd03', design: 25.8, floor: 24, nodes: 34,
    route: ['npc-post.osgar.scorchhold', 'cinderreach.d03.gate', 'cinderreach.spawn.scorchhold.1', 'cinderreach.spawn.scorchhold.perch.1', 'cinderreach.scorchhold.keep.door', 'cinderreach.scorchhold.keep.door', 'npc-post.osgar.scorchhold'],
    beats: { killUnit: 11, interact: 9, note: 4, boss: 1 },
  },
];

export type AnchorPos = Readonly<Record<string, { x: number; z: number }>>;

export interface PaceResult { quest: string; minutes: number; travelM: number; uncappedMinutes: number }

/** The row's estimated minutes (straight horizontal legs; a mounted leg at the canter). An unknown anchor throws. */
export function paceMinutes(row: PaceRow, anchors: AnchorPos): PaceResult {
  let travelM = 0;
  let seconds = 0;
  for (let i = 1; i < row.route.length; i++) {
    const a = anchors[row.route[i - 1]];
    const b = anchors[row.route[i]];
    if (!a) throw new Error(`pacing ${row.quest}: unknown anchor ${row.route[i - 1]}`);
    if (!b) throw new Error(`pacing ${row.quest}: unknown anchor ${row.route[i]}`);
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    travelM += d;
    seconds += d / (i <= (row.rideLegs ?? 0) ? RIDE_MPS : WALK_MPS);
  }
  let talkAndBeatsS = row.nodes * TALK_NODE_S;
  for (const [beat, n] of Object.entries(row.beats) as [Act2Beat, number][]) talkAndBeatsS += ACT2_BEAT_S[beat] * n;
  // Travel counts at most 3/7 of the talk-and-beats time (Part 7): the capped figure is the one the floors read.
  return { quest: row.quest, minutes: (cappedTravelS(seconds, talkAndBeatsS) + talkAndBeatsS) / 60, travelM, uncappedMinutes: (seconds + talkAndBeatsS) / 60 };
}
