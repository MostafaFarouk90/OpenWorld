import { describe, expect, it } from 'vitest';
import { ASH_WRAITH } from '../defs';
import { MoveSelector, mulberry32 } from './moveSelect';

const moves = ASH_WRAITH.moves; // claw w3 [0,1.7], grab w1 [0,1.4], sweep w0 [0,2.0]

describe('MoveSelector', () => {
  it('gates by range', () => {
    const s = new MoveSelector();
    expect(s.pick(moves, 5, () => 0)).toBeNull();
    expect(s.pick(moves, 1.6, () => 0)?.id).toBe('wraith.claw');
    expect(s.pick(moves, 1.6, () => 0.99)?.id).toBe('wraith.claw'); // grab out of range (1.4)
    expect(s.pick(moves, 1.0, () => 0.99)?.id).toBe('wraith.grab');
    expect(s.pick(moves, NaN, () => 0)).toBeNull();
  });
  it('cooldowns apply and expire', () => {
    const s = new MoveSelector();
    s.markUsed('wraith.claw', moves);
    expect(s.pick(moves, 1.6, () => 0)).toBeNull();
    s.tick(1.0);
    expect(s.onCooldown('wraith.claw')).toBe(true);
    s.tick(0.3);
    expect(s.pick(moves, 1.6, () => 0)?.id).toBe('wraith.claw');
  });
  it('is deterministic with a seeded rng', () => {
    const run = (seed: number) => {
      const s = new MoveSelector();
      const r = mulberry32(seed);
      return Array.from({ length: 20 }, () => s.pick(moves, 1, r)!.id);
    };
    expect(run(7)).toEqual(run(7));
    expect(new Set(run(7)).size).toBe(2);
  });
  it('weight 0 is never picked without a filter, but is with one', () => {
    const s = new MoveSelector();
    const r = mulberry32(1);
    for (let i = 0; i < 200; i++) expect(s.pick(moves, 1, r)!.id).not.toBe('wraith.sweep');
    expect(s.pick(moves, 1, () => 0.5, ['wraith.sweep'])?.id).toBe('wraith.sweep');
  });
  it('filter restricts the pool; nothing eligible gives null', () => {
    const s = new MoveSelector();
    expect(s.pick(moves, 1, () => 0, ['wraith.grab'])?.id).toBe('wraith.grab');
    expect(s.pick(moves, 1.6, () => 0, ['wraith.grab'])).toBeNull();
    expect(s.pick(moves, 1, () => 0, ['nope'])).toBeNull();
    expect(s.pick([], 1, () => 0)).toBeNull();
  });
  it('empty filter means no restriction', () => {
    expect(new MoveSelector().pick(moves, 1, () => 0, [])?.id).toBe('wraith.claw');
  });
});
