import { describe, expect, it, vi } from 'vitest';
import type { BurnZone } from './Burn';
import { LeapController, type LeapHost } from './Leap';
import { LEAP } from './tuning';

function setup(over: Partial<LeapHost> = {}) {
  const state = { learned: true, alive: true, busy: null as ReturnType<LeapHost['busyReason']>, zone: 'warm' as BurnZone, y: 0, refuse: false, active: true };
  const useShard = vi.fn();
  const onLaunch = vi.fn();
  const startLeap = vi.fn(() => (state.refuse ? null : { get active() { return state.active; }, cancel() { state.active = false; } }));
  const host: LeapHost = {
    learned: () => state.learned,
    alive: () => state.alive,
    busyReason: () => state.busy,
    zone: () => state.zone,
    feetY: () => state.y,
    startLeap,
    useShard,
    onLaunch,
    ...over,
  };
  return { leap: new LeapController(host), state, useShard, onLaunch, startLeap };
}

describe('LeapController', () => {
  it('refuses until the ability is granted, and when dead, with nothing spent', () => {
    const { leap, state, useShard, startLeap } = setup();
    state.learned = false;
    expect(leap.press(0)).toEqual({ ok: false, reason: 'not-learned' });
    state.learned = true;
    state.alive = false;
    expect(leap.press(0)).toEqual({ ok: false, reason: 'dead' });
    expect(startLeap).not.toHaveBeenCalled();
    expect(useShard).not.toHaveBeenCalled();
  });

  it.each(['staggered', 'blocked', 'busy', 'casting'] as const)('refuses while %s', (reason) => {
    const { leap, state, startLeap } = setup();
    state.busy = reason;
    expect(leap.press(0)).toEqual({ ok: false, reason });
    expect(startLeap).not.toHaveBeenCalled();
  });

  it('asks core for 6 m and charges 8 Burn only once the feet leave the ground', () => {
    const { leap, state, useShard, onLaunch, startLeap } = setup();
    expect(leap.press(1)).toEqual({ ok: true });
    expect(startLeap).toHaveBeenCalledWith({ distance: LEAP.distance, apex: LEAP.apex });
    expect(useShard).not.toHaveBeenCalled();
    leap.update(1.02);
    expect(useShard).not.toHaveBeenCalled();
    state.y = 0.3;
    leap.update(1.05);
    expect(useShard).toHaveBeenCalledTimes(1);
    expect(useShard).toHaveBeenCalledWith(8, 'leap', false);
    expect(onLaunch).toHaveBeenCalledTimes(1);
    leap.update(1.1);
    expect(useShard).toHaveBeenCalledTimes(1);
  });

  it('a Leap into a wall (cancelled before liftoff) spends nothing and starts no cooldown', () => {
    const { leap, state, useShard } = setup();
    leap.press(0);
    state.active = false;
    leap.onPhase('cancel', 0.05);
    expect(useShard).not.toHaveBeenCalled();
    expect(leap.remaining(0.05)).toBe(0);
    expect(leap.press(0.06)).toEqual({ ok: true });
  });

  it('a liftoff that ended unseen is dropped by update() without a charge', () => {
    const { leap, state, useShard } = setup();
    leap.press(0);
    state.active = false;
    leap.update(0.05);
    expect(useShard).not.toHaveBeenCalled();
    expect(leap.press(0.1)).toEqual({ ok: true });
  });

  it('a cancel in mid-air keeps the cost and the cooldown', () => {
    const { leap, state, useShard } = setup();
    leap.press(0);
    state.y = 1;
    leap.onPhase('cancel', 0.4);
    expect(useShard).toHaveBeenCalledTimes(1);
    expect(leap.remaining(0.4)).toBeCloseTo(LEAP.cooldownSeconds);
  });

  it('a landing implies liftoff even if update never saw the rise', () => {
    const { leap, useShard } = setup();
    leap.press(0);
    leap.onPhase('land', 0.9);
    expect(useShard).toHaveBeenCalledTimes(1);
  });

  it('the cooldown is 4.0 s: refused just before, accepted at the end', () => {
    const { leap, state } = setup();
    leap.press(10);
    state.y = 1;
    leap.update(10.05);
    state.y = 0;
    expect(leap.press(10.05 + 3.9)).toEqual({ ok: false, reason: 'cooldown' });
    expect(leap.remaining(10.05 + 3.9)).toBeCloseTo(0.1, 5);
    expect(leap.press(10.05 + 4)).toEqual({ ok: true });
  });

  it('a second press while one is in flight is refused', () => {
    const { leap, startLeap } = setup();
    leap.press(0);
    expect(leap.press(0.01)).toEqual({ ok: false, reason: 'cooldown' });
    expect(startLeap).toHaveBeenCalledTimes(1);
  });

  it('core refusing (airborne, frozen, already leaping) spends nothing', () => {
    const { leap, state, useShard } = setup();
    state.refuse = true;
    expect(leap.press(0)).toEqual({ ok: false, reason: 'rejected' });
    expect(useShard).not.toHaveBeenCalled();
    expect(leap.remaining(0)).toBe(0);
  });

  it('decides the Scar at the press, from Burn then, not at takeoff', () => {
    const { leap, state, useShard } = setup();
    state.zone = 'cinder';
    leap.press(0);
    state.zone = 'warm'; // Burn dropped before liftoff
    state.y = 1;
    leap.update(0.05);
    expect(useShard).toHaveBeenCalledWith(8, 'leap', true);
  });

  it('does not scar below Burn 75 at the press', () => {
    const { leap, state, useShard } = setup();
    state.zone = 'blaze';
    leap.press(0);
    state.y = 1;
    leap.update(0.05);
    expect(useShard).toHaveBeenCalledWith(8, 'leap', false);
  });

  it('reset() forgets a flight in progress but keeps the cooldown', () => {
    const { leap, state, useShard } = setup();
    leap.press(0);
    state.y = 1;
    leap.update(0.05);
    leap.reset();
    leap.update(0.1);
    expect(useShard).toHaveBeenCalledTimes(1);
    expect(leap.remaining(0.1)).toBeGreaterThan(3);
    leap.clearCooldown();
    expect(leap.remaining(0.1)).toBe(0);
  });
});
