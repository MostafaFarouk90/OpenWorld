import { describe, expect, it } from 'vitest';
import { attackSetProblem, AttackSets, KNIGHT_ATTACK_SET } from '../../player/attackSets';
import { ASHBLADE_ATTACKS, ASHBLADE_ATTACK_SET, ASHBLADE_HEAVY_CLIP } from './attackSet';

describe('Ashblade attack set', () => {
  it('is a playable set of four distinct Rogue clips with the crossed chop as the heavy', () => {
    expect(attackSetProblem(ASHBLADE_ATTACK_SET)).toBeNull();
    expect(ASHBLADE_ATTACKS).toHaveLength(4);
    expect(ASHBLADE_ATTACK_SET.heavyIndex).toBe(2);
    expect(ASHBLADE_ATTACKS[2].clip).toBe('Dualwield_Melee_Attack_Chop');
    expect(ASHBLADE_HEAVY_CLIP).toBe('Dualwield_Melee_Attack_Chop');
    expect(new Set(ASHBLADE_ATTACKS.map((a) => a.clip)).size).toBe(4);
  });

  it('registers once for the class and leaves every other class on the Knight set', () => {
    const sets = new AttackSets();
    const first = sets.register('ashblade', ASHBLADE_ATTACK_SET);
    expect(first.ok).toBe(true);
    expect(sets.get('ashblade').attacks.map((a) => a.clip)).toEqual(ASHBLADE_ATTACKS.map((a) => a.clip));
    expect(sets.get('warden')).toBe(KNIGHT_ATTACK_SET);
    expect(sets.get(null)).toBe(KNIGHT_ATTACK_SET);
    expect(sets.register('ashblade', ASHBLADE_ATTACK_SET)).toEqual({ ok: false, reason: 'duplicate' });
  });

  it('forgets the set on dispose', () => {
    const sets = new AttackSets();
    const r = sets.register('ashblade', ASHBLADE_ATTACK_SET);
    if (r.ok) r.dispose();
    expect(sets.has('ashblade')).toBe(false);
    expect(sets.get('ashblade')).toBe(KNIGHT_ATTACK_SET);
  });

  it('keeps every window inside the clip and opening before it closes', () => {
    for (const a of ASHBLADE_ATTACKS) {
      expect(a.activeStart).toBeGreaterThanOrEqual(0);
      expect(a.activeEnd).toBeLessThanOrEqual(1);
      expect(a.activeStart).toBeLessThan(a.activeEnd);
    }
  });
});
