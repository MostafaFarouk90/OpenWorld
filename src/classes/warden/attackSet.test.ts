import { describe, expect, it } from 'vitest';
import { HEAVY_CHOP_CLIPS, isHeavyBlow, registerHeavyClip } from '../../combat/heavyBlow';
import { AttackSets, KNIGHT_ATTACK_SET, attackSetProblem } from '../../player/attackSets';
import { WARDEN_ATTACKS, WARDEN_ATTACK_SET } from './attackSet';
import { WARDEN_CLIPS } from './tuning';

describe('Warden attack set', () => {
  it('is a valid set of four distinct two-handed clips with the chop as the heavy attack', () => {
    expect(attackSetProblem(WARDEN_ATTACK_SET)).toBeNull();
    expect(WARDEN_ATTACKS.map((a) => a.clip)).toEqual([WARDEN_CLIPS.slice, WARDEN_CLIPS.spinning, WARDEN_CLIPS.chop, WARDEN_CLIPS.stab]);
    expect(WARDEN_ATTACKS[WARDEN_ATTACK_SET.heavyIndex].clip).toBe(WARDEN_CLIPS.chop);
  });

  it('windows are inside the clip and open before they close; none is wider than the Knight\'s widest by far', () => {
    for (const a of WARDEN_ATTACKS) {
      expect(a.activeStart).toBeGreaterThanOrEqual(0);
      expect(a.activeEnd).toBeLessThanOrEqual(1);
      expect(a.activeStart).toBeLessThan(a.activeEnd);
    }
    // Spinning is the shortest clip (0.667 s): its window in seconds stays under half a second.
    const spin = WARDEN_ATTACKS[1];
    expect((spin.activeEnd - spin.activeStart) * 0.667).toBeLessThan(0.5);
  });

  it('registers once for the warden, refuses a duplicate, and dispose gives the Knight set back', () => {
    const sets = new AttackSets();
    const r = sets.register('warden', WARDEN_ATTACK_SET);
    expect(r.ok).toBe(true);
    expect(sets.get('warden').attacks[0].clip).toBe(WARDEN_CLIPS.slice);
    expect(sets.register('warden', WARDEN_ATTACK_SET)).toEqual({ ok: false, reason: 'duplicate' });
    if (r.ok) r.dispose();
    expect(sets.get('warden')).toBe(KNIGHT_ATTACK_SET);
  });
});

describe('registerHeavyClip', () => {
  it('makes the clip a heavy blow until removed; the Knight chop stays heavy', () => {
    expect(isHeavyBlow({ attackId: '1H_Melee_Attack_Chop' })).toBe(true);
    expect(isHeavyBlow({ attackId: WARDEN_CLIPS.chop })).toBe(false);
    const off = registerHeavyClip(WARDEN_CLIPS.chop);
    expect(isHeavyBlow({ attackId: WARDEN_CLIPS.chop })).toBe(true);
    expect(HEAVY_CHOP_CLIPS.has(WARDEN_CLIPS.chop)).toBe(true);
    expect(isHeavyBlow({ attackId: WARDEN_CLIPS.slice })).toBe(false);
    off();
    expect(isHeavyBlow({ attackId: WARDEN_CLIPS.chop })).toBe(false);
  });

  it('ignores empty names and duplicates, and a duplicate\'s remover cannot remove the first registration', () => {
    const off = registerHeavyClip('X_Chop');
    const again = registerHeavyClip('X_Chop');
    again();
    expect(isHeavyBlow({ attackId: 'X_Chop' })).toBe(true);
    registerHeavyClip('')();
    expect(HEAVY_CHOP_CLIPS.has('')).toBe(false);
    off();
    expect(isHeavyBlow({ attackId: 'X_Chop' })).toBe(false);
    expect(isHeavyBlow({ attackId: '1H_Melee_Attack_Chop' })).toBe(true);
  });

  it('poise at the heavy threshold is heavy whatever the attack id', () => {
    expect(isHeavyBlow({ poise: 40 })).toBe(true);
    expect(isHeavyBlow({ poise: 10 })).toBe(false);
  });
});
