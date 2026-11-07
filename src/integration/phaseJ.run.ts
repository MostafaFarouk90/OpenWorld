/**
 * Phase J's headless chain (N12 PR 2): the Foundry quests, R27 to M56 with D09 (Vey) and D10 (Ulthred), then the ending
 * through N12's director (cutscene, title card, the eight-slide epilogue, the credits, the after-state, one save), played in
 * plan order by phaseJDriver.ts on the run's Phase I end save (`act5-phase-i-end-<run>.json`, written by Phase I's chain:
 * the Phase I to Phase J save test). Run A is the design's marshal playthrough (R27 collapse, one pyre, Vey struck down,
 * Rekindle, kills as kills); run B the keepers' (R27 kept, four pyres, Vey spared, Let It Die, the Spare and the Release
 * offered first: the mercy-heavy census).
 *
 * Measures what the brief names: per-quest seconds, levels and XP (the census: run A ends 37 to 38, run B 36 to 37, as ruled),
 * deaths, the cap on every hostile met, mercy, favour and the M56 snapshot, the ending's steps and the flags it leaves, the
 * pacing of Phase J on N11's rows with the nodes each quest's run read, and the act's (Phase I's rows from the end save's
 * trails), and what was scripted. M55's trial and D10's Ulthred are N6's real pieces
 * (the trial dodged by side-steps, Ulthred through winUlthredForTest). Numbers owned by other threads are reported, never retuned here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFromSave, type ChapterHarness } from './chapterHarness';
import { ensure } from './phaseA';
import type { PhaseCTrail } from './phaseC';
import { xpLedger } from './phaseF';
import { trailNodes } from './timing';
import { capOffenders, PHASE_G_RUN_A, PHASE_G_RUN_B, type CapActor } from './phaseG';
import { newWatch, watchDialogueRunner } from './phaseGDriver';
import { PHASE_I_MERCY_B } from './phaseIDriver';
import { PHASE_I_COLLIDER_RADIUS, rimToAct5Row } from './phaseI.run';
import {
  PHASE_J_ORDER, PHASE_J_RUN_A, PHASE_J_RUN_B, playEnding, playPhaseJQuest, wantedFlagsJ, type EndingTrail, type PhaseJChoices, type PhaseJRun,
} from './phaseJDriver';
import { seedFixtureRandom } from './fixtureDeterminism';
import { act5FinalGate, act5PacingReport, act5TimingMarkdown, estimateAct5Row, type Act5PaceRow, type Act5PacingReport } from './act5Timing';
import { readAct5PhaseIEnd, readAct5PhaseIEndMeta } from '../save/__fixtures__/act5';
import { RIM_A5_PACE, paceAt as rimPaceAt } from '../quests/content/act5/rim/pacing';
import { FOUNDRY_A5_PACE, paceAt as foundryPaceAt } from '../quests/content/act5/foundry/pacing';
import { ACT5_PHASE_J } from '../quests/act5Jump';
import { FAVOUR_TRACKS, snapshotFlag } from '../state/favour';
import {
  M56_CAEL_LIVES_FLAG, M56_CHOICE_FLAG, M56_SCARS_FLAG, R27_CHOICE, R28_PYRES, R30_VERSE, VEY_OUTCOME,
} from '../quests/content/act5/foundry/flags';

const prog = (h: ChapterHarness) => h.ctx.services.require('progression') as unknown as { xp: number; level: number };
const gold = (h: ChapterHarness): number => (h.ctx.services.get('inventory') as { gold?: number } | undefined)?.gold ?? -1;

/** Plan 11's census, as ruled after the Phase J report (M1, 2026-11-07): run A ends at 37 to 38, run B (mercy-heavy) at 36
 * to 37, with Ulthred's real kill in; the kill factor stays 3.0. (The plan's 35 to 36 was set on a 98,800 start; a real
 * Phase I enters Phase J at 33 to 34.) */
export const PHASE_J_END_LEVEL: Readonly<Record<'a' | 'b', readonly [number, number]>> = { a: [37, 38], b: [36, 37] };

/** The flags the ending leaves (asserted per run). */
export const ENDING_FLAGS = ['story.gate.end', 'codex.actEnding.a5.seen', 'world.afterEnding'] as const;

export interface PhaseJResult {
  run: 'a' | 'b';
  choices: PhaseJChoices;
  played: string[];
  missing: string[];
  seconds: Record<string, number>;
  picks: string[];
  xp: { start: number; end: number; quests: number; kill: number; other: number };
  level: { start: number; end: number };
  levelsAtStart: Record<string, number>;
  deaths: number;
  cap: string[];
  mercy: { spared: number; refused: number; released: number };
  gold: { start: number; end: number };
  favour: Record<string, number>;
  snapshots: Record<'d09' | 'm56', Record<string, unknown>>;
  outcomes: Record<string, unknown>;
  ending: EndingTrail & { flags: Record<string, unknown>; actEnded: unknown[] };
  notes: string[];
  scripted: Record<string, string[]>;
  talks: Record<string, string>;
  pacing: string;
  report: Act5PacingReport;
  gate: { phaseJ: number; act: number; ok: boolean; reasons: string[] };
  /** quests started during the run that are not Phase J's */
  startedOutside: string[];
}

/** Phase I's rows on the nodes its chain read (the end save's trails) and Phase J's on this run's. */
export function act5ActRows(phaseITrails: Record<string, unknown>, phaseJTrails: Record<string, PhaseCTrail>) {
  const i = RIM_A5_PACE.filter((row) => phaseITrails[row.quest])
    .map((row) => estimateAct5Row(rimToAct5Row(row), rimPaceAt, trailNodes(phaseITrails[row.quest] as PhaseCTrail)));
  const j = FOUNDRY_A5_PACE.filter((row) => phaseJTrails[row.quest])
    .map((row) => estimateAct5Row(row as unknown as Act5PaceRow, foundryPaceAt, trailNodes(phaseJTrails[row.quest]!)));
  return [...i, ...j];
}

/** Plays Phase J and the ending on a fresh boot of the run's Phase I end save. */
export async function runPhaseJ(run: 'a' | 'b'): Promise<PhaseJResult> {
  watchDialogueRunner();
  seedFixtureRandom();
  const meta = await readAct5PhaseIEndMeta(run);
  const h = await bootFromSave(await readAct5PhaseIEnd(run), { models: true, virtualClock: true, colliderRadius: PHASE_I_COLLIDER_RADIUS });
  try {
    ensure(h.loaded, `Phase J run ${run}: the Phase I end save loaded`);
    await h.runAsync(30);
    const quests = h.ctx.services.require('quests');
    const c = run === 'a' ? PHASE_G_RUN_A : PHASE_G_RUN_B;
    const jc = run === 'a' ? PHASE_J_RUN_A : PHASE_J_RUN_B;
    const cap: string[] = [];
    const seen = new Set<string>();
    const watch = newWatch();
    watch.poll = (hh) => void cap.push(...capOffenders(hh.ctx.actors.all() as Iterable<CapActor>, prog(hh).level, seen));
    const actEnded: unknown[] = [];
    h.ctx.events.on('act.ended', (e) => void actEnded.push(e));
    const xp0 = prog(h).xp;
    const level0 = prog(h).level;
    const gold0 = gold(h);
    const trails: Record<string, PhaseCTrail> = {};
    const seconds: Record<string, number> = {};
    const levelsAtStart: Record<string, number> = {};
    const picks: string[] = [];
    const played: string[] = [];
    const missing: string[] = [];
    let ending: EndingTrail | null = null;
    for (const q of PHASE_J_ORDER) {
      if (!quests.get(q)) { missing.push(q); continue; }
      trails[q] = { talks: [], scripted: [], order: [] };
      levelsAtStart[q] = prog(h).level;
      const r: PhaseJRun = {
        h, c, jc, want: { ...wantedFlagsJ(jc) }, watch, trail: trails[q]!, picks, used: new Set(),
        ...(run === 'b' ? { mercy: PHASE_I_MERCY_B } : {}),
      };
      const t0 = h.clock.ms;
      await playPhaseJQuest(r, q);
      // the ending follows M56's completion; its time is the ending's, not M56's
      seconds[q] = Math.round((h.clock.ms - t0) / 1000);
      if (q === 'm56') ending = await playEnding(r);
      played.push(q);
    }
    const st = h.ctx.state;
    const snap = (id: 'd09' | 'm56') => Object.fromEntries(['taken', ...FAVOUR_TRACKS].map((t) => [t, st.getFlag(snapshotFlag(id, t as never) as never)]));
    const report = act5PacingReport(act5ActRows(meta.trails, trails));
    const g = act5FinalGate(report);
    const ledger = xpLedger(h.of('xp.gained'));
    const questXp = h.of('xp.gained').filter((e) => e.source.startsWith('quest:')).reduce((n, e) => n + e.amount, 0);
    return {
      run, choices: jc, played, missing, seconds, picks,
      xp: { start: Math.round(xp0), end: Math.round(prog(h).xp), quests: Math.round(questXp), kill: Math.round(ledger.kill), other: Math.round(ledger.other) },
      level: { start: level0, end: prog(h).level },
      levelsAtStart,
      deaths: h.of('actor.died').filter((e) => e.actorId === h.ctx.player.actor.id).length,
      cap,
      mercy: { spared: watch.spared, refused: watch.spareRefused, released: h.of('mercy').filter((m) => m.verb === 'release').length },
      gold: { start: gold0, end: gold(h) },
      favour: Object.fromEntries(FAVOUR_TRACKS.map((t) => [t, st.favour(t)])),
      snapshots: { d09: snap('d09'), m56: snap('m56') },
      outcomes: Object.fromEntries([R27_CHOICE, R28_PYRES, R30_VERSE, VEY_OUTCOME, M56_CHOICE_FLAG, M56_CAEL_LIVES_FLAG, M56_SCARS_FLAG].map((k) => [k, st.getFlag(k as never)])),
      ending: {
        ...(ending ?? { steps: [], slidesRead: 0, seconds: 0 }),
        flags: Object.fromEntries(ENDING_FLAGS.map((k) => [k, st.getFlag(k as never)])),
        actEnded,
      },
      notes: watch.notes,
      scripted: Object.fromEntries(Object.entries(trails).map(([q, t]) => [q, t.scripted])),
      talks: Object.fromEntries(Object.entries(trails).map(([q, t]) => [q, t.talks.map((x) => `${x.npc}:${x.nodes}`).join(' ')])),
      pacing: act5TimingMarkdown(report),
      report,
      gate: { phaseJ: report.phases.J?.share ?? 0, act: report.act.share, ok: g.ok, reasons: g.reasons },
      startedOutside: h.of('quest.started').map((e) => e.questId).filter((id) => !ACT5_PHASE_J.includes(id)),
    };
  } finally {
    h.dispose();
  }
}

/** The run's vitest body: plays it, prints the numbers the report quotes, asserts. */
export function definePhaseJRun(run: 'a' | 'b'): void {
  describe(`Phase J headless chain, run ${run.toUpperCase()}`, () => {
    beforeEach(() => {
      vi.spyOn(console, 'info').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());
    it('plays the Foundry quests and the ending from the Phase I end save', async () => {
      const r = await runPhaseJ(run);
      console.log(JSON.stringify({ ...r, report: undefined, pacing: undefined }, null, 1));
      console.log(r.pacing);
      expect(r.missing, 'every Phase J quest in the build').toEqual([]);
      expect(r.played).toEqual([...PHASE_J_ORDER]);
      expect(r.cap).toEqual([]);
      expect(r.deaths).toBe(0);
      expect(r.startedOutside, 'only Phase J quests started').toEqual([]);
      // the run's choices, as the design pairs them
      const jc = r.choices;
      expect(r.outcomes).toMatchObject({ [R27_CHOICE]: jc.r27, [R30_VERSE]: jc.verse, [VEY_OUTCOME]: jc.vey, [M56_CHOICE_FLAG]: jc.m56, [M56_CAEL_LIVES_FLAG]: true });
      expect(r.snapshots.d09.taken).toBe(true);
      expect(r.snapshots.m56.taken).toBe(true);
      // the ending: every step once, in order, eight slides read, the after-state written, act.ended once
      expect(r.ending.steps.map((s) => s.step)).toEqual(['cutscene', 'card', 'epilogue', 'credits', 'after', 'done']);
      expect(r.ending.slidesRead).toBe(8);
      expect(r.ending.flags).toEqual(Object.fromEntries(ENDING_FLAGS.map((k) => [k, true])));
      expect(r.ending.actEnded).toEqual([{ act: 5, endingId: 'embers-or-dawn' }]);
      // the census
      const [lo, hi] = PHASE_J_END_LEVEL[run];
      expect(r.level.end, `run ${run} ends at level ${r.level.end}`).toBeGreaterThanOrEqual(lo);
      expect(r.level.end).toBeLessThanOrEqual(hi);
      // pacing: no Act 5 quest under the floor; Phase J and the act at 51% (run A, the shorter branch the rows measure)
      expect(r.report.failures, 'no quest under the 40% floor').toEqual([]);
      if (run === 'a') expect(r.gate.ok, r.gate.reasons.join('; ')).toBe(true);
    }, 3_600_000);
  });
}
