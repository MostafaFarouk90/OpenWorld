import { describe, expect, it } from 'vitest';
import { CLASS_STATS, DEFAULT_DRILL } from './kits';

describe('class kit data', () => {
  it('gives every new class a base Ember of 100 (the Knight ruling applied uniformly)', () => {
    for (const row of Object.values(CLASS_STATS)) expect(row.ember).toBe(100);
  });

  it('puts the ability step right after the skill step, so a freshly learned active skill is what it teaches', () => {
    const ids = DEFAULT_DRILL.map((s) => s.mechanic);
    expect(ids.indexOf('ability')).toBe(ids.indexOf('skills') + 1);
  });
});
