import { describe, expect, it } from 'vitest';
import { MoveModifiers } from './MoveModifiers';

describe('MoveModifiers', () => {
  it('starts neutral', () => {
    const m = new MoveModifiers();
    expect(m.state()).toEqual({ speedScale: 1, lockMove: false, lockFacing: false, freeze: false });
    expect(m.size).toBe(0);
    expect(m.isActionLocked('jump')).toBe(false);
    expect(m.sources()).toEqual([]);
  });

  it('speed scales multiply', () => {
    const m = new MoveModifiers();
    m.add('carry', { speedScale: 0.5 });
    m.add('drink', { speedScale: 0.5 });
    expect(m.state().speedScale).toBeCloseTo(0.25);
  });

  it('clamps each scale to [0, 1] and treats non-finite as 1', () => {
    const m = new MoveModifiers();
    const a = m.add('a', { speedScale: 3 });
    expect(m.state().speedScale).toBe(1);
    a();
    const b = m.add('b', { speedScale: -2 });
    expect(m.state().speedScale).toBe(0);
    b();
    m.add('c', { speedScale: NaN });
    m.add('d', { speedScale: Infinity });
    expect(m.state().speedScale).toBe(1);
  });

  it('any lock wins', () => {
    const m = new MoveModifiers();
    m.add('a', { lockMove: false });
    m.add('b', { lockMove: true });
    m.add('c', { lockFacing: true });
    expect(m.state()).toMatchObject({ lockMove: true, lockFacing: true });
  });

  it('removal restores the previous state; removing twice is safe', () => {
    const m = new MoveModifiers();
    const off = m.add('a', { speedScale: 0.5, lockMove: true, lockActions: ['jump'] });
    expect(m.isActionLocked('jump')).toBe(true);
    off();
    off();
    expect(m.state()).toEqual({ speedScale: 1, lockMove: false, lockFacing: false, freeze: false });
    expect(m.isActionLocked('jump')).toBe(false);
    expect(m.size).toBe(0);
  });

  it('same source may add several modifiers; each is removed independently', () => {
    const m = new MoveModifiers();
    const a = m.add('cast', { speedScale: 0.5 });
    m.add('cast', { speedScale: 0.5 });
    expect(m.sources()).toEqual(['cast', 'cast']);
    a();
    expect(m.state().speedScale).toBe(0.5);
    expect(m.size).toBe(1);
  });

  it('sources keep names containing #', () => {
    const m = new MoveModifiers();
    m.add('weird#name', {});
    expect(m.sources()).toEqual(['weird#name']);
  });

  it('lockActions only lock the listed actions, from any modifier', () => {
    const m = new MoveModifiers();
    m.add('a', { lockActions: ['attack1', 'block'] });
    m.add('b', { lockActions: ['jump'] });
    expect(m.isActionLocked('attack1')).toBe(true);
    expect(m.isActionLocked('jump')).toBe(true);
    expect(m.isActionLocked('dodge')).toBe(false);
  });

  it('copies lockActions so later mutation by the caller has no effect', () => {
    const m = new MoveModifiers();
    const list: ('jump' | 'dodge')[] = ['jump'];
    m.add('a', { lockActions: list });
    list.push('dodge');
    expect(m.isActionLocked('dodge')).toBe(false);
  });
});
