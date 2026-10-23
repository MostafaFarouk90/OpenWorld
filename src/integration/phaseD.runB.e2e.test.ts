/**
 * Phase D (Oldsmoke and Deepgate), run B (mercy-heavy), played end to end from the Phase C complete save (Redmane spared) on a
 * headless game with every real plugin: R09 to the miners, R10 by compromise, M21 by the spy run, then
 * D04 and M22, which end the act. The driver is src/integration/phaseD.ts; its shortcuts are listed in the trail and pinned
 * below. Run A and run B are separate files so the two run in parallel workers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFromSave, type ChapterHarness } from './chapterHarness';
import { ACT2_C_FIXTURES, readAct2CFixture } from '../save/__fixtures__/act2c';
import { PHASE_D_ORDER, PHASE_D_RUN_B, phaseDTiming, playPhaseD } from './phaseD';
import { startCensus } from './act2Xp';
import { timingMarkdown } from './timing';
import { expectEndingFiredOnce, expectPhaseDComplete } from './phaseDAssert';

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

describe('Phase D run B', () => {
  it('plays M16 to M22 through the real services and ends the act once', async () => {
    h = await bootFromSave(await readAct2CFixture(ACT2_C_FIXTURES.completeSpared), { models: true, virtualClock: true });
    const census = startCensus(h);
    const trails = await playPhaseD(h, undefined, { choices: PHASE_D_RUN_B, hooks: census.hooks });
    h.run(5);
    expectPhaseDComplete(h, 'B');
    expectEndingFiredOnce(h);
    for (const q of PHASE_D_ORDER) expect(trails[q].order.length, q).toBeGreaterThan(0);
    expect(PHASE_D_ORDER.flatMap((q) => trails[q].scripted)).toEqual([
      'm18.solve(the Surge cast raised as spell.released)',
      'm19.route(entered the lower galleries through the interior service, not the lift)',
      'm21.sneak(teleported checkpoint to checkpoint, the watch loop not played)',
    ]);
    const timing = phaseDTiming(h, trails, 'B');
    const rows = census.rows();
    expect(rows.map((r) => r.quest)).toEqual([...PHASE_D_ORDER]);
    const env = (globalThis as { process?: { env: Record<string, string | undefined>; stdout: { write(s: string): void } } }).process;
    // Every quest clears 40% of its design minutes on the branch this run took (plan Part 7, Q7).
    if (env?.env.CENSUS === '1') env.stdout.write(`\n${census.markdown()}\n\n${timingMarkdown(timing)}\n`);
    for (const r of timing) expect(r.estimateMin, r.quest).toBeGreaterThanOrEqual(r.designMin * 0.4);
  }, 400_000);
});
