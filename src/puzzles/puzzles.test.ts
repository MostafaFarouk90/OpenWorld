import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { PressureTimer } from './PressureTimer';
import { ValveWheel, valveInteractable } from './ValveWheel';
import { PRESSURE_PHASE, PRESSURE_SECONDS } from './tuning';

describe('PressureTimer', () => {
  it('defaults to the 45 s of design 7.2 and the "pressure" phase', () => {
    expect(PRESSURE_SECONDS).toBe(45);
    expect(PRESSURE_PHASE).toBe('pressure');
    expect(new PressureTimer().total).toBe(45);
  });

  it('counts down, expires exactly once and stops', () => {
    const t = new PressureTimer(2);
    expect(t.update(1)).toBe(false);
    t.start();
    expect(t.active).toBe(true);
    expect(t.update(1.5)).toBe(false);
    expect(t.remaining()).toBeCloseTo(0.5);
    expect(t.update(1)).toBe(true);
    expect(t.active).toBe(false);
    expect(t.remaining()).toBe(0);
    expect(t.update(1)).toBe(false);
  });

  it('reset stops without expiring and start restarts a running clock', () => {
    const t = new PressureTimer(3);
    t.start();
    t.update(2);
    t.start();
    expect(t.remaining()).toBe(3);
    t.reset();
    expect(t.active).toBe(false);
    expect(t.update(10)).toBe(false);
  });

  it('ignores a zero, negative or NaN step and rejects a bad total', () => {
    const t = new PressureTimer(3);
    t.start();
    for (const dt of [0, -1, NaN]) expect(t.update(dt)).toBe(false);
    expect(t.remaining()).toBe(3);
    expect(() => new PressureTimer(0)).toThrow();
    expect(() => new PressureTimer(Infinity)).toThrow();
  });
});

describe('ValveWheel', () => {
  it('cycles through its positions and wraps', () => {
    const seen: number[] = [];
    const w = new ValveWheel({ id: 'valve:a', onChange: (p) => seen.push(p) });
    for (let i = 0; i < 5; i++) w.turn();
    expect(seen).toEqual([1, 2, 3, 0, 1]);
    expect(w.position()).toBe(1);
  });

  it('supports a two-position cooling valve and validates its options', () => {
    const w = new ValveWheel({ id: 'valve:c', positions: 2 });
    w.turn();
    w.turn();
    expect(w.position()).toBe(0);
    expect(() => new ValveWheel({ id: 'valve:x', positions: 1 })).toThrow();
    expect(() => new ValveWheel({ id: 'valve:x', initial: 4 })).toThrow();
  });

  it('a locked wheel does not turn; set ignores out-of-range and unchanged values', () => {
    const onChange = vi.fn();
    const w = new ValveWheel({ id: 'valve:a', onChange });
    w.locked = true;
    expect(w.turn()).toBe(false);
    w.locked = false;
    expect(w.set(9)).toBe(false);
    expect(w.set(0)).toBe(false);
    expect(w.set(2)).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(2, 0);
  });

  it('builds a valve interactable that turns the wheel and disables when locked', () => {
    const w = new ValveWheel({ id: 'valve:a' });
    const i = valveInteractable(w, (out) => out.set(1, 2, 3));
    expect(i.kind).toBe('valve');
    expect(i.position(new THREE.Vector3()).toArray()).toEqual([1, 2, 3]);
    expect(i.enabled?.()).toBe(true);
    i.onInteract({} as never);
    expect(w.position()).toBe(1);
    expect(i.promptParams?.()).toEqual({ position: 2, of: 4 });
    w.locked = true;
    expect(i.enabled?.()).toBe(false);
  });
});
