// N3 lava runtime: the burn never kills and never goes under 10% from any health; the throw picks the nearest lip from the
// entry point; a load in lava lands on a lip; the last safe lip; the lava-stair push; shapes, profiles, crusts, edges.
import { describe, expect, it, vi } from 'vitest';
import type { Vec3 } from '../../physics/PhysicsWorld';
import { LavaField, nearestOnShape, surfaceAt, validateVolume, type LavaFieldPorts } from './LavaField';
import type { LavaFieldDef } from './types';
import { LAVA } from './tuning';

const DT = 1 / 60;

function channel(over: Partial<LavaFieldDef> = {}): LavaFieldDef {
  return {
    id: 'test.channel',
    shape: { kind: 'box', x0: -3, z0: -10, x1: 3, z1: 10 },
    surfaceY: 0,
    damagePctPerS: 15,
    safeLips: [
      { x: -5, y: 0.5, z: 0 },
      { x: 5, y: 0.5, z: 0 },
    ],
    ...over,
  };
}

function rig(opts: { health?: number; max?: number; modifier?: number; throwOk?: boolean; ward?: number } = {}) {
  const max = opts.max ?? 1000;
  const v = { health: opts.health ?? max, max, dead: false };
  const thrown: { id: string; to: Vec3 }[] = [];
  const entered: string[] = [];
  const pushes: Array<() => { position: Vec3; yaw: number } | null> = [];
  let releases = 0;
  const throwTo = vi.fn(async (_to: Vec3, _yaw: number) => opts.throwOk ?? true);
  const ports: LavaFieldPorts = {
    vitals: () => ({ ...v }),
    damage: (a) => {
      v.health -= a * (opts.modifier ?? 1);
      if (v.health <= 0) {
        v.health = 0;
        v.dead = true;
      }
    },
    heal: (a) => {
      v.health = Math.min(v.max, v.health + a);
    },
    throwTo,
    entered: (id) => entered.push(id),
    thrown: (id, to) => thrown.push({ id, to }),
    pushMode: (g) => {
      pushes.push(g);
      return () => releases++;
    },
    ward: opts.ward === undefined ? undefined : () => opts.ward!,
    warn: () => {},
  };
  const field = new LavaField(ports);
  return { field, v, thrown, entered, pushes, releases: () => releases, throwTo };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('LavaField: the burn', () => {
  it.each([1, 0.5, 0.105, 0.1, 0.05])('never kills and never goes under 10%% (start %s of max), even standing in it', async (f) => {
    const t = rig({ health: 1000 * f, throwOk: false });
    t.field.add(channel());
    for (let i = 0; i < 60 * 30; i++) {
      t.field.step(DT, { x: 0, y: -0.5, z: 0 }, true);
      await Promise.resolve();
    }
    expect(t.v.dead).toBe(false);
    expect(t.v.health).toBeGreaterThan(0);
    expect(t.v.health).toBeGreaterThanOrEqual(Math.min(1000 * f, 100) - 1e-9);
  });

  it('a damage modifier that doubles the hit is healed back to exactly the floor', async () => {
    const t = rig({ health: 120, modifier: 4, throwOk: false });
    t.field.add(channel());
    for (let i = 0; i < 120; i++) {
      t.field.step(DT, { x: 0, y: -0.5, z: 0 }, true);
      await Promise.resolve();
    }
    expect(t.v.dead).toBe(false);
    expect(t.v.health).toBeCloseTo(100, 6);
  });

  it('burns 15% of max a second, scaled by heat gear (N7 heatWard), and not at all above the surface', async () => {
    const t = rig({ throwOk: false });
    t.field.add(channel());
    for (let i = 0; i < 12; i++) t.field.step(DT, { x: 0, y: -0.5, z: 0 }, true);
    expect(t.v.health).toBeCloseTo(1000 - 150 * 12 * DT, 6);
    const w = rig({ ward: 0.7, throwOk: false });
    w.field.add(channel());
    for (let i = 0; i < 12; i++) w.field.step(DT, { x: 0, y: -0.5, z: 0 }, true);
    expect(w.v.health).toBeCloseTo(1000 - 150 * 0.7 * 12 * DT, 6);
    const dry = rig();
    dry.field.add(channel());
    for (let i = 0; i < 60; i++) dry.field.step(DT, { x: 0, y: 0.01, z: 0 }, true);
    expect(dry.v.health).toBe(1000);
  });

  it('a dead player is not burned or thrown', () => {
    const t = rig();
    t.field.add(channel());
    t.v.dead = true;
    for (let i = 0; i < 60; i++) t.field.step(DT, { x: 0, y: -0.5, z: 0 }, true);
    expect(t.throwTo).not.toHaveBeenCalled();
  });
});

describe('LavaField: the throw', () => {
  it(`throws after ${LAVA.throwAfterS} s to the nearest lip from where Cael stepped in, facing away from the lava`, async () => {
    const t = rig();
    t.field.add(channel());
    // walking in from the east side (x 4 on the ground), then 1 m into the lava on the west half
    t.field.step(DT, { x: 4, y: 0.5, z: 0 }, true);
    let ticks = 0;
    while (t.throwTo.mock.calls.length === 0 && ticks < 120) {
      t.field.step(DT, { x: -1, y: -0.5, z: 0 }, true);
      ticks++;
    }
    expect(ticks).toBe(Math.ceil(LAVA.throwAfterS / DT));
    const [to, yaw] = t.throwTo.mock.calls[0]!;
    expect(to).toEqual({ x: 5, y: 0.5, z: 0 }); // the east lip: nearest to the entry point, not to the feet
    expect(Math.sin(-yaw)).toBeCloseTo(1, 6); // facing +X (away from the lava, toward the lip)
    expect(t.entered).toEqual(['test.channel']);
    await flush();
    expect(t.thrown).toEqual([{ id: 'test.channel', to: { x: 5, y: 0.5, z: 0 } }]);
    expect(t.field.lastSafeLip).toEqual({ x: 5, y: 0.5, z: 0 });
    // about 6% lost from full
    expect(t.v.health).toBeGreaterThan(930);
    expect(t.v.health).toBeLessThan(950);
  });

  it('ties between lips keep list order', async () => {
    const t = rig();
    t.field.add(channel());
    for (let i = 0; i < 30; i++) t.field.step(DT, { x: 0, y: -0.5, z: 0 }, true);
    expect(t.throwTo.mock.calls[0]![0]).toEqual({ x: -5, y: 0.5, z: 0 });
  });

  it('a failed safe teleport throws again on the next tick; no burn while a throw is in flight', async () => {
    let ok = false;
    const t = rig();
    t.throwTo.mockImplementation(async () => ok);
    t.field.add(channel());
    for (let i = 0; i < 30; i++) t.field.step(DT, { x: 0, y: -0.5, z: 0 }, true);
    const h = t.v.health;
    t.field.step(DT, { x: 0, y: -0.5, z: 0 }, true); // in flight
    expect(t.v.health).toBe(h);
    await flush();
    ok = true;
    for (let i = 0; i < 30; i++) t.field.step(DT, { x: 0, y: -0.5, z: 0 }, true);
    await flush();
    expect(t.thrown.length).toBe(1);
  });

  it('pushes lava-stair while in lava or airborne over it, with the last lip as the safe point; releases on safe ground', async () => {
    const t = rig();
    t.field.add(channel());
    t.field.step(DT, { x: 5, y: 0.5, z: 0 }, true); // on the east lip: passed it
    expect(t.pushes.length).toBe(0);
    t.field.step(DT, { x: 0, y: 2, z: 0 }, false); // a jump over the channel
    expect(t.pushes.length).toBe(1);
    expect(t.pushes[0]!()).toEqual({ position: { x: 5, y: 0.5, z: 0 }, yaw: 0 });
    t.field.step(DT, { x: -5, y: 0.5, z: 0 }, true); // landed on the west lip
    expect(t.releases()).toBe(1);
    expect(t.field.lastSafeLip).toEqual({ x: -5, y: 0.5, z: 0 });
  });

  it('a load in lava lands on the nearest lip with no damage and no lava.thrown; a load on ground does nothing', async () => {
    const t = rig();
    t.field.add(channel());
    await t.field.onLoaded({ x: 2, y: -0.5, z: 3 });
    expect(t.throwTo).toHaveBeenCalledTimes(1);
    expect(t.throwTo.mock.calls[0]![0]).toEqual({ x: 5, y: 0.5, z: 0 });
    expect(t.v.health).toBe(1000);
    expect(t.thrown).toEqual([]);
    const g = rig();
    g.field.add(channel());
    await g.field.onLoaded({ x: 20, y: 1, z: 0 });
    expect(g.throwTo).not.toHaveBeenCalled();
  });

  it('a save point with no lip passed is the nearest lip of the nearest volume', () => {
    const t = rig();
    t.field.add(channel());
    t.field.step(DT, { x: -12, y: 0.5, z: 0 }, true);
    expect(t.field.safePoint()).toEqual({ position: { x: -5, y: 0.5, z: 0 }, yaw: 0 });
  });
});

describe('LavaField: shapes and crusts', () => {
  it('circle, ribbon and profiled ribbon', () => {
    const t = rig();
    t.field.add(channel({ id: 'c', shape: { kind: 'circle', x: 100, z: 0, r: 10 }, surfaceY: 5 }));
    t.field.add(channel({ id: 'r', shape: { kind: 'ribbon', points: [[200, 0], [200, 100]], halfWidth: 3 }, surfaceY: 0, profile: [50, 0] }));
    expect(t.field.at(105, 4, 0)).toBe('c');
    expect(t.field.at(111, 4, 0)).toBeNull();
    expect(t.field.at(105, 6, 0)).toBeNull();
    // the profile runs from 50 at z 0 down to 0 at z 100: at z 50 the surface is 25
    expect(t.field.at(201, 24, 50)).toBe('r');
    expect(t.field.at(201, 26, 50)).toBeNull();
    expect(t.field.at(204, 24, 50)).toBeNull();
    expect(surfaceAt({ def: t.field.def('r')!, surfaceY: 0 }, 200, 50)).toBeCloseTo(25, 6);
  });

  it('a rising surface moves the whole profile; lips can be replaced; bad input is refused', () => {
    const t = rig();
    t.field.add(channel());
    expect(t.field.setSurface('test.channel', 2)).toBe(true);
    expect(t.field.at(0, 1.5, 0)).toBe('test.channel');
    expect(t.field.setSurface('nope', 2)).toBe(false);
    expect(t.field.setSurface('test.channel', NaN)).toBe(false);
    expect(t.field.setLips('test.channel', [])).toBe(false);
    expect(t.field.setLips('test.channel', [{ x: 0, y: 3, z: 20 }])).toBe(true);
    expect(t.field.lips('test.channel')).toEqual([{ x: 0, y: 3, z: 20 }]);
  });

  it('an open crust reads as ground; closed it is lava again', () => {
    const t = rig();
    t.field.add(channel());
    t.field.addCrust('vent.a', 'test.channel', { kind: 'box', x0: -3, z0: -1, x1: 3, z1: 1 });
    expect(t.field.at(0, -0.1, 0)).toBe('test.channel');
    t.field.setCrustSolid('vent.a', true);
    expect(t.field.at(0, -0.1, 0)).toBeNull();
    expect(t.field.at(0, -0.1, 5)).toBe('test.channel');
    expect(t.field.over(0, 0)).toBe(false);
    t.field.setCrustSolid('vent.a', false);
    expect(t.field.at(0, -0.1, 0)).toBe('test.channel');
  });

  it('refuses a duplicate id and bad defs; the undo removes the volume', () => {
    const t = rig();
    const undo = t.field.add(channel());
    expect(() => t.field.add(channel())).toThrow(/already registered/);
    expect(() => t.field.add(channel({ id: 'x', safeLips: [] }))).toThrow(/safe lip/);
    expect(validateVolume(channel({ id: 'y', shape: { kind: 'circle', x: 0, z: 0, r: 0 } }))).toMatch(/r > 0/);
    expect(validateVolume(channel({ id: 'z', shape: { kind: 'ribbon', points: [[0, 0], [1, 1]], halfWidth: 1 }, profile: [1] }))).toMatch(/profile/);
    expect(validateVolume(channel({ id: 'w', surfaceY: NaN }))).toMatch(/surfaceY/);
    undo();
    expect(t.field.has('test.channel')).toBe(false);
    expect(t.field.at(0, -1, 0)).toBeNull();
  });

  it('nearest: the nearest surface point and its distance (N8)', () => {
    const t = rig();
    t.field.add(channel());
    expect(t.field.nearest(10, 0)).toEqual({ volumeId: 'test.channel', distance: 7, point: { x: 3, y: 0, z: 0 } });
    expect(nearestOnShape({ kind: 'circle', x: 0, z: 0, r: 5 }, 10, 0)).toEqual({ x: 5, z: 0, distance: 5 });
    expect(nearestOnShape({ kind: 'ribbon', points: [[0, 0], [0, 10]], halfWidth: 2 }, 5, 5).distance).toBeCloseTo(3, 6);
    expect(new LavaField({ vitals: () => ({ health: 1, max: 1, dead: false }), damage() {}, heal() {}, throwTo: async () => true }).nearest(0, 0)).toBeNull();
  });
});
