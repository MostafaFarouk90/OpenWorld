import { describe, expect, it, vi } from 'vitest';
import type { MoveModifier } from '../../core/MoveModifiers';
import type { Vec3Like } from '../../core/events';
import type { MovementMode } from '../../movement/types';
import { GLIDE_TUNING } from '../../movement/types';
import { GLIDE_GRAVITY, GLIDE_LOCKS, GLIDE_RETURN_SOURCE, GLIDE_SOURCE, GlidePlayer, RETURN_FADE } from './GlidePlayer';
import { GLIDE_LANES, GLIDE_RULES, type GlideLane } from './lanes';

const DT = 1 / 60;
const lane = (id: string): GlideLane => GLIDE_LANES.find((l) => l.site.id === id)!;
const AERIE = lane('summit-aerie');

/** A fake player that moves along the forced move and the launched vertical speed over a flat floor at `floor`. */
function harness(opts: { open?: boolean; mode?: MovementMode; floor?: number; mounted?: boolean } = {}) {
  const s = {
    feet: { x: 0, y: 0, z: 0 } as Vec3Like,
    vy: 0,
    floor: opts.floor ?? 0,
    grounded: true,
    ctrl: 'walk' as 'walk' | 'glide',
    sink: undefined as number | undefined,
    forced: null as { x: number; z: number; speed: number } | null,
    steer: 0,
    mode: opts.mode ?? ('walk' as MovementMode),
    safe: null as { position: Vec3Like; yaw: number } | null,
    mods: new Map<string, MoveModifier>(),
    open: opts.open ?? true,
    busy: false,
    dead: false,
    mounted: opts.mounted ?? false,
    fades: [] as [number, number][],
    toasts: [] as string[],
    launched: null as number | null,
  };
  const events: [string, unknown][] = [];
  const ports = {
    feet: () => s.feet,
    grounded: () => s.grounded,
    groundAt: () => s.floor,
    launch: (vy: number) => (s.launched = vy),
    setControllerMode: (m: 'walk' | 'glide', sink?: number) => {
      s.ctrl = m;
      s.sink = sink;
    },
    setForcedMove: (m: { x: number; z: number; speed: number } | null) => (s.forced = m),
    steer: () => s.steer,
    addModifier: (source: string, mod: MoveModifier) => {
      s.mods.set(source, mod);
      return () => s.mods.delete(source);
    },
    movementMode: () => s.mode,
    setMovementMode: (m: MovementMode, safe?: { position: Vec3Like; yaw: number } | null) => {
      s.mode = m;
      s.safe = safe ?? null;
    },
    teleport: vi.fn((p: Vec3Like) => {
      s.feet = { ...p };
      s.vy = 0;
      // As the real controller: airborne for the tick after a teleport.
      s.grounded = false;
    }),
    fade: (o: number, t: number) => s.fades.push([o, t]),
    isOpen: () => s.open,
    stand: (l: GlideLane) => ({ x: l.site.ledge.x, y: s.floor + 40, z: l.site.ledge.z }),
    busy: () => s.busy,
    dead: () => s.dead,
    mounted: () => s.mounted,
    dismount: vi.fn(() => (s.mounted = false)),
    emit: (type: string, p: unknown) => events.push([type, p]),
    toast: (k: string) => s.toasts.push(k),
  };
  const g = new GlidePlayer(ports as never);
  /** One tick: the glide decides, then the fake body moves like the glide controller. */
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      s.launched = null;
      g.fixedUpdate(DT);
      if (s.mods.get(GLIDE_RETURN_SOURCE)?.freeze) continue;
      if (s.launched !== null) s.vy = s.launched;
      if (s.ctrl === 'glide') s.vy = Math.max(s.vy - GLIDE_GRAVITY * DT, -(s.sink ?? Infinity));
      else s.vy -= GLIDE_GRAVITY * DT;
      const f = s.forced;
      s.feet = { x: s.feet.x + (f ? f.x * f.speed * DT : 0), y: s.feet.y + s.vy * DT, z: s.feet.z + (f ? f.z * f.speed * DT : 0) };
      s.grounded = s.feet.y <= s.floor;
      if (s.grounded) {
        s.feet.y = s.floor;
        s.vy = 0;
      }
    }
  };
  const names = () => events.map((e) => e[0]);
  return { s, g, ports, events, names, tick };
}

/** Launch from the Aerie ledge (stand 40 m over the floor) and leave the ground. */
function airborne(h = harness()) {
  expect(h.g.launch('summit-aerie')).toBeNull();
  h.s.grounded = false;
  h.tick();
  expect(h.g.state).toBe('gliding');
  return h;
}

describe('launch', () => {
  it('places the player on the stand, sets glide mode with the stand as the safe point, and locks the actions', () => {
    const h = harness({ mounted: true });
    expect(h.g.launch('summit-aerie')).toBeNull();
    expect(h.ports.dismount).toHaveBeenCalled();
    expect(h.ports.teleport).toHaveBeenCalledWith({ x: AERIE.site.ledge.x, y: 40, z: AERIE.site.ledge.z }, expect.any(Number));
    expect(h.s.mode).toBe('glide');
    expect(h.s.safe).toEqual({ position: { x: AERIE.site.ledge.x, y: 40, z: AERIE.site.ledge.z }, yaw: AERIE.def.heading });
    expect(h.s.ctrl).toBe('glide');
    expect(h.s.sink).toBe(GLIDE_TUNING.sinkRate);
    expect(h.s.mods.get(GLIDE_SOURCE)?.lockActions).toEqual(GLIDE_LOCKS);
    expect(GLIDE_LOCKS).not.toContain('interact');
    expect(h.events).toEqual([['glide.started', { ledgeId: 'glide.summit-aerie' }]]);
    expect(h.g.state).toBe('launching');
    expect(h.g.catchArmed).toBe(true);
  });

  it('accepts the def id too', () => {
    expect(harness().g.launch('glide.summit-aerie')).toBeNull();
  });

  it.each([
    ['closed', { open: false }, 'glide.refused.closed'],
    ['mode', { mode: 'haul' as MovementMode }, 'glide.refused.mode'],
  ])('refuses when %s, with a toast, changing nothing', (why, o, key) => {
    const h = harness(o);
    expect(h.g.launch('summit-aerie')).toBe(why);
    expect(h.s.toasts).toEqual([key]);
    expect(h.ports.teleport).not.toHaveBeenCalled();
    expect(h.events).toEqual([]);
    expect(h.g.catchArmed).toBe(false);
  });

  it('refuses while busy, while gliding, and an unknown ledge without a toast', () => {
    const h = harness();
    h.s.busy = true;
    expect(h.g.launch('summit-aerie')).toBe('busy');
    h.s.busy = false;
    expect(h.g.launch('nowhere')).toBe('unknown');
    expect(h.s.toasts).toEqual(['glide.refused.busy']);
    h.g.launch('summit-aerie');
    expect(h.g.launch('summit-skyhold')).toBe('busy');
  });

  it('a launch that never leaves the ground is cancelled after the timeout', () => {
    const h = harness({ floor: 0 });
    h.g.launch('summit-aerie');
    // A flat stand at the floor: right after the teleport the controller reports airborne, but the feet are on it.
    h.s.feet = { ...h.s.feet, y: 0 };
    h.tick();
    expect(h.g.state).toBe('launching');
    h.tick(Math.ceil(GLIDE_RULES.launchTimeout / DT) + 2);
    expect(h.names()).toEqual(['glide.started', 'glide.ended']);
    expect(h.events.at(-1)![1]).toEqual({ reason: 'cancelled' });
    expect(h.s.mode).toBe('walk');
    expect(h.s.ctrl).toBe('walk');
    expect(h.s.forced).toBeNull();
    expect(h.s.mods.has(GLIDE_SOURCE)).toBe(false);
    expect(h.g.catchArmed).toBe(false);
  });
});

describe('flight', () => {
  it('flies forward at 10 m/s along the yaw and sinks at the sink rate', () => {
    const h = airborne();
    h.tick(60);
    expect(h.s.forced!.speed).toBe(GLIDE_TUNING.forwardSpeed);
    expect(h.s.forced!.x).toBeCloseTo(-Math.sin(AERIE.def.heading), 9);
    expect(h.s.forced!.z).toBeCloseTo(-Math.cos(AERIE.def.heading), 9);
    expect(h.s.vy).toBeCloseTo(-GLIDE_TUNING.sinkRate, 6);
    expect(h.g.heightAboveGround).toBeGreaterThan(30);
  });

  it('A and D turn the yaw, clamped to the lane at both edges', () => {
    const h = airborne();
    h.s.steer = 1;
    h.tick(15);
    expect(h.g.yaw).toBeCloseTo(AERIE.def.heading - GLIDE_RULES.turnRate * 0.25, 2);
    h.tick(300);
    expect(h.g.yaw).toBeCloseTo(AERIE.def.heading - AERIE.def.laneHalfAngle, 9);
    h.s.steer = -1;
    h.tick(600);
    expect(h.g.yaw).toBeCloseTo(AERIE.def.heading + AERIE.def.laneHalfAngle, 9);
  });

  it('lift sets the vertical speed to the sink plus the lift, capped, through launch', () => {
    // A thermal under the Aerie lip: the chasm column is 160 m round at (14958, 300, 15939); start in it.
    const h = harness({ floor: 0 });
    h.g.launch('summit-aerie');
    h.s.feet = { x: 14958, y: 400, z: 15939 };
    h.s.grounded = false;
    h.tick();
    expect(h.g.lift).toBe(6);
    expect(h.s.launched).toBeCloseTo(Math.min(GLIDE_RULES.maxClimb, 6 - GLIDE_TUNING.sinkRate) + GLIDE_GRAVITY * DT, 9);
    h.tick();
    expect(h.s.vy).toBeCloseTo(6 - GLIDE_TUNING.sinkRate, 6);
  });
});

describe('endings', () => {
  it('landed: glide.landed then glide.ended, everything restored, catch disarmed', () => {
    const h = airborne(harness({ floor: 0 }));
    h.tick(60 * 20);
    expect(h.names()).toEqual(['glide.started', 'glide.landed', 'glide.ended']);
    expect(h.events[2]![1]).toEqual({ reason: 'landed' });
    expect(h.s.mode).toBe('walk');
    expect(h.s.ctrl).toBe('walk');
    expect(h.s.forced).toBeNull();
    expect(h.s.mods.size).toBe(0);
    expect(h.g.catchArmed).toBe(false);
    expect(h.g.state).toBe('idle');
  });

  it('let go: cancelled, and the fall stays armed for the catch', () => {
    const h = airborne();
    h.g.letGo();
    expect(h.events.at(-1)).toEqual(['glide.ended', { reason: 'cancelled' }]);
    expect(h.s.mode).toBe('walk');
    expect(h.g.catchArmed).toBe(true);
  });

  it('a hit ends the glide into a fall; a hit when idle does nothing', () => {
    const h = airborne();
    h.g.onHit();
    expect(h.events.at(-1)).toEqual(['glide.ended', { reason: 'hit' }]);
    const n = h.events.length;
    h.g.onHit();
    expect(h.events.length).toBe(n);
  });

  it('a core containment push ends it as contained and returns the player to the stand', () => {
    const h = airborne();
    h.g.onContained();
    expect(h.events.at(-1)).toEqual(['glide.ended', { reason: 'contained' }]);
    expect(h.s.fades.at(-1)).toEqual([1, RETURN_FADE.out]);
    expect(h.s.mods.get(GLIDE_RETURN_SOURCE)?.freeze).toBe(true);
    h.ports.teleport.mockClear();
    h.tick(Math.ceil(RETURN_FADE.out / DT) + 1);
    expect(h.ports.teleport).toHaveBeenCalledWith({ x: AERIE.site.ledge.x, y: 40, z: AERIE.site.ledge.z }, expect.any(Number));
    expect(h.s.fades.at(-1)).toEqual([0, RETURN_FADE.in]);
    expect(h.s.mods.has(GLIDE_RETURN_SOURCE)).toBe(false);
    expect(h.g.catchArmed).toBe(false);
  });

  it('leaving the lane corridor is contained', () => {
    const h = airborne();
    h.s.feet = { x: AERIE.site.catchBox.x1 + 50, y: 500, z: AERIE.site.ledge.z };
    h.g.expect(h.s.feet);
    h.tick();
    expect(h.events.at(-1)).toEqual(['glide.ended', { reason: 'contained' }]);
  });

  it('passing the z guard is contained', () => {
    const h = airborne();
    const a = AERIE.def.landingAreas[0]!;
    // Inside the landing area (always in the corridor) but past z 16900 would be contained; move the guard check alone.
    h.s.feet = { x: (a.x0 + a.x1) / 2, y: 900, z: GLIDE_RULES.maxZ + 1 };
    h.g.expect(h.s.feet);
    h.tick();
    expect(h.events.at(-1)).toEqual(['glide.ended', { reason: 'contained' }]);
  });

  it("another system's teleport ends it as contained where it put the player (no return)", () => {
    const h = airborne();
    h.s.feet = { x: 0, y: 5, z: 0 };
    h.tick();
    expect(h.events.at(-1)).toEqual(['glide.ended', { reason: 'contained' }]);
    expect(h.s.fades).toEqual([]);
    expect(h.g.catchArmed).toBe(false);
  });

  it('a load drops the glide silently', () => {
    const h = airborne();
    const n = h.events.length;
    h.g.reset();
    expect(h.events.length).toBe(n);
    expect(h.g.state).toBe('idle');
    expect(h.s.ctrl).toBe('walk');
    expect(h.s.forced).toBeNull();
    expect(h.s.mods.size).toBe(0);
    expect(h.g.catchArmed).toBe(false);
  });
});

describe('death', () => {
  it('dying mid-glide ends it and disarms the catch', () => {
    const h = airborne();
    h.s.dead = true;
    h.tick();
    expect(h.events.at(-1)).toEqual(['glide.ended', { reason: 'hit' }]);
    expect(h.g.catchArmed).toBe(false);
    expect(h.s.forced).toBeNull();
  });

  it('a corpse falling after a let-go is never caught', () => {
    const h = airborne(harness({ floor: 0 }));
    h.g.letGo();
    h.s.dead = true;
    h.s.feet = { x: AERIE.site.ledge.x + 300, y: 10, z: AERIE.site.ledge.z };
    h.g.expect(h.s.feet);
    h.tick();
    expect(h.s.fades).toEqual([]);
    expect(h.g.catchArmed).toBe(false);
  });
});

describe('the catch', () => {
  it('never fires over a landing area, even below the floor', () => {
    const h = airborne(harness({ floor: 0 }));
    h.g.letGo();
    const a = AERIE.def.landingAreas[0]!;
    h.s.feet = { x: (a.x0 + a.x1) / 2, y: AERIE.site.catchFloorY - 50, z: (a.z0 + a.z1) / 2 };
    h.g.expect(h.s.feet);
    h.tick();
    expect(h.s.fades).toEqual([]);
  });

  it('a fall below the floor inside the box returns the player to the stand', () => {
    const h = airborne(harness({ floor: 0 }));
    h.g.letGo();
    // The fake floor is 0, under the Aerie catch floor (305): the faller is caught on the way down.
    h.s.feet = { x: AERIE.site.ledge.x + 300, y: AERIE.site.catchFloorY + 2, z: AERIE.site.ledge.z };
    h.g.expect(h.s.feet);
    h.tick(60);
    expect(h.s.fades[0]).toEqual([1, RETURN_FADE.out]);
    expect(h.s.feet.x).toBe(AERIE.site.ledge.x);
    expect(h.g.catchArmed).toBe(false);
  });

  it('the catch is disarmed once the player stands on ground above the floor', () => {
    const h = airborne(harness({ floor: 400 }));
    h.g.letGo();
    h.tick(600);
    expect(h.s.grounded).toBe(true);
    expect(h.g.catchArmed).toBe(false);
    // Later, walking below the floor in the box (a cave) never triggers it.
    h.s.feet = { x: AERIE.site.ledge.x + 300, y: 100, z: AERIE.site.ledge.z };
    h.g.expect(h.s.feet);
    h.tick();
    expect(h.s.fades).toEqual([]);
  });

  it('outside the box nothing is caught', () => {
    const h = airborne(harness({ floor: 0 }));
    h.g.letGo();
    h.s.feet = { x: AERIE.site.catchBox.x1 + 500, y: 10, z: AERIE.site.ledge.z };
    h.g.expect(h.s.feet);
    h.tick();
    expect(h.s.fades).toEqual([]);
  });

  it('no new launch while a return plays', () => {
    const h = airborne();
    h.g.onContained();
    expect(h.g.launch('summit-aerie')).toBe('busy');
  });
});
