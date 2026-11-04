// Phase F run B: the Dragonspine first (from act3-spine-m28): the lower Dragonspine, then the whole Greyfen (R12 cut, R14
// released), then the summit; R15 to the hut, R16 kept, M31 yielded, Skarl defeated; the act ends once with the camp at the hearth.
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { runPhaseF } from './phaseF.chain';
import { SPINE_RUN_B } from './phaseFDriver';
import { GREYFEN_RUN_B } from './phaseEDriver';

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('Phase F run B (the Dragonspine first)', () => {
  it('plays all 21 quests headless, ends the act once with the camp at the hearth, and clears the act pacing gate', async () => {
    console.log(await runPhaseF('b', SPINE_RUN_B, GREYFEN_RUN_B));
  }, 2_400_000);
});
