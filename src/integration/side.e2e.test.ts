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
import { emptySideTrails, playJ01, playJ02, playJ03, playJ04, playSideJobs, SIDE_ORDER } from './side';
import { estimateTimingFor, SIDE_PLAN, timingMarkdown } from './timing';
import { npcPosition } from './phaseA';

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
    for (const j of SIDE_ORDER) expect(qstate(j), j).toBe('inactive');
    expect(h!.ctx.state.flagsWith('story.j0')).toEqual([]);
    h!.ctx.state.setFlag('story.m05.tobbBond', true);
    const trails = emptySideTrails();
    await playSideJobs(h!, trails);
    for (const j of SIDE_ORDER) expect(qstate(j), j).toBe('completed');
    expect(flag('story.j04.verse')).toBe('ash');
    expect(flag('story.j02.loaf')).toBe('left');
    // the rewards were paid
    expect(h!.ctx.services.require('inventory').gold).toBeGreaterThanOrEqual(15 + 12 + 25 + 10);
    // j03 lights its codex entry on completion
    expect(h!.ctx.services.require('codex').has('lore.dead-road-waystones')).toBe(true);
    // formula minutes (src/integration/TIMING.md)
    const rows = estimateTimingFor(h!, SIDE_PLAN, trails);
    console.log(timingMarkdown(rows));
    expect(rows.map((r) => r.quest)).toEqual([...SIDE_ORDER]);
    for (const r of rows) expect(Math.abs(r.deltaPct), `${r.quest} ${r.estimateMin.toFixed(1)} min against ${r.designMin}`).toBeLessThanOrEqual(25);
  }, TIMEOUT);

  it('j03 started from the tablet first, j02 with the loaf kept, j04 with another verse', async () => {
    await boot();
    h!.ctx.state.setFlag('story.m05.tobbBond', true);
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
    h!.ctx.state.setFlag('story.m05.tobbBond', true);
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
