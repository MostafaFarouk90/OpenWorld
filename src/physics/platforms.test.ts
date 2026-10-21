import { beforeEach, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP, PLAYER } from '../config/constants';
import { CharacterController, type MoveIntent } from './CharacterController';
import { PhysicsWorld, type Vec3 } from './PhysicsWorld';
import { flatGround } from './flatGround';
import { Platforms, type PlatformPath } from './platforms';

const IDLE: MoveIntent = { moveX: 0, moveZ: 0, sprint: false, jump: false };
const intent = (patch: Partial<MoveIntent>): MoveIntent => ({ ...IDLE, ...patch });
const DT = FIXED_TIMESTEP;

let physics: PhysicsWorld;
let arrivals: Array<[string, number]>;
let platforms: Platforms;

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  arrivals = [];
  platforms = new Platforms({ onArrived: (id, stop) => arrivals.push([id, stop]) });
});

function box(centre: Vec3, half: Vec3) {
  const body = physics.world.createRigidBody(
    physics.rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(centre.x, centre.y, centre.z),
  );
  physics.world.createCollider(physics.rapier.ColliderDesc.cuboid(half.x, half.y, half.z), body);
  return body;
}

function staticBox(centre: Vec3, half: Vec3): void {
  physics.addStaticCollider(
    physics.rapier.ColliderDesc.cuboid(half.x, half.y, half.z).setTranslation(centre.x, centre.y, centre.z),
  );
}

function tick(c?: CharacterController, i: MoveIntent = IDLE): void {
  platforms.fixedUpdate(DT);
  c?.fixedUpdate(i);
  physics.step();
}

function ticks(n: number, c?: CharacterController, i: MoveIntent = IDLE): void {
  for (let k = 0; k < n; k++) tick(c, i);
}

const feet = (c: CharacterController): Vec3 => c.interpolatedFeet(1, { x: 0, y: 0, z: 0 });

const path = (stops: Vec3[], speed = 2, wait = 0): PlatformPath => ({ stops, speed, wait });
const A = { x: 0, y: 0, z: 0 };
const B = { x: 0, y: 2, z: 0 };

describe('Platforms registration', () => {
  it('throws on a duplicate id', () => {
    platforms.register('p', box(A, { x: 1, y: 0.1, z: 1 }), path([A, B]));
    expect(() => platforms.register('p', box(A, { x: 1, y: 0.1, z: 1 }), path([A, B]))).toThrow();
  });

  it('throws on bad paths', () => {
    const b = box(A, { x: 1, y: 0.1, z: 1 });
    expect(() => platforms.register('a', b, path([A]))).toThrow();
    expect(() => platforms.register('b', b, path([A, B], 0))).toThrow();
    expect(() => platforms.register('c', b, path([A, B], -1))).toThrow();
    expect(() => platforms.register('d', b, path([A, B], 1, -1))).toThrow();
  });

  it('undo unregisters', () => {
    const b = box(A, { x: 1, y: 0.1, z: 1 });
    const undo = platforms.register('p', b, path([A, B]));
    expect(platforms.lastStop('p')).toBe(0);
    undo();
    expect(platforms.lastStop('p')).toBeUndefined();
    expect(platforms.delta(b)).toEqual({ x: 0, y: 0, z: 0 });
    expect(() => platforms.register('p', b, path([A, B]))).not.toThrow();
  });
});

describe('Platforms movement', () => {
  it('visits each stop in order, looping, honouring waits', () => {
    const b = box(A, { x: 1, y: 0.1, z: 1 });
    platforms.register('p', b, path([A, B, { x: 4, y: 2, z: 0 }], 2, 1));
    let t = 0;
    const times: number[] = [];
    let seen = 0;
    for (let i = 0; i < 60 * 12 && arrivals.length < 4; i++) {
      tick();
      t += DT;
      if (arrivals.length > seen) {
        seen = arrivals.length;
        times.push(t);
      }
    }
    expect(arrivals.map((a) => a[1])).toEqual([1, 2, 0, 1]);
    expect(arrivals.every((a) => a[0] === 'p')).toBe(true);
    // 1 s start wait + 1 s travel; then 1 s wait + 2 s travel; then 1 s wait + sqrt(20)/2 s travel.
    expect(times[0]).toBeCloseTo(2, 1);
    expect(times[1]).toBeCloseTo(5, 1);
    expect(times[2]).toBeCloseTo(5 + 1 + Math.hypot(4, 2) / 2, 1);
    expect(platforms.lastStop('p')).toBe(1);
  });

  it('reports the frame delta and zero while waiting', () => {
    const b = box(A, { x: 1, y: 0.1, z: 1 });
    platforms.register('p', b, path([A, B], 3, 0));
    tick();
    expect(platforms.delta(b).y).toBeCloseTo(3 * DT, 6);
    expect(platforms.delta(b.collider(0)).y).toBeCloseTo(3 * DT, 6);
    expect(platforms.isPlatformCollider(b.collider(0))).toBe(true);
    const other = box({ x: 9, y: 0, z: 9 }, { x: 1, y: 1, z: 1 });
    expect(platforms.isPlatformCollider(other.collider(0))).toBe(false);
    expect(platforms.delta(other.collider(0))).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('Platforms persistence', () => {
  it('round trips serialize/load', () => {
    const b = box(A, { x: 1, y: 0.1, z: 1 });
    platforms.register('p', b, path([A, B, { x: 4, y: 2, z: 0 }], 5, 0));
    for (let i = 0; i < 120 && platforms.lastStop('p') !== 2; i++) tick();
    const saved = platforms.serialize();
    expect(saved).toEqual({ p: 2 });

    const fresh = new Platforms();
    const b2 = box(A, { x: 1, y: 0.1, z: 1 });
    fresh.register('p', b2, path([A, B, { x: 4, y: 2, z: 0 }], 5, 0));
    fresh.load(saved);
    expect(fresh.lastStop('p')).toBe(2);
    expect(b2.translation().x).toBeCloseTo(4, 5);
  });

  it('applies a load that came before registration, and keeps it in serialize', () => {
    platforms.load({ p: 1, junk: 'x', neg: -1 });
    expect(platforms.serialize()).toEqual({ p: 1 });
    const b = box(A, { x: 1, y: 0.1, z: 1 });
    platforms.register('p', b, path([A, B]));
    expect(platforms.lastStop('p')).toBe(1);
    expect(b.translation().y).toBeCloseTo(2, 5);
    expect(platforms.standingPoint('p')).toEqual({ x: 0, y: expect.closeTo(2.1, 5), z: 0 });
  });
});

describe('CharacterController on platforms', () => {
  it('carries the player up a lift and stays grounded', () => {
    physics.addHeightfield(flatGround(200));
    const lift = box({ x: 0, y: 0.75, z: 0 }, { x: 2, y: 0.25, z: 2 }); // top at y = 1
    platforms.register('lift', lift, path([{ x: 0, y: 0.75, z: 0 }, { x: 0, y: 5.75, z: 0 }], 2, 1));
    const c = new CharacterController(physics, { x: 0, y: 1, z: 0 });
    c.setPlatformSource((col) => platforms.delta(col));
    ticks(20, c);
    expect(c.grounded).toBe(true);
    let airTicks = 0;
    for (let i = 0; i < 60 * 3.6; i++) {
      tick(c);
      if (!c.grounded) airTicks++;
    }
    expect(platforms.lastStop('lift')).toBe(1);
    ticks(30, c);
    expect(feet(c).y).toBeGreaterThan(6 - 0.2);
    expect(feet(c).y).toBeLessThan(6 + 0.2);
    expect(c.grounded).toBe(true);
    expect(airTicks).toBeLessThan(10);
  });

  it('carries the player sideways', () => {
    physics.addHeightfield(flatGround(200));
    const slab = box({ x: 0, y: 1.25, z: 0 }, { x: 2, y: 0.25, z: 2 }); // top at y = 1.5
    platforms.register('slab', slab, path([{ x: 0, y: 1.25, z: 0 }, { x: 6, y: 1.25, z: 0 }], 3, 0));
    const c = new CharacterController(physics, { x: 0, y: 1.5, z: 0 });
    c.setPlatformSource((col) => platforms.delta(col));
    ticks(20, c);
    expect(feet(c).y).toBeGreaterThan(1.45);
    const lag = () => slab.translation().x - feet(c).x;
    const lag0 = lag();
    ticks(30, c);
    // Rides along: the offset stays put instead of growing.
    expect(Math.abs(lag() - lag0)).toBeLessThan(0.05);
    expect(Math.abs(lag())).toBeLessThan(0.3);
    expect(feet(c).x).toBeGreaterThan(2);
    expect(c.grounded).toBe(true);
    expect(c.groundCollider()).toBe(slab.collider(0));
    expect(platforms.idOf(c.groundCollider()!)).toBe('slab');
  });
});

describe('CharacterController wall contact', () => {
  function settled(at: Vec3): CharacterController {
    physics.addHeightfield(flatGround(200));
    const c = new CharacterController(physics, at);
    ticks(30, c);
    return c;
  }

  it('is non-null beside a box with a horizontal normal, null in the open', () => {
    const c = settled({ x: 0, y: 0, z: 0 });
    expect(c.wallContact()).toBeNull();
    staticBox({ x: 0, y: 2, z: -2.5 }, { x: 5, y: 2, z: 0.5 }); // face at z = -2
    physics.step();
    c.fixedUpdate(IDLE);
    ticks(60, c, intent({ moveZ: -1 }));
    const wall = c.wallContact();
    expect(wall).not.toBeNull();
    expect(Math.abs(wall!.normal.y)).toBeLessThan(0.3);
    expect(wall!.normal.z).toBeGreaterThan(0.9);
  });

  it('wallSlide caps the fall speed at a wall only', () => {
    physics.addHeightfield(flatGround(200));
    staticBox({ x: 0, y: 20, z: -2.5 }, { x: 5, y: 20, z: 0.5 });
    const c = new CharacterController(physics, { x: 0, y: 30, z: -1.4 });
    const fallRate = (slide: boolean): number => {
      const y0 = feet(c).y;
      for (let i = 0; i < 20; i++) {
        if (slide) c.wallSlide(2);
        tick(c, intent({ moveZ: -1 }));
      }
      return (y0 - feet(c).y) / (20 * DT);
    };
    ticks(40, c, intent({ moveZ: -1 }));
    expect(c.wallContact()).not.toBeNull();
    expect(c.grounded).toBe(false);
    expect(fallRate(true)).toBeLessThan(2.1);
    expect(fallRate(false)).toBeGreaterThan(2.5);

    // Away from the wall the request does nothing.
    const free = new CharacterController(physics, { x: 30, y: 60, z: 30 });
    ticks(30, free);
    expect(free.wallContact()).toBeNull();
    const y0 = feet(free).y;
    for (let i = 0; i < 10; i++) {
      free.wallSlide(2);
      tick(free);
    }
    expect((y0 - feet(free).y) / (10 * DT)).toBeGreaterThan(5);
  });
});

describe('CharacterController air jumps', () => {
  function airborne(airJumps: number): CharacterController {
    physics.addHeightfield(flatGround(200));
    const c = new CharacterController(physics, A);
    c.airJumps = airJumps;
    ticks(30, c);
    tick(c, intent({ jump: true }));
    ticks(10, c);
    expect(c.grounded).toBe(false);
    return c;
  }

  function vy(c: CharacterController, i: MoveIntent): number {
    const y0 = feet(c).y;
    tick(c, i);
    return (feet(c).y - y0) / DT;
  }

  it('airJumps = 1 allows exactly one extra jump', () => {
    const c = airborne(1);
    expect(vy(c, intent({ jump: true }))).toBeGreaterThan(PLAYER.jumpSpeed - 1);
    ticks(5, c);
    expect(vy(c, intent({ jump: false }))).toBeLessThan(PLAYER.jumpSpeed - 1);
    tick(c); // release edge
    const before = vy(c, IDLE);
    expect(vy(c, intent({ jump: true }))).toBeLessThan(before + 1);
  });

  it('a held jump does not consume the air jump', () => {
    const c = airborne(1);
    // jump was released after the ground jump; holding across many ticks uses it once only
    expect(vy(c, intent({ jump: true }))).toBeGreaterThan(PLAYER.jumpSpeed - 1);
    for (let i = 0; i < 5; i++) vy(c, intent({ jump: true }));
    expect(vy(c, intent({ jump: true }))).toBeLessThan(PLAYER.jumpSpeed - 1);
  });

  it('resets after landing', () => {
    const c = airborne(1);
    tick(c, intent({ jump: true }));
    for (let i = 0; i < 200 && !c.grounded; i++) tick(c);
    expect(c.grounded).toBe(true);
    ticks(5, c);
    tick(c, intent({ jump: true }));
    ticks(10, c);
    expect(c.grounded).toBe(false);
    expect(vy(c, intent({ jump: true }))).toBeGreaterThan(PLAYER.jumpSpeed - 1);
  });

  it('default airJumps = 0 gives no air jump', () => {
    const c = airborne(0);
    expect(c.airJumps).toBe(0);
    expect(vy(c, intent({ jump: true }))).toBeLessThan(PLAYER.jumpSpeed - 1);
  });
});
