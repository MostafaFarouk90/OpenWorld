/**
 * Phase G (Harrowmark before and through the betrayal, M35 to M41), played on a game booted from the carried Act 3 base
 * (untopped, so the census reads the chain's own XP; coordinator ruling A). The objective player is phaseGDriver.ts (round 2,
 * once L10's quests and L6's Bellows-Engine are stacked); this module holds what does not need them: the run choices, the
 * expected XP, the cap watcher and the measured pacing gate.
 *
 * Run A: every delegate won, R20 bribe, R21 all, R22 light, R23 public, kills as kills.
 * Run B (mercy-heavy): delegates lost, R20 stealth, R21 leaders, R22 heavy, R23 private, every Footman that may be spared is.
 */
import { bootFromSave, type ChapterHarness } from './chapterHarness';
import { ensure } from './phaseA';
import { trailNodes } from './timing';
import type { PhaseCTrail } from './phaseC';
import { act4PacingReport, estimateAct4Row, phaseGGate, type Act4PacingReport, type Act4PaceRow } from './act4Timing';
import { ACT4_PHASE_G } from '../quests/act4Jump';
import { readAct4Base } from '../save/__fixtures__/act4';
import { ALL_SPAWNERS } from '../enemies/allSpawners';
import { ACT4_CAP_ABOVE_PLAYER, ACT4_FIRST_ARRIVAL_ABOVE_PLAYER } from '../enemies/level';

export type PhaseGQuest = (typeof ACT4_PHASE_G)[number];
export const PHASE_G_ORDER: readonly PhaseGQuest[] = ACT4_PHASE_G;

export type House = 'halvard' | 'oswin' | 'grisel';
export interface PhaseGChoices {
  delegates: Record<House, 'won' | 'lost'>;
  r20: 'bribe' | 'stealth' | 'force';
  r21: 'all' | 'leaders';
  r22: 'light' | 'heavy';
  r23: 'public' | 'private';
  /** spare every Footman the rules allow (M39's Halvard +1 each) */
  spare: boolean;
}
export const PHASE_G_RUN_A: PhaseGChoices = {
  delegates: { halvard: 'won', oswin: 'won', grisel: 'won' }, r20: 'bribe', r21: 'all', r22: 'light', r23: 'public', spare: false,
};
export const PHASE_G_RUN_B: PhaseGChoices = {
  delegates: { halvard: 'lost', oswin: 'lost', grisel: 'won' }, r20: 'stealth', r21: 'leaders', r22: 'heavy', r23: 'private', spare: true,
};

/** Plan 2.1 and 2.2 rewards (design table), L2's measured kill XP and L6's Bellows-Engine at an even level. */
export const PHASE_G_QUEST_XP: Readonly<Record<PhaseGQuest, number>> = {
  m35: 700, m36: 800, r19: 550, r20: 600, r21: 550, r22: 650, r23: 550, d07: 1100, m37: 600, m38: 900, m39: 1000, m40: 800, m41: 600,
};
export const PHASE_G_EXPECTED = {
  quests: Object.values(PHASE_G_QUEST_XP).reduce((a, b) => a + b, 0),
  /** L2's handoff (2026-11-06): about 99 per Footman, 82 per hound at x 2.4 */
  kills: 6_100,
  /** L6 (2026-11-06): 700 at an even level */
  boss: 700,
} as const;
/** Coordinator ruling E: Phase G's own asserts (the act-end asserts are PR 2's). Run A under 28 is reported, never relaxed. */
export const PHASE_G_END_LEVEL = { a: 28, b: 27 } as const;

/** Boots the carried base headless (with models: the Footmen are humanoids) and lets the load settle. */
export async function bootPhaseG(): Promise<ChapterHarness & { loaded: boolean }> {
  const h = await bootFromSave(await readAct4Base(), { models: true, virtualClock: true });
  ensure(h.loaded, 'Phase G: the carried base loaded');
  return h;
}

/** The spawn tags of first-arrival groups (Q1: at most P + 2). */
export const FIRST_ARRIVAL_TAGS: ReadonlySet<string> = new Set(
  ALL_SPAWNERS.filter((s) => s.firstArrival && s.tag).map((s) => s.tag!),
);

export interface CapActor { kind: string; team?: string; dead?: boolean; level?: number; spawnTag?: string; root?: { position: { x: number; z: number } } }

/** Bosses carry their own levels (act4BossLevel) and are not region spawns. */
export const CAP_EXEMPT_KINDS: ReadonlySet<string> = new Set(['bellows-engine', 'eormen']);

/**
 * Q1 on the live game: every hostile met during Phase G stands at most P + 3 (first-arrival groups P + 2)
 * over the player's level when it is seen. Returns the offenders, once each.
 */
export function capOffenders(actors: Iterable<CapActor>, playerLevel: number, seen = new Set<string>()): string[] {
  const out: string[] = [];
  for (const a of actors) {
    if (a.team !== 'hostile' || a.dead || !a.root || typeof a.level !== 'number' || CAP_EXEMPT_KINDS.has(a.kind)) continue;
    const first = !!a.spawnTag && FIRST_ARRIVAL_TAGS.has(a.spawnTag);
    const cap = playerLevel + ((first ? ACT4_FIRST_ARRIVAL_ABOVE_PLAYER : ACT4_CAP_ABOVE_PLAYER) ?? Infinity);
    if (a.level > cap) {
      const key = `${a.kind}@${a.spawnTag ?? '?'} ${a.level} at player ${playerLevel}${first ? ' (first arrival)' : ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(key);
      }
    }
  }
  return out;
}

/** The Phase G pacing report on L10's (and L6's) rows with the nodes each quest's run read, and the 51% gate. */
export function measurePhaseG(
  rows: readonly Act4PaceRow[], trails: Readonly<Record<string, PhaseCTrail>>, at: (anchor: string) => { x: number; z: number },
): { report: Act4PacingReport; gate: ReturnType<typeof phaseGGate> } {
  const measured = rows.map((row) => {
    const trail = trails[row.quest];
    ensure(trail, `a trail for ${row.quest}`);
    return estimateAct4Row(row, at, trailNodes(trail));
  });
  const report = act4PacingReport(measured);
  return { report, gate: phaseGGate(report, PHASE_G_ORDER) };
}
