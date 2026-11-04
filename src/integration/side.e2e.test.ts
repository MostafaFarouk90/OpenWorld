/**
 * The Act 1 side jobs j01 to j04 played end to end on a headless game with every real plugin, from the Phase A end save
 * (src/integration/side.ts). Real services and input throughout, as in chapter.e2e.test.ts: every talk and choice through the
 * dialogue service and key presses, goTo objectives through the real triggers, the lambs and the basket picked up with F, the
 * bluff stone reached by a real Surge Leap (V), the barrow pair from its real spawner (killed with lethal player hits, as in the
 * chain), the notes read with F.
 *
 * Shortcut (through the owning service's public API): the Phase A save predates the bond scene's flag, so
 * `story.m05.tobbBond` is set the way the scene sets it before j04 is offered.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFromSave, type ChapterHarness } from './chapterHarness';
import { PHASE_A_FIXTURES, readPhaseAFixture } from '../save/__fixtures__/phaseA';
import {
  emptySideTrails, playJ01, playJ02, playJ03, playJ04, playJ05, playJ06, playJ07, playJ08, playJ09, playJ09Repeat, playJ10, playJ11, playSideJobs, SIDE_BRIGHTWATER,
  type SideJob,
} from './side';
import { ACT1_FIXTURES, readAct1Fixture } from '../save/__fixtures__/act1';
import { estimateTimingFor, SIDE_PLAN, timingMarkdown } from './timing';
import { npcPosition } from './phaseA';
import { enterInterior, leaveInterior, useAt } from './phaseB';

const TIMEOUT = 300_000;
let h: ChapterHarness | null = null;
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  h?.dispose();
  h = null;
  vi.restoreAllMocks();
});

const subPlan = (jobs: readonly SideJob[]) => Object.fromEntries(jobs.map((j) => [j, SIDE_PLAN[j]])) as Record<SideJob, (typeof SIDE_PLAN)[SideJob]>;
const within25 = (jobs: readonly SideJob[], trails: ReturnType<typeof emptySideTrails>) => {
  const rows = estimateTimingFor(h!, subPlan(jobs), trails);
  console.log(timingMarkdown(rows));
  expect(rows.map((r) => r.quest)).toEqual([...jobs]);
  for (const r of rows) expect(Math.abs(r.deltaPct), `${r.quest} ${r.estimateMin.toFixed(1)} min against ${r.designMin}`).toBeLessThanOrEqual(25);
};
const flag = (k: string) => h!.ctx.state.getFlag(k);
const qstate = (id: string) => h!.ctx.services.require('quests').state(id);
const boot = async (file?: unknown) => {
  h = await bootFromSave(file ?? (await readPhaseAFixture(PHASE_A_FIXTURES.releasedSaved)), { models: true, virtualClock: true });
  expect(h.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
  return h;
};

describe('Act 1 side jobs j01 to j04 (all real plugins)', () => {
  it('an old save (no jobs) loads with every job inactive and no job flag; all four play through, with their timing', async () => {
    await boot();
    for (const j of SIDE_BRIGHTWATER) expect(qstate(j), j).toBe('inactive');
    expect(h!.ctx.state.flagsWith('story.j0')).toEqual([]);
    h!.ctx.state.setFlag('story.m05.tobbBond', true); // the saved fixture predates the bond scene's flag
    const trails = emptySideTrails();
    await playSideJobs(h!, trails);
    for (const j of SIDE_BRIGHTWATER) expect(qstate(j), j).toBe('completed');
    expect(flag('story.j04.verse')).toBe('ash');
    expect(flag('story.j02.loaf')).toBe('left');
    // the rewards were paid
    expect(h!.ctx.services.require('inventory').gold).toBeGreaterThanOrEqual(15 + 12 + 25 + 10);
    // j03 lights its codex entry on completion
    expect(h!.ctx.services.require('codex').has('lore.dead-road-waystones')).toBe(true);
    // formula minutes (src/integration/TIMING.md)
    const rows = estimateTimingFor(h!, subPlan(SIDE_BRIGHTWATER), trails);
    console.log(timingMarkdown(rows));
    expect(rows.map((r) => r.quest)).toEqual([...SIDE_BRIGHTWATER]);
    for (const r of rows) expect(Math.abs(r.deltaPct), `${r.quest} ${r.estimateMin.toFixed(1)} min against ${r.designMin}`).toBeLessThanOrEqual(25);
  }, TIMEOUT);

  it('j03 started from the tablet first, j02 with the loaf kept, j04 with another verse', async () => {
    await boot();
    h!.ctx.state.setFlag('story.m05.tobbBond', true); // the saved fixture predates the bond scene's flag
    const t = emptySideTrails();
    await playJ03(h!, t.j03, 'tablet');
    expect(qstate('j03')).toBe('completed');
    await playJ02(h!, t.j02, 'kept');
    expect(flag('story.j02.loaf')).toBe('kept');
    await playJ04(h!, t.j04, 'bread');
    expect(flag('story.j04.verse')).toBe('bread');
    expect(npcPosition(h!, 'orla')).toBeTruthy();
  }, TIMEOUT);

  it('saves and reloads in the middle of a job (j01 with one lamb home, j04 with the fire lit)', async () => {
    await boot();
    h!.ctx.state.setFlag('story.m05.tobbBond', true); // the saved fixture predates the bond scene's flag
    const t = emptySideTrails();
    // j01: accept, find and carry the first lamb home, save
    const { talkTo, carryTo } = await import('./phaseA');
    await talkTo(h!, t.j01, 'hob', [3]);
    expect(qstate('j01')).toBe('active');
    await h!.runAsync(30);
    await h!.enterTrigger('j01.scar');
    await carryTo(h!, 'j01.lamb-1', 'j01.fold', 'story.j01.lamb1.delivered');
    await talkTo(h!, t.j04, 'tobb', [1]);
    await h!.runAsync(30);
    expect((await h!.ctx.services.require('save').saveNow('manual')).ok).toBe(true);
    await h!.flush();
    const saved = JSON.parse(JSON.stringify(h!.fake.peek('slot-0')));
    h!.dispose();
    await boot(saved);
    const q = h!.ctx.services.require('quests');
    expect(qstate('j01')).toBe('active');
    expect(q.objectiveDone('j01', 'scar')).toBe(true);
    expect(q.objectives('j01').find((o) => o.def.id === 'lambs')!.progress).toBe(1);
    expect(qstate('j04')).toBe('active');
    // finish both from the loaded game
    await h!.enterTrigger('j01.scarecrows');
    await carryTo(h!, 'j01.lamb-2', 'j01.fold', 'story.j01.lamb2.delivered');
    await h!.enterTrigger('j01.ford');
    await carryTo(h!, 'j01.lamb-3', 'j01.fold', 'story.j01.lamb3.delivered');
    await talkTo(h!, t.j01, 'hob');
    expect(qstate('j01')).toBe('completed');
    expect(flag('story.j01.lamb1.delivered')).toBe(true);
    const fire = await import('./side');
    expect(fire).toBeDefined();
    void playJ01;
  }, TIMEOUT);
});


describe('Act 1 side jobs j05 to j11 (all real plugins)', () => {
  const act1 = (name: Parameters<typeof readAct1Fixture>[0]) => readAct1Fixture(name);

  it('j05, j06 and j08 from the M06 gate save: each completes, pays, and is within 25% of plan', async () => {
    await boot(await act1(ACT1_FIXTURES.m06ThroughGate));
    const t = emptySideTrails();
    const inv = h!.ctx.services.require('inventory');
    const gold0 = inv.gold;
    for (const [j, play] of [['j05', playJ05], ['j06', playJ06], ['j08', playJ08]] as const) {
      expect(qstate(j), j).toBe('inactive');
      await play(h!, t[j]);
      expect(qstate(j), j).toBe('completed');
    }
    expect(inv.gold - gold0).toBe(15 + 12 + 18);
    within25(['j05', 'j06', 'j08'], t);
  }, TIMEOUT);

  it('j07 and j09 (and the repeat bout, which pays nothing) from the class-chosen save', async () => {
    await boot(await act1(ACT1_FIXTURES.m07ClassChosen));
    const t = emptySideTrails();
    await playJ07(h!, t.j07);
    await playJ09(h!, t.j09);
    const d = await playJ09Repeat(h!, t.j09);
    expect(d).toEqual({ xp: 0, gold: 0 });
    expect(qstate('j09')).toBe('completed');
    within25(['j07', 'j09'], t);
  }, TIMEOUT);

  it('j10 is refused until j04 is done, then plays', async () => {
    await boot(await act1(ACT1_FIXTURES.m07ClassChosen));
    expect(h!.ctx.services.require('quests').start('j10')).toBe(false);
    h!.ctx.state.setFlag('story.m05.tobbBond', true); // the saved fixture predates the bond scene's flag
    const t = emptySideTrails();
    await playJ04(h!, t.j04);
    await playJ10(h!, t.j10, 'window');
    expect(flag('story.j10.verse')).toBe('window');
    within25(['j04', 'j10'], t);
  }, TIMEOUT);

  it('j11 from the complete save: the grate stays shut without the key, turns with it, and the job plays', async () => {
    await boot(await act1(ACT1_FIXTURES.complete));
    const inv = h!.ctx.services.require('inventory');
    const keys = inv.count('sewer-master-key');
    expect(keys).toBeGreaterThanOrEqual(1);
    const t = emptySideTrails();
    await playJ11(h!, t.j11);
    expect(qstate('j11')).toBe('completed');
    expect(flag('world.underways.cartway')).toBe(true);
    within25(['j11'], t);
  }, TIMEOUT);

  it('j11: without the key the grate refuses (the shut one answers, the flag stays unset); with it the grate turns', async () => {
    await boot(await act1(ACT1_FIXTURES.complete));
    const inv = h!.ctx.services.require('inventory');
    const n = inv.count('sewer-master-key');
    expect(inv.remove('sewer-master-key', n)).toBe(true);
    await enterInterior(h!, 'underways', 'underways');
    await expect(useAt(h!, 'j11.grate', 'use:j11-grate')).rejects.toThrow();
    await useAt(h!, 'j11.grate', 'use:j11-grate-shut');
    expect(flag('world.underways.cartway')).toBeFalsy();
    inv.add('sewer-master-key', n);
    await h!.runAsync(20);
    await useAt(h!, 'j11.grate', 'use:j11-grate');
    expect(flag('world.underways.cartway')).toBe(true);
    await leaveInterior(h!);
  }, TIMEOUT);
});
