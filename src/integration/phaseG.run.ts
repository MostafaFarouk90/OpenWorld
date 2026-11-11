/**
 * Phase G's headless chain (L13 PR 1): the thirteen Harrowmark quests, M35 to M41, played in order on the carried Act 3 base
 * (untopped, coordinator ruling A) by phaseGDriver.ts, in run A (every delegate won, kills as kills) or run B (two delegates
 * lost, the stealth and the quieter ways, Footmen spared). Asserts what the brief names: every quest completed, M37 offered
 * only after the other eight, Gaut retired, the city held behind its gates with nobody stranded, the "Waste is next" card
 * after M41 with the hold standing, the services reachable, the Q1 cap on everything met, the XP and the end level (ruling E,
 * reported never relaxed), and the 51% pacing gate on the rows measured in the run.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChapterHarness } from './chapterHarness';
import { ensure } from './phaseA';
import type { PhaseCTrail } from './phaseC';
import { xpLedger } from './phaseF';
import {
  bootPhaseG, capOffenders, measurePhaseG, PHASE_G_END_LEVEL, PHASE_G_EXPECTED, PHASE_G_ORDER, PHASE_G_RUN_A, PHASE_G_RUN_B,
  type CapActor, type PhaseGChoices,
} from './phaseG';
import { newWatch, playPhaseGQuest, pressAt, wantedFlags, watchDialogueRunner, type PhaseGRun } from './phaseGDriver';
import { REFUGE_STONE, servicesAfterM41, unreachable, type ServicePorts } from './act4Services';
import { WAYSTONE_TUNING } from '../waystones/tuning';
import { saveFixture, seedFixtureRandom } from './fixtureDeterminism';
import { fixtureText } from './act4FixturesGen';
import { phaseGEndName } from '../save/__fixtures__/act4';
import { act4TimingMarkdown } from './act4Timing';
import { evalCondition } from '../quests/conditions';
import { HARROWMARK_A4_PACE, paceAt } from '../quests/content/act4/harrowmark/pacing';
import { M37_NEEDS } from '../quests/content/act4/harrowmark/m37.quest';
import { WASTE_CARD_SEEN_FLAG } from './phaseGCard';
import { insideRingWall } from '../harrowmark/noStrand';
import { vendorOpenByTable } from '../economy/stock';

export interface PhaseGResult {
  run: 'a' | 'b';
  seconds: Record<string, number>;
  trails: Record<string, PhaseCTrail>;
  picks: string[];
  xp: { start: number; end: number; quests: number; kill: number; other: number };
  level: { start: number; end: number };
  deaths: number;
  cap: string[];
  spared: number;
  spareRefused: number;
  notes: string[];
  pacing: string;
  gate: { share: number; ok: boolean; reasons: string[] };
  talks: Record<string, string>;
  refuge: string[];
  /** the travel results, out to another stone and back to the refuge */
  travel: unknown[];
}

/** A point well inside the Ashen Waste (engine x 8000..16000, z 5500..12000), off the Caldera. */
const WASTE_DEEP = { x: 9000, z: 7000 } as const;

const prog = (h: ChapterHarness) => h.ctx.services.require('progression') as unknown as { xp: number; level: number };

/** Plays the whole of Phase G on a fresh boot of the carried base; `atEnd` sees the game at Phase G's end (before dispose). */
export async function runPhaseG(
  run: 'a' | 'b', c: PhaseGChoices = run === 'a' ? PHASE_G_RUN_A : PHASE_G_RUN_B, atEnd?: (h: ChapterHarness, r: PhaseGResult) => Promise<void>,
): Promise<PhaseGResult> {
  watchDialogueRunner();
  // seeded as the fixtures are, so the AI and the waves roll the same in every run (no flaky shard)
  seedFixtureRandom();
  const h = await bootPhaseG();
  try {
    const cap: string[] = [];
    const seen = new Set<string>();
    const watch = newWatch();
    watch.poll = (hh) => { cap.push(...capOffenders(hh.ctx.actors.all() as Iterable<CapActor>, prog(hh).level, seen)); };
    const xp0 = prog(h).xp;
    const level0 = prog(h).level;
    const trails: Record<string, PhaseCTrail> = {};
    const seconds: Record<string, number> = {};
    const picks: string[] = [];
    const quests = h.ctx.services.require('quests');
    const m37Open = () => evalCondition(quests.get('m37')!.startWhen, { state: h.ctx.state as never, quests });
    for (const q of PHASE_G_ORDER) {
      if ((M37_NEEDS as readonly string[]).includes(q)) ensure(!m37Open(), `M37 not offerable before ${q} is done`);
      if (q === 'm37') ensure(m37Open(), 'M37 offerable once the other eight are done');
      trails[q] = { talks: [], scripted: [], order: [] };
      const r: PhaseGRun = { h, c, want: wantedFlags(c), watch, trail: trails[q]!, picks, used: new Set() };
      const t0 = h.clock.ms;
      await playPhaseGQuest(r, q);
      seconds[q] = Math.round((h.clock.ms - t0) / 1000);
    }
    // where M41 leaves the player, before the refuge leg moves him: outside the ring wall
    const f41 = h.ctx.player.feet;
    const insideAfterM41 = insideRingWall(f41.x, f41.z);
    // every choice of the run took: the state holds what the run wanted (a fallback pick would show here)
    const choices = Object.entries(wantedFlags(c))
      .filter(([k, v]) => (h.ctx.state.getFlag(k) ?? false) !== v)
      .map(([k, v]) => `${k}: wanted ${String(v)}, got ${String(h.ctx.state.getFlag(k))}`);
    // the card after M41, read once, the hold standing
    for (let i = 0; i < 20 && !h.ctx.state.getBool(WASTE_CARD_SEEN_FLAG); i++) {
      // the HUD's widgets update on the render frame, which a headless game never draws: update the card as the frame would
      const card = (globalThis as unknown as { __phaseGCard?: { visible?: boolean; dismiss?(): void; update?(dt: number): void } }).__phaseGCard;
      card?.update?.(0.5);
      if (card?.visible) card.dismiss?.();
      await h.runAsync(30);
    }
    // ruling D: the refuge stone, reached on foot and rekindled as a player arriving at Ashgate would, then travel out and back
    const ws0 = h.ctx.services.require('waystones');
    const refuge: string[] = [];
    const travel: unknown[] = [];
    // the use point is the stone itself, 2.6 m north of the anchor (WAYSTONE_STONE_OFFSET): walk up to it from any side
    await pressAt(h, `waystone:${REFUGE_STONE}`, WAYSTONE_TUNING.rekindleHoldSeconds + 0.2);
    await h.runAsync(30);
    refuge.push(`rekindled ${REFUGE_STONE}: ${ws0.isLit(REFUGE_STONE)}`);
    const other = ws0.litIds().find((id) => id !== REFUGE_STONE && !ws0.isDark(id));
    ensure(other, 'a lit stone other than the refuge to travel to');
    for (const to of [other!, REFUGE_STONE]) {
      const p = ws0.travel(to);
      let res: unknown;
      void p.then((x) => { res = x; });
      for (let i = 0; i < 80 && res === undefined; i++) await h.runAsync(30);
      refuge.push(`travel to ${to}: ${JSON.stringify(res)}`);
      travel.push(res);
    }
    const xp1 = prog(h).xp;
    const ledger = xpLedger(h.of('xp.gained'));
    const questXp = h.of('xp.gained').filter((e) => e.source.startsWith('quest:')).reduce((n, e) => n + e.amount, 0);
    const measured = measurePhaseG(HARROWMARK_A4_PACE, trails, paceAt);
    const result: PhaseGResult = {
      run, seconds, trails, picks,
      xp: { start: Math.round(xp0), end: Math.round(xp1), quests: Math.round(questXp), kill: Math.round(ledger.kill), other: Math.round(ledger.other) },
      level: { start: level0, end: prog(h).level },
      deaths: h.of('actor.died').filter((e) => e.actorId === h.ctx.player.actor.id).length,
      cap, spared: watch.spared, spareRefused: watch.spareRefused, notes: watch.notes,
      pacing: act4TimingMarkdown(measured.report),
      gate: { share: measured.report.phases.G?.share ?? 0, ok: measured.gate.ok, reasons: measured.gate.reasons },
      talks: Object.fromEntries(Object.entries(trails).map(([q, t]) => [q, t.talks.map((x) => `${x.npc}:${x.nodes}`).join(' ')])),
      refuge, travel,
    };
    // the world after M41: Gaut gone, the gates shut, the hold standing, the card seen, nobody inside the walls
    const gaut = [...h.ctx.actors.all()].some((a) => a.kind === 'npc:gaut' && !a.dead);
    const ws = h.ctx.services.require('waystones');
    const ports: ServicePorts = {
      flags: h.ctx.state,
      anchor: (id) => h.ctx.anchors.find(id)?.position,
      vendorOpen: (v) => vendorOpenByTable(v, h.ctx.state),
      stoneLit: (id) => ws.isLit(id),
      stoneDark: (id) => ws.isDark(id),
    };
    const bad = unreachable(servicesAfterM41(ports));
    Object.assign(result, {
      world: {
        gautStanding: gaut,
        // the Waste shut at Phase G's end: M42 not yet accepted, so a point deep in the Waste is closed (the hold is retired)
        held: !h.ctx.state.getBool('story.m42.started') && !h.ctx.services.require('containment').isOpen(WASTE_DEEP.x, WASTE_DEEP.z),
        cardSeen: h.ctx.state.getBool(WASTE_CARD_SEEN_FLAG),
        insideWalls: insideAfterM41,
        refugeLit: ws.isLit(REFUGE_STONE),
        choices,
        unreachable: bad,
      },
    });
    if (atEnd) await atEnd(h, result);
    return result;
  } finally {
    h.dispose();
  }
}

const SAVE_END = ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.SAVE_PHASE_G_END) === '1';

/** What the Phase G end save's meta records (read by phaseH.run.ts). */
export interface PhaseGEndMeta {
  run: 'a' | 'b';
  level: PhaseGResult['level'];
  xp: PhaseGResult['xp'];
  deaths: number;
  spared: number;
  seconds: Record<string, number>;
  trails: Record<string, PhaseCTrail>;
}

/** Writes the Phase G end save of `run` beside the Act 4 fixtures (`act4-phase-g-end-<run>.json`). */
async function writePhaseGEnd(h: ChapterHarness, run: 'a' | 'b', r: PhaseGResult): Promise<void> {
  const fsName = 'node:fs';
  const urlName = 'node:url';
  const fs = (await import(/* @vite-ignore */ fsName)) as { writeFileSync(p: string, d: string): void };
  const { fileURLToPath } = (await import(/* @vite-ignore */ urlName)) as { fileURLToPath(u: URL): string };
  const dir = fileURLToPath(new URL('../save/__fixtures__/act4/', import.meta.url));
  fs.writeFileSync(`${dir}${phaseGEndName(run)}.json`, fixtureText(await saveFixture(h)));
  // the meta carries what Phase H's act-wide numbers need from this run: its trails (pacing) and its XP and level
  const meta: PhaseGEndMeta = {
    run, level: r.level, xp: r.xp, deaths: r.deaths, spared: r.spared, seconds: r.seconds,
    trails: Object.fromEntries(Object.entries(r.trails).map(([q, t]) => [q, { talks: t.talks, scripted: t.scripted, order: t.order }])),
  };
  fs.writeFileSync(`${dir}${phaseGEndName(run)}.meta.json`, fixtureText(meta));
}

/** The runs the 51% Phase G gate is asserted on (the others print their share for the report). */
export const PHASE_G_GATE_RUNS: readonly ('a' | 'b')[] = ['a'];

/** The run's vitest body: plays it, prints the numbers the report quotes, asserts. */
export function definePhaseGRun(run: 'a' | 'b'): void {
  describe(`Phase G headless chain, run ${run.toUpperCase()}`, () => {
    beforeEach(() => {
      vi.spyOn(console, 'info').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());
    it('plays M35 to M41 and holds the Waste', async () => {
      // SAVE_PHASE_G_END=1 writes the run's end save, the start of Phase H's chain (phaseH.run.ts)
      const r = await runPhaseG(run, undefined, SAVE_END ? (h, res) => writePhaseGEnd(h, run, res) : undefined);
      const w = (r as unknown as {
        world: { gautStanding: boolean; held: boolean; cardSeen: boolean; insideWalls: boolean; unreachable: string[]; refugeLit: boolean; choices: string[] };
      }).world;
      console.log(JSON.stringify({ ...r, trails: undefined, world: w }, null, 1));
      console.log(r.pacing);
      expect(w.gautStanding).toBe(false);
      expect(w.held).toBe(true);
      expect(w.cardSeen).toBe(true);
      expect(w.insideWalls).toBe(false);
      expect(w.unreachable).toEqual([]);
      expect(w.refugeLit).toBe(true);
      expect(r.travel).toEqual([{ ok: true }, { ok: true }]);
      expect(w.choices).toEqual([]);
      // every NPC the chain talked to stood in the world (no talk started at an empty post by script)
      expect(r.notes.filter((n) => n.includes('absent'))).toEqual([]);
      expect(r.cap).toEqual([]);
      // The 51% gate is held on run A, the reference run; run B (the stealth R20, whose plan row counts the force route's
      // beats) is reported and held to the 40% row floor and a measured row for every quest (coordinator ruling, round 2).
      const held = PHASE_G_GATE_RUNS.includes(run) ? r.gate.reasons : r.gate.reasons.filter((x) => !x.startsWith('Phase G at'));
      expect(held).toEqual([]);
      expect(r.level.end).toBeGreaterThanOrEqual(PHASE_G_END_LEVEL[run]);
      expect(r.xp.quests).toBeGreaterThanOrEqual(PHASE_G_EXPECTED.quests * 0.9);
    }, 3_600_000);
  });
}
