import { describe, expect, it, vi } from 'vitest';
import type { MoveModifier } from '../../core/MoveModifiers';
import type { Vec3Like } from '../../core/events';
import type { MovementMode } from '../../movement/types';
import { DIVE_RULES } from '../dive/types';
import type { DiveRouteStandsDef } from '../dive/types';
import { DEEP_TOAST_KEY, DIVE_SOURCE, DROWN_SOURCE, mountCapAt, WADE_SOURCE, wadeScale, WaterPlayer } from './WaterPlayer';
import { WaterVolumes } from './WaterVolumes';

const DT = 1 / 60;
const box = (x0: number, z0: number, x1: number, z1: number) => ({ box: { x0, z0, x1, z1 } });

/** A world with a fake player: a wade strip (x 0..20), a deep lake (x 20..40), and a dive pool (x 50..60, surface 0). */
function harness(opts: { route?: boolean; flags?: Record<string, boolean> } = {}) {
  const flags: Record<string, boolean> = opts.flags ?? {};
  const ground = (x: number) => (x < 0 ? 0.5 : x < 20 ? -0.8 : x < 40 ? -5 : x < 50 ? 0.5 : -6);
  const volumes = new WaterVolumes({ groundAt: (x) => ground(x), flags: { getFlag: (k) => flags[k] } });
  volumes.register({ id: 'water.t.wade', kind: 'wade', surfaceY: 0, area: box(0, -50, 20, 50) });
  volumes.register({ id: 'water.t.deep', kind: 'deep', surfaceY: 0, area: box(20, -50, 40, 50) });
  volumes.register({ id: 'water.t.pool', kind: 'dive', surfaceY: 0, area: box(50, -5, 60, 5), activeWhen: { none: ['story.d05.sluice1'] } });
  volumes.register({ id: 'water.t.pool-low', kind: 'dive', surfaceY: -2, area: box(50, -5, 60, 5), activeWhen: { all: ['story.d05.sluice1'] } });
  const pocket = (id: string, x: number, standZ: number) => ({ id, at: { x, y: 0, z: 0 }, stand: { x, y: 0.5, z: standZ } });
  if (opts.route !== false) {
    const r: DiveRouteStandsDef = {
      id: 'dive.t.pool',
      volumeId: 'water.t.pool',
      points: [{ x: 50, y: -2, z: 0 }, { x: 60, y: -2, z: 0 }],
      airPockets: [pocket('p.high', 58, 6)],
      entryStand: { x: 48, y: 0.5, z: 0 },
    };
    volumes.registerRoute(r);
    volumes.registerRoute({ ...r, id: 'dive.t.pool-low', volumeId: 'water.t.pool-low', airPockets: [pocket('p.low', 52, 7)] });
  }
  const s = {
    feet: { x: -5, y: 0.5, z: 0 } as Vec3Like,
    grounded: true,
    rise: false,
    sink: false,
    moving: false,
    mounted: false,
    boots: false,
    mode: 'walk' as MovementMode,
    safe: null as { position: Vec3Like; yaw: number } | null,
    ctrl: 'walk' as 'walk' | 'swim',
    vertical: null as number | null,
    mods: new Map<string, MoveModifier>(),
    ledge: null as Vec3Like | null,
  };
  const events: [string, unknown][] = [];
  const ports = {
    feet: () => s.feet,
    yaw: () => 0,
    grounded: () => s.grounded,
    teleport: vi.fn((p: Vec3Like) => {
      s.feet = { ...p };
    }),
    setControllerMode: (m: 'walk' | 'swim') => (s.ctrl = m),
    setVerticalIntent: (v: number | null) => (s.vertical = v),
    addModifier: (source: string, mod: MoveModifier) => {
      s.mods.set(source, mod);
      return () => {
        if (s.mods.get(source) === mod) s.mods.delete(source);
      };
    },
    movementMode: () => s.mode,
    setMovementMode: (m: MovementMode, safe?: { position: Vec3Like; yaw: number } | null) => {
      s.mode = m;
      s.safe = safe ?? null;
    },
    emit: (t: string, p: unknown) => void events.push([t, p]),
    toast: vi.fn(),
    fade: vi.fn(),
    rise: () => s.rise,
    sink: () => s.sink,
    moving: () => s.moving,
    mounted: () => s.mounted,
    fenBoots: () => s.boots,
    hurtNonLethal: vi.fn(),
    probeLedge: () => s.ledge,
    warn: vi.fn(),
  };
  const w = new WaterPlayer(volumes, ports as never);
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) w.fixedUpdate(DT);
  };
  const at = (x: number, y: number, z = 0) => (s.feet = { x, y, z });
  const named = (t: string) => events.filter((e) => e[0] === t).map((e) => e[1]);
  return { w, s, ports, tick, at, events, named, flags, volumes };
}

/** Puts the player under the pool's surface (from a ledge) and starts the dive. */
function dive(h: ReturnType<typeof harness>, x = 55) {
  h.at(48, 0.5);
  h.tick();
  h.at(x, -3);
  h.tick();
}

describe('wading', () => {
  it('scale: 2.48 m/s plain, 3.49 m/s with the Fen Boots (half the slowdown)', () => {
    expect(4.5 * wadeScale(false)).toBeCloseTo(2.475, 3);
    expect(4.5 * wadeScale(true)).toBeCloseTo(3.4875, 3);
  });

  it('0.4 to 1.2 m deep slows and stops the sprint; the dodge is not locked; it ends on dry land', () => {
    const h = harness();
    h.at(5, -0.3); // 0.3 deep
    h.tick();
    expect(h.s.mods.has(WADE_SOURCE)).toBe(false);
    h.at(5, -0.4); // 0.4 deep
    h.tick();
    expect(h.s.mods.get(WADE_SOURCE)).toEqual({ speedScale: wadeScale(false), noSprint: true });
    expect(h.w.state).toBe('wading');
    h.at(5, -1.2);
    h.tick();
    expect(h.s.mods.has(WADE_SOURCE)).toBe(true);
    h.at(-5, 0.5);
    h.tick();
    expect(h.s.mods.has(WADE_SOURCE)).toBe(false);
    expect(h.w.state).toBe('dry');
  });

  it('the Fen Boots change the scale in place, without stacking', () => {
    const h = harness();
    h.at(5, -0.8);
    h.tick();
    h.s.boots = true;
    h.tick();
    expect(h.s.mods.get(WADE_SOURCE)?.speedScale).toBeCloseTo(0.775);
    expect([...h.s.mods.keys()]).toEqual([WADE_SOURCE]);
  });

  it('water.entered and water.left once per volume change', () => {
    const h = harness();
    h.at(5, -0.8);
    h.tick(3);
    h.at(-5, 0.5);
    h.tick(2);
    expect(h.named('water.entered')).toEqual([{ kind: 'wade', volumeId: 'water.t.wade' }]);
    expect(h.named('water.left')).toEqual([{ kind: 'wade', volumeId: 'water.t.wade' }]);
  });
});

describe('the deep-water edge', () => {
  it('pushes back to the last dry or wading point and toasts once per 4 s', () => {
    const h = harness();
    h.at(18, -0.8);
    h.tick();
    h.at(21, -2);
    h.tick();
    expect(h.s.feet).toEqual({ x: 18, y: -0.8, z: 0 });
    expect(h.ports.toast).toHaveBeenCalledWith(DEEP_TOAST_KEY);
    for (let i = 0; i < 60; i++) {
      h.at(21, -2);
      h.tick();
    }
    expect(h.ports.toast).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 4 * 60; i++) {
      h.at(21, -2);
      h.tick();
    }
    expect(h.ports.toast).toHaveBeenCalledTimes(2);
  });

  it('a wade volume deeper than 1.2 m at a point behaves as deep there', () => {
    const h = harness();
    h.at(5, -0.8);
    h.tick();
    h.at(6, -1.3);
    h.tick();
    expect(h.s.feet.x).toBe(5);
  });

  it('is suspended while seated on the ferry', () => {
    const h = harness();
    h.at(18, -0.8);
    h.tick();
    h.s.mode = 'ferry';
    h.at(30, 0.35);
    h.tick();
    expect(h.s.feet.x).toBe(30);
    expect(h.s.mods.size).toBe(0);
  });

  it('a rider is pushed back from dive water too', () => {
    const h = harness();
    h.s.mounted = true;
    h.at(48, 0.5);
    h.tick();
    h.at(51, -0.6);
    h.tick();
    expect(h.s.feet.x).toBe(48);
  });

  it('with no dry point to return to it warns and does not move the player', () => {
    const h = harness();
    h.at(30, -2);
    h.tick();
    expect(h.ports.teleport).not.toHaveBeenCalled();
    expect(h.ports.warn).toHaveBeenCalled();
  });

  it('the mount cap is its walk speed in water and Infinity on dry land', () => {
    const h = harness();
    expect(mountCapAt(h.volumes, -5, 0, 3.5)).toBe(Infinity);
    expect(mountCapAt(h.volumes, 5, 0, 3.5)).toBe(3.5);
    expect(mountCapAt(h.volumes, 30, 0, 3.5)).toBe(3.5);
  });
});

describe('diving', () => {
  it('starts when the head goes under in a dive volume: the mode the same tick, swim, locks, events', () => {
    const h = harness();
    h.at(48, 0.5);
    h.tick();
    h.at(55, -1); // head at 0.6: out
    h.tick();
    expect(h.w.state).not.toBe('diving');
    h.at(55, -1.7); // head at -0.1: under
    h.tick();
    expect(h.w.state).toBe('diving');
    expect(h.s.mode).toBe('dive');
    expect(h.s.safe?.position).toEqual({ x: 48, y: 0.5, z: 0 });
    expect(h.s.ctrl).toBe('swim');
    const mod = h.s.mods.get(DIVE_SOURCE)!;
    expect(mod.speedScale! * 4.5).toBeCloseTo(2);
    expect(mod.noSprint).toBe(true);
    expect(mod.lockActions).toEqual(expect.arrayContaining(['attack1', 'block', 'dodge', 'surge', 'ability1', 'mount', 'sneak']));
    expect(mod.lockActions).not.toContain('jump');
    expect(h.named('dive.started')).toEqual([{ volumeId: 'water.t.pool' }]);
    expect(h.named('breath.changed')).toEqual([{ value: 30 }]);
  });

  it('never outside a dive volume (outdoor water is wade only)', () => {
    const h = harness();
    h.at(5, -1.7);
    h.tick();
    expect(h.w.state).not.toBe('diving');
  });

  it('rise and sink at 2 m/s, never above the head-out line', () => {
    const h = harness();
    dive(h);
    h.s.rise = true;
    h.tick();
    expect(h.s.vertical).toBe(2);
    h.s.rise = false;
    h.s.sink = true;
    h.tick();
    expect(h.s.vertical).toBe(-2);
    h.s.sink = false;
    h.tick();
    expect(h.s.vertical).toBe(0);
    h.at(55, -DIVE_RULES.headOutDepth);
    h.s.rise = true;
    h.tick();
    expect(h.s.vertical).toBe(0);
  });

  it('breath drains in simulation ticks and shows whole seconds; a paused game drains nothing', () => {
    const h = harness();
    dive(h);
    h.tick(61); // the start tick drains nothing; these 61 drain 61 ticks
    expect(h.w.breath).toBeCloseTo(30 - 61 / 60, 5);
    expect(h.named('breath.changed').slice(-1)).toEqual([{ value: 29 }]);
    const n = h.named('breath.changed').length;
    // No ticks (pause, a menu): nothing changes.
    expect(h.w.breath).toBeCloseTo(30 - 61 / 60, 5);
    expect(h.named('breath.changed').length).toBe(n);
  });

  it('head out refills once and makes the pocket in reach the last pocket (one refill per tick)', () => {
    const h = harness();
    dive(h);
    h.tick(120);
    h.at(58, -1.4);
    h.tick();
    expect(h.w.breath).toBe(30);
    expect(h.s.safe?.position).toEqual({ x: 58, y: 0.5, z: 6 });
    expect(h.named('dive.surfaced')).toEqual([{ volumeId: 'water.t.pool', pocketId: 'p.high' }]);
    h.tick(5);
    expect(h.named('dive.surfaced')).toHaveLength(1);
    expect(h.named('breath.changed').filter((b) => (b as { value: number }).value === 30)).toHaveLength(2);
  });

  it('drowning: once, under a freeze, 20% non-lethal, then the stand of the last pocket, walk mode, full breath', () => {
    const h = harness();
    dive(h);
    h.at(58, -1.4);
    h.tick(); // pocket p.high
    h.at(55, -3);
    h.tick(30 * 60 + 1);
    expect(h.ports.hurtNonLethal).toHaveBeenCalledTimes(1);
    expect(h.ports.hurtNonLethal).toHaveBeenCalledWith(0.2);
    expect(h.s.mods.has(DROWN_SOURCE) || h.s.feet.z === 6).toBe(true);
    h.tick(30);
    expect(h.ports.hurtNonLethal).toHaveBeenCalledTimes(1);
    expect(h.s.feet).toEqual({ x: 58, y: 0.5, z: 6 });
    expect(h.w.state).toBe('dry');
    expect(h.s.mode).toBe('walk');
    expect(h.s.ctrl).toBe('walk');
    expect(h.s.vertical).toBeNull();
    expect(h.s.mods.size).toBe(0);
    expect(h.w.breath).toBe(30);
    expect(h.ports.fade).toHaveBeenNthCalledWith(1, 1, DIVE_RULES.drownFadeSeconds);
    expect(h.ports.fade).toHaveBeenLastCalledWith(0, 0.4);
  });

  it('drowning with no pocket reached returns to the entry stand', () => {
    const h = harness();
    dive(h);
    h.tick(30 * 60 + 40);
    expect(h.s.feet).toEqual({ x: 48, y: 0.55, z: 0 });
  });

  it('a sluice flipped during the drowning fade sends the player to the remapped pocket', () => {
    const h = harness();
    dive(h);
    h.at(58, -1.4);
    h.tick();
    h.at(55, -3);
    h.tick(30 * 60 + 2); // drowning, fading
    h.flags['story.d05.sluice1'] = true;
    h.w.onFlagsChanged();
    h.tick(30);
    expect(h.s.feet).toEqual({ x: 52, y: 0.5, z: 7 });
  });

  it('a sluice mid-dive remaps the last pocket and the safe point to the active set', () => {
    const h = harness();
    dive(h);
    h.at(58, -1.4);
    h.tick();
    h.at(55, -3.5);
    h.tick();
    h.flags['story.d05.sluice1'] = true;
    h.w.onFlagsChanged();
    expect(h.s.safe?.position).toEqual({ x: 52, y: 0.5, z: 7 });
    expect(h.s.mode).toBe('dive');
    // The swimmer is now in the lower volume (surface -2): still diving.
    h.tick();
    expect(h.w.state).toBe('diving');
  });

  it('leaving the water with breath left never drowns', () => {
    const h = harness();
    dive(h);
    h.tick(30 * 60 - 8);
    h.at(45, 0.5);
    h.tick();
    expect(h.w.state).toBe('dry');
    h.tick(120);
    expect(h.ports.hurtNonLethal).not.toHaveBeenCalled();
  });

  it('standing in shallow water with the head out ends the dive (naming the pocket in reach); not while ungrounded', () => {
    const h = harness();
    dive(h);
    h.s.grounded = false;
    h.at(51, -1.1);
    h.tick();
    expect(h.w.state).toBe('diving');
    h.s.grounded = true;
    h.at(51, -1.1);
    h.tick();
    expect(h.w.state).not.toBe('diving');
    expect(h.s.mode).toBe('walk');
    expect(h.named('dive.surfaced').slice(-1)).toEqual([{ volumeId: 'water.t.pool', pocketId: 'p.high' }]);
  });

  it('climbs out at a ledge after 3 blocked ticks against the face', () => {
    const h = harness();
    dive(h);
    h.at(51, -1.4);
    h.s.moving = true;
    h.s.ledge = { x: 49.6, y: 0.55, z: 0 };
    h.tick(DIVE_RULES.ledgeBlockedTicks + 1);
    expect(h.s.feet).toEqual({ x: 49.6, y: 0.55, z: 0 });
    expect(h.w.state).toBe('dry');
    expect(h.s.ctrl).toBe('walk');
  });

  it("another system's teleport (a waystone, a cutscene) ends the dive where it put the player", () => {
    const h = harness();
    dive(h);
    h.at(500, 10); // a cutscene teleport
    h.tick();
    expect(h.w.state).toBe('dry');
    expect(h.s.mode).toBe('walk');
    expect(h.s.ctrl).toBe('walk');
    expect(h.s.mods.size).toBe(0);
    expect(h.s.feet).toEqual({ x: 500, y: 10, z: 0 });
  });

  it("K7's own teleports never read as a jump (the drowning move)", () => {
    const h = harness();
    dive(h);
    h.w.expect({ x: 0, y: 0, z: 400 });
    h.at(0, 0, 400);
    h.tick();
    // Not in the pool any more: the dive ends for that reason, but the expected move is not a "teleport".
    expect(h.w.state).toBe('dry');
  });

  it('save.loaded: controller walk, intent cleared, every modifier gone, no dive in the same tick', () => {
    const h = harness();
    dive(h);
    h.w.reset();
    expect(h.s.ctrl).toBe('walk');
    expect(h.s.vertical).toBeNull();
    expect(h.s.mods.size).toBe(0);
    // Still under water (a load that left the player there): no dive starts in the load's tick.
    h.tick();
    expect(h.w.state).not.toBe('diving');
    expect(h.s.ctrl).toBe('walk');
  });

  it('a quick re-entry does not stack modifiers', () => {
    const h = harness();
    dive(h);
    h.at(51, -1.1);
    h.tick(); // out
    h.at(55, -3);
    h.tick(3); // back in after the guard
    expect(h.w.state).toBe('diving');
    expect([...h.s.mods.keys()]).toEqual([DIVE_SOURCE]);
  });

  it('a dive volume with no route warns once and uses the last dry point as the entry stand', () => {
    const h = harness({ route: false });
    dive(h);
    expect(h.ports.warn).toHaveBeenCalledTimes(1);
    expect(h.s.safe?.position).toEqual({ x: 48, y: 0.5, z: 0 });
  });
});

describe('review fixes', () => {
  it('a rider in wading water gets no wade modifier (the mount cap does the slowing)', () => {
    const h = harness();
    h.s.mounted = true;
    h.at(5, -0.8);
    h.tick();
    expect(h.s.mods.has(WADE_SOURCE)).toBe(false);
    h.s.mounted = false;
    h.tick();
    expect(h.s.mods.has(WADE_SOURCE)).toBe(true);
  });

  it('a drowning cut short by a load lifts its fade', () => {
    const h = harness();
    dive(h);
    h.tick(30 * 60 + 2);
    expect(h.ports.fade).toHaveBeenLastCalledWith(1, DIVE_RULES.drownFadeSeconds);
    h.w.reset();
    expect(h.ports.fade).toHaveBeenLastCalledWith(0, 0.4);
  });

  it("a drowning cut short by another system's teleport lifts its fade", () => {
    const h = harness();
    dive(h);
    h.tick(30 * 60 + 2);
    h.at(-200, 0.5);
    h.tick();
    expect(h.w.state).toBe('dry');
    expect(h.ports.fade).toHaveBeenLastCalledWith(0, 0.4);
  });

  it('a stand exit sends dive.surfaced once, not once for the head-out and again for the end', () => {
    const h = harness();
    dive(h);
    h.at(55, -1);
    h.tick();
    expect(h.w.state).not.toBe('diving');
    expect(h.named('dive.surfaced')).toHaveLength(1);
  });
});
