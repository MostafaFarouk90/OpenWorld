// Act 2 Step 0: the character controller far from the origin. Rapier runs in float32, so at engine x 22000 (the far
// edge of Cinderreach) a position rounds to about 2 mm, a fifth of the controller's 10 mm skin. Each scenario runs at
// the origin, at Harrowmark and at the far edge, and must behave the same. Results: plans/act2-a0-far-coords.md.
import { beforeEach, describe, expect, it } from 'vitest';
import { CHARACTER_CONTROLLER, PLAYER } from '../config/constants';
import { CharacterController, type MoveIntent } from './CharacterController';
import { PhysicsWorld, type Vec3 } from './PhysicsWorld';
import { flatGround } from './flatGround';

const IDLE: MoveIntent = { moveX: 0, moveZ: 0, sprint: false, jump: false };
const intent = (patch: Partial<MoveIntent>): MoveIntent => ({ ...IDLE, ...patch });

// [name, x, z, y]: Act 3 Step 0 added the Dragonspine far corner at 600 m (the summit's height) and the Greyfen's west edge.
const BASES: [string, number, number, number][] = [
  ['origin', 0, 0, 0],
  ['harrowmark', 8000, 2000, 0],
  ['cinderreach far edge', 22000, 3000, 0],
  ['far corner of the map', 23000, 17000, 0],
  ['dragonspine far corner at 600 m', 16500, 16500, 600],
  ['dragonspine far corner at 790 m (interior float)', 16500, 16500, 790],
  ['greyfen west edge', -400, 15400, 10],
];

let physics: PhysicsWorld;

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
});

describe.each(BASES)('character controller at %s', (_name, bx, bz, by) => {
  const at = (x: number, y: number, z: number): Vec3 => ({ x: bx + x, y: by + y, z: bz + z });
  const local = (c: CharacterController): Vec3 => {
    const f = c.interpolatedFeet(1, { x: 0, y: 0, z: 0 });
    return { x: f.x - bx, y: f.y - by, z: f.z - bz };
  };
  const tick = (c: CharacterController, i: MoveIntent = IDLE) => {
    c.fixedUpdate(i);
    physics.step();
  };
  const ticks = (c: CharacterController, n: number, i: MoveIntent = IDLE) => {
    for (let k = 0; k < n; k++) tick(c, i);
  };
  const ground = () => physics.addHeightfield(flatGround(200, 32, by, bx, bz));
  const box = (c: Vec3, h: Vec3) =>
    physics.addStaticCollider(physics.rapier.ColliderDesc.cuboid(h.x, h.y, h.z).setTranslation(bx + c.x, by + c.y, bz + c.z));
  const ramp = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    const half = { x: 1.5, y: 0.1, z: 4 };
    const lowY = half.y * Math.cos(a) - half.z * Math.sin(a);
    const lowZ = half.y * Math.sin(a) + half.z * Math.cos(a);
    physics.addStaticCollider(
      physics.rapier.ColliderDesc.cuboid(half.x, half.y, half.z)
        .setTranslation(bx, by - lowY, bz - lowZ)
        .setRotation({ x: Math.sin(a / 2), y: 0, z: 0, w: Math.cos(a / 2) }),
    );
  };
  const spawn = (x = 0, z = 0) => {
    const c = new CharacterController(physics, at(x, 0, z));
    ticks(c, 30);
    return c;
  };

  it('settles and holds still over 600 idle ticks (no drift, no sinking)', () => {
    ground();
    const c = spawn();
    expect(c.grounded).toBe(true);
    const s = local(c);
    let maxDrift = 0;
    for (let i = 0; i < 600; i++) {
      tick(c);
      const p = local(c);
      maxDrift = Math.max(maxDrift, Math.hypot(p.x - s.x, p.y - s.y, p.z - s.z));
      expect(c.grounded).toBe(true);
    }
    expect(maxDrift).toBeLessThan(0.005);
  });

  it.each([
    [1, 0],
    [0.7, 0.3],
    [1, 1],
  ])('walks at speed with no stalled tick (%d, %d)', (moveX, moveZ) => {
    ground();
    const c = spawn();
    const expected = (Math.min(1, Math.hypot(moveX, moveZ)) * PLAYER.walkSpeed) / 60;
    let prev = local(c);
    let minY = Infinity;
    for (let i = 0; i < 600; i++) {
      tick(c, intent({ moveX, moveZ }));
      const now = local(c);
      const step = Math.hypot(now.x - prev.x, now.z - prev.z);
      // Float32 rounding at 22 km is about 2 mm against a 75 mm tick: allow 5% either way, never a stall.
      expect(step).toBeGreaterThan(expected * 0.9);
      expect(step).toBeLessThan(expected * 1.05);
      minY = Math.min(minY, now.y);
      prev = now;
    }
    expect(minY).toBeGreaterThan(-0.02);
  });

  it('slides along a wall without stalling', () => {
    ground();
    const c = spawn();
    box({ x: 0, y: 2, z: -1.5 }, { x: 40, y: 2, z: 0.5 });
    physics.step();
    for (let i = 0; i < 30; i++) tick(c, intent({ moveX: 0.7, moveZ: -0.7 }));
    expect(local(c).z).toBeCloseTo(-1 + PLAYER.radius + CHARACTER_CONTROLLER.offset, 1);
    const along = (0.7 * PLAYER.walkSpeed) / 60;
    let prev = local(c);
    const steps: number[] = [];
    for (let i = 0; i < 300; i++) {
      tick(c, intent({ moveX: 0.7, moveZ: -0.7 }));
      const now = local(c);
      steps.push((now.x - prev.x) / along);
      prev = now;
    }
    expect(Math.min(...steps)).toBeGreaterThan(0.7);
    expect(steps.reduce((a, v) => a + v, 0) / steps.length).toBeGreaterThan(0.97);
  });

  it('steps onto a 0.35 m box and is stopped by a 0.6 m one', () => {
    ground();
    box({ x: -5, y: 0.175, z: -5 }, { x: 3, y: 0.175, z: 3 });
    box({ x: 5, y: 0.3, z: -5 }, { x: 3, y: 0.3, z: 3 });
    const low = spawn(-5, 0);
    const high = spawn(5, 0);
    for (let i = 0; i < 90; i++) {
      low.fixedUpdate(intent({ moveZ: -1 }));
      high.fixedUpdate(intent({ moveZ: -1 }));
      physics.step();
    }
    expect(local(low).y).toBeCloseTo(0.35 + 0.01, 1);
    expect(low.grounded).toBe(true);
    expect(local(high).y).toBeLessThan(0.05);
    expect(local(high).z).toBeGreaterThan(-2 + PLAYER.radius - 0.05);
  });

  it('climbs a 40 degree ramp', () => {
    ground();
    ramp(40);
    const c = spawn(0, 2);
    ticks(c, 60, intent({ moveZ: -1 }));
    expect(local(c).y).toBeGreaterThan(0.8);
    expect(c.grounded).toBe(true);
  });

  it('is blocked by a 55 degree ramp', () => {
    ground();
    ramp(55);
    const c = spawn(0, 2);
    ticks(c, 90, intent({ moveZ: -1 }));
    expect(local(c).y).toBeLessThan(0.15);
  });

  it('jumps to the usual apex and lands grounded', () => {
    ground();
    const c = spawn();
    const base = local(c).y;
    tick(c, intent({ jump: true }));
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      tick(c);
      peak = Math.max(peak, local(c).y - base);
      if (i > 5 && c.grounded) break;
    }
    const expected = (PLAYER.jumpSpeed * PLAYER.jumpSpeed) / (2 * PLAYER.gravity);
    expect(peak).toBeGreaterThan(expected * 0.9);
    expect(peak).toBeLessThan(expected * 1.1);
    expect(c.grounded).toBe(true);
  });
});
