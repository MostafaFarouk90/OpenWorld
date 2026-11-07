// Act 4 L14: R05's fog hounds are softened on their own group only.
import { describe, expect, it } from 'vitest';
import { ACT2_SPAWNERS_A12, R05_FOG_OPTIONS } from './spawners';

describe('R05 fog hound options (L14)', () => {
  it('the fog group carries the softer damage and health', () => {
    const fog = ACT2_SPAWNERS_A12.find((d) => d.id === 'q12.r05.fog')!;
    expect(fog.options).toEqual(R05_FOG_OPTIONS);
    expect(R05_FOG_OPTIONS.damageScale).toBeLessThan(1);
    expect(R05_FOG_OPTIONS.healthScale).toBeLessThan(1);
  });

  it('no other hound group picks them up', () => {
    for (const d of ACT2_SPAWNERS_A12.filter((x) => x.enemy === 'ember-hound' && x.id !== 'q12.r05.fog')) {
      expect(d.options?.damageScale, d.id).not.toBe(R05_FOG_OPTIONS.damageScale);
    }
  });
});
