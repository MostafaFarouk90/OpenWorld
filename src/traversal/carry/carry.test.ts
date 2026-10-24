import { describe, expect, it, vi } from 'vitest';
import type { MoveModifier } from '../../core/MoveModifiers';
import type { Vec3Like } from '../../core/events';
import type { MovementMode } from '../../movement/types';
import { CARRY_RULES, CarryResets, carryProblem, nearestOnRoute, resetPoints, type CarryRoute } from './CarryResets';
import { SLED_SOURCE, SLED_TRAIL, Sleds } from './Sleds';

const DT = 1 / 60;
/** A route climbing north: 0 m at z 0, 60 m up at z -300 (dense checkpoints every 50 m); reset points at 0, 3 and 6. */
const ROUTE: CarryRoute = {
  id: 'sled.r15.1',
  checkpoints: Array.from({ length: 7 }, (_, i) => ({ x: 0, y: i * 10, z: -(i * 50) || 0 })),
  corridorHalfWidth: 30,
  maxDrop: 10,
  resetAt: [0, 3, 6],
};

function harness(o: { deep?: (p: Vec3Like) => boolean; open?: (x: number, z: number) => boolean } = {}) {
  const s = { feet: { x: 0, y: 0, z: 5 } as Vec3Like, mode: 'walk' as MovementMode, mods: new Map<string, MoveModifier>(), yaw: 0 };
  const events: [string, unknown][] = [];
  const ports = {
    deepAt: o.deep ?? (() => false),
    isOpen: o.open ?? (() => true),
    playerFeet: () => s.feet,
    fade: vi.fn(),
    emit: (t: string, p: unknown) => void events.push([t, p]),
    movementMode: () => s.mode,
    setMovementMode: (m: MovementMode) => (s.mode = m),
    warn: vi.fn(),
  };
  const resets = new CarryResets(ports);
  const shown = new Map<string, Vec3Like>();
  const sleds = new Sleds(
    {
      feet: () => s.feet,
      yaw: () => s.yaw,
      groundAt: (_x, z) => -z / 5,
      addModifier: (src, m) => {
        s.mods.set(src, m);
        return () => s.mods.delete(src);
      },
      show: (id, p) => void shown.set(id, { ...p }),
      hide: (id) => void shown.delete(id),
      emit: (t, p) => void events.push([t, p]),
    },
    resets,
  );
  const run = (sec: number) => {
    for (let i = 0; i < Math.round(sec * 60); i++) {
      sleds.fixedUpdate();
      resets.fixedUpdate(DT);
    }
  };
  return { s, ports, resets, sleds, events, shown, run };
}

describe('the carry reset rules', () => {
  it('nearestOnRoute: distance in (x, z) and the line height there', () => {
    expect(nearestOnRoute(ROUTE.checkpoints, { x: 10, y: 0, z: -25 })).toEqual({ dist: 10, y: 5 });
    expect(nearestOnRoute([{ x: 0, y: 3, z: 0 }], { x: 3, y: 0, z: 4 })).toEqual({ dist: 5, y: 3 });
  });

  it('one case each: deep water, the closed area, off the route, below it; none on the route', () => {
    const ok = { deepAt: () => false, isOpen: () => true };
    expect(carryProblem(ROUTE, { x: 5, y: 10, z: -50 }, ok)).toBeNull();
    expect(carryProblem(ROUTE, { x: 5, y: 10, z: -50 }, { ...ok, deepAt: () => true })).toBe('deepWater');
    expect(carryProblem(ROUTE, { x: 5, y: 10, z: -50 }, { ...ok, isOpen: () => false })).toBe('closed');
    expect(carryProblem(ROUTE, { x: 31, y: 10, z: -50 }, ok)).toBe('offRoute');
    expect(carryProblem(ROUTE, { x: 29, y: 10, z: -50 }, ok)).toBeNull();
    expect(carryProblem(ROUTE, { x: 5, y: -0.5, z: -50 }, ok)).toBe('tooLow');
    expect(carryProblem(ROUTE, { x: 5, y: 0.5, z: -50 }, ok)).toBeNull();
  });

  it('reset points: resetAt filtered and sorted, every checkpoint by default', () => {
    expect(resetPoints(ROUTE)).toEqual([0, 3, 6]);
    expect(resetPoints({ ...ROUTE, resetAt: undefined })).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(resetPoints({ ...ROUTE, resetAt: [9, 3, 3, -1] })).toEqual([3]);
    expect(resetPoints({ ...ROUTE, resetAt: [99] })).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('tracking throws on a duplicate id or an empty route', () => {
    const { resets } = harness();
    const t = { route: ROUTE, position: () => null, place: () => {}, held: () => false };
    resets.track(t);
    expect(() => resets.track(t)).toThrow(/duplicate/);
    expect(() => resets.track({ ...t, route: { ...ROUTE, id: 'x', checkpoints: [] } })).toThrow(/checkpoints/);
  });
});

describe('the sled', () => {
  it('hauling: 60% speed, no sprint, attacks locked but the dodge kept, haul mode; letting go ends it', () => {
    const h = harness();
    h.sleds.add({ id: 'sled.r15.1', route: ROUTE });
    expect(h.sleds.take('sled.r15.1')).toBe(true);
    const m = h.s.mods.get(SLED_SOURCE)!;
    expect(m.speedScale).toBe(0.6);
    expect(m.noSprint).toBe(true);
    expect(m.lockActions).toEqual(expect.arrayContaining(['attack1', 'block', 'surge', 'ability1', 'mount']));
    expect(m.lockActions).not.toContain('dodge');
    h.run(0.1);
    expect(h.s.mode).toBe('haul');
    h.sleds.drop();
    h.run(0.1);
    expect(h.s.mods.size).toBe(0);
    expect(h.s.mode).toBe('walk');
  });

  it('trails behind the player on the ground, and waits where it was dropped by a direct hit', () => {
    const h = harness();
    h.sleds.add({ id: 'sled.r15.1', route: ROUTE });
    h.sleds.take('sled.r15.1');
    h.s.feet = { x: 0, y: 4, z: -20 };
    h.run(0.05);
    expect(h.sleds.position('sled.r15.1')).toEqual({ x: 0, y: (20 - SLED_TRAIL) / 5, z: -20 + SLED_TRAIL });
    h.sleds.onDirectHit();
    h.s.feet = { x: 0, y: 6, z: -30 };
    h.run(0.05);
    expect(h.sleds.held).toBeNull();
    expect(h.sleds.position('sled.r15.1')?.z).toBeCloseTo(-20 + SLED_TRAIL);
  });

  it('pushed off the route it returns to the last reset point after a fade, let go, with carry.reset after the place', () => {
    const h = harness();
    h.sleds.add({ id: 'sled.r15.1', route: ROUTE });
    h.sleds.take('sled.r15.1');
    // Haul it up past checkpoint 3 (z -150, y 30): the ground model puts the sled on the line.
    for (let z = 0; z >= -160; z -= 2) {
      h.s.feet = { x: 0, y: -z / 5, z };
      h.run(CARRY_RULES.checkSeconds);
    }
    expect(h.resets.checkpointIndex('sled.r15.1')).toBe(3);
    h.s.feet = { x: 45, y: 32, z: -160 };
    h.run(CARRY_RULES.checkSeconds + 0.02);
    expect(h.ports.fade).toHaveBeenCalledWith(1, CARRY_RULES.fadeOutSeconds);
    h.run(CARRY_RULES.fadeOutSeconds + 0.05);
    expect(h.sleds.position('sled.r15.1')).toEqual({ x: 0, y: 30, z: -150 });
    expect(h.sleds.held).toBeNull();
    expect(h.events.find((e) => e[0] === 'carry.reset')).toEqual(['carry.reset', { id: 'sled.r15.1', reason: 'offRoute' }]);
    expect(h.ports.fade).toHaveBeenLastCalledWith(0, CARRY_RULES.fadeInSeconds);
  });

  it.each([
    ['deepWater', { deep: (p: Vec3Like) => p.x > 3 }],
    ['closed', { open: (x: number) => x <= 3 }],
  ] as const)('a sled lying in %s returns to its first reset point (no fade when the player is far)', (reason, o) => {
    const h = harness(o);
    h.sleds.add({ id: 'sled.r15.1', route: ROUTE, start: { x: 5, y: 0, z: -10 } });
    h.s.feet = { x: 0, y: 0, z: 400 };
    h.run(CARRY_RULES.checkSeconds + 0.02);
    expect(h.ports.fade).not.toHaveBeenCalled();
    expect(h.sleds.position('sled.r15.1')).toEqual({ x: 0, y: 0, z: 0 });
    expect(h.events.find((e) => e[0] === 'carry.reset')?.[1]).toEqual({ id: 'sled.r15.1', reason });
  });

  it('too far below the route returns it', () => {
    const h = harness();
    h.sleds.add({ id: 'sled.r15.1', route: ROUTE, start: { x: 5, y: 15, z: -150 } });
    h.s.feet = { x: 0, y: 0, z: 400 };
    h.run(CARRY_RULES.checkSeconds + 0.02);
    expect(h.events.find((e) => e[0] === 'carry.reset')?.[1]).toEqual({ id: 'sled.r15.1', reason: 'tooLow' });
  });

  it('"reset haul" (Thorgar) mid-haul, and fast travel while hauling, send it back', () => {
    const h = harness();
    h.sleds.add({ id: 'sled.r15.1', route: ROUTE });
    h.sleds.take('sled.r15.1');
    h.s.feet = { x: 0, y: 2, z: -12 };
    h.run(0.1);
    expect(h.resets.reset('sled.r15.1', 'asked')).toBe(true);
    expect(h.resets.reset('sled.r15.1', 'asked')).toBe(false); // already running
    h.run(0.5);
    expect(h.sleds.position('sled.r15.1')).toEqual({ x: 0, y: 0, z: 0 });
    expect(h.resets.reset('nope', 'asked')).toBe(false);
    h.sleds.take('sled.r15.1');
    h.s.feet = { x: 0, y: 2, z: -12 };
    h.run(0.1);
    h.resets.onTravel();
    expect(h.sleds.position('sled.r15.1')).toEqual({ x: 0, y: 0, z: 0 });
    expect(h.sleds.held).toBeNull();
    expect(h.events.filter((e) => e[0] === 'carry.reset').map((e) => (e[1] as { reason: string }).reason)).toEqual(['asked', 'travel']);
  });

  it('persists where it lies and the progress; a save during the fade stores the checkpoint; a load holds nothing', () => {
    const h = harness();
    h.sleds.add({ id: 'sled.r15.1', route: ROUTE });
    h.sleds.take('sled.r15.1');
    for (let z = 0; z >= -160; z -= 2) {
      h.s.feet = { x: 0, y: -z / 5, z };
      h.run(CARRY_RULES.checkSeconds);
    }
    h.sleds.drop();
    const lying = h.sleds.position('sled.r15.1')!;
    const save1 = { ...h.resets.serialize(), ...h.sleds.serialize() };
    expect(save1.progress).toEqual({ 'sled.r15.1': 3 });
    expect(save1.sleds['sled.r15.1']).toEqual(lying);
    h.resets.reset('sled.r15.1', 'asked');
    const duringFade = { ...h.resets.serialize(), ...h.sleds.serialize() };
    expect(duringFade.sleds['sled.r15.1']).toEqual({ x: 0, y: 30, z: -150 });

    const g = harness();
    g.sleds.add({ id: 'sled.r15.1', route: ROUTE });
    g.resets.load(JSON.parse(JSON.stringify(duringFade)));
    g.sleds.load(JSON.parse(JSON.stringify(duringFade)));
    expect(g.sleds.position('sled.r15.1')).toEqual({ x: 0, y: 30, z: -150 });
    expect(g.resets.checkpointIndex('sled.r15.1')).toBe(3);
    expect(g.sleds.held).toBeNull();
  });

  it('an old save without the key (load(null)) puts the sled at its start with no progress', () => {
    const h = harness();
    h.sleds.add({ id: 'sled.r15.1', route: ROUTE });
    h.sleds.take('sled.r15.1');
    h.s.feet = { x: 0, y: 2, z: -12 };
    h.run(0.6);
    h.resets.load(null);
    h.sleds.load(null);
    expect(h.sleds.position('sled.r15.1')).toEqual({ x: 0, y: 0, z: 0 });
    expect(h.sleds.held).toBeNull();
    expect(h.resets.serialize()).toEqual({ progress: {} });
    expect(h.sleds.serialize()).toEqual({ sleds: {} });
  });

  it('a save loaded before the sled is added still places it, and keeps it on the next save', () => {
    const h = harness();
    h.sleds.load({ sleds: { 'sled.r15.2': { x: 1, y: 2, z: 3 } } });
    expect(h.sleds.serialize().sleds['sled.r15.2']).toEqual({ x: 1, y: 2, z: 3 });
    h.sleds.add({ id: 'sled.r15.2', route: { ...ROUTE, id: 'sled.r15.2' } });
    expect(h.sleds.position('sled.r15.2')).toEqual({ x: 1, y: 2, z: 3 });
  });
});

describe('a held quest carry (K13: R18 eggs, R17 bundles)', () => {
  it('is tracked like a sled: haul mode while held, its owner places it, the reset never touches anything else', () => {
    const h = harness();
    let held = true;
    let at: Vec3Like = { x: 0, y: 0, z: -5 };
    const place = vi.fn((p: Vec3Like) => {
      at = p;
      held = false;
    });
    const egg: CarryRoute = { id: 'egg.r18.1', checkpoints: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 10, z: -50 }], corridorHalfWidth: 30, maxDrop: 10, resetAt: [0] };
    h.resets.track({ route: egg, position: () => at, place, held: () => held });
    h.run(0.1);
    expect(h.s.mode).toBe('haul');
    at = { x: 0, y: 10, z: -50 }; // reached the nest shelf: eggs still go back to the pick-up
    h.run(0.6);
    at = { x: 0, y: -20, z: -50 }; // fell off the ledge
    h.run(0.6 + CARRY_RULES.fadeOutSeconds);
    expect(place).toHaveBeenCalledWith({ x: 0, y: 0, z: 0 });
    expect(h.s.mode).toBe('walk');
  });

  it('a throwing owner callback warns and the reset is still reported', () => {
    const h = harness();
    h.resets.track({ route: { ...ROUTE, id: 'candle.r17' }, position: () => ({ x: 99, y: 0, z: 0 }), place: () => { throw new Error('boom'); }, held: () => false });
    h.s.feet = { x: 0, y: 0, z: 900 };
    h.run(0.6);
    expect(h.ports.warn).toHaveBeenCalled();
    expect(h.events.some((e) => e[0] === 'carry.reset')).toBe(true);
  });
});
