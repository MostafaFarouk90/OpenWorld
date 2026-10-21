import { describe, expect, it } from 'vitest';
import { BARK_GATE_TUNING, BarkGate } from './barkGate';

describe('BarkGate', () => {
  it('holds a second companion quiet for the gap, then lets him speak', () => {
    const g = new BarkGate();
    expect(g.claim('tobb')).toBe(true);
    expect(g.claim('hrolf')).toBe(false);
    g.tick(BARK_GATE_TUNING.gapSeconds - 0.1);
    expect(g.claim('hrolf')).toBe(false);
    g.tick(0.2);
    expect(g.claim('hrolf')).toBe(true);
    expect(g.claim('tobb')).toBe(false);
  });

  it('never holds a companion back on his own last bark; reset and bad dt', () => {
    const g = new BarkGate();
    expect(g.claim('tobb')).toBe(true);
    expect(g.claim('tobb')).toBe(true);
    g.tick(NaN);
    g.tick(-1);
    expect(g.claim('hrolf')).toBe(false);
    g.reset();
    expect(g.claim('hrolf')).toBe(true);
  });
});
