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
    // Every quest's objectives were completed in order, and what was raised instead of played is named.
    for (const q of PHASE_C_ORDER) expect(trails[q].order.length, q).toBeGreaterThan(0);
    const scripted = PHASE_C_ORDER.flatMap((q) => trails[q].scripted);
    expect(scripted).toEqual(['r05.herdHome(fox)', 'r11.wyrm(spare)', 'm14.temper(session opened without the screen)']);
  }, 240_000);
});
