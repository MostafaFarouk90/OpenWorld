/**
 * Phase D (Oldsmoke and Deepgate), run A (normal), played end to end from the Phase C complete save (Redmane defeated) on a
 * headless game with every real plugin: R09 to the stewards, R10 to the miners, M21 confronting Aldous with proof, then
 * D04 and M22, which end the act. The driver is src/integration/phaseD.ts; its shortcuts are listed in the trail and pinned
 * below. Run A and run B are separate files so the two run in parallel workers.
 */
import { M16_AMBUSH_BAND } from '../quests/content/act2/oldsmoke/spawners';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFromSave, type ChapterHarness } from './chapterHarness';
import { ACT2_C_FIXTURES, readAct2CFixture } from '../save/__fixtures__/act2c';
import { PHASE_D_ORDER, PHASE_D_RUN_A, phaseDTiming, playPhaseD } from './phaseD';
import { startCensus } from './act2Xp';
import { CARRIED_KNIGHT } from './carriedKnight';
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

describe('Phase D run A', () => {
  it('plays M16 to M22 through the real services and ends the act once', async () => {
    h = await bootFromSave(await readAct2CFixture(ACT2_C_FIXTURES.completeDefeated), { models: true, virtualClock: true });
    const census = startCensus(h);
    const trails = await playPhaseD(h, undefined, { choices: PHASE_D_RUN_A, hooks: census.hooks });
    h.run(5);
    expectPhaseDComplete(h, 'A');
    expectEndingFiredOnce(h);
    for (const q of PHASE_D_ORDER) expect(trails[q].order.length, q).toBeGreaterThan(0);
    expect(PHASE_D_ORDER.flatMap((q) => trails[q].scripted)).toEqual([
      'm18.solve(the Surge cast raised as spell.released)',
    ]);
    // the carried character meets M16's hounds (band 12 to 14) at the top of that band
    expect(census.rows().find((r) => r.quest === 'm16')!.levelStart).toBeGreaterThanOrEqual(M16_AMBUSH_BAND.max);
    expect(census.rows().find((r) => r.quest === 'm16'), 'm16').toMatchObject({ levelStart: CARRIED_KNIGHT.m16.level, maxHealth: CARRIED_KNIGHT.m16.maxHealth });
    const timing = phaseDTiming(h, trails, 'A');
    const rows = census.rows();
    expect(rows.map((r) => r.quest)).toEqual([...PHASE_D_ORDER]);
    const env = (globalThis as { process?: { env: Record<string, string | undefined>; stdout: { write(s: string): void } } }).process;
    // Every quest clears 40% of its design minutes on the branch this run took (plan Part 7, Q7).
    if (env?.env.CENSUS === '1') env.stdout.write(`\n${census.markdown()}\n\n${timingMarkdown(timing)}\n`);
    for (const r of timing) expect(r.estimateMin, r.quest).toBeGreaterThanOrEqual(r.designMin * 0.4);
  }, 400_000);
});
