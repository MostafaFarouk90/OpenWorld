import { describe, expect, it, vi } from 'vitest';
import type { MoveModifier } from '../../core/MoveModifiers';
import type { Vec3Like } from '../../core/events';
import type { MovementMode } from '../../movement/types';
import { ACT3_FERRY, ferryRoutes } from '../sites';
import { DECK_HEIGHT, FERRY_SOURCE, FERRY_SPEED, FerryLeg, FerryRides } from './FerryRides';

const DT = 1 / 60;

function harness(o: { token?: boolean; running?: boolean; combat?: boolean; mounted?: boolean; safe?: 'resolve' | 'reject' | 'none' } = {}) {
  const s = {
    feet: { x: 3600, y: 6.5, z: 10100 } as Vec3Like,
    token: o.token ?? true,
    running: o.running ?? true,
    combat: o.combat ?? false,
    busy: false,
    mounted: o.mounted ?? false,
    mode: 'walk' as MovementMode,
    safe: null as { position: Vec3Like; yaw: number } | null,
    mods: new Map<string, MoveModifier>(),
    boat: null as Vec3Like | null,
  };
  let resolveJob: (() => void) | null = null;
  const events: [string, unknown][] = [];
  const ports = {
    feet: () => s.feet,
    yaw: () => 0,
    hasToken: () => s.token,
    running: () => s.running,
    inCombat: () => s.combat,
    busy: () => s.busy,
    mounted: () => s.mounted,
    dismount: vi.fn(() => (s.mounted = false)),
    movementMode: () => s.mode,
    setMovementMode: (m: MovementMode, safe?: { position: Vec3Like; yaw: number } | null) => {
      s.mode = m;
      s.safe = safe ?? null;
    },
    addModifier: (src: string, m: MoveModifier) => {
      s.mods.set(src, m);
      return () => s.mods.delete(src);
    },
    teleport: vi.fn((p: Vec3Like) => (s.feet = { ...p })),
    safeTeleport: vi.fn((p: Vec3Like) => {
      if (o.safe === 'none') return null;
      return new Promise<void>((res, rej) => {
        resolveJob = () => {
          s.feet = { ...p };
          if (o.safe === 'reject') rej(new Error('stuck'));
          else res();
        };
      });
    }),
    landing: (id: string) => {
      const st = ACT3_FERRY.stops.find((q) => q.id === id);
      return st ? { x: st.x, y: 6.5, z: st.z } : null;
    },
    showBoat: (p: Vec3Like) => (s.boat = { ...p }),
    hideBoat: () => (s.boat = null),
    emit: (t: string, p: unknown) => void events.push([t, p]),
    toast: vi.fn(),
    warn: vi.fn(),
  };
  const f = new FerryRides(ports as never);
  for (const r of ferryRoutes(ACT3_FERRY)) f.register(r);
  return { f, s, ports, events, finishJob: () => resolveJob?.() };
}

describe('FerryLeg', () => {
  it('measures the path and walks it both ways, facing along it', () => {
    const leg = new FerryLeg({ id: 'r', stops: [{ id: 'a', anchorId: 'x.a' }, { id: 'b', anchorId: 'x.b' }], path: [{ x: 0, y: 6, z: 0 }, { x: 0, y: 6, z: -10 }, { x: 10, y: 6, z: -10 }], speed: 5 });
    expect(leg.length).toBe(20);
    expect(leg.at(5)).toMatchObject({ x: 0, z: -5 });
    expect(leg.at(5).yaw).toBeCloseTo(0);
    expect(leg.at(15).x).toBeCloseTo(5);
    expect(leg.at(5, true)).toMatchObject({ x: 5, z: -10 });
    expect(leg.at(5, true).yaw).toBeCloseTo(Math.PI / 2);
  });
  it('rejects a one-point path, a zero-length path or a leg without exactly two stops', () => {
    const stops = [{ id: 'a', anchorId: 'x.a' }, { id: 'b', anchorId: 'x.b' }];
    expect(() => new FerryLeg({ id: 'r', stops, path: [{ x: 0, y: 0, z: 0 }], speed: 5 })).toThrow(/two path points/);
    expect(() => new FerryLeg({ id: 'r', stops, path: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }], speed: 5 })).toThrow(/zero-length/);
    expect(() => new FerryLeg({ id: 'r', stops: [stops[0]], path: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }], speed: 5 })).toThrow(/two stops/);
  });
});

describe('the Greyfen ferry', () => {
  it("K1's four stops on three legs; destinations and the default cycle", () => {
    const { f } = harness();
    expect(f.stops()).toEqual(['reedgate', 'mere', 'greywatch', 'mireweather']);
    expect(f.destinations('mere')).toEqual(['reedgate', 'greywatch', 'mireweather']);
    expect(f.defaultDestination('reedgate')).toBe('mere');
    expect(f.defaultDestination('nowhere')).toBeNull();
  });

  it('refuses without the token, before M24, in combat, while busy, and off the network (toasting the reason)', () => {
    expect(harness({ token: false }).f.board('reedgate', 'mere')).toBe('noToken');
    expect(harness({ running: false }).f.board('reedgate', 'mere')).toBe('notRunning');
    expect(harness({ combat: true }).f.board('reedgate', 'mere')).toBe('combat');
    const h = harness();
    expect(h.f.board('reedgate', 'greywatch')).toBe('noRoute');
    expect(h.ports.toast).toHaveBeenCalledWith('ferry.refused.noRoute');
    h.s.busy = true;
    expect(h.f.board('reedgate', 'mere')).toBe('busy');
  });

  it('boards: dismounts, sets ferry mode with the departure stop as the safe point, freezes, seats the player on the boat', () => {
    const h = harness({ mounted: true });
    expect(h.f.board('reedgate', 'mere')).toBeNull();
    expect(h.ports.dismount).toHaveBeenCalled();
    expect(h.s.mode).toBe('ferry');
    expect(h.s.safe?.position).toEqual({ x: 3600, y: 6.5, z: 10100 });
    expect(h.s.mods.get(FERRY_SOURCE)).toEqual({ freeze: true });
    expect(h.s.feet.y).toBeCloseTo(6 + DECK_HEIGHT);
    expect(h.s.boat).not.toBeNull();
    expect(h.events[0]).toEqual(['ferry.boarded', { routeId: 'ferry.greyfen.reedgate-mere', from: 'reedgate', to: 'mere' }]);
    expect(h.f.board('reedgate', 'mere')).toBe('busy');
  });

  it('rides at 5 m/s and arrives on the landing in walk mode', () => {
    const h = harness();
    h.f.board('reedgate', 'mere');
    const start = { ...h.s.feet };
    for (let i = 0; i < 60; i++) h.f.fixedUpdate(DT, false);
    expect(Math.hypot(h.s.feet.x - start.x, h.s.feet.z - start.z)).toBeCloseTo(FERRY_SPEED, 0);
    const legLen = new FerryLeg(ferryRoutes(ACT3_FERRY)[0]).length;
    for (let i = 0; i < Math.ceil((legLen / FERRY_SPEED) * 60) + 2; i++) h.f.fixedUpdate(DT, false);
    expect(h.f.riding).toBe(false);
    expect(h.s.feet).toEqual({ x: 3150, y: 6.5, z: 11900 });
    expect(h.s.mode).toBe('walk');
    expect(h.s.mods.size).toBe(0);
    expect(h.s.boat).toBeNull();
    expect(h.events.at(-1)).toEqual(['ferry.arrived', { routeId: 'ferry.greyfen.reedgate-mere', stop: 'mere', skipped: false }]);
  });

  it('rides a leg backwards (Mere to Reedgate)', () => {
    const h = harness();
    h.s.feet = { x: 3150, y: 6.5, z: 11900 };
    expect(h.f.board('mere', 'reedgate')).toBeNull();
    for (let i = 0; i < 60 * 600; i++) h.f.fixedUpdate(DT, false);
    expect(h.s.feet).toEqual({ x: 3600, y: 6.5, z: 10100 });
  });

  it('skip: the interact (not on the boarding tick) fades to the next stop through the safe teleport', async () => {
    const h = harness();
    h.f.board('reedgate', 'mere');
    h.f.fixedUpdate(DT, true); // the boarding press
    expect(h.ports.safeTeleport).not.toHaveBeenCalled();
    h.f.fixedUpdate(DT, true);
    expect(h.ports.safeTeleport).toHaveBeenCalledWith({ x: 3150, y: 6.5, z: 11900 }, expect.any(Number));
    expect(h.f.riding).toBe(true);
    h.finishJob();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.f.riding).toBe(false);
    expect(h.s.mode).toBe('walk');
    expect(h.events.at(-1)).toEqual(['ferry.arrived', { routeId: 'ferry.greyfen.reedgate-mere', stop: 'mere', skipped: true }]);
  });

  it('skip without the waystones service places at once; a failed safe teleport still ends the ride at the stop', async () => {
    const a = harness({ safe: 'none' });
    a.f.board('reedgate', 'mere');
    a.f.skip();
    expect(a.f.riding).toBe(false);
    expect(a.s.feet).toEqual({ x: 3150, y: 6.5, z: 11900 });
    const b = harness({ safe: 'reject' });
    b.f.board('reedgate', 'mere');
    b.f.skip();
    b.finishJob();
    await Promise.resolve();
    await Promise.resolve();
    expect(b.f.riding).toBe(false);
    expect(b.s.feet).toEqual({ x: 3150, y: 6.5, z: 11900 });
  });

  it('save.loaded ends the ride without moving the player (the loader put them at the departure stop)', () => {
    const h = harness();
    h.f.board('reedgate', 'mere');
    for (let i = 0; i < 120; i++) h.f.fixedUpdate(DT, false);
    h.s.feet = { x: 3600, y: 6.5, z: 10100 };
    h.ports.teleport.mockClear();
    h.f.reset();
    expect(h.f.riding).toBe(false);
    expect(h.ports.teleport).not.toHaveBeenCalled();
    expect(h.s.mods.size).toBe(0);
    expect(h.s.boat).toBeNull();
  });

  it("another system's teleport mid-ride ends the ride where it put the player", () => {
    const h = harness();
    h.f.board('reedgate', 'mere');
    h.f.fixedUpdate(DT, false);
    h.s.feet = { x: 0, y: 50, z: 0 };
    h.f.fixedUpdate(DT, false);
    expect(h.f.riding).toBe(false);
    expect(h.s.feet).toEqual({ x: 0, y: 50, z: 0 });
    expect(h.s.mode).toBe('walk');
  });

  it('duplicate route ids throw', () => {
    const { f } = harness();
    expect(() => f.register(ferryRoutes(ACT3_FERRY)[0])).toThrow(/duplicate/);
  });
});
