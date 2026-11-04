/**
 * Phase F (the lower Dragonspine and the summit, then the act's ending), played on a game booted from an Act 3 fixture. The
 * objective player is phaseFDriver.ts (and phaseEDriver.ts for the Greyfen in run B). This file holds the boot, the pacing
 * over all 21 quests (K12's Greyfen rows on K16's estimator, K13's Dragonspine and summit rows on their own estimator with
 * the nodes each run read), K4's two over-target legs, and the XP census numbers the chain reports.
 *
 * Run A plays the Greyfen first: it starts from `act3-greyfen-m28` (the Greyfen injected), so its Greyfen rows carry their
 * planned nodes. Run B plays the lower Dragonspine first, from `act3-spine-m28`, then the whole Greyfen through the Phase E
 * driver, then the summit, so all 21 quests are measured on nodes it read.
 */
import { bootFromSave, type ChapterHarness } from './chapterHarness';
import { ensure } from './phaseA';
import type { PhaseCTrail } from './phaseC';
import { trailNodes } from './timing';
import { act3PacingReport, estimateAct3Row, ACT3_ACT_TARGET, SHARE_EPSILON, type Act3PacingReport, type Act3TimingRow } from './act3Timing';
import type { Act3Order } from '../quests/act3Jump';
import { blockOf } from '../quests/act3Jump';
import { readAct3Fixture, readAct3FixtureMeta } from '../save/__fixtures__/act3';
import { act3FixtureFresh, fixtureDefIds, knownQuestDefs } from './act3FixtureKey';
import { GREYFEN_PACE, paceAt as greyfenAt } from '../quests/content/act3/greyfen/pacing';
import { DRAGONSPINE_PACE, paceLegs, paceRow, type Act3PaceRow as SpinePaceRow } from '../quests/content/act3/dragonspine/pacing';
import { SUMMIT_PACE } from '../quests/content/act3/summit/pacing';
import { TALK_NODE_S } from './timing';
import { act3AmbientCensus } from '../enemies/fen/census';
import { GREYFEN_SPAWNERS as GREYFEN_AMBIENT, DRAGONSPINE_SPAWNERS as DRAGONSPINE_AMBIENT } from '../enemies/act3Spawners';
import { GREYFEN_KILL_XP_FACTOR } from '../enemies/fen/fen.plugin';
import { DRAGONSPINE_KILL_XP_FACTOR } from '../enemies/peak/peak.plugin';
import { levelForXp } from '../progression/tuning';

/** The fixture each run starts from. */
export const PHASE_F_START: Record<'a' | 'b', { order: Act3Order; id: string }> = {
  a: { order: 'greyfen', id: 'm28' },
  b: { order: 'spine', id: 'm28' },
};

/** Boots a run's start fixture headless (with models, no renderer) and lets the load settle. */
export async function bootPhaseF(run: 'a' | 'b'): Promise<ChapterHarness & { loaded: boolean }> {
  const { order, id } = PHASE_F_START[run];
  // Models on: the hunters (M33, D06) are humanoids, which a game without the asset loader cannot spawn.
  const h = await bootFromSave(await readAct3Fixture(order, id as never), { models: true, virtualClock: true });
  ensure(h.loaded, `Phase F run ${run}: the fixture act3-${order}-${id} loaded`);
  const meta = await readAct3FixtureMeta(order, id as never);
  const qs = h.ctx.services.require('quests');
  const known = knownQuestDefs((q) => qs.objectives(q).length > 0, fixtureDefIds(id as never, order));
  ensure(act3FixtureFresh(meta, known), `Phase F run ${run}: act3-${order}-${id} is stale for this build; regenerate the fixtures`);
  return h;
}

/** K13's row (its own `sled` leg and beats) on its own estimator, as K16's timing row so the act report takes it. */
export function spineTimingRow(row: SpinePaceRow, nodes: number = row.nodes): Act3TimingRow {
  const r = paceRow(row, { nodes });
  const talkS = nodes * TALK_NODE_S;
  const beatS = r.talkAndBeatsS - talkS;
  const travelM = paceLegs(row).reduce((s, l) => s + l.metres, 0);
  return {
    quest: row.quest, block: blockOf(row.quest), travelM, travelS: r.travelS, countedTravelS: r.cappedTravelS, nodes, talkS, beatS,
    estimateMin: r.minutes, designMin: row.design, share: r.share,
  };
}

/**
 * The act over all 21 quests: each quest's row with the nodes its trail read (a quest without a trail, the Greyfen in run A,
 * keeps its planned nodes and is listed in `planned`).
 */
export function measurePhaseF(trails: Readonly<Record<string, PhaseCTrail>>): { report: Act3PacingReport; planned: string[] } {
  const planned: string[] = [];
  const nodesOf = (q: string, plannedNodes: number) => {
    const t = trails[q];
    if (!t) planned.push(q);
    return t ? trailNodes(t) : plannedNodes;
  };
  const rows: Act3TimingRow[] = [
    ...GREYFEN_PACE.map((r) => estimateAct3Row(r, greyfenAt, nodesOf(r.quest, r.nodes))),
    ...[...DRAGONSPINE_PACE, ...SUMMIT_PACE].map((r) => spineTimingRow(r, nodesOf(r.quest, r.nodes))),
  ];
  return { report: act3PacingReport(rows), planned };
}

/** The act gate: no quest under 40%, the act at 50% or more, all 21 measured. */
export function phaseFGate(report: Act3PacingReport): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (report.rows.length !== 21) reasons.push(`${report.rows.length} quests measured, not 21`);
  if (report.failures.length) reasons.push(`under the 40% floor: ${report.failures.join(', ')}`);
  if (!(report.act.share >= ACT3_ACT_TARGET - SHARE_EPSILON)) reasons.push(`the act at ${(report.act.share * 100).toFixed(2)}% (target 50%)`);
  return { ok: reasons.length === 0, reasons };
}

/** K13's planned block shares, for the report. */
export const K13_PLANNED_SHARE = { spine: 0.537, summit: 0.547 } as const;

/** K4's two legs over their planned length (reported, never gated): M33's ride and D06's glide, and each quest's travel share. */
export const K4_LEG_PLAN = { m33: { mode: 'ride', plannedM: 800 }, d06: { mode: 'glide', plannedM: 700 } } as const;
export interface K4LegReport { quest: string; mode: string; metres: number; plannedM: number; travelShare: number }
export function k4Legs(): K4LegReport[] {
  return (Object.entries(K4_LEG_PLAN) as [keyof typeof K4_LEG_PLAN, (typeof K4_LEG_PLAN)[keyof typeof K4_LEG_PLAN]][]).map(([quest, p]) => {
    const row = SUMMIT_PACE.find((r) => r.quest === quest)!;
    const metres = paceLegs(row).filter((l) => l.mode === p.mode).reduce((s, l) => s + l.metres, 0);
    const r = paceRow(row);
    // Uncapped travel over the whole estimate with it: the share the 3/7 cap (30% of the total) holds travel to.
    const travelShare = r.travelS / (r.travelS + r.talkAndBeatsS);
    return { quest, mode: p.mode, metres, plannedM: p.plannedM, travelShare };
  });
}

/** The static ambient census at parity (K6b's figure, plan 7.2): Greyfen at L 18, the lower slopes at 20, the summit at 26. */
export function ambientCensus(): { greyfen: number; lower: number; summit: number; total: number } {
  const summitDef = (d: { area?: string }) => d.area === 'dragonspine-summit';
  const g = act3AmbientCensus(GREYFEN_AMBIENT, { level: 18, playerLevel: 18, regionFactor: GREYFEN_KILL_XP_FACTOR }).total;
  const l = act3AmbientCensus(DRAGONSPINE_AMBIENT.filter((d) => !summitDef(d)), { level: 20, playerLevel: 20, regionFactor: DRAGONSPINE_KILL_XP_FACTOR }).total;
  const s = act3AmbientCensus(DRAGONSPINE_AMBIENT.filter(summitDef), { level: 26, playerLevel: 26, regionFactor: DRAGONSPINE_KILL_XP_FACTOR }).total;
  return { greyfen: g, lower: l, summit: s, total: g + l + s };
}

/** The share of the ambient census a mercy-heavy full play is taken to collect on the way (the brief's arithmetic). */
export const MERCY_AMBIENT_SHARE = 0.6;

/** XP the run gained, split into kill XP and everything else (quests, mercy, items), read from `xp.gained`. */
export interface XpLedger { kill: number; other: number }
export function xpLedger(events: readonly { amount: number; source: string }[]): XpLedger {
  const out = { kill: 0, other: 0 };
  for (const e of events) {
    if (e.source.startsWith('kill.')) out.kill += e.amount;
    else out.other += e.amount;
  }
  return out;
}

/**
 * The census levels: `chain` from the run's own XP; `mercyHeavy` drops the chain's kill XP (a player who spares and calms
 * the quest groups, as the mercy paths allow) and adds 60% of the ambient census, the brief's "mercy-heavy full play".
 */
export function censusLevels(totalXp: number, ledger: XpLedger, ambient: number): { chain: number; mercyHeavy: number; mercyHeavyXp: number } {
  const mercyHeavyXp = totalXp - ledger.kill + MERCY_AMBIENT_SHARE * ambient;
  return { chain: levelForXp(totalXp), mercyHeavy: levelForXp(mercyHeavyXp), mercyHeavyXp: Math.round(mercyHeavyXp) };
}

