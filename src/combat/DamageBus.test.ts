import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { DamageBus, damageFor } from './DamageBus';
import type { HitEvent } from './types';

const ev = (bone = 'torso'): HitEvent => ({
  bone,
  point: new THREE.Vector3(),
  normal: new THREE.Vector3(0, 0, 1),
  attacker: null,
  target: null,
  damage: 10,
});

describe('DamageBus', () => {
  it('delivers events to subscribers and counts them', () => {
    const bus = new DamageBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe(a);
    bus.subscribe(b);
    expect(bus.listenerCount).toBe(2);
    const e = ev();
    bus.emit(e);
    expect(a).toHaveBeenCalledWith(e);
    expect(b).toHaveBeenCalledWith(e);
  });

  it('emit with no listeners is a no-op', () => {
    expect(() => new DamageBus().emit(ev())).not.toThrow();
  });

  it('unsubscribe stops delivery; double unsubscribe is harmless', () => {
    const bus = new DamageBus();
    const a = vi.fn();
    const other = vi.fn();
    const off = bus.subscribe(a);
    bus.subscribe(other);
    off();
    off();
    expect(bus.listenerCount).toBe(1);
    bus.emit(ev());
    expect(a).not.toHaveBeenCalled();
    expect(other).toHaveBeenCalledTimes(1);
  });

  it('same function subscribed twice is two independent subscriptions', () => {
    const bus = new DamageBus();
    const a = vi.fn();
    const off1 = bus.subscribe(a);
    bus.subscribe(a);
    off1();
    bus.emit(ev());
    expect(a).toHaveBeenCalledTimes(1);
  });

  it('listener unsubscribed earlier in the same emit is not called', () => {
    const bus = new DamageBus();
    const second = vi.fn();
    let offSecond: () => void = () => {};
    bus.subscribe(() => offSecond());
    offSecond = bus.subscribe(second);
    bus.emit(ev());
    expect(second).not.toHaveBeenCalled();
    expect(bus.listenerCount).toBe(1);
  });

  it('listener may unsubscribe itself during emit', () => {
    const bus = new DamageBus();
    const calls = vi.fn();
    const off = bus.subscribe(() => {
      calls();
      off();
    });
    const tail = vi.fn();
    bus.subscribe(tail);
    bus.emit(ev());
    bus.emit(ev());
    expect(calls).toHaveBeenCalledTimes(1);
    expect(tail).toHaveBeenCalledTimes(2);
  });

  it('listener subscribed during emit is not called until the next emit', () => {
    const bus = new DamageBus();
    const late = vi.fn();
    let added = false;
    bus.subscribe(() => {
      if (!added) {
        added = true;
        bus.subscribe(late);
      }
    });
    bus.emit(ev());
    expect(late).not.toHaveBeenCalled();
    bus.emit(ev());
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('throwing listener is reported and does not block others', () => {
    const onErr = vi.fn();
    const bus = new DamageBus(onErr);
    const boom = new Error('boom');
    const after = vi.fn();
    const before = vi.fn();
    bus.subscribe(before);
    bus.subscribe(() => {
      throw boom;
    });
    bus.subscribe(after);
    expect(() => bus.emit(ev())).not.toThrow();
    expect(before).toHaveBeenCalled();
    expect(after).toHaveBeenCalled();
    expect(onErr).toHaveBeenCalledTimes(1);
    expect(onErr).toHaveBeenCalledWith(boom);
  });

  it('a throwing error handler does not break emit', () => {
    const bus = new DamageBus(() => {
      throw new Error('handler');
    });
    const after = vi.fn();
    bus.subscribe(() => {
      throw new Error('x');
    });
    bus.subscribe(after);
    expect(() => bus.emit(ev())).not.toThrow();
    expect(after).toHaveBeenCalled();
  });

  it('uses console.error by default', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const bus = new DamageBus();
      const err = new Error('default');
      bus.subscribe(() => {
        throw err;
      });
      bus.emit(ev());
      expect(spy).toHaveBeenCalledWith(err);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('damageFor', () => {
  it('applies bone multipliers to the default base', () => {
    expect(damageFor('head')).toBe(20);
    expect(damageFor('torso')).toBe(10);
    expect(damageFor('upperLegL')).toBeCloseTo(6);
  });

  it('unknown bone uses multiplier 1', () => {
    expect(damageFor('tail')).toBe(10);
    expect(damageFor('')).toBe(10);
  });

  it('custom base and zero base', () => {
    expect(damageFor('head', 5)).toBe(10);
    expect(damageFor('tail', 7)).toBe(7);
    expect(damageFor('head', 0)).toBe(0);
  });
});
