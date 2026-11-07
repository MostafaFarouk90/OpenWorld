// The Act 5 pacing estimator (plan Part 1.2, 1.3 and 7.1; brief N12): Act 4's formula with every leg marked by how it is
// travelled. The Caldera is foot only (the Ashmare is refused, as in the Waste), so a `ride` leg is an error here.
//
//   estimate = min(travel, 3/7 x (nodes x 20 s + sum of beats)) + nodes x 20 s + sum of beats
//
// Any quest under 40% of its design minutes fails; under 45% is reported. Phase I (PR 1) fails under 52%; Phase J and the
// act (PR 2) under 51% (plan 1.4).
//
// The note convention (the Phase H lesson, coordinator ruling): a readable note, inscription, mural or page counts ONCE as a
// `search` beat and never as dialogue nodes. Headless node counts come from `trailNodes` (talks whose npc starts `note-`
// are dropped). A row names its notes in `notes`, and the estimator refuses a row with fewer `search` beats than notes, so
// every note is a beat and no row can lean on a note's text for its share.
import { ACT5_PHASE_I, ACT5_PHASE_J } from '../quests/act5Jump';
import { ACT2_TRAVEL_CAP, ACT5_BEAT_S, ESCORT_CART_MPS, ROUTE_FOLLOW_MPS, STORM_WALK_MPS, TALK_NODE_S, WALK_MPS } from './timing';

export type Act5Beat = keyof typeof ACT5_BEAT_S;
export type Act5Phase = 'I' | 'J';

/** `foot` everywhere in the Caldera and its interiors; `follow` at an NPC's pace; `storm` in an ash storm; `cart` beside R26's cart; `door` a load (no travel). */
export type Act5Leg = 'foot' | 'follow' | 'storm' | 'cart' | 'door';
export const ACT5_LEGS: readonly Act5Leg[] = ['foot', 'follow', 'storm', 'cart', 'door'];
export const ACT5_LEG_MPS: Readonly<Record<Act5Leg, number>> = {
  foot: WALK_MPS, follow: ROUTE_FOLLOW_MPS, storm: STORM_WALK_MPS, cart: ESCORT_CART_MPS, door: 0,
};

/** One quest's pacing row on its shorter branch (the quest threads N10 and N11 write these). */
export interface Act5PaceRow {
  quest: string;
  design: number;
  /** anchor ids in the order the player reaches them */
  route: string[];
  /** `legs[i]` is the leg from `route[i]` to `route[i + 1]` */
  legs: Act5Leg[];
  /** planned dialogue nodes on the shorter branch, notes excluded; a headless run passes what it read */
  nodes: number;
  beats: Partial<Record<Act5Beat, number>>;
  /** the readable notes, inscriptions, murals and pages on the row's path: each is one `search` beat, never nodes */
  notes?: string[];
}

export const ACT5_QUEST_FLOOR = 0.4;
export const ACT5_REPORT_UNDER = 0.45;
/** Plan 1.4: the Phase I PR fails under this share (planned 56%). */
export const PHASE_I_GATE = 0.52;
/** Plan 1.4: the final PR fails if Phase J measures under this (planned 54 to 55%). */
export const PHASE_J_GATE = 0.51;
/** Plan 1.4: the final PR fails if the act measures under this (planned 55%). */
export const ACT5_ACT_TARGET = 0.51;
const EPS = 1e-9;

export const act5PhaseOf = (quest: string): Act5Phase | undefined =>
  ACT5_PHASE_I.includes(quest) ? 'I' : ACT5_PHASE_J.includes(quest) ? 'J' : undefined;

export interface Act5TimingRow {
  quest: string;
  phase: Act5Phase | undefined;
  travelM: number;
  travelS: number;
  countedTravelS: number;
  nodes: number;
  talkS: number;
  beatS: number;
  estimateMin: number;
  designMin: number;
  share: number;
}

export const act5BeatSeconds = (quest: string, beats: Partial<Record<Act5Beat, number>>): number =>
  Object.entries(beats).reduce((s, [k, n]) => {
    const per = ACT5_BEAT_S[k as Act5Beat];
    if (per === undefined) throw new Error(`act5 timing: ${quest} has unknown beat "${k}"`);
    if (!Number.isFinite(n ?? 0) || (n ?? 0) < 0) throw new Error(`act5 timing: ${quest} beat "${k}" has count ${n}`);
    return s + per * (n ?? 0);
  }, 0);

/** Every note is a search beat: a row with more notes than `search` beats is refused (the note convention). */
export function checkNotes(quest: string, beats: Partial<Record<Act5Beat, number>>, notes: readonly string[] = []): void {
  if (new Set(notes).size !== notes.length) throw new Error(`act5 timing: ${quest} lists a note twice`);
  const search = beats.search ?? 0;
  if (notes.length > search) {
    throw new Error(`act5 timing: ${quest} has ${notes.length} notes but ${search} search beats (a note counts once as a search beat, never as nodes)`);
  }
}

/** The estimate from travel already summed (shared by the row estimator and the plan table). */
export function act5Estimate(
  quest: string, design: number, travelM: number, travelS: number, nodes: number, beats: Partial<Record<Act5Beat, number>>,
  notes?: readonly string[],
): Act5TimingRow {
  if (!(design > 0) || !Number.isFinite(design)) throw new Error(`act5 timing: ${quest} has design minutes ${design}`);
  for (const [k, v] of [['travel metres', travelM], ['travel seconds', travelS], ['nodes', nodes]] as const) {
    if (!Number.isFinite(v) || v < 0) throw new Error(`act5 timing: ${quest} has ${k} ${v}`);
  }
  checkNotes(quest, beats, notes);
  const talkS = nodes * TALK_NODE_S;
  const beatS = act5BeatSeconds(quest, beats);
  const countedTravelS = Math.min(travelS, ACT2_TRAVEL_CAP * (talkS + beatS));
  const estimateMin = (countedTravelS + talkS + beatS) / 60;
  return { quest, phase: act5PhaseOf(quest), travelM, travelS, countedTravelS, nodes, talkS, beatS, estimateMin, designMin: design, share: estimateMin / design };
}

/** One row on real anchors; `nodes` defaults to the row's plan (a headless run passes `trailNodes` of its trail). */
export function estimateAct5Row(row: Act5PaceRow, at: (anchor: string) => { x: number; z: number }, nodes: number = row.nodes): Act5TimingRow {
  if (row.legs.length !== row.route.length - 1) {
    throw new Error(`act5 timing: ${row.quest} has ${row.route.length} route points but ${row.legs.length} legs (want ${row.route.length - 1})`);
  }
  let travelM = 0;
  let travelS = 0;
  for (let i = 0; i < row.legs.length; i++) {
    const leg = row.legs[i];
    if (!ACT5_LEGS.includes(leg)) throw new Error(`act5 timing: ${row.quest} leg ${i} has mode "${leg}" (the Caldera is foot only)`);
    if (leg === 'door') continue;
    const a = at(row.route[i]);
    const b = at(row.route[i + 1]);
    const m = Math.hypot(b.x - a.x, b.z - a.z);
    travelM += m;
    travelS += m / ACT5_LEG_MPS[leg];
  }
  return act5Estimate(row.quest, row.design, travelM, travelS, nodes, row.beats, row.notes);
}

export interface Act5Share { estimateMin: number; designMin: number; share: number; quests: number }
export type Act5RowStatus = 'ok' | 'report' | 'fail';

export interface Act5PacingReport {
  rows: (Act5TimingRow & { status: Act5RowStatus })[];
  phases: Partial<Record<Act5Phase, Act5Share>>;
  act: Act5Share;
  failures: string[];
  reported: string[];
}

const shareOf = (rows: readonly Act5TimingRow[]): Act5Share => {
  const estimateMin = rows.reduce((s, r) => s + r.estimateMin, 0);
  const designMin = rows.reduce((s, r) => s + r.designMin, 0);
  return { estimateMin, designMin, share: designMin > 0 ? estimateMin / designMin : 0, quests: rows.length };
};

export function act5PacingReport(rows: readonly Act5TimingRow[]): Act5PacingReport {
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.quest)) throw new Error(`act5 timing: ${r.quest} measured twice`);
    seen.add(r.quest);
  }
  const status = (r: Act5TimingRow): Act5RowStatus =>
    !Number.isFinite(r.share) || r.share < ACT5_QUEST_FLOOR - EPS ? 'fail' : r.share < ACT5_REPORT_UNDER - EPS ? 'report' : 'ok';
  const out = rows.map((r) => ({ ...r, status: status(r) }));
  const phases: Partial<Record<Act5Phase, Act5Share>> = {};
  for (const p of ['I', 'J'] as const) {
    const of = rows.filter((r) => r.phase === p);
    if (of.length) phases[p] = shareOf(of);
  }
  return {
    rows: out, phases, act: shareOf(rows),
    failures: out.filter((r) => r.status === 'fail').map((r) => r.quest),
    reported: out.filter((r) => r.status === 'report').map((r) => r.quest),
  };
}

function gate(report: Act5PacingReport, quests: readonly string[], label: string, share: Act5Share | undefined, line: number): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const measured = new Set(report.rows.map((r) => r.quest));
  const missing = quests.filter((q) => !measured.has(q));
  if (missing.length) reasons.push(`${label} quests not measured: ${missing.join(', ')}`);
  const under = report.failures.filter((q) => quests.includes(q));
  if (under.length) reasons.push(`under the 40% floor: ${under.join(', ')}`);
  if (!share || !Number.isFinite(share.share) || share.share < line - EPS) {
    reasons.push(`${label} at ${share ? (share.share * 100).toFixed(2) : '0'}% (gate ${Math.round(line * 100)}%)`);
  }
  return { ok: reasons.length === 0, reasons };
}

/** PR 1: every Phase I quest measured, none under the floor, Phase I at 52% or more. */
export const phaseIGate = (report: Act5PacingReport, phaseI: readonly string[] = ACT5_PHASE_I) =>
  gate(report, phaseI, 'Phase I', report.phases.I, PHASE_I_GATE);

/** PR 2: Phase J at 51% or more and the act at 51% or more, no Act 5 quest under the floor. */
export function act5FinalGate(report: Act5PacingReport): { ok: boolean; reasons: string[] } {
  const j = gate(report, ACT5_PHASE_J, 'Phase J', report.phases.J, PHASE_J_GATE);
  const a = gate(report, [...ACT5_PHASE_I, ...ACT5_PHASE_J], 'Act 5', report.act, ACT5_ACT_TARGET);
  const reasons = [...new Set([...j.reasons, ...a.reasons])];
  return { ok: reasons.length === 0, reasons };
}

export function act5TimingMarkdown(report: Act5PacingReport): string {
  const f = (n: number, d = 1) => n.toFixed(d);
  const pct = (n: number) => `${f(n * 100, 0)}%`;
  const lines = [
    '| quest | travel m | travel min (counted) | nodes | talk min | beats min | estimate min | design min | share | |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const r of report.rows) {
    const mark = r.status === 'fail' ? '**under 40%**' : r.status === 'report' ? 'under 45%' : '';
    lines.push(`| ${r.quest.toUpperCase()} | ${f(r.travelM, 0)} | ${f(r.travelS / 60)} (${f(r.countedTravelS / 60)}) | ${r.nodes} | ${f(r.talkS / 60)} | ${f(r.beatS / 60)} | ${f(r.estimateMin)} | ${r.designMin} | ${pct(r.share)} | ${mark} |`);
  }
  for (const [p, s] of Object.entries(report.phases)) lines.push(`| **Phase ${p}** | | | | | | **${f(s.estimateMin)}** | **${s.designMin}** | **${pct(s.share)}** | |`);
  lines.push(`| **act** | | | | | | **${f(report.act.estimateMin)}** | **${report.act.designMin}** | **${pct(report.act.share)}** | |`);
  return lines.join('\n');
}
