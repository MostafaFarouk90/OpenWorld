import { describe, expect, it } from 'vitest';
import { CombatPresence } from './CombatPresence';

describe('CombatPresence', () => {
  it('first aggro starts a fight, the second aggro (same or other actor) does not', () => {
    const c = new CombatPresence();
    expect(c.fighting).toBe(false);
    expect(c.aggro('a')).toBe('start');
    expect(c.fighting).toBe(true);
    expect(c.aggro('b')).toBeNull();
    expect(c.aggro('a')).toBeNull();
    expect(c.size).toBe(2);
  });
  it('ends only after the quiet debounce, and only for a fight of at least 3 s', () => {
    const c = new CombatPresence();
    c.aggro('a');
    for (let i = 0; i < 3; i++) expect(c.tick(1)).toBeNull();
    c.remove('a');
    expect(c.tick(1)).toBeNull();
    expect(c.fighting).toBe(true);
    expect(c.tick(1)).toBe('end');
    expect(c.fighting).toBe(false);
    expect(c.tick(1)).toBeNull();
  });
  it('a short fight ends silently (no end edge) but a new one can start', () => {
    const c = new CombatPresence();
    c.aggro('a');
    c.tick(1);
    c.remove('a');
    expect(c.tick(1)).toBeNull();
    expect(c.tick(1)).toBeNull();
    expect(c.fighting).toBe(false);
    expect(c.aggro('a')).toBe('start');
  });
  it('the quiet time itself does not count towards the 3 s minimum', () => {
    const c = new CombatPresence();
    c.aggro('a');
    c.tick(2);
    c.remove('a');
    expect(c.tick(1.5)).toBeNull();
    expect(c.tick(0.5)).toBeNull(); // 2 s fought + 2 s quiet = 4 s total, but only 2 s of fight
    expect(c.fighting).toBe(false);
  });
  it('a fight of exactly 3 s counts', () => {
    const c = new CombatPresence();
    c.aggro('a');
    c.tick(3);
    c.remove('a');
    expect(c.tick(1.5)).toBeNull();
    expect(c.tick(0.5)).toBe('end');
  });
  it('re-aggro inside the debounce cancels the end', () => {
    const c = new CombatPresence();
    c.aggro('a');
    c.tick(5);
    c.remove('a');
    expect(c.tick(1)).toBeNull();
    expect(c.aggro('b')).toBeNull(); // still the same fight
    for (let i = 0; i < 5; i++) expect(c.tick(1)).toBeNull();
    expect(c.fighting).toBe(true);
    c.remove('b');
    expect(c.tick(1)).toBeNull();
    expect(c.tick(1)).toBe('end');
  });
  it('stays in the fight while any hostile remains', () => {
    const c = new CombatPresence();
    c.aggro('a');
    c.aggro('b');
    c.tick(4);
    c.remove('a');
    expect(c.size).toBe(1);
    for (let i = 0; i < 10; i++) expect(c.tick(1)).toBeNull();
    expect(c.fighting).toBe(true);
  });
  it('remove of an unknown actor is harmless', () => {
    const c = new CombatPresence();
    expect(() => c.remove('ghost')).not.toThrow();
    c.aggro('a');
    c.remove('ghost');
    expect(c.size).toBe(1);
  });
  it('tick when not fighting, or with dt <= 0, does nothing', () => {
    const c = new CombatPresence();
    expect(c.tick(5)).toBeNull();
    c.aggro('a');
    c.remove('a');
    for (const dt of [0, -3, NaN]) expect(c.tick(dt)).toBeNull();
    expect(c.fighting).toBe(true);
    // none of those counted as quiet time
    expect(c.tick(1.5)).toBeNull();
    expect(c.fighting).toBe(true);
  });
  it('reset clears everything without reporting an end', () => {
    const c = new CombatPresence();
    c.aggro('a');
    c.tick(10);
    c.reset();
    expect(c.fighting).toBe(false);
    expect(c.size).toBe(0);
    for (let i = 0; i < 5; i++) expect(c.tick(1)).toBeNull();
    expect(c.aggro('a')).toBe('start');
  });
  it('honours custom debounce and minimum', () => {
    const c = new CombatPresence(1, 0);
    c.aggro('a');
    c.remove('a');
    expect(c.tick(1)).toBe('end');
  });
});
