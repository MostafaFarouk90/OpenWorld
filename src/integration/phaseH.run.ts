/**
 * Phase H's headless chain (L13 PR 2): the eight Waste quests, M42 to M46 with R24, R25 and D08, played in plan order by
 * phaseHDriver.ts on the game saved at the end of Phase G's own chain (`act4-phase-g-end-<run>.json`, written by
 * `SAVE_PHASE_G_END=1` on phaseG.runA/B: the save test from Phase G to Phase H). Run A follows Phase G's run A (R24 all to
 * the camp, Eormen defeated, the blooms burned, kills as kills); run B follows run B (R24 half to Harrowmark, Eormen released,
 * the pyre wraiths released, every Footman spared and every wraith or husk released where the Release takes).
 *
 * Asserts what the brief names: the hold retired (the Waste shut on load, open on accepting M42), every quest completed,
 * M46 offered only after the other seven, the Q1 cap on everything met, the act ending once (`story.gate.a5`, the card, the
 * fade to the Rimfoot fire, `scene-act4-camp`, `story.a4.campSeen`), the end level (run A 30 to 32, run B 27 or more), the
 * pacing over all 21 quests (the act at 50% or more, no quest under the 40% floor; Phase G's rows from the saved trails).
 * Numbers owned by other threads (XP rewards, kill factors, the D08 row) are reported, never retuned here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFromSave, type ChapterHarness } from './chapterHarness';
import { ensure } from './phaseA';
import type { PhaseCTrail } from './phaseC';
import { xpLedger } from './phaseF';
import { trailNodes } from './timing';
import { capOffenders, PHASE_G_RUN_A, PHASE_G_RUN_B, type CapActor } from './phaseG';
import { newWatch, readOpen, wantedFlags, watchDialogueRunner } from './phaseGDriver';
import {
  PHASE_H_MERCY_B, PHASE_H_ORDER, PHASE_H_RUN_A, PHASE_H_RUN_B, playPhaseHQuest, wantedFlagsH, type PhaseHRun,
} from './phaseHDriver';
import type { PhaseGEndMeta } from './phaseG.run';
import { seedFixtureRandom } from './fixtureDeterminism';
import { act4PacingReport, act4TimingMarkdown, ACT4_ACT_TARGET, estimateAct4Row, type Act4PacingReport } from './act4Timing';
import { readPhaseGEnd, readPhaseGEndMeta } from '../save/__fixtures__/act4';
import { HARROWMARK_A4_PACE, paceAt as harrowmarkPaceAt } from '../quests/content/act4/harrowmark/pacing';
import { WASTE_A4_PACE, paceAt as wastePaceAt } from '../quests/content/act4/waste/pacing';
import { M46_NEEDS } from '../quests/content/act4/waste/m46.quest';
import { evalCondition } from '../quests/conditions';
import { ACT4_ENDING } from './act4Ending.plugin';
import { ACT4_CAMP_DIALOGUE } from '../dialogue/content/act4/campScene.dialogue';
import { WASTE_CARD_SEEN_FLAG } from './phaseGCard';
import { WASTE_AMBIENT_SPAWNERS, WASTE_SPAWNERS } from '../enemies/waste/spawners';
import { wasteAmbientCensus } from '../enemies/waste/census';
import { ACT4_HARROWMARK_SPAWNERS } from '../harrowmark/act4/spawners';
import { ACT4_QUEST_SPAWNERS } from '../quests/content/act4';
import { act4Level, ACT4_CAP_ABOVE_PLAYER, ACT4_FIRST_ARRIVAL_ABOVE_PLAYER } from '../enemies/level';
import type { SpawnerDef } from '../enemies/types';
import { D08_BOSS_FLAG } from '../quests/content/act4/waste/d08.quest';
import { R24_CHOICE } from '../quests/content/act4/waste/r24.quest';

/** The brief's act-end asserts: the chain ends at 30 to 32 (run A), the mercy-heavy run at 27 or more. */
export const PHASE_H_END_LEVEL = { a: { min: 30, max: 32 }, b: { min: 27, max: 32 } } as const;
const prog = (h: ChapterHarness) => h.ctx.services.require('progression') as unknown as { xp: number; level: number };

export interface PhaseHResult {
  run: 'a' | 'b';
  seconds: Record<string, number>;
  picks: string[];
  xp: { start: number; end: number; quests: number; kill: number; other: number };
  level: { start: number; afterM42Accept: number; end: number };
  levelsAtStart: Record<string, number>;
  deaths: number;
  cap: string[];
  mercy: { spared: number; refused: number; released: number };
  notes: string[];
  scripted: Record<string, string[]>;
  talks: Record<string, string>;
  pacing: string;
  report: Act4PacingReport;
  pacingWithNotes: { phaseH: number; act: number; failures: string[]; table: string };
  /** the hold retired, read on the loaded Phase G end save */
  carried: { m41Done: boolean; cardSeen: boolean; m42Offered: boolean; wasteShutBeforeAccept: boolean; wasteOpenAfterAccept: boolean };
  m46EarlyOffered: string[];
  ending: { ended: number; gateWrites: number; cardShown: boolean; camps: number; campSeen: boolean; atFireM: number; campNodes: number };
  outcomes: { eormen: string | undefined; r24: string | undefined };
  census: { ambientAtStart: number; ambientAtEnd: number };
}

/** A point well inside the Ashen Waste (as phaseG.run.ts). */
const WASTE_DEEP = { x: 9000, z: 7000 } as const;

/** Every Act 4 spawn group's highest roll at `player`: none above P + 3 (first arrivals P + 2); how many the cap pulls down. */
export function staticCap(defs: readonly SpawnerDef[], player: number, bandMax = 35): { over: string[]; capped: number; groups: number } {
  const over: string[] = [];
  let capped = 0;
  for (const d of defs) {
    const first = d.firstArrival === true;
    const top = act4Level({ min: Math.min(bandMax, player), max: bandMax }, 1, player, first);
    const cap = player + (first ? ACT4_FIRST_ARRIVAL_ABOVE_PLAYER : (ACT4_CAP_ABOVE_PLAYER ?? Infinity));
    if (top > cap) over.push(`${d.id} ${top} > ${cap}`);
    if (bandMax > cap) capped++;
  }
  return { over, capped, groups: defs.length };
}

export const ACT4_ALL_SPAWNERS: readonly SpawnerDef[] = [...ACT4_HARROWMARK_SPAWNERS, ...ACT4_QUEST_SPAWNERS, ...WASTE_SPAWNERS];

/** Plays the whole of Phase H on a fresh boot of the run's Phase G end save. */
export async function runPhaseH(run: 'a' | 'b'): Promise<PhaseHResult> {
  watchDialogueRunner();
  seedFixtureRandom();
  const gMeta = await readPhaseGEndMeta(run);
  const h = await bootFromSave(await readPhaseGEnd(run), { models: true, virtualClock: true });
  try {
    ensure(h.loaded, `Phase H run ${run}: the Phase G end save loaded`);
    await h.runAsync(30);
    const s = h.ctx.state;
    const quests = h.ctx.services.require('quests');
    const containment = h.ctx.services.require('containment');
    // the save test, Phase G to Phase H: the Waste shut on the loaded save until M42 is accepted
    const carried: PhaseHResult['carried'] = {
      m41Done: quests.state('m41') === 'completed',
      cardSeen: s.getBool(WASTE_CARD_SEEN_FLAG),
      m42Offered: quests.state('m42') === 'inactive' && evalCondition(quests.get('m42')!.startWhen, { state: s as never, quests }),
      wasteShutBeforeAccept: !containment.isOpen(WASTE_DEEP.x, WASTE_DEEP.z),
      wasteOpenAfterAccept: false,
    };
    const c = run === 'a' ? PHASE_G_RUN_A : PHASE_G_RUN_B;
    const hc = run === 'a' ? PHASE_H_RUN_A : PHASE_H_RUN_B;
    const cap: string[] = [];
    const seen = new Set<string>();
    const watch = newWatch();
    watch.poll = (hh) => { cap.push(...capOffenders(hh.ctx.actors.all() as Iterable<CapActor>, prog(hh).level, seen)); };
    const xp0 = prog(h).xp;
    const level0 = prog(h).level;
    const census0 = wasteAmbientCensus(WASTE_AMBIENT_SPAWNERS, { playerLevel: level0 }).total;
    const trails: Record<string, PhaseCTrail> = {};
    const seconds: Record<string, number> = {};
    const levelsAtStart: Record<string, number> = {};
    const picks: string[] = [];
    const m46EarlyOffered: string[] = [];
    const m46Open = () => evalCondition(quests.get('m46')!.startWhen, { state: s as never, quests });
    let afterM42Accept = level0;
    // the act's ending, watched from the boot: every `true` write of the gate
    let gateWrites = 0;
    const set = s.setFlag.bind(s);
    (s as { setFlag: typeof set }).setFlag = ((k: string, v: unknown) => {
      if (k === ACT4_ENDING.gateFlag && v === true) gateWrites++;
      return set(k as never, v as never);
    }) as typeof set;
    for (const q of PHASE_H_ORDER) {
      if (q !== 'm46' && m46Open()) m46EarlyOffered.push(`before ${q}`);
      if (q === 'm46') ensure(m46Open(), `M46 offerable once ${M46_NEEDS.join(', ')} are done`);
      trails[q] = { talks: [], scripted: [], order: [] };
      levelsAtStart[q] = prog(h).level;
      const r: PhaseHRun = {
        h, c, hc, want: { ...wantedFlags(c), ...wantedFlagsH(hc) }, watch, trail: trails[q]!, picks, used: new Set(),
        ...(run === 'b' ? { mercy: PHASE_H_MERCY_B } : {}),
      };
      const t0 = h.clock.ms;
      if (q === 'm42') {
        // accepted by Wulfhild's brief: the Waste opens with it (the first objective's talk is the offer)
        const off = h.ctx.events.on('quest.started', (e) => {
          if (e.questId !== 'm42') return;
          afterM42Accept = prog(h).level;
        });
        await playPhaseHQuest(r, q);
        off();
      } else await playPhaseHQuest(r, q);
      if (q === 'm42') carried.wasteOpenAfterAccept = containment.isOpen(WASTE_DEEP.x, WASTE_DEEP.z);
      seconds[q] = Math.round((h.clock.ms - t0) / 1000);
    }
    // the ending: the card (the HUD updates on render), the fade to the Rimfoot fire, the camp scene read through
    const card = h.ctx.services.require('actEndingCard');
    const dialogue = h.ctx.services.require('dialogue');
    let cardShown = false;
    let campNodes = 0;
    const endTrail: PhaseCTrail = { talks: [], scripted: [], order: [] };
    const rEnd: PhaseHRun = { h, c, hc, want: {}, watch, trail: endTrail, picks, used: new Set() };
    for (let i = 0; i < 400 && s.getFlag(ACT4_ENDING.campSeenFlag) !== true; i++) {
      h.ctx.hud.update(0.5);
      if (card.active()) { cardShown = true; card.dismiss(); }
      if (dialogue.active) campNodes += readOpen(rEnd, ACT4_CAMP_DIALOGUE);
      await h.runAsync(15);
    }
    await h.runAsync(120);
    const fire = h.ctx.anchors.find(ACT4_ENDING.campAnchorId!)?.position;
    const f = h.ctx.player.feet;
    const xp1 = prog(h).xp;
    const ledger = xpLedger(h.of('xp.gained'));
    const questXp = h.of('xp.gained').filter((e) => e.source.startsWith('quest:')).reduce((n, e) => n + e.amount, 0);
    // the pacing over all 21: Phase G's rows on the run's saved trails, Phase H's on this run's
    const at = (id: string) => { try { return wastePaceAt(id); } catch { return harrowmarkPaceAt(id); } };
    const rows = [
      ...HARROWMARK_A4_PACE.map((row) => estimateAct4Row(row, harrowmarkPaceAt, trailNodes(gMeta.trails[row.quest]!))),
      ...WASTE_A4_PACE.map((row) => estimateAct4Row(row, at, trailNodes(trails[row.quest]!))),
    ];
    const report = act4PacingReport(rows);
    // L11's own count (plan rows' WASTE_A4_NODES): a note's two lines as dialogue nodes too, on top of its `search` beat.
    // Reported beside the convention (notes are beats only, as Acts 2 and 3 and Phase G count them), never gated.
    const withNotes = (t: PhaseCTrail) => t.talks.reduce((n, x) => n + x.nodes, 0);
    const reportWithNotes = act4PacingReport([
      ...HARROWMARK_A4_PACE.map((row) => estimateAct4Row(row, harrowmarkPaceAt, trailNodes(gMeta.trails[row.quest]!))),
      ...WASTE_A4_PACE.map((row) => estimateAct4Row(row, at, withNotes(trails[row.quest]!))),
    ]);
    const released = h.of('mercy').filter((m) => m.verb === 'release').length;
    return {
      run, seconds, picks,
      xp: { start: Math.round(xp0), end: Math.round(xp1), quests: Math.round(questXp), kill: Math.round(ledger.kill), other: Math.round(ledger.other) },
      level: { start: level0, afterM42Accept, end: prog(h).level },
      levelsAtStart,
      deaths: h.of('actor.died').filter((e) => e.actorId === h.ctx.player.actor.id).length,
      cap,
      mercy: { spared: watch.spared, refused: watch.spareRefused, released },
      notes: watch.notes,
      scripted: Object.fromEntries(Object.entries(trails).map(([q, t]) => [q, t.scripted])),
      talks: Object.fromEntries(Object.entries(trails).map(([q, t]) => [q, t.talks.map((x) => `${x.npc}:${x.nodes}`).join(' ')])),
      pacing: act4TimingMarkdown(report),
      report,
      pacingWithNotes: { phaseH: reportWithNotes.phases.H?.share ?? 0, act: reportWithNotes.act.share, failures: reportWithNotes.failures, table: act4TimingMarkdown(reportWithNotes) },
      carried,
      m46EarlyOffered,
      ending: {
        ended: h.of('act.ended').filter((e) => e.act === 4).length,
        gateWrites,
        cardShown,
        camps: h.of('dialogue.started').filter((e) => e.dialogueId === ACT4_CAMP_DIALOGUE).length,
        campSeen: s.getFlag(ACT4_ENDING.campSeenFlag) === true,
        atFireM: fire ? Math.round(Math.hypot(f.x - fire.x, f.z - fire.z)) : -1,
        campNodes,
      },
      outcomes: { eormen: s.getString(D08_BOSS_FLAG), r24: s.getString(R24_CHOICE) },
      census: { ambientAtStart: census0, ambientAtEnd: wasteAmbientCensus(WASTE_AMBIENT_SPAWNERS, { playerLevel: prog(h).level }).total },
    };
  } finally {
    h.dispose();
  }
}

/** The run's vitest body: plays it, prints the numbers the report quotes, asserts. */
export function definePhaseHRun(run: 'a' | 'b'): void {
  describe(`Phase H headless chain, run ${run.toUpperCase()}`, () => {
    beforeEach(() => {
      vi.spyOn(console, 'info').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());
    it('plays M42 to M46 from the Phase G end save and ends the act once', async () => {
      const r = await runPhaseH(run);
      console.log(JSON.stringify({ ...r, report: undefined, pacing: undefined }, null, 1));
      console.log(r.pacing);
      console.log(`with notes as nodes (L11's count): Phase H ${(r.pacingWithNotes.phaseH * 100).toFixed(1)}%, act ${(r.pacingWithNotes.act * 100).toFixed(1)}%`);
      console.log(r.pacingWithNotes.table);
      // the hold is retired: carried over from Phase G, the Waste opens only with M42
      expect(r.carried).toEqual({ m41Done: true, cardSeen: true, m42Offered: true, wasteShutBeforeAccept: true, wasteOpenAfterAccept: true });
      expect(r.m46EarlyOffered).toEqual([]);
      expect(r.outcomes).toEqual(run === 'a' ? { eormen: 'defeated', r24: 'all' } : { eormen: 'released', r24: 'half' });
      // the ending, once
      expect(r.ending).toMatchObject({ ended: 1, gateWrites: 1, cardShown: true, camps: 1, campSeen: true });
      expect(r.ending.atFireM).toBeLessThan(20);
      expect(r.cap).toEqual([]);
      expect(r.deaths).toBe(0);
      // the act's levels
      expect(r.level.end).toBeGreaterThanOrEqual(PHASE_H_END_LEVEL[run].min);
      expect(r.level.end).toBeLessThanOrEqual(PHASE_H_END_LEVEL[run].max);
      // Q1, static: no Act 4 group can roll above the cap at the run's level at M35's start and at M42's start
      const g = await readPhaseGEndMeta(run);
      for (const p of [g.level.start, r.level.start]) expect(staticCap(ACT4_ALL_SPAWNERS, p).over, `at level ${p}`).toEqual([]);
      // the pacing, last (so every other check above has run): the act at 50% or more, no quest under the 40% floor
      expect(r.report.failures, 'no quest under the 40% floor').toEqual([]);
      expect(r.report.act.share).toBeGreaterThanOrEqual(ACT4_ACT_TARGET - 1e-9);
    }, 3_600_000);
  });
}

/** Phase G's end meta for the report (read without booting). */
export type { PhaseGEndMeta };
