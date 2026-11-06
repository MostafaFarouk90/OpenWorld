// The Act 4 pacing estimator (plan Part 1.2, 1.3 and 7.1; brief L13): the Act 2 and Act 3 formula with every leg marked by
// how it is travelled, adding the storm walk along a rope-line and R24's escort cart.
//
//   estimate = min(travel, 3/7 x (nodes x 20 s + sum of beats)) + nodes x 20 s + sum of beats
//
// Any quest under 40% of its design minutes fails; under 45% is reported. Phase G (PR 1) fails under 51% (plan 1.4), so
// Phase H keeps room and the act stays at 50% or more (PR 2). The quest threads (L10, L6, L11) write `Act4PaceRow`s.
import { phaseOf, ACT4_PHASE_G, type Act4Phase } from '../quests/act4Jump';
import {
  ACT2_TRAVEL_CAP, ACT4_BEAT_S, ESCORT_CART_MPS, RIDE_MPS, ROUTE_FOLLOW_MPS, STORM_WALK_MPS, TALK_NODE_S, WALK_MPS,
} from './timing';

export type Act4Beat = keyof typeof ACT4_BEAT_S;

/**
 * How one leg is travelled (plan 1.2). `ride` only outside the walls (the farm-ring, R22's waystone trips; never in the
 * Waste); `foot` inside the walls, every interior, the Underways and the Waste out of a storm; `follow` at an NPC's pace;
 * `storm` along a rope-line in a storm; `cart` beside R24's cart; `door` a load or frame change (no travel counted).
 */
export type Act4Leg = 'ride' | 'foot' | 'follow' | 'storm' | 'cart' | 'door';
export const ACT4_LEGS: readonly Act4Leg[] = ['ride', 'foot', 'follow', 'storm', 'cart', 'door'];

/** One quest's pacing row, on its shorter branch. */
export interface Act4PaceRow {
  quest: string;
  /** design minutes (plan Part 7.1) */
  design: number;
  /** anchor ids in the order the player reaches them */
  route: string[];
  /** one mode per leg: `legs[i]` is the leg from `route[i]` to `route[i + 1]` */
  legs: Act4Leg[];
  /** planned dialogue nodes on the shorter branch; a headless run passes the nodes it actually read instead */
  nodes: number;
  beats: Partial<Record<Act4Beat, number>>;
}

export const ACT4_QUEST_FLOOR = 0.4;
export const ACT4_REPORT_UNDER = 0.45;
export const ACT4_ACT_TARGET = 0.5;
/** Plan 1.4: the Phase G PR fails if Phase G measures under this share (planned 53%). */
export const PHASE_G_GATE = 0.51;
const EPS = 1e-9;

export const ACT4_LEG_MPS: Readonly<Record<Act4Leg, number>> = {
  ride: RIDE_MPS, foot: WALK_MPS, follow: ROUTE_FOLLOW_MPS, storm: STORM_WALK_MPS, cart: ESCORT_CART_MPS, door: 0,
};

export interface Act4TimingRow {
  quest: string;
  phase: Act4Phase | undefined;
  travelM: number;
  /** travel before the cap */
  travelS: number;
  /** travel after the cap */
  countedTravelS: number;
  nodes: number;
  talkS: number;
  beatS: number;
  estimateMin: number;
  designMin: number;
  share: number;
}

export const act4BeatSeconds = (quest: string, beats: Partial<Record<Act4Beat, number>>): number =>
  Object.entries(beats).reduce((s, [k, n]) => {
    const per = ACT4_BEAT_S[k as Act4Beat];
    if (per === undefined) throw new Error(`act4 timing: ${quest} has unknown beat "${k}"`);
    if (!Number.isFinite(n ?? 0) || (n ?? 0) < 0) throw new Error(`act4 timing: ${quest} beat "${k}" has count ${n}`);
    return s + per * (n ?? 0);
  }, 0);

/** The estimate from travel already summed (shared by the row estimator and the plan table). */
export function act4Estimate(
  quest: string, design: number, travelM: number, travelS: number, nodes: number, beats: Partial<Record<Act4Beat, number>>,
): Act4TimingRow {
  if (!(design > 0) || !Number.isFinite(design)) throw new Error(`act4 timing: ${quest} has design minutes ${design}`);
  for (const [k, v] of [['travel metres', travelM], ['travel seconds', travelS], ['nodes', nodes]] as const) {
    if (!Number.isFinite(v) || v < 0) throw new Error(`act4 timing: ${quest} has ${k} ${v}`);
  }
  const talkS = nodes * TALK_NODE_S;
  const beatS = act4BeatSeconds(quest, beats);
  const countedTravelS = Math.min(travelS, ACT2_TRAVEL_CAP * (talkS + beatS));
  const estimateMin = (countedTravelS + talkS + beatS) / 60;
  return { quest, phase: phaseOf(quest), travelM, travelS, countedTravelS, nodes, talkS, beatS, estimateMin, designMin: design, share: estimateMin / design };
}

/** One row on real anchors; `nodes` defaults to the row's planned count (a headless run passes what it read). */
export function estimateAct4Row(
  row: Act4PaceRow, at: (anchor: string) => { x: number; z: number }, nodes: number = row.nodes,
): Act4TimingRow {
  if (row.legs.length !== row.route.length - 1) {
    throw new Error(`act4 timing: ${row.quest} has ${row.route.length} route points but ${row.legs.length} legs (want ${row.route.length - 1})`);
  }
  let travelM = 0;
  let travelS = 0;
  for (let i = 0; i < row.legs.length; i++) {
    const leg = row.legs[i];
    if (!ACT4_LEGS.includes(leg)) throw new Error(`act4 timing: ${row.quest} leg ${i} has unknown mode "${leg}"`);
    if (leg === 'door') continue;
    const a = at(row.route[i]);
    const b = at(row.route[i + 1]);
    const m = Math.hypot(b.x - a.x, b.z - a.z);
    travelM += m;
    travelS += m / ACT4_LEG_MPS[leg];
  }
  return act4Estimate(row.quest, row.design, travelM, travelS, nodes, row.beats);
}

export interface Act4Share { estimateMin: number; designMin: number; share: number; quests: number }
export type Act4RowStatus = 'ok' | 'report' | 'fail';

export interface Act4PacingReport {
  rows: (Act4TimingRow & { status: Act4RowStatus })[];
  phases: Partial<Record<Act4Phase, Act4Share>>;
  act: Act4Share;
  /** quests under the 40% floor */
  failures: string[];
  /** quests at 40% or more but under 45% */
  reported: string[];
}

const shareOf = (rows: readonly Act4TimingRow[]): Act4Share => {
  const estimateMin = rows.reduce((s, r) => s + r.estimateMin, 0);
  const designMin = rows.reduce((s, r) => s + r.designMin, 0);
  return { estimateMin, designMin, share: designMin > 0 ? estimateMin / designMin : 0, quests: rows.length };
};

export function act4PacingReport(rows: readonly Act4TimingRow[]): Act4PacingReport {
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.quest)) throw new Error(`act4 timing: ${r.quest} measured twice`);
    seen.add(r.quest);
  }
  const status = (r: Act4TimingRow): Act4RowStatus =>
    !Number.isFinite(r.share) || r.share < ACT4_QUEST_FLOOR - EPS ? 'fail' : r.share < ACT4_REPORT_UNDER - EPS ? 'report' : 'ok';
  const out = rows.map((r) => ({ ...r, status: status(r) }));
  const phases: Partial<Record<Act4Phase, Act4Share>> = {};
  for (const p of ['G', 'H'] as const) {
    const of = rows.filter((r) => r.phase === p);
    if (of.length) phases[p] = shareOf(of);
  }
  return {
    rows: out,
    phases,
    act: shareOf(rows),
    failures: out.filter((r) => r.status === 'fail').map((r) => r.quest),
    reported: out.filter((r) => r.status === 'report').map((r) => r.quest),
  };
}

/** The Phase G gate: every Phase G quest measured, none under the floor, and Phase G at 51% or more. */
export function phaseGGate(report: Act4PacingReport, phaseG: readonly string[] = ACT4_PHASE_G): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const measured = new Set(report.rows.map((r) => r.quest));
  const missing = phaseG.filter((q) => !measured.has(q));
  if (missing.length) reasons.push(`Phase G quests not measured: ${missing.join(', ')}`);
  if (report.failures.length) reasons.push(`under the 40% floor: ${report.failures.join(', ')}`);
  const g = report.phases.G;
  if (!g || !Number.isFinite(g.share) || g.share < PHASE_G_GATE - EPS) {
    reasons.push(`Phase G at ${g ? (g.share * 100).toFixed(2) : '0'}% (gate ${PHASE_G_GATE * 100}%)`);
  }
  return { ok: reasons.length === 0, reasons };
}

export function act4TimingMarkdown(report: Act4PacingReport): string {
  const f = (n: number, d = 1) => n.toFixed(d);
  const pct = (n: number) => `${f(n * 100, 0)}%`;
  const lines = [
    '| quest | travel m | travel min (counted) | nodes | talk min | beats min | estimate min | design min | share | |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const r of report.rows) {
    const mark = r.status === 'fail' ? '**under 40%**' : r.status === 'report' ? 'under 45%' : '';
    lines.push(
      `| ${r.quest.toUpperCase()} | ${f(r.travelM, 0)} | ${f(r.travelS / 60)} (${f(r.countedTravelS / 60)}) | ${r.nodes} | ${f(r.talkS / 60)} | ${f(r.beatS / 60)} | ${f(r.estimateMin)} | ${r.designMin} | ${pct(r.share)} | ${mark} |`,
    );
  }
  for (const [p, s] of Object.entries(report.phases)) {
    lines.push(`| **Phase ${p}** | | | | | | **${f(s.estimateMin)}** | **${s.designMin}** | **${pct(s.share)}** | |`);
  }
  lines.push(`| **act** | | | | | | **${f(report.act.estimateMin)}** | **${report.act.designMin}** | **${pct(report.act.share)}** | |`);
  return lines.join('\n');
}
