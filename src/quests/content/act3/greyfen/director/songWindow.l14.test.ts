// Act 4 L14 (L1 PR 2 follow-up): R13's widened window never lets one press reach two strikes.
import { describe, expect, it } from 'vitest';
import { GEAR_TUNING } from '../../../../../gear/tuning';
import { PATTERNS } from '../../../../../gear/rhythm';
import { SONG_TIER, WIDE_GOOD_MS } from './song';

const stepMs = 60000 / GEAR_TUNING.rhythm.bpm / GEAR_TUNING.rhythm.divisions;

describe('R13 wide window (L14)', () => {
  it('is still wider than the normal window', () => {
    expect(WIDE_GOOD_MS).toBeGreaterThan(GEAR_TUNING.rhythm.goodMs);
  });

  for (const kind of Object.keys(SONG_TIER) as Array<keyof typeof SONG_TIER>) {
    it(`${kind}: neighbouring windows do not overlap`, () => {
      const steps = PATTERNS[SONG_TIER[kind] as 1 | 2];
      for (let i = 1; i < steps.length; i++) {
        const gapMs = (steps[i]! - steps[i - 1]!) * stepMs;
        expect(2 * WIDE_GOOD_MS, `${kind} ${steps[i - 1]}->${steps[i]}`).toBeLessThan(gapMs);
      }
    });
  }

  it('a press late on step 4 of the song bar reaches only that strike', () => {
    const steps = PATTERNS[2];
    const late = 4 * stepMs + WIDE_GOOD_MS; // the last moment step 4 accepts
    const reach = steps.filter((s) => Math.abs(late - s * stepMs) <= WIDE_GOOD_MS);
    expect(reach).toEqual([4]);
  });
});
