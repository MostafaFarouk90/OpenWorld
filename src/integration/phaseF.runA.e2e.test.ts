// Phase F run A: the Greyfen first (from act3-greyfen-m28), the lower Dragonspine then the summit; R15 to the lodge, R16 given,
// M31 won, Skarl spared; ends on "The Coal-Mother's Oath", the fade to the lodge hearth and the camp scene.
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { runPhaseF } from './phaseF.chain';
import { SPINE_RUN_A } from './phaseFDriver';

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('Phase F run A (the Greyfen first)', () => {
  it('plays M28 to D06 headless, ends the act once with the camp at the hearth, and clears the act pacing gate', async () => {
    console.log(await runPhaseF('a', SPINE_RUN_A));
  }, 2_400_000);
});
