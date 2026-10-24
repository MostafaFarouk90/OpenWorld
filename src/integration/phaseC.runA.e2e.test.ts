/**
 * Phase C (Cinderreach), run A, played end to end from the Act 1 complete fixture on a headless game with every real
 * plugin: the first branch of every choice (R05 safe road, R06 cleansed, R07 spared, R11 slain, Redmane defeated).
 * The driver is src/integration/phaseC.ts; the shortcuts it took are listed in the trail and pinned below. Run A and run B
 * are separate files so the two (each about a minute) run in parallel workers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFromSave, type ChapterHarness } from './chapterHarness';
import { ACT1_FIXTURES, readAct1Fixture } from '../save/__fixtures__/act1';
import { PHASE_C_ORDER, playPhaseC } from './phaseC';
import { startCensus } from './act2Xp';
import { CARRIED_KNIGHT } from './carriedKnight';
import { expectPhaseCComplete } from './phaseCAssert';
import { ACT2_PACE } from '../quests/content/act2/pacing';
import { estimatePaceRow, trailNodes } from './timing';


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

describe('Phase C run A', () => {
  it('plays M11 to D03 through the real services', async () => {
    h = await bootFromSave(await readAct1Fixture(ACT1_FIXTURES.complete), { models: true, virtualClock: true });
    const census = startCensus(h);
    const trails = await playPhaseC(h, undefined, { hooks: census.hooks });
    expectPhaseCComplete(h, 'A');
    const pace = ACT2_PACE.map((row) => ({ row, est: estimatePaceRow(row, row.design, (id) => h!.anchor(id), trailNodes(trails[row.quest])) }));
    const penv = (globalThis as { process?: { env: Record<string, string | undefined>; stdout: { write(s: string): void } } }).process;
    if (penv?.env.CENSUS === '1') penv.stdout.write(`\nPACE ${pace.map(({ row, est }) => `${row.quest} ${est.estimateMin.toFixed(1)}/${row.floor} (${est.nodes} nodes vs ${row.nodes})`).join('; ')}\n`);
    // R07 (the recheck of 14.1 against 14) holds its static floor on the nodes this run read; every quest holds 40% of its design minutes.
    // R11 and M14 used to read fewer nodes than their rows assume (13.4 and 20.8); the polish beats (Wynne, Hrolf's report, the keeper, Aelfreda) bring them to 33 and 42 nodes read (the authored beats add 10 and 8; see TIMING.md), so both now hold their static floors too.
    for (const { row, est } of pace) expect(est.estimateMin, row.quest).toBeGreaterThanOrEqual(['r07', 'r11', 'm14'].includes(row.quest) ? row.floor : row.design * 0.4);
    // Every quest's objectives were completed in order, and what was raised instead of played is named.
    for (const q of PHASE_C_ORDER) expect(trails[q].order.length, q).toBeGreaterThan(0);
    const scripted = PHASE_C_ORDER.flatMap((q) => trails[q].scripted);
    expect(scripted).toEqual(['m14.temper(session opened without the screen)']);
    // The kill-XP census (report only; CENSUS=1 prints it). Every quest paid something, and the run ends in the act's band.
    const rows = census.rows();
    expect(rows.map((r) => r.quest)).toEqual([...PHASE_C_ORDER]);
    for (const r of rows) expect(r.killXp + r.otherXp, r.quest).toBeGreaterThan(0);
    // The character the hound packs are tuned against (difficulty.test.ts reads the same table).
    expect(rows.find((r) => r.quest === 'r05'), 'r05').toMatchObject({ levelStart: CARRIED_KNIGHT.r05.level, maxHealth: CARRIED_KNIGHT.r05.maxHealth });
    const env = (globalThis as { process?: { env: Record<string, string | undefined>; stdout: { write(s: string): void } } }).process;
    if (env?.env.CENSUS === '1') env.stdout.write(`\n${census.markdown()}\n\n${pace.map(({ row, est }) => `${row.quest} ${est.estimateMin.toFixed(1)} vs floor ${row.floor} (${est.nodes} nodes)`).join('\n')}\n`);
  }, 240_000);
});
