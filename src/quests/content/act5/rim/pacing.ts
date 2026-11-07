// The Rim quests' pacing rows (plan 7.1, brief N10): each quest's route on real anchors in the order the player reaches them, one
// travel mode per leg (L13's `Act4Leg`), the dialogue nodes of its shorter branch (pinned to the real trees by the dialogue test)
// and its beats. A note read is one `search` beat, never dialogue; scene lines are not dialogue. Act 5 adds two beats N12's
// `ACT5_BEAT_S` will own (a lava crossing 30 s, a siege order 20 s); until it lands they are defined here and added on top of
// L13's formula (same cap, same talk rate).
import { ACT2_TRAVEL_CAP, TALK_NODE_S } from '../../../../integration/timing';
import { act4BeatSeconds, estimateAct4Row, type Act4Leg, type Act4PaceRow } from '../../../../integration/act4Timing';
import { CALDERA_LAYOUT } from '../../../../caldera/caldera.layout';
import { CALDERA_INTERIORS } from '../../../../caldera/interiors';
import { WASTE_LAYOUT } from '../../../../waste/waste.layout';
import { COOL, Q, STAIR } from './ids';
import { R26_ROUTE_IDS } from './anchors';
import { rimA5InteriorExtras, rimA5QuestLayout } from './layout';
import { M48_CHANNELS, M48_LEVER_CHANNELS, M48_VENT_CHANNELS } from './m48.quest';
import { M50_CHANNELS, M50_ORDER } from './m50.quest';
import { R29_POSTS } from './r29.quest';

/** Act 5's own beats (N12's table, plan 7.1): seconds per unit. */
export const RIM_LOCAL_BEAT_S = { lavaCrossing: 30, siegeOrder: 20 } as const;
export type RimLocalBeat = keyof typeof RIM_LOCAL_BEAT_S;
/** The brief's floor for every Phase I row. */
export const PHASE_I_ROW_FLOOR = 0.52;

export interface RimPaceRow extends Act4PaceRow { local?: Partial<Record<RimLocalBeat, number>> }
export interface RimTimingRow { quest: string; travelS: number; countedTravelS: number; talkS: number; beatS: number; estimateMin: number; designMin: number; share: number }

type Step = readonly [Act4Leg, string];
function build(quest: string, design: number, start: string, steps: readonly Step[], nodes: number, beats: Act4PaceRow['beats'], local?: RimPaceRow['local']): RimPaceRow {
  return { quest, design, route: [start, ...steps.map((s) => s[1])], legs: steps.map((s) => s[0]), nodes, beats, ...(local ? { local } : {}) };
}
const leg = (mode: Act4Leg) => (...ids: string[]): Step[] => ids.map((id) => [mode, id] as const);
const foot = leg('foot');
const cart = leg('cart');
const door = leg('door');
const q = (s: string): string => `${Q}.${s}`;
const RIM = (id: string): string => `npc-post.${id}.rim`;
const HROLF = 'caldera.camp.companion.hrolf';

/**
 * Dialogue nodes of each quest's shorter branch, by the shipped convention (L13): its talk rows and choices, pinned to the trees
 * by the dialogue test. M47 carries the two nodes the coordinator asked for at Alric's post (ruling 1).
 */
export const RIM_A5_NODES = { m47: 28, m48: 28, m49: 52, r26: 23, r29: 24, m50: 26, m51: 44 } as const;

export const RIM_A5_PACE: readonly RimPaceRow[] = [
  // M47: Wulfhild at the Rimfoot fire, the knots on the switchbacks, the hairpin and the journal, the inscription, the winch, Alric,
  // Edric and Rook, the brazier, the lamp, the bell, the waystone, Alric
  build('m47', 40, 'npc-post.wulfhild.rimfoot', [
    ...foot(q('m47.knot1.2'), q('m47.hairpin'), q('m47.journal'), q('m47.knot2.2'), q('m47.inscription'), 'caldera.rim-gate.winch',
      q('post.alric.gate'), q('post.edric.gate'), q('post.rook.gate'), q('m47.brazier'), q('m47.lamp'), q('m47.bell'), 'waystone.rim-camp', q('post.alric.gate')),
  ], RIM_A5_NODES.m47, { killUnit: 6, search: 3, interact: 4, set: 1 }),
  // M48: Alric at the head; down the stair, each channel's wheel or lever then its far lip, the notes, the golems, the ghost and
  // the gnats on the way; the cache and Alric at the foot
  build('m48', 45, q('post.alric.stair'), [
    ...foot(...M48_CHANNELS.flatMap((n) => {
      const v = (M48_VENT_CHANNELS as readonly number[]).indexOf(n);
      const pre = v >= 0 ? `${STAIR}.vent.${v + 1}` : `${STAIR}.lever.${(M48_LEVER_CHANNELS as readonly number[]).indexOf(n) + 1}`;
      const extra = n === 1 ? [q('m48.marks')] : n === 2 ? [q('m48.golems.1')] : n === 3 ? [q('post.m48.ghost')] : n === 4 ? [q('m48.tally')] : n === 5 ? [q('m48.gnats.1')] : [];
      return [pre, `${STAIR}.chan.${n}`, ...extra];
    }), q('m48.cache'), q('post.alric.foot')),
  ], RIM_A5_NODES.m48, { killUnit: 8, interact: 6, search: 3, set: 1 }, { lavaCrossing: 6 }),
  // M49: Hrolf, the signal fire, the arrival; the six allies round the fire, the plan and the tally; the camp's banner (the shorter
  // branch: no House won), the war table, the three posts, Hrolf
  build('m49', 40, HROLF, [
    ...foot(q('m49.signal'), ...['wystan', 'merrin', 'wenna', 'wulfhild', 'rook', 'edric'].map(RIM), q('m49.plan'), q('m49.tally'),
      q('m49.banner.camp'), 'caldera.camp.war-table', q('m49.post.brace'), q('m49.post.crates'), q('m49.post.wall'), HROLF),
  ], RIM_A5_NODES.m49, { interact: 5, search: 2, set: 2 }),
  // R26 (the fast road, the measured branch): Merrin, down to Rimfoot, the guard, the manifest, the master, the load; the cart up
  // the stairs (two ambushes); the unload, the waybill, Merrin
  build('r26', 40, RIM('merrin'), [
    ...foot(q('post.r26.guard.1'), q('r26.manifest'), q('post.r26.master'), q('r26.load')),
    ...cart(...R26_ROUTE_IDS.fast),
    ...foot(q('r26.unload'), q('r26.waybill'), RIM('merrin')),
  ], RIM_A5_NODES.r26, { killUnit: 8, interact: 2, search: 2, set: 1 }),
  // R29: Ansgar; at each post the shade, the search, the dead and the part, carried back to the gong; the hang, the strike, Ansgar
  build('r29', 35, RIM('ansgar'), [
    ...foot(...R29_POSTS.flatMap((n) => [q(`post.r29.stoker.${n}`), q(`r29.search.${n}`), q(`r29.dead.${n}.1`), q(`r29.part.${n}`), 'caldera.stokers.gong']), RIM('ansgar')),
  ], RIM_A5_NODES.r29, { search: 3, killUnit: 6, interact: 4, rhythm: 1, set: 1 }),
  // M50: Alric at the camp, the Hall's door; inside, Alric, the keeper, the chart; each channel's three wheels in the chart's
  // order (one fail on the first channel), the golems between; the forge's golems and mark; Alric
  build('m50', 50, RIM('alric'), [
    ...foot('caldera.door.cooling-hall'),
    ...door(`${COOL}.entry`),
    ...foot(`${COOL}.alric`, q('post.m50.keeper'), `${COOL}.chart.1`,
      ...M50_CHANNELS.flatMap((c) => [
        ...M50_ORDER[c].map((w) => `${COOL}.wheel.${c}.${w}`),
        ...(c === 1 ? [`${COOL}.golem.2.1`, `${COOL}.chart.2`] : c === 2 ? [`${COOL}.golem.3.1`, q('m50.gnats.1')] : []),
      ]),
      `${COOL}.golem.4.1`, `${COOL}.reward`, `${COOL}.alric`),
  ], RIM_A5_NODES.m50, { puzzle: 3, killUnit: 7, interact: 9, search: 3, set: 1 }),
  // M51: the horn-stone, Alric and Edric at the camp, the climb to the terraces and the waystone, the dragons, the scouts on the
  // east terraces and their captain, the orders, the bones, Ysmeryth
  build('m51', 50, q('m51.call'), [
    ...foot(RIM('alric'), RIM('edric'), 'waystone.wyrm-terraces', q('m51.talk.ysmeryth'), q('m51.talk.orsk'), q('m51.talk.hathren'),
      q('m51.scouts.2'), q('post.m51.captain'), q('m51.orders'), q('m51.bones'), q('m51.talk.ysmeryth')),
  ], RIM_A5_NODES.m51, { set: 3, killUnit: 4, search: 2, interact: 2 }),
];

/** L13's estimate with Act 5's local beats added to the beat sum (so they also widen the travel cap, as N12's table will). */
export function estimateRimRow(row: RimPaceRow, at: (anchor: string) => { x: number; z: number }, nodes: number = row.nodes): RimTimingRow {
  const base = estimateAct4Row(row, at, nodes);
  const localS = Object.entries(row.local ?? {}).reduce((s, [k, n]) => s + RIM_LOCAL_BEAT_S[k as RimLocalBeat] * (n ?? 0), 0);
  const talkS = nodes * TALK_NODE_S;
  const beatS = act4BeatSeconds(row.quest, row.beats) + localS;
  const countedTravelS = Math.min(base.travelS, ACT2_TRAVEL_CAP * (talkS + beatS));
  const estimateMin = (countedTravelS + talkS + beatS) / 60;
  return { quest: row.quest, travelS: base.travelS, countedTravelS, talkS, beatS, estimateMin, designMin: row.design, share: estimateMin / row.design };
}

let byId: Map<string, { x: number; z: number }> | undefined;
/** Any anchor a Rim pacing row names: N1's Caldera layout, L1's Rimfoot, my quest anchors, N2's interiors (local frames). */
export function paceAt(anchor: string): { x: number; z: number } {
  if (!byId) {
    byId = new Map([
      ...CALDERA_LAYOUT.anchors, ...WASTE_LAYOUT.anchors, ...rimA5QuestLayout().anchors, ...CALDERA_INTERIORS.flatMap((d) => d.anchors),
      ...rimA5InteriorExtras().flatMap((d) => d.anchors),
    ].map((a) => [a.id, { x: a.x, z: a.z }]));
  }
  const p = byId.get(anchor);
  if (!p) throw new Error(`rim a5 pacing: no anchor ${anchor}`);
  return p;
}
