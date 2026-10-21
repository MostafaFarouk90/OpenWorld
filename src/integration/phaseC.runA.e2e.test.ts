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
import { expectPhaseCComplete } from './phaseCAssert';


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
    // Every quest's objectives were completed in order, and what was raised instead of played is named.
    for (const q of PHASE_C_ORDER) expect(trails[q].order.length, q).toBeGreaterThan(0);
    const scripted = PHASE_C_ORDER.flatMap((q) => trails[q].scripted);
    expect(scripted).toEqual(['m14.temper(session opened without the screen)']);
    // The kill-XP census (report only; CENSUS=1 prints it). Every quest paid something, and the run ends in the act's band.
    const rows = census.rows();
    expect(rows.map((r) => r.quest)).toEqual([...PHASE_C_ORDER]);
    for (const r of rows) expect(r.killXp + r.otherXp, r.quest).toBeGreaterThan(0);
    const env = (globalThis as { process?: { env: Record<string, string | undefined>; stdout: { write(s: string): void } } }).process;
    if (env?.env.CENSUS === '1') env.stdout.write(`\n${census.markdown()}\n`);
  }, 240_000);
});
