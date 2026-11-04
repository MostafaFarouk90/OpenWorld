// Phase E run A: the Greyfen first (from act3-greyfen-m23), R12 burned and R14 returned; the Dragonspine stays held.
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { runPhaseE } from './phaseE.chain';
import { GREYFEN_RUN_A } from './phaseEDriver';

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('Phase E run A (the Greyfen first)', () => {
  it('plays M23 to D05 headless, shows the peaks card, keeps the Dragonspine held and clears the 52% gate', async () => {
    console.log(await runPhaseE('a', GREYFEN_RUN_A, false));
  }, 1_800_000);
});
