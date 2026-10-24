// K11: the tier 4 presets together stay well inside the 11.1 cap of 4,000 live points.
import { describe, expect, it } from 'vitest';
import { ACT3_SKILL_EFFECT_IDS } from './index';
import { ASHBLADE_T4_PARTICLES } from './ashblade';
import { KNIGHT_T4_PARTICLES } from './knight';
import { WARDEN_T4_PARTICLES } from './warden';
import { EFFECT_IDS } from '../types';

describe('act3 skill VFX budget', () => {
  it('every preset has a peak entry and all nine skills together use under a tenth of the cap', () => {
    const table: Record<string, number> = { ...KNIGHT_T4_PARTICLES, ...WARDEN_T4_PARTICLES, ...ASHBLADE_T4_PARTICLES };
    for (const id of ACT3_SKILL_EFFECT_IDS) expect(table[id], id).toBeGreaterThanOrEqual(0);
    expect(Object.values(table).reduce((a, b) => a + b, 0)).toBeLessThan(400);
  });

  it('the ids are registered and unique', () => {
    for (const id of ACT3_SKILL_EFFECT_IDS) expect(EFFECT_IDS).toContain(id);
    expect(new Set(EFFECT_IDS).size).toBe(EFFECT_IDS.length);
  });
});
