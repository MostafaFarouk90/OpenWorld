/**
 * Phase C (Cinderreach), run B, played end to end from the Act 1 complete fixture on a headless game with every real
 * plugin: the second branch of every choice (R05 fox, R06 sealed, R07 culled, R11 spared, Redmane spared).
 * The driver is src/integration/phaseC.ts; the shortcuts it took are listed in the trail and pinned below. Run A and run B
 * are separate files so the two (each about a minute) run in parallel workers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFromSave, type ChapterHarness } from './chapterHarness';
import { ACT1_FIXTURES, readAct1Fixture } from '../save/__fixtures__/act1';
import { PHASE_C_ORDER, PHASE_C_RUN_B, playPhaseC } from './phaseC';
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

describe('Phase C run B', () => {
  it('plays M11 to D03 through the real services', async () => {
    h = await bootFromSave(await readAct1Fixture(ACT1_FIXTURES.complete), { models: true, virtualClock: true });
    const trails = await playPhaseC(h, undefined, { choices: PHASE_C_RUN_B });
    expectPhaseCComplete(h, 'B');
    const pace = ACT2_PACE.map((row) => ({ row, est: estimatePaceRow(row, row.design, (id) => h!.anchor(id), trailNodes(trails[row.quest])) }));
    const penv = (globalThis as { process?: { env: Record<string, string | undefined>; stdout: { write(s: string): void } } }).process;
    if (penv?.env.CENSUS === '1') penv.stdout.write(`\nPACE ${pace.map(({ row, est }) => `${row.quest} ${est.estimateMin.toFixed(1)}/${row.floor} (${est.nodes} nodes vs ${row.nodes})`).join('; ')}\n`);
    // R07 (the recheck of 14.1 against 14) holds its static floor on the nodes this run read; every quest holds 40% of its design minutes.
    // R11 and M14 now hold their static floors too (the polish beats lift them from 13.4 and 20.8).
    for (const { row, est } of pace) expect(est.estimateMin, row.quest).toBeGreaterThanOrEqual(['r07', 'r11', 'm14'].includes(row.quest) ? row.floor : row.design * 0.4);
    // Every quest's objectives were completed in order, and what was raised instead of played is named.
    for (const q of PHASE_C_ORDER) expect(trails[q].order.length, q).toBeGreaterThan(0);
    const scripted = PHASE_C_ORDER.flatMap((q) => trails[q].scripted);
    expect(scripted).toEqual(['r11.wyrm(spare)', 'm14.temper(session opened without the screen)']);
  }, 240_000);
});
