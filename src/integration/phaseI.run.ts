/**
 * Phase I's headless chain (N12 PR 1): the Rim quests, M47 to M51 with R26 and R29 (and M52 once N10 PR 2's siege lands),
 * played in plan order by phaseIDriver.ts on Act 5's carried base (`act5-carried-chain-<run>.json`, the end of L13's Phase H
 * chain: the save test from Act 4 to Act 5). Run A is the design's "marshal" playthrough on base A (R26 the fast road, kills
 * as kills); run B is "keepers" on base B (R26 the long road, the Spare and the Release offered first). The preset's choice
 * flags and live favour are set on the loaded save before anything is played, so M52's snapshot reads the design's table
 * (no Rim quest moves favour).
 *
 * Measures what the brief and the coordinator name: per-quest seconds, levels and XP, deaths, the cap on every hostile met,
 * the player's gold on first reaching Alric's anvil and at the phase's end (N7's forge set is 550), the pacing on N10's rows
 * with the nodes each quest's run read (Act 5's table and formula), and what was scripted. Quests not yet in the build are
 * reported as `missing`, never faked. Numbers owned by other threads are reported, never retuned here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFromSave, type ChapterHarness } from './chapterHarness';
import { ensure } from './phaseA';
import type { PhaseCTrail } from './phaseC';
import { xpLedger } from './phaseF';
import { trailNodes } from './timing';
import { capOffenders, PHASE_G_RUN_A, PHASE_G_RUN_B, type CapActor } from './phaseG';
import { newWatch, watchDialogueRunner } from './phaseGDriver';
import {
  PHASE_I_MERCY_B, PHASE_I_ORDER, PHASE_I_RUN_A, PHASE_I_RUN_B, playPhaseIQuest, wantedFlagsI, type PhaseIRun,
} from './phaseIDriver';
import { seedFixtureRandom } from './fixtureDeterminism';
import { act5PacingReport, act5TimingMarkdown, estimateAct5Row, phaseIGate, type Act5PaceRow, type Act5PacingReport } from './act5Timing';
import { readAct5Base, readAct5BaseMeta } from '../save/__fixtures__/act5';
import { RIM_A5_PACE, paceAt, type RimPaceRow } from '../quests/content/act5/rim/pacing';
import { ACT5_PRESET_FLAGS, presetLiveFavour, type Act5FavourPreset } from '../quests/act5Jump';
import { FAVOUR_TRACKS, snapshotFlag } from '../state/favour';
import { M52_SPARED_ANY, M52_STOOD, M52_STOOD_ROWS, M52_WAVE4_HELD, M52_WOUNDED } from '../quests/content/act5/rim/m52.quest';
import { RIM_CARD_SEEN_FLAG } from './phaseICard';
import { INSIDE_FLOOR_POINT } from './act5Fixtures';
import { R26_CHOICE } from '../quests/content/act5/rim/r26.quest';

const prog = (h: ChapterHarness) => h.ctx.services.require('progression') as unknown as { xp: number; level: number };
const gold = (h: ChapterHarness): number => (h.ctx.services.get('inventory') as { gold?: number } | undefined)?.gold ?? -1;

const PHASE_I_SKIP = (((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.PHASE_I_SKIP) ?? '').split(',').filter(Boolean);

/** Alric's anvil at the Rim Camp (N7's forge): the gold is read the first time Cael stands within this of it. */
export const ALRIC_ANVIL_ANCHOR = 'caldera.camp.anvil.alric';
export const ALRIC_ANVIL_M = 6;
export const PHASE_I_PRESET: Readonly<Record<'a' | 'b', Act5FavourPreset>> = { a: 'marshal', b: 'keepers' };

export interface PhaseIResult {
  run: 'a' | 'b';
  preset: Act5FavourPreset;
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
  gold: { start: number; atAnvil: number | null; anvilQuest: string | null; end: number };
  favour: Record<string, number>;
  notes: string[];
  scripted: Record<string, string[]>;
  talks: Record<string, string>;
  pacing: string;
  report: Act5PacingReport;
  gate: { share: number; ok: boolean; reasons: string[] };
  outcomes: { r26: string | undefined };
  /** M52: the siege's own outcome flags, the snapshot it took, the card and the hold at the phase's end */
  siege: { wounded: unknown; wave4Held: boolean; sparedAny: boolean; stood: Record<string, boolean>; snapshot: Record<string, unknown> };
  end: { cardShown: boolean; cardSeen: boolean; floorShut: boolean; foundryHoldMet: boolean };
}

/** N10's Rim row as Act 5's estimator row: its two local beats are Act 5's `crossing` and `order`. */
export function rimToAct5Row(r: RimPaceRow): Act5PaceRow {
  const beats = { ...r.beats } as Act5PaceRow['beats'];
  if (r.local?.lavaCrossing) beats.crossing = (beats.crossing ?? 0) + r.local.lavaCrossing;
  if (r.local?.siegeOrder) beats.order = (beats.order ?? 0) + r.local.siegeOrder;
  return { quest: r.quest, design: r.design, route: r.route, legs: r.legs as Act5PaceRow['legs'], nodes: r.nodes, beats };
}

/** Sets the preset's choice flags and live favour on the loaded game (as the `&favour=` jump does). */
export function applyPhaseIPreset(h: ChapterHarness, preset: Act5FavourPreset): void {
  const s = h.ctx.state;
  for (const [k, v] of Object.entries(ACT5_PRESET_FLAGS[preset])) s.setFlag(k as never, v as never);
  const live = presetLiveFavour(preset, 'm47');
  for (const t of FAVOUR_TRACKS) s.addFavour(t, live[t] - s.favour(t), 'script');
}

/** Plays Phase I on a fresh boot of the run's carried base. */
export async function runPhaseI(
  run: 'a' | 'b',
  atEnd?: (h: ChapterHarness, r: PhaseIResult, trails: Record<string, PhaseCTrail>) => Promise<void>,
): Promise<PhaseIResult> {
  watchDialogueRunner();
  seedFixtureRandom();
  await readAct5BaseMeta(run);
  const h = await bootFromSave(await readAct5Base(run), { models: true, virtualClock: true });
  try {
    ensure(h.loaded, `Phase I run ${run}: the carried base loaded`);
    await h.runAsync(30);
    const preset = PHASE_I_PRESET[run];
    applyPhaseIPreset(h, preset);
    await h.runAsync(10);
    const quests = h.ctx.services.require('quests');
    const c = run === 'a' ? PHASE_G_RUN_A : PHASE_G_RUN_B;
    const ic = run === 'a' ? PHASE_I_RUN_A : PHASE_I_RUN_B;
    const cap: string[] = [];
    const seen = new Set<string>();
    const watch = newWatch();
    const anvil = h.ctx.anchors.find(ALRIC_ANVIL_ANCHOR)?.position;
    let atAnvil: number | null = null;
    let anvilQuest: string | null = null;
    let current = '';
    // the Rim card is phase-i's own ActEndingCard (phaseI.plugin.ts), not Act 4's service
    const card = (globalThis as { __phaseICard?: { readonly active: boolean; readonly visible: boolean; dismiss(): void } }).__phaseICard;
    let cardShown = false;
    watch.poll = (hh) => {
      // the card ("The Rim holds") comes up on M52's completion, mid-step: the HUD updates on render
      if (current === 'm52' && card && !cardShown) {
        hh.ctx.hud.update(0);
        if (card.visible) { cardShown = true; card.dismiss(); }
      }
      cap.push(...capOffenders(hh.ctx.actors.all() as Iterable<CapActor>, prog(hh).level, seen));
      if (atAnvil === null && anvil) {
        const f = hh.ctx.player.feet;
        if (Math.hypot(f.x - anvil.x, f.z - anvil.z) <= ALRIC_ANVIL_M) { atAnvil = gold(hh); anvilQuest = current; }
      }
    };
    const xp0 = prog(h).xp;
    const level0 = prog(h).level;
    const gold0 = gold(h);
    const trails: Record<string, PhaseCTrail> = {};
    const seconds: Record<string, number> = {};
    const levelsAtStart: Record<string, number> = {};
    const picks: string[] = [];
    const played: string[] = [];
    const missing: string[] = [];
    for (const q of PHASE_I_ORDER) {
      if (!quests.get(q)) { missing.push(q); continue; }
      // a probe only (never a result): PHASE_I_SKIP=r26 plays on past a quest that cannot finish yet
      if (PHASE_I_SKIP.includes(q)) { missing.push(`${q} (skipped by PHASE_I_SKIP)`); continue; }
      current = q;
      trails[q] = { talks: [], scripted: [], order: [] };
      levelsAtStart[q] = prog(h).level;
      const r: PhaseIRun = {
        h, c, ic, want: { ...wantedFlagsI(ic) }, watch, trail: trails[q]!, picks, used: new Set(),
        ...(run === 'b' ? { mercy: PHASE_I_MERCY_B } : {}),
      };
      const t0 = h.clock.ms;
      await playPhaseIQuest(r, q);
      seconds[q] = Math.round((h.clock.ms - t0) / 1000);
      played.push(q);
    }
    // the anvil is the camp's: if no step walked within reach of it, Cael walks there now (the gold read as he arrives)
    if (atAnvil === null && anvil) {
      await h.approach(anvil as never, ALRIC_ANVIL_M - 1);
      atAnvil = gold(h);
      anvilQuest = 'after the phase (walked there)';
    }
    // the card ("The Rim holds") on M52's completion: the HUD updates on render
    for (let i = 0; i < 60 && played.includes('m52') && !cardShown; i++) {
      h.ctx.hud.update(0.5);
      if (card?.visible) { cardShown = true; card.dismiss(); break; }
      await h.runAsync(15);
    }
    const st = h.ctx.state;
    const containment = h.ctx.services.require('containment');
    const siege: PhaseIResult['siege'] = {
      wounded: st.getFlag(M52_WOUNDED as never),
      wave4Held: st.getBool(M52_WAVE4_HELD as never),
      sparedAny: st.getBool(M52_SPARED_ANY as never),
      stood: Object.fromEntries(M52_STOOD_ROWS.map((row) => [row, st.getBool(M52_STOOD(row) as never)])),
      snapshot: Object.fromEntries(['taken', ...FAVOUR_TRACKS].map((t) => [t, st.getFlag(snapshotFlag('m52', t as never) as never)])),
    };
    const end: PhaseIResult['end'] = {
      cardShown, cardSeen: st.getBool(RIM_CARD_SEEN_FLAG as never),
      floorShut: !containment.isOpen(INSIDE_FLOOR_POINT.x, INSIDE_FLOOR_POINT.z),
      foundryHoldMet: st.getBool('story.phase.foundryOpen' as never),
    };
    const rows = RIM_A5_PACE.filter((row) => trails[row.quest]).map((row) => estimateAct5Row(rimToAct5Row(row), paceAt, trailNodes(trails[row.quest]!)));
    const report = act5PacingReport(rows);
    const g = phaseIGate(report, played);
    const ledger = xpLedger(h.of('xp.gained'));
    const questXp = h.of('xp.gained').filter((e) => e.source.startsWith('quest:')).reduce((n, e) => n + e.amount, 0);
    const result: PhaseIResult = {
      run, preset, played, missing, seconds, picks,
      xp: { start: Math.round(xp0), end: Math.round(prog(h).xp), quests: Math.round(questXp), kill: Math.round(ledger.kill), other: Math.round(ledger.other) },
      level: { start: level0, end: prog(h).level },
      levelsAtStart,
      deaths: h.of('actor.died').filter((e) => e.actorId === h.ctx.player.actor.id).length,
      cap,
      mercy: { spared: watch.spared, refused: watch.spareRefused, released: h.of('mercy').filter((m) => m.verb === 'release').length },
      gold: { start: gold0, atAnvil, anvilQuest, end: gold(h) },
      favour: Object.fromEntries(FAVOUR_TRACKS.map((t) => [t, h.ctx.state.favour(t)])),
      notes: watch.notes,
      scripted: Object.fromEntries(Object.entries(trails).map(([q, t]) => [q, t.scripted])),
      talks: Object.fromEntries(Object.entries(trails).map(([q, t]) => [q, t.talks.map((x) => `${x.npc}:${x.nodes}`).join(' ')])),
      pacing: act5TimingMarkdown(report),
      report,
      gate: { share: report.phases.I?.share ?? 0, ok: g.ok, reasons: g.reasons },
      outcomes: { r26: h.ctx.state.getString(R26_CHOICE) },
      siege, end,
    };
    if (atEnd) await atEnd(h, result, trails);
    return result;
  } finally {
    h.dispose();
  }
}

/** The run's vitest body: plays it, prints the numbers the report quotes, asserts. */
export function definePhaseIRun(run: 'a' | 'b'): void {
  describe(`Phase I headless chain, run ${run.toUpperCase()}`, () => {
    beforeEach(() => {
      vi.spyOn(console, 'info').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());
    it('plays the Rim quests from the carried base', async () => {
      const r = await runPhaseI(run);
      console.log(JSON.stringify({ ...r, report: undefined, pacing: undefined }, null, 1));
      console.log(r.pacing);
      expect(r.missing.filter((m) => m.includes('skipped')), 'no quest skipped').toEqual([]);
      expect(r.outcomes.r26).toBe(run === 'a' ? 'fast' : 'long');
      expect(r.cap).toEqual([]);
      expect(r.deaths).toBe(0);
      expect(r.gold.atAnvil).not.toBeNull();
      expect(r.missing, 'every Phase I quest in the build').toEqual([]);
      // the phase's end: the card once, the Foundry still shut (the hold PR 2 retires)
      expect(r.end).toEqual({ cardShown: true, cardSeen: true, floorShut: true, foundryHoldMet: false });
      expect(r.siege.snapshot.taken).toBe(true);
      expect(r.report.failures, 'no quest under the 40% floor').toEqual([]);
      if (run === 'a') expect(r.gate.ok, `Phase I at ${(r.gate.share * 100).toFixed(1)}%`).toBe(true);
    }, 3_600_000);
  });
}
