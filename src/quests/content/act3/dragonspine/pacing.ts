// Pacing rows for the seven lower Dragonspine quests (plans/act3-K13.md section 4), measured on K4's real anchors (the layout and the
// collapsed cave's local anchors); positions are never written down here. The shape is K16's `Act3PaceRow` (as K12 copied it):
// `quest`, `design`, `route` (anchor ids), `legs` (one explicit mode per leg), `nodes`, `beats`. The published
// src/integration/act3Timing.ts does not exist yet, so the type is kept here, field for field, plus the two things this block adds:
// the `sled` leg (a hauled sled is dragged at 60% of walking speed) and the `sled` and `carry` beats.
//
// estimate = (min(travel, 3/7 x talkAndBeats) + talkAndBeats) / 60, talkAndBeats = nodes x 20 s + the beats' seconds.
// Speeds: foot 4.5 (every leg here is on foot: the climbs are off-road and a held carry refuses the Ashmare), sled 2.7, follow 2.
// A door costs nothing. Each quest starts where a waystone fast travel leaves the player (the lodge, Rime Pass and the Last Anvil
// have stones), so no long walk is charged for reaching the first giver; the way back is charged only where no stone is near.
import { ACT2_BEAT_S, ROUTE_FOLLOW_MPS, TALK_NODE_S, WALK_MPS, cappedTravelS } from '../../../../integration/timing';
import { dragonspineBuild } from '../../../../dragonspine/layout';
import { DRAGONSPINE_INTERIORS } from '../../../../dragonspine/interiors';
import { SECTIONS } from '../../../../stealth/sections';

/** 'door' = an interior frame change, 0 distance. */
export type Act3Leg = 'ride' | 'foot' | 'wade' | 'glide' | 'ferry' | 'follow' | 'door' | 'sled';
export type Act3Beat = 'killUnit' | 'search' | 'interact' | 'leap' | 'set' | 'stealthSection' | 'carry' | 'sled';
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
  beats: Partial<Record<Act3Beat, number>>;
}

export const ACT3_BEAT_S: Readonly<Record<Act3Beat, number>> = {
  killUnit: ACT2_BEAT_S.killUnit, search: ACT2_BEAT_S.search, interact: ACT2_BEAT_S.interact, leap: ACT2_BEAT_S.leap, set: ACT2_BEAT_S.set,
  stealthSection: ACT2_BEAT_S.stealthSection, carry: ACT2_BEAT_S.carry,
  /** one sled hauled: hitching it, the haul's stops, a hawk's stoop dodged, setting it down */
  sled: 90,
};

export const ACT3_SPEED_MPS = { foot: WALK_MPS, sled: WALK_MPS * 0.6, follow: ROUTE_FOLLOW_MPS, ride: 9, wade: 3.5, glide: 10, ferry: 5 } as const;
/** The block's Part 7.1 design minutes (295) and the row gate. */
export const ROW_GATE = 0.45;

const CAVE = 'collapsed-cave';
interface At { space: string; x: number; z: number }
const WORLD = new Map<string, At>(dragonspineBuild().layout.anchors.map((a: { id: string; x: number; z: number }) => [a.id, { space: 'world', x: a.x, z: a.z }]));
const INSIDE = new Map<string, At>(
  DRAGONSPINE_INTERIORS.filter((d) => d.id === CAVE).flatMap((d) => d.anchors.map((a): [string, At] => [a.id, { space: CAVE, x: a.x, z: a.z }])),
);

/** Where an anchor is: the layout outdoors, an interior's local metres inside. Throws on an unknown id. */
export function paceAt(id: string): At {
  const at = INSIDE.get(id) ?? WORLD.get(id);
  if (!at) throw new Error(`dragonspine pacing: unknown anchor ${id}`);
  return at;
}

type Step = readonly [Act3Leg, string];
const F = (to: string): Step => ['foot', to];
const S = (to: string): Step => ['sled', to];
const D = (to: string): Step => ['door', to];

/** The legs of a row with their measured metres. */
export function paceLegs(row: Act3PaceRow): Act3PaceLeg[] {
  return row.legs.map((mode, i): Act3PaceLeg => {
    const from = row.route[i]!;
    const to = row.route[i + 1]!;
    if (mode === 'door') return { mode, from, to, metres: 0 };
    const a = paceAt(from);
    const b = paceAt(to);
    if (a.space !== b.space) throw new Error(`dragonspine pacing ${row.quest}: ${from} to ${to} crosses a door but is a ${mode} leg`);
    return { mode, from, to, metres: Math.round(Math.hypot(b.x - a.x, b.z - a.z) * 10) / 10 };
  });
}

function build(quest: string, design: number, start: string, steps: readonly Step[], nodes: number, beats: Act3PaceRow['beats']): Act3PaceRow {
  const route = [start, ...steps.map((s) => s[1])];
  const row: Act3PaceRow = { quest, design, route, legs: steps.map((s) => s[0]), nodes, beats };
  paceLegs(row); // throws on an unknown anchor or a leg that crosses a door
  return row;
}

const n = (prefix: string, from: number, to: number): string[] => Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);
const feet = (ids: string[]): Step[] => ids.map(F);
const CAIRN = (k: number): string => `dragonspine.m28.cairn.${k}`;
const WAY = (k: number): string => `dragonspine.wayside.${k}`;
const CARVING = (k: number): string => `dragonspine.anvil.carving.${k}`;

export const DRAGONSPINE_PACE: readonly Act3PaceRow[] = [
  // M28: Thorgar and the four hunters at the lodge, the trail up (trailhead, scout, four cairns, two ledges) to the crag and its view (the nine-second camera hold is covered by Cael's three view lines, counted as nodes, not as a set piece)
  build('m28', 50, 'waystone.wyrmwatch-lodge', [
    F('npc-post.thorgar.yard'), ...feet(n('npc-post.lodge-hunter-', 1, 4)), F('dragonspine.m28.trailhead'), F('dragonspine.spawn.m28.scout'),
    F(CAIRN(1)), F('dragonspine.m28.leap.1.launch'), F('dragonspine.m28.leap.1'), F(CAIRN(2)), F(CAIRN(3)), F('dragonspine.m28.leap.2.launch'), F('dragonspine.m28.leap.2'),
    F(CAIRN(4)), F('dragonspine.m28.crag'), F('dragonspine.m28.crag.view'),
  ], 35, { killUnit: 8, search: 4, leap: 2 }),
  // R15: three sleds from the shed to the cache and the walk back for the next, the unload and the choice at the cache, Thorgar
  build('r15', 40, 'waystone.wyrmwatch-lodge', [
    F('npc-post.thorgar.yard'), F('npc-post.sled-hand-1'), F('npc-post.sled-hand-2'),
    F('dragonspine.r15.sled-start.1'), S('dragonspine.r15.cache'), F('dragonspine.r15.sled-start.2'), S('dragonspine.r15.cache'),
    F('dragonspine.r15.sled-start.3'), S('dragonspine.r15.cache'), F('npc-post.thorgar.yard'),
  ], 26, { sled: 3, killUnit: 6, interact: 1 }),
  // M29: Eadgyth's fire, the five trophies on her wall, the woodpile (two hawks), back to the fire, her confession
  build('m29', 40, 'waystone.rime-pass', [
    F('npc-post.eadgyth.fire'), ...feet(n('dragonspine.shelter.trophy.', 1, 5)), F('dragonspine.spawn.shelter.hawk-1'), F('dragonspine.shelter.woodpile'),
    F('dragonspine.shelter.fire'), F('npc-post.eadgyth.fire'),
  ], 40, { search: 5, interact: 2, killUnit: 2, set: 1 }),
  // R16 (the shorter branch): the cave trail and the ledge at the mouth, the pack, the passage, the rockfall, the chamber, the axe; back to Eadgyth at the fire
  build('r16', 40, 'waystone.rime-pass', [
    F('npc-post.eadgyth.fire'), F('dragonspine.cave.trailhead'), F('npc-post.lodge-hunter-cave'), F('dragonspine.cave.leap.launch'), F('dragonspine.cave.leap'),
    F('dragonspine.spawn.cave.ogre'), F('dragonspine.cave.mouth'),
    D('dragonspine.cave.inside'), F('dragonspine.cave.search.1'), F('dragonspine.cave.search.2'), F('dragonspine.cave.rockfall'),
    F('dragonspine.cave.search.3'), F('dragonspine.cave.search.4'), F('dragonspine.cave.search.5'), F('dragonspine.cave.search.6'), F('dragonspine.cave.axe'),
    D('dragonspine.cave.exit'), D('dragonspine.cave.mouth'), F('npc-post.eadgyth.fire'),
  ], 30, { search: 6, killUnit: 5, interact: 2, leap: 1 }),
  // M30: Ansgar at the Anvil, the pilgrim, the shoulder (an ogre and hawks), the sweep and relight, the six carvings round the ring, the two marks
  build('m30', 50, 'waystone.last-anvil', [
    F('npc-post.ansgar.anvil'), F('npc-post.pilgrim-3'), F('dragonspine.spawn.anvil.hawk-2'), F('dragonspine.spawn.anvil.ogre'), F('dragonspine.anvil.shrine'),
    ...feet([1, 2, 3, 4, 5, 6].map(CARVING)), F('dragonspine.anvil.mark.1'), F('dragonspine.anvil.mark.2'), F('npc-post.ansgar.anvil'),
  ], 39, { search: 8, killUnit: 6, interact: 4 }),
  // R17 (on foot: a held carry refuses the Ashmare): the bundle at the Anvil, shrines 3, 2 (and a pilgrim), 1, then back up past the Anvil to 4, 5 (a pilgrim), 6, and Ansgar
  build('r17', 35, 'waystone.last-anvil', [
    F('npc-post.ansgar.anvil'), F('dragonspine.anvil.shrine'), F(WAY(3)), F(WAY(2)), F('npc-post.pilgrim-1'), F(WAY(1)),
    F('dragonspine.anvil.shrine'), F(WAY(4)), F(WAY(5)), F('npc-post.pilgrim-2'), F(WAY(6)), F('npc-post.ansgar.anvil'),
  ], 22, { interact: 6, carry: 6, killUnit: 4 }),
  // R18: Thorgar, the walk to the thief's camp (the cliffs have no stone), his talk, the camp, three eggs carried up the climb to the nest and back for the next, Thorgar
  build('r18', 40, 'waystone.wyrmwatch-lodge', [
    F('npc-post.thorgar.yard'), F('npc-post.egg-thief'), F('dragonspine.hawk.camp.search.1'), F('dragonspine.hawk.camp.search.3'), F('dragonspine.hawk.camp.search.4'),
    F('dragonspine.hawk.egg.1'), ...feet(n('dragonspine.hawk.climb.', 1, 15)), F('dragonspine.hawk.nest.r18'),
    ...feet(n('dragonspine.hawk.climb.', 1, 15).reverse()), F('dragonspine.hawk.egg.2'), ...feet(n('dragonspine.hawk.climb.', 1, 15)), F('dragonspine.hawk.nest.2'),
    ...feet(n('dragonspine.hawk.climb.', 1, 15).reverse()), F('dragonspine.hawk.egg.3'), ...feet(n('dragonspine.hawk.climb.', 1, 15)), F('dragonspine.hawk.nest.3'),
    F('npc-post.thorgar.yard'),
  ], 27, { search: 4, carry: 3, stealthSection: SECTIONS.filter((x) => x.quest.id === 'r18').length, interact: 3 }),
];

export interface Act3PaceResult { quest: string; minutes: number; travelS: number; cappedTravelS: number; talkAndBeatsS: number; share: number }

const legSpeed = (leg: Act3PaceLeg): number => (leg.mode === 'door' ? Infinity : ACT3_SPEED_MPS[leg.mode]);

/** One row's estimate: travel at its legs' speeds, capped at 3/7 of talk-and-beats; `share` is minutes over the design minutes. */
export function paceRow(row: Act3PaceRow, over: { nodes?: number } = {}): Act3PaceResult {
  const travelS = paceLegs(row).reduce((s, l) => s + l.metres / legSpeed(l), 0);
  const beatS = (Object.entries(row.beats) as [Act3Beat, number][]).reduce((s, [k, c]) => s + ACT3_BEAT_S[k] * c, 0);
  const talkAndBeatsS = (over.nodes ?? row.nodes) * TALK_NODE_S + beatS;
  const capped = cappedTravelS(travelS, talkAndBeatsS);
  const minutes = (capped + talkAndBeatsS) / 60;
  return { quest: row.quest, minutes, travelS, cappedTravelS: capped, talkAndBeatsS, share: minutes / row.design };
}

/** The block: the seven rows' minutes over their design minutes (about 51%). */
export function paceBlock(rows: readonly Act3PaceRow[] = DRAGONSPINE_PACE): { minutes: number; design: number; share: number } {
  const minutes = rows.reduce((s, r) => s + paceRow(r).minutes, 0);
  const design = rows.reduce((s, r) => s + r.design, 0);
  return { minutes, design, share: minutes / design };
}
