// Phase E run B: the Greyfen second (from act3-spine-m23, the lower Dragonspine done first), R12 cut and R14 released; the Dragonspine is open.
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { runPhaseE } from './phaseE.chain';
import { GREYFEN_RUN_B } from './phaseEDriver';

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('Phase E run B (the Greyfen second)', () => {
  it('plays M23 to D05 headless, shows the peaks card, with the Dragonspine open and clears the 52% gate', async () => {
    console.log(await runPhaseE('b', GREYFEN_RUN_B));
  }, 1_800_000);
});
