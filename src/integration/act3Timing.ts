// The Act 3 pacing estimator (plan Part 1.2, 1.3 and 7.1; brief K16): Act 2's formula with every leg marked by how it is
// travelled, so riding, walking, wading, gliding and the ferry each count at their own speed.
//
//   estimate = min(travel, 3/7 x (nodes x 20 s + sum of beats)) + nodes x 20 s + sum of beats
//
// Travel is capped at 3/7 of talk and beats (at most 30% of the estimate), so no quest meets its floor by travel alone.
// Any quest under 40% of its design minutes fails; under 45% is reported. Phase E (PR 1) gates the Greyfen block at 52%;
// the final PR adds the act at 50% over all 21 quests. The quest threads write their rows as `Act3PaceRow`.
import { blockOf, type Act3BlockOf } from '../quests/act3Jump';
import {
  ACT2_TRAVEL_CAP, ACT3_BEAT_S, FERRY_MPS, GLIDE_MPS, RIDE_MPS, ROUTE_FOLLOW_MPS, TALK_NODE_S, WADE_BOOTS_MPS, WADE_MPS, WALK_MPS,
} from './timing';

export type Act3Beat = keyof typeof ACT3_BEAT_S;

/**
 * How one leg is travelled (plan 1.2). `door` is a load or a frame change (an interior, a dive space floating apart from
 * the surface) and counts no travel; whatever crosses it is priced by a beat.
 */
export type Act3Leg = 'ride' | 'foot' | 'wade' | 'glide' | 'ferry' | 'follow' | 'door';
export const ACT3_LEGS: readonly Act3Leg[] = ['ride', 'foot', 'wade', 'glide', 'ferry', 'follow', 'door'];

/** One quest's pacing row, on its shorter branch. */
export interface Act3PaceRow {
  quest: string;
  /** design minutes (plan Part 7.1) */
  design: number;
  /** anchor ids in the order the player reaches them */
  route: string[];
  /** one mode per leg: `legs[i]` is the leg from `route[i]` to `route[i + 1]` */
  legs: Act3Leg[];
  /** planned dialogue nodes on the shorter branch; a headless run passes the nodes it actually read instead */
  nodes: number;
  beats: Partial<Record<Act3Beat, number>>;
}

/** Plan 1.2: per-quest floor, the planning margin reported under it, the act target. */
export const ACT3_QUEST_FLOOR = 0.4;
export const ACT3_REPORT_UNDER = 0.45;
export const ACT3_ACT_TARGET = 0.5;
/** Coordinator review, change 5: the Phase E PR fails if the Greyfen block measures under this share (planned 53%). */
export const PHASE_E_GREYFEN_GATE = 0.52;

/** Float slack on the share lines (a share computed at exactly the line passes it). */
export const SHARE_EPSILON = 1e-9;

/** The only quest played before the Fen Boots exist (M23 grants them), in either block order. */
export const PRE_BOOTS_QUESTS: readonly string[] = ['m23'];

/** Metres per second for a leg of `quest`; `door` is 0 (no travel counted). */
export function legSpeed(leg: Act3Leg, quest: string): number {
  switch (leg) {
    case 'ride': return RIDE_MPS;
    case 'foot': return WALK_MPS;
    case 'wade': return PRE_BOOTS_QUESTS.includes(quest) ? WADE_MPS : WADE_BOOTS_MPS;
    case 'glide': return GLIDE_MPS;
    case 'ferry': return FERRY_MPS;
    case 'follow': return ROUTE_FOLLOW_MPS;
    case 'door': return 0;
  }
}

export interface Act3TimingRow {
  quest: string;
  block: Act3BlockOf | undefined;
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

export const beatSeconds = (beats: Partial<Record<Act3Beat, number>>): number =>
  Object.entries(beats).reduce((s, [k, n]) => {
    const per = ACT3_BEAT_S[k as Act3Beat];
    if (per === undefined) throw new Error(`act3 timing: unknown beat "${k}"`);
    if (!Number.isFinite(n ?? 0) || (n ?? 0) < 0) throw new Error(`act3 timing: beat "${k}" has count ${n}`);
    return s + per * (n ?? 0);
  }, 0);

/** The estimate from travel already summed (shared by the row estimator and the plan table). */
export function act3Estimate(
  quest: string, design: number, travelM: number, travelS: number, nodes: number, beats: Partial<Record<Act3Beat, number>>,
): Act3TimingRow {
  // A missing or broken input would make the share NaN, which no `<` comparison catches: refuse it here.
  if (!(design > 0) || !Number.isFinite(design)) throw new Error(`act3 timing: ${quest} has design minutes ${design}`);
  for (const [k, v] of [['travel metres', travelM], ['travel seconds', travelS], ['nodes', nodes]] as const) {
    if (!Number.isFinite(v) || v < 0) throw new Error(`act3 timing: ${quest} has ${k} ${v}`);
  }
  const talkS = nodes * TALK_NODE_S;
  const beatS = beatSeconds(beats);
  const countedTravelS = Math.min(travelS, ACT2_TRAVEL_CAP * (talkS + beatS));
  const estimateMin = (countedTravelS + talkS + beatS) / 60;
  return {
    quest, block: blockOf(quest), travelM, travelS, countedTravelS, nodes, talkS, beatS, estimateMin, designMin: design,
    share: estimateMin / design,
  };
}

/** One row on real anchors; `nodes` defaults to the row's planned count (a headless run passes what it read). */
export function estimateAct3Row(
  row: Act3PaceRow, at: (anchor: string) => { x: number; z: number }, nodes: number = row.nodes,
): Act3TimingRow {
  if (row.legs.length !== row.route.length - 1) {
    throw new Error(`act3 timing: ${row.quest} has ${row.route.length} route points but ${row.legs.length} legs (want ${row.route.length - 1})`);
  }
  let travelM = 0;
  let travelS = 0;
  for (let i = 0; i < row.legs.length; i++) {
    const leg = row.legs[i];
    if (!ACT3_LEGS.includes(leg)) throw new Error(`act3 timing: ${row.quest} leg ${i} has unknown mode "${leg}"`);
    if (leg === 'door') continue;
    const a = at(row.route[i]);
    const b = at(row.route[i + 1]);
    const m = Math.hypot(b.x - a.x, b.z - a.z);
    travelM += m;
    travelS += m / legSpeed(leg, row.quest);
  }
  return act3Estimate(row.quest, row.design, travelM, travelS, nodes, row.beats);
}

export interface Act3Share { estimateMin: number; designMin: number; share: number; quests: number }
export type Act3RowStatus = 'ok' | 'report' | 'fail';

export interface Act3PacingReport {
  rows: (Act3TimingRow & { status: Act3RowStatus })[];
  blocks: Partial<Record<Act3BlockOf, Act3Share>>;
  act: Act3Share;
  /** quests under the 40% floor */
  failures: string[];
  /** quests at 40% or more but under 45% */
  reported: string[];
}

const share = (rows: readonly Act3TimingRow[]): Act3Share => {
  const estimateMin = rows.reduce((s, r) => s + r.estimateMin, 0);
  const designMin = rows.reduce((s, r) => s + r.designMin, 0);
  return { estimateMin, designMin, share: designMin > 0 ? estimateMin / designMin : 0, quests: rows.length };
};

export function act3PacingReport(rows: readonly Act3TimingRow[]): Act3PacingReport {
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.quest)) throw new Error(`act3 timing: ${r.quest} measured twice`);
    seen.add(r.quest);
  }
  // A hair of float slack on every line, so a row at exactly 40% or 45% counts as at it; a non-finite share fails.
  const status = (r: Act3TimingRow): Act3RowStatus =>
    !Number.isFinite(r.share) || r.share < ACT3_QUEST_FLOOR - SHARE_EPSILON ? 'fail' : r.share < ACT3_REPORT_UNDER - SHARE_EPSILON ? 'report' : 'ok';
  const out = rows.map((r) => ({ ...r, status: status(r) }));
  const blocks: Partial<Record<Act3BlockOf, Act3Share>> = {};
  for (const b of ['greyfen', 'spine', 'summit'] as const) {
    const of = rows.filter((r) => r.block === b);
    if (of.length) blocks[b] = share(of);
  }
  return {
    rows: out,
    blocks,
    act: share(rows),
    failures: out.filter((r) => r.status === 'fail').map((r) => r.quest),
    reported: out.filter((r) => r.status === 'report').map((r) => r.quest),
  };
}

/** The Phase E gate: every Greyfen quest measured, none under the floor, and the block at 52% or more. */
export function phaseEGate(report: Act3PacingReport, greyfen: readonly string[]): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const measured = new Set(report.rows.map((r) => r.quest));
  const missing = greyfen.filter((q) => !measured.has(q));
  if (missing.length) reasons.push(`Greyfen quests not measured: ${missing.join(', ')}`);
  if (report.failures.length) reasons.push(`under the 40% floor: ${report.failures.join(', ')}`);
  const g = report.blocks.greyfen;
  if (!g || !Number.isFinite(g.share) || g.share < PHASE_E_GREYFEN_GATE - SHARE_EPSILON) {
    reasons.push(`Greyfen block at ${g ? (g.share * 100).toFixed(2) : '0'}% (gate ${PHASE_E_GREYFEN_GATE * 100}%)`);
  }
  return { ok: reasons.length === 0, reasons };
}

export function act3TimingMarkdown(report: Act3PacingReport): string {
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
  for (const [b, s] of Object.entries(report.blocks)) {
    lines.push(`| **${b}** | | | | | | **${f(s.estimateMin)}** | **${s.designMin}** | **${pct(s.share)}** | |`);
  }
  lines.push(`| **act** | | | | | | **${f(report.act.estimateMin)}** | **${report.act.designMin}** | **${pct(report.act.share)}** | |`);
  return lines.join('\n');
}
