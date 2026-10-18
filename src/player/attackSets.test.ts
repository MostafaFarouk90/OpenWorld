import { describe, expect, it, vi } from 'vitest';
import { KNIGHT_ATTACKS, type AttackClipDef } from '../characters/knightClips';
import { AttackSets, KNIGHT_ATTACK_SET, SpeedMultipliers, attackSetProblem, type AttackSet } from './attackSets';

const clips = (): AttackClipDef[] => [
  { clip: 'A', activeStart: 0.1, activeEnd: 0.3 },
  { clip: 'B', activeStart: 0.2, activeEnd: 0.4 },
  { clip: 'C', activeStart: 0.3, activeEnd: 0.5 },
  { clip: 'D', activeStart: 0.4, activeEnd: 0.6 },
];
const set = (o: Partial<AttackSet> = {}): AttackSet => ({ attacks: clips(), heavyIndex: 1, ...o });

describe('attackSetProblem', () => {
  it('accepts the Knight set and a well-formed set', () => {
    expect(attackSetProblem(KNIGHT_ATTACK_SET)).toBeNull();
    expect(attackSetProblem(set())).toBeNull();
  });

  it('accepts windows touching 0 and 1', () => {
    const attacks = clips();
    attacks[0] = { clip: 'A', activeStart: 0, activeEnd: 1 };
    expect(attackSetProblem(set({ attacks }))).toBeNull();
  });

  it.each([0, 3, 5])('rejects %i attacks', (n) => {
    expect(attackSetProblem(set({ attacks: clips().slice(0, n).concat(n === 5 ? [{ clip: 'E', activeStart: 0, activeEnd: 1 }] : []) }))).toMatch(/exactly 4/);
  });

  it('rejects missing or non-array attacks', () => {
    expect(attackSetProblem(undefined as never)).not.toBeNull();
    expect(attackSetProblem({ attacks: 'no', heavyIndex: 0 } as never)).not.toBeNull();
  });

  it.each([-1, 4, 1.5, NaN, Infinity])('rejects heavyIndex %s', (heavyIndex) => {
    expect(attackSetProblem(set({ heavyIndex }))).toMatch(/heavyIndex/);
  });

  it('rejects a duplicate clip', () => {
    const attacks = clips();
    attacks[3] = { ...attacks[3], clip: 'A' };
    expect(attackSetProblem(set({ attacks }))).toMatch(/duplicate clip A/);
  });

  it('rejects an empty or non-string clip name and a null entry', () => {
    for (const bad of [{ clip: '', activeStart: 0.1, activeEnd: 0.2 }, { clip: 7, activeStart: 0.1, activeEnd: 0.2 }, null]) {
      const attacks = clips();
      attacks[2] = bad as never;
      expect(attackSetProblem(set({ attacks }))).toMatch(/without a clip name/);
    }
  });

  it.each([
    [0.5, 0.5],
    [0.6, 0.4],
    [-0.1, 0.4],
    [0.1, 1.1],
    [NaN, 0.5],
    [0.1, Infinity],
  ])('rejects window %s..%s', (activeStart, activeEnd) => {
    const attacks = clips();
    attacks[1] = { clip: 'B', activeStart, activeEnd };
    expect(attackSetProblem(set({ attacks }))).toBe('bad window for B');
  });
});

describe('AttackSets', () => {
  it('has the Knight built in and unknown, null and empty classes read as the Knight', () => {
    const s = new AttackSets();
    expect(s.has('knight')).toBe(true);
    expect(s.get('knight')).toBe(KNIGHT_ATTACK_SET);
    expect(s.get('nobody')).toBe(KNIGHT_ATTACK_SET);
    expect(s.get(null)).toBe(KNIGHT_ATTACK_SET);
    expect(s.get(undefined)).toBe(KNIGHT_ATTACK_SET);
    expect(s.get('')).toBe(KNIGHT_ATTACK_SET);
    expect(KNIGHT_ATTACK_SET.attacks).toBe(KNIGHT_ATTACKS);
    expect(KNIGHT_ATTACK_SET.heavyIndex).toBe(2);
  });

  it('registers a class and returns it', () => {
    const s = new AttackSets();
    const r = s.register('mage', set());
    expect(r.ok).toBe(true);
    expect(s.has('mage')).toBe(true);
    expect(s.get('mage').heavyIndex).toBe(1);
    expect(s.get('mage').attacks.map((a) => a.clip)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('refuses a duplicate class, including the built-in Knight, and keeps the first set', () => {
    const s = new AttackSets();
    expect(s.register('knight', set())).toEqual({ ok: false, reason: 'duplicate' });
    expect(s.get('knight')).toBe(KNIGHT_ATTACK_SET);
    s.register('mage', set({ heavyIndex: 0 }));
    expect(s.register('mage', set({ heavyIndex: 3 }))).toEqual({ ok: false, reason: 'duplicate' });
    expect(s.get('mage').heavyIndex).toBe(0);
  });

  it('refuses an empty or non-string class id', () => {
    const s = new AttackSets();
    expect(s.register('', set())).toEqual({ ok: false, reason: 'bad-class' });
    expect(s.register(undefined as never, set())).toEqual({ ok: false, reason: 'bad-class' });
    expect(s.register(5 as never, set())).toEqual({ ok: false, reason: 'bad-class' });
  });

  it('refuses a malformed set and registers nothing', () => {
    const s = new AttackSets();
    expect(s.register('x', set({ attacks: clips().slice(0, 3) }))).toEqual({ ok: false, reason: 'bad-set' });
    expect(s.register('x', set({ heavyIndex: 4 }))).toEqual({ ok: false, reason: 'bad-set' });
    expect(s.register('x', undefined as never)).toEqual({ ok: false, reason: 'bad-set' });
    expect(s.has('x')).toBe(false);
  });

  it('a bad class id is reported before a bad set', () => {
    expect(new AttackSets().register('', set({ heavyIndex: 9 }))).toEqual({ ok: false, reason: 'bad-class' });
  });

  it('stores a frozen copy: mutating the input afterwards changes nothing', () => {
    const s = new AttackSets();
    const input = set();
    s.register('mage', input);
    input.heavyIndex = 3;
    input.attacks[0].clip = 'Z';
    input.attacks[0].activeEnd = 0.99;
    (input.attacks as AttackClipDef[]).pop();
    const got = s.get('mage');
    expect(got.heavyIndex).toBe(1);
    expect(got.attacks).toHaveLength(4);
    expect(got.attacks[0]).toEqual({ clip: 'A', activeStart: 0.1, activeEnd: 0.3 });
    expect(got).not.toBe(input);
  });

  it('dispose removes the class so it reads as the Knight again and can be registered anew', () => {
    const s = new AttackSets();
    const r = s.register('mage', set());
    if (!r.ok) throw new Error('expected ok');
    r.dispose();
    expect(s.has('mage')).toBe(false);
    expect(s.get('mage')).toBe(KNIGHT_ATTACK_SET);
    expect(s.register('mage', set({ heavyIndex: 0 })).ok).toBe(true);
  });

  it('a stale dispose does not remove a later registration of the same class', () => {
    const s = new AttackSets();
    const first = s.register('mage', set());
    if (!first.ok) throw new Error('expected ok');
    first.dispose();
    s.register('mage', set({ heavyIndex: 0 }));
    first.dispose();
    expect(s.has('mage')).toBe(true);
    expect(s.get('mage').heavyIndex).toBe(0);
  });
});

describe('SpeedMultipliers', () => {
  it('is 1 with no entries', () => {
    expect(new SpeedMultipliers().value()).toBe(1);
  });

  it('multiplies entries together', () => {
    const m = new SpeedMultipliers();
    m.add('a', 1.2);
    m.add('b', 1.5);
    expect(m.value()).toBeCloseTo(1.8);
  });

  it('clamps to 0.5..2', () => {
    const m = new SpeedMultipliers();
    const offA = m.add('a', 1.8);
    m.add('b', 1.8);
    expect(m.value()).toBe(2);
    offA();
    expect(m.value()).toBe(1.8);
    const slow = new SpeedMultipliers();
    slow.add('a', 0.3);
    expect(slow.value()).toBe(0.5);
    const edge = new SpeedMultipliers();
    edge.add('a', 2);
    expect(edge.value()).toBe(2);
  });

  it('re-reads function entries on every call', () => {
    const m = new SpeedMultipliers();
    let v = 1.25;
    m.add('song', () => v);
    expect(m.value()).toBe(1.25);
    v = 1.5;
    expect(m.value()).toBe(1.5);
  });

  it.each([
    ['throwing', (): number => { throw new Error('boom'); }],
    ['NaN', NaN],
    ['zero', 0],
    ['negative', -2],
    ['Infinity', Infinity],
    ['function returning NaN', (): number => NaN],
    ['function returning 0', (): number => 0],
  ] as const)('ignores a %s entry and reports it through onBad', (_n, bad) => {
    const onBad = vi.fn();
    const m = new SpeedMultipliers(onBad);
    m.add('good', 1.5);
    m.add('bad', bad as number | (() => number));
    expect(m.value()).toBe(1.5);
    expect(onBad).toHaveBeenCalledWith('bad', expect.any(String));
    expect(onBad).not.toHaveBeenCalledWith('good', expect.anything());
  });

  it('works without an onBad handler', () => {
    const m = new SpeedMultipliers();
    m.add('bad', NaN);
    expect(m.value()).toBe(1);
  });

  it('adding the same id replaces the entry', () => {
    const m = new SpeedMultipliers();
    m.add('a', 1.5);
    m.add('a', 1.2);
    expect(m.value()).toBeCloseTo(1.2);
  });

  it('a remover removes only its own entry', () => {
    const m = new SpeedMultipliers();
    const offOld = m.add('a', 1.5);
    m.add('a', 1.2); // replaces
    offOld();
    expect(m.value()).toBeCloseTo(1.2);
  });

  it('removing twice or removing an unrelated id is harmless', () => {
    const m = new SpeedMultipliers();
    const off = m.add('a', 1.5);
    m.add('b', 1.2);
    off();
    off();
    expect(m.value()).toBeCloseTo(1.2);
  });

  it('a remover for a function entry matches by identity', () => {
    const m = new SpeedMultipliers();
    const fn = () => 1.4;
    const off = m.add('a', fn);
    expect(m.value()).toBeCloseTo(1.4);
    off();
    expect(m.value()).toBe(1);
  });
});
