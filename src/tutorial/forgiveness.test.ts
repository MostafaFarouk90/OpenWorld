import { describe, expect, it } from 'vitest';
import { CombatForgiveness, FORGIVENESS, lessonVerb } from './forgiveness';

describe('CombatForgiveness', () => {
  it('credits a hit taken shortly after a dodge press', () => {
    const f = new CombatForgiveness();
    f.observe(10, true, false);
    expect(f.onHitTaken(10 + FORGIVENESS.dodgeLeadSeconds - 0.01, 'dodged')).toBe('dodged');
  });

  it('does not credit a dodge pressed long before the hit', () => {
    const f = new CombatForgiveness();
    f.observe(10, true, false);
    expect(f.onHitTaken(10 + FORGIVENESS.dodgeLeadSeconds + 0.5, 'dodged')).toBeNull();
  });

  it('credits a hit with the guard up or just dropped, from any direction', () => {
    const f = new CombatForgiveness();
    f.observe(5, false, true);
    expect(f.onHitTaken(5, 'blocked')).toBe('blocked');
    f.observe(6, false, true);
    expect(f.onHitTaken(6 + FORGIVENESS.guardGraceSeconds - 0.01, 'blocked')).toBe('blocked');
    expect(f.onHitTaken(7, 'blocked')).toBeNull();
  });

  it('a dodge press does not credit a block lesson, nor the reverse', () => {
    const f = new CombatForgiveness();
    f.observe(1, true, false);
    expect(f.onHitTaken(1.1, 'blocked')).toBeNull();
    const g = new CombatForgiveness();
    g.observe(1, false, true);
    expect(g.onHitTaken(1.1, 'dodged')).toBeNull();
  });

  it('hands a credit over every few hits taken with no attempt, so the lesson cannot dead-end', () => {
    const f = new CombatForgiveness();
    const out: Array<string | null> = [];
    for (let i = 0; i < FORGIVENESS.pityHits * 2; i++) out.push(f.onHitTaken(100 + i * 5, 'dodged'));
    expect(out.filter((x) => x === 'dodged')).toHaveLength(2);
    expect(out[FORGIVENESS.pityHits - 1]).toBe('dodged');
  });

  it('an attempt resets the pity count', () => {
    const f = new CombatForgiveness();
    f.onHitTaken(0, 'dodged');
    f.onHitTaken(10, 'dodged');
    f.observe(20, true, false);
    expect(f.onHitTaken(20.1, 'dodged')).toBe('dodged');
    expect(f.onHitTaken(30, 'dodged')).toBeNull();
  });
});

describe('lessonVerb', () => {
  it('names the verb of the block, dodge and skirmish count steps only', () => {
    expect(lessonVerb('t09', 0)).toBe('blocked');
    expect(lessonVerb('t09', 1)).toBeNull();
    expect(lessonVerb('t10', 0)).toBe('dodged');
    expect(lessonVerb('skirmish', 0)).toBe('dodged');
    expect(lessonVerb('skirmish', 1)).toBeNull();
    expect(lessonVerb('t05', 0)).toBeNull();
    expect(lessonVerb(null, 0)).toBeNull();
  });
});
