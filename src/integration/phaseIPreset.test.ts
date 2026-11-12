// The Phase I chain's preset seed (N12): the design's M52 table less R26's road, read from N10's master tree.
import { describe, expect, it } from 'vitest';
import { r26FavourDeltas } from './phaseI.run';
import { PHASE_I_RUN_A, PHASE_I_RUN_B } from './phaseIDriver';

describe('the Phase I preset seed', () => {
  it("reads R26's roads from N10's tree: long +3 Oswin, fast -3, nothing else", () => {
    expect(r26FavourDeltas('long')).toEqual({ oswin: 3 });
    expect(r26FavourDeltas('fast')).toEqual({ oswin: -3 });
  });
  it('pairs the roads as the design does: marshal (A) long, keepers (B) fast', () => {
    expect(PHASE_I_RUN_A.r26).toBe('long');
    expect(PHASE_I_RUN_B.r26).toBe('fast');
  });
});
