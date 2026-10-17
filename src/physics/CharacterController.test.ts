import type RAPIER from '@dimforge/rapier3d';
import { beforeEach, describe, expect, it } from 'vitest';
import { CHARACTER_CONTROLLER, FIXED_TIMESTEP, PLAYER } from '../config/constants';
import { CharacterController, type MoveIntent } from './CharacterController';
import { PhysicsWorld, type Vec3 } from './PhysicsWorld';
import { flatGround } from './flatGround';

const IDLE: MoveIntent = { moveX: 0, moveZ: 0, sprint: false, jump: false };
const intent = (patch: Partial<MoveIntent>): MoveIntent => ({ ...IDLE, ...patch });
const GROUND_SKIN = 0.01;

let physics: PhysicsWorld;

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
});

function addGround(): void {
  physics.addHeightfield(flatGround(200));
}

function addBox(centre: Vec3, half: Vec3): void {
  physics.addStaticCollider(
    physics.rapier.ColliderDesc.cuboid(half.x, half.y, half.z).setTranslation(centre.x, centre.y, centre.z),
  );
}

/** Mirrors DebugScene.ramp: slab tilted about X rising towards -Z, low top edge flush with y = 0 at z = at.z. */
function addRamp(at: { x: number; z: number }, deg: number): void {
  const angle = (deg * Math.PI) / 180;
  const half = { x: 1.5, y: 0.1, z: 4 };
  const rotation = { x: Math.sin(angle / 2), y: 0, z: 0, w: Math.cos(angle / 2) };
  // (0, half.y, half.z) rotated about X by angle.
  const lowY = half.y * Math.cos(angle) - half.z * Math.sin(angle);
  const lowZ = half.y * Math.sin(angle) + half.z * Math.cos(angle);
  physics.addStaticCollider(
    physics.rapier.ColliderDesc.cuboid(half.x, half.y, half.z)
      .setTranslation(at.x, -lowY, at.z - lowZ)
      .setRotation(rotation),
  );
}

function tick(c: CharacterController, i: MoveIntent = IDLE): void {
  c.fixedUpdate(i);
  physics.step();
}

function ticks(c: CharacterController, n: number, i: MoveIntent = IDLE): void {
  for (let k = 0; k < n; k++) tick(c, i);
}

function feet(c: CharacterController): Vec3 {
  return c.interpolatedFeet(1, { x: 0, y: 0, z: 0 });
}

function spawnOnGround(at: Vec3 = { x: 0, y: 0, z: 0 }): CharacterController {
  addGround();
  const c = new CharacterController(physics, at);
  ticks(c, 30);
  return c;
}

function rapierController(c: CharacterController): RAPIER.KinematicCharacterController {
  return (c as unknown as { controller: RAPIER.KinematicCharacterController }).controller;
}

describe('CharacterController configuration', () => {
  it('applies every spec constant to the Rapier controller', () => {
    addGround();
    const c = new CharacterController(physics, { x: 0, y: 0, z: 0 });
    const rc = rapierController(c);
    const k = CHARACTER_CONTROLLER;
    expect(rc.offset()).toBeCloseTo(k.offset, 6);
    expect(rc.maxSlopeClimbAngle()).toBeCloseTo(k.maxSlopeClimbAngle, 5);
    expect(rc.minSlopeSlideAngle()).toBeCloseTo(k.minSlopeSlideAngle, 5);
    expect(rc.snapToGroundEnabled()).toBe(true);
    expect(rc.snapToGroundDistance()).toBeCloseTo(k.snapToGround, 6);
    expect(rc.autostepEnabled()).toBe(true);
    expect(rc.autostepMaxHeight()).toBeCloseTo(k.autoStep.maxHeight, 6);
    expect(rc.autostepMinWidth()).toBeCloseTo(k.autoStep.minWidth, 6);
    expect(rc.autostepIncludesDynamicBodies()).toBe(k.autoStep.includeDynamicBodies);
    expect(rc.slideEnabled()).toBe(true);
    const up = rc.up();
    expect(up.x).toBeCloseTo(0);
    expect(up.y).toBeCloseTo(1);
    expect(up.z).toBeCloseTo(0);
  });
});

describe('CharacterController ground contact', () => {
  it('settles on the ground within 30 idle ticks and is grounded', () => {
    addGround();
    const c = new CharacterController(physics, { x: 0, y: 0, z: 0 });
    ticks(c, 30);
    expect(c.grounded).toBe(true);
    expect(feet(c).y).toBeGreaterThan(-0.005);
    expect(feet(c).y).toBeLessThan(GROUND_SKIN + 0.02);
  });

  it('does not sink or leave the ground over 300 idle ticks', () => {
    const c = spawnOnGround();
    const y0 = feet(c).y;
    for (let i = 0; i < 300; i++) {
      tick(c);
      expect(feet(c).y).toBeGreaterThan(y0 - 0.01);
    }
    expect(c.grounded).toBe(true);
    expect(feet(c).y).toBeCloseTo(y0, 2);
  });

  it('falls when there is no ground and is not grounded', () => {
    const c = new CharacterController(physics, { x: 0, y: 10, z: 0 });
    ticks(c, 10);
    expect(c.grounded).toBe(false);
    expect(feet(c).y).toBeLessThan(10);
  });
});

describe('CharacterController horizontal movement', () => {
  function travelled(i: MoveIntent, n = 60): number {
    const c = spawnOnGround();
    const start = feet(c);
    ticks(c, n, i);
    const end = feet(c);
    return Math.hypot(end.x - start.x, end.z - start.z);
  }

  it('walks at walkSpeed', () => {
    expect(travelled(intent({ moveZ: -1 }))).toBeCloseTo(PLAYER.walkSpeed, 2);
  });

  it('sprints at sprintSpeed', () => {
    expect(travelled(intent({ moveZ: -1, sprint: true }))).toBeCloseTo(PLAYER.sprintSpeed, 2);
  });

  // Regression: when the capsule drifted inside the offset skin, Rapier dropped a whole tick's move.
  it.each([
    [1, 0],
    [0, -1],
    [0.7, 0.3],
    [1, 1],
  ])('never stalls a tick while walking on flat ground (%d, %d)', (moveX, moveZ) => {
    const c = spawnOnGround();
    const expected = (Math.min(1, Math.hypot(moveX, moveZ)) * PLAYER.walkSpeed) / 60;
    let prev = feet(c);
    for (let i = 0; i < 600; i++) {
      tick(c, intent({ moveX, moveZ }));
      const now = feet(c);
      // Sliding along the floor can shave a percent or two off a tick; a stall would lose all of it.
      const step = Math.hypot(now.x - prev.x, now.z - prev.z);
      expect(step).toBeGreaterThan(expected * 0.9);
      expect(step).toBeLessThan(expected * 1.01);
      prev = now;
    }
  });

  // Regression: sliding along a wall, Rapier reported wall + floor hits inside the skin and dropped the move.
  it('never stalls a tick while sliding along a wall', () => {
    const c = spawnOnGround();
    addBox({ x: 0, y: 2, z: -1.5 }, { x: 40, y: 2, z: 0.5 }); // face at z = -1
    physics.step();
    const along = (0.7 * PLAYER.walkSpeed) / 60;
    for (let i = 0; i < 30; i++) tick(c, intent({ moveX: 0.7, moveZ: -0.7 }));
    expect(feet(c).z).toBeCloseTo(-1 + PLAYER.radius + CHARACTER_CONTROLLER.offset, 1);
    let prev = feet(c);
    const steps: number[] = [];
    for (let i = 0; i < 600; i++) {
      tick(c, intent({ moveX: 0.7, moveZ: -0.7 }));
      const now = feet(c);
      steps.push((now.x - prev.x) / along);
      prev = now;
    }
    // No stalls (Rapier's own slide can shave ~20% off a tick against the wall), and full speed overall.
    expect(Math.min(...steps)).toBeGreaterThan(0.7);
    expect(steps.reduce((a, v) => a + v, 0) / steps.length).toBeGreaterThan(0.97);
  });

  it('clamps diagonal input to unit length (horizontal speed)', () => {
    const straight = travelled(intent({ moveX: 1 }));
    const diagonal = travelled(intent({ moveX: 1, moveZ: 1 }));
    expect(diagonal).toBeCloseTo(straight, 0);
    expect(diagonal).toBeLessThan(PLAYER.walkSpeed * 1.01);
  });

  // Regression: on one huge ground cuboid, Rapier lost contact along its diagonal and the character
  // sank through. The ground is now a flat heightfield (flatGround); every diagonal must hold.
  it.each([
    [1, 1],
    [0.5, 0.5],
    [-0.5, 0.5],
    [-1, -1],
  ])('stays on the ground while walking diagonally (%d, %d)', (moveX, moveZ) => {
    const c = spawnOnGround();
    let minY = Infinity;
    for (let i = 0; i < 300; i++) {
      tick(c, intent({ moveX, moveZ }));
      minY = Math.min(minY, feet(c).y);
    }
    expect(minY).toBeGreaterThan(-0.02);
    expect(c.grounded).toBe(true);
  });

  it('scales small input proportionally', () => {
    const full = travelled(intent({ moveX: 1 }));
    expect(travelled(intent({ moveX: 0.5 }))).toBeCloseTo(full / 2, 2);
  });

  it('does not move on idle input', () => {
    const c = spawnOnGround();
    const s = feet(c);
    ticks(c, 60);
    expect(Math.hypot(feet(c).x - s.x, feet(c).z - s.z)).toBeLessThan(1e-3);
  });
});

describe('CharacterController jumping', () => {
  const expectedPeak = (PLAYER.jumpSpeed * PLAYER.jumpSpeed) / (2 * PLAYER.gravity);

  function jumpOnce(holdJump: boolean): { peak: number; landed: boolean; c: CharacterController } {
    const c = spawnOnGround();
    const base = feet(c).y;
    let peak = 0;
    tick(c, intent({ jump: true }));
    for (let i = 0; i < 120; i++) {
      tick(c, intent({ jump: holdJump }));
      peak = Math.max(peak, feet(c).y - base);
      if (i > 5 && c.grounded) break;
    }
    return { peak, landed: c.grounded, c };
  }

  it('peaks near jumpSpeed^2 / (2 gravity), lands, and is grounded again', () => {
    const { peak, landed, c } = jumpOnce(false);
    expect(peak).toBeGreaterThan(expectedPeak * 0.9);
    expect(peak).toBeLessThan(expectedPeak * 1.1);
    expect(landed).toBe(true);
    expect(feet(c).y).toBeLessThan(GROUND_SKIN + 0.03);
  });

  it('leaves the ground after the jump tick', () => {
    const c = spawnOnGround();
    const base = feet(c).y;
    ticks(c, 3, intent({ jump: true }));
    expect(feet(c).y).toBeGreaterThan(base + 0.1);
    expect(c.grounded).toBe(false);
  });

  it('does not double-jump when jump is held while airborne', () => {
    const single = jumpOnce(false).peak;
    const held = jumpOnce(true);
    expect(held.peak).toBeLessThanOrEqual(single + 0.005);
  });

  it('ignores jump while falling in mid-air', () => {
    addGround();
    const jumper = new CharacterController(physics, { x: -10, y: 5, z: 0 });
    const faller = new CharacterController(physics, { x: 10, y: 5, z: 0 });
    for (let i = 0; i < 20; i++) {
      jumper.fixedUpdate(intent({ jump: true }));
      faller.fixedUpdate(IDLE);
      physics.step();
    }
    expect(feet(jumper).y).toBeCloseTo(feet(faller).y, 5);
    expect(feet(jumper).y).toBeLessThan(5);
  });

  it('ignores jump after walking off a ledge', () => {
    addGround();
    addBox({ x: 0, y: 0.5, z: -3 }, { x: 3, y: 0.5, z: 3 }); // 1 m high block, z in [-6, 0]
    const c = new CharacterController(physics, { x: 0, y: 1, z: -3 });
    ticks(c, 20);
    expect(c.grounded).toBe(true);
    // Walk until clearly off the edge and falling, without pressing jump.
    for (let i = 0; i < 120 && !(feet(c).z > 0.3 && feet(c).y < 0.9 && !c.grounded); i++) {
      tick(c, intent({ moveZ: 1 }));
    }
    expect(c.grounded).toBe(false);
    expect(feet(c).y).toBeLessThan(0.9);
    // Holding jump while in the air must not add upward velocity.
    let prevY = feet(c).y;
    for (let i = 0; i < 20 && !c.grounded; i++) {
      tick(c, intent({ moveZ: 1, jump: true }));
      expect(feet(c).y).toBeLessThanOrEqual(prevY + 1e-4);
      prevY = feet(c).y;
    }
  });
});

describe('CharacterController ceiling', () => {
  it('is stopped by a low ceiling and starts falling immediately', () => {
    addGround();
    addBox({ x: 0, y: 2.7, z: 0 }, { x: 5, y: 0.5, z: 5 }); // underside at 2.2 m
    const c = new CharacterController(physics, { x: 0, y: 0, z: 0 });
    ticks(c, 30);
    const maxFeet = 2.2 - 2 * (PLAYER.halfHeight + PLAYER.radius) + 0.05;
    tick(c, intent({ jump: true }));
    let peakIdx = 0;
    let peak = -Infinity;
    const ys: number[] = [];
    for (let i = 0; i < 60; i++) {
      tick(c);
      const y = feet(c).y;
      ys.push(y);
      expect(y).toBeLessThanOrEqual(maxFeet);
      if (y > peak + 1e-9) {
        peak = y;
        peakIdx = i;
      }
    }
    expect(peak).toBeGreaterThan(0.2);
    // Peak is reached at the contact and the character descends within a few ticks, not glued to the ceiling.
    expect(ys[peakIdx + 4]).toBeLessThan(peak - 0.01);
    expect(c.grounded).toBe(true);
  });
});

describe('CharacterController terminal velocity', () => {
  it('never falls faster than maxFallSpeed and reaches it', () => {
    const c = new CharacterController(physics, { x: 0, y: 500, z: 0 });
    let prev = feet(c).y;
    let maxStep = 0;
    for (let i = 0; i < 400; i++) {
      tick(c);
      const y = feet(c).y;
      maxStep = Math.max(maxStep, prev - y);
      expect(prev - y).toBeLessThanOrEqual(PLAYER.maxFallSpeed * FIXED_TIMESTEP + 1e-4);
      prev = y;
    }
    expect(maxStep).toBeGreaterThan(PLAYER.maxFallSpeed * FIXED_TIMESTEP - 1e-3);
  });
});

describe('CharacterController auto-step', () => {
  it('steps onto a 0.35 m box', () => {
    addGround();
    addBox({ x: 0, y: 0.175, z: -5 }, { x: 3, y: 0.175, z: 3 }); // face at z = -2
    const c = new CharacterController(physics, { x: 0, y: 0, z: 0 });
    ticks(c, 30);
    ticks(c, 60, intent({ moveZ: -1 }));
    expect(feet(c).y).toBeCloseTo(0.35 + GROUND_SKIN, 1);
    expect(feet(c).z).toBeLessThan(-2);
    expect(c.grounded).toBe(true);
  });

  it('is blocked by a 0.6 m box', () => {
    addGround();
    addBox({ x: 0, y: 0.3, z: -5 }, { x: 3, y: 0.3, z: 3 });
    const c = new CharacterController(physics, { x: 0, y: 0, z: 0 });
    ticks(c, 30);
    ticks(c, 90, intent({ moveZ: -1 }));
    expect(feet(c).y).toBeLessThan(0.05);
    expect(feet(c).z).toBeCloseTo(-2 + PLAYER.radius, 1);
    expect(feet(c).z).toBeGreaterThan(-2 + PLAYER.radius - 0.05);
  });
});

describe('CharacterController slopes', () => {
  function startBelowRamp(): CharacterController {
    addGround();
    const c = new CharacterController(physics, { x: 0, y: 0, z: 2 });
    ticks(c, 30);
    return c;
  }

  it('climbs a 40 degree ramp', () => {
    addRamp({ x: 0, z: 0 }, 40);
    const c = startBelowRamp();
    ticks(c, 60, intent({ moveZ: -1 }));
    expect(feet(c).y).toBeGreaterThan(0.8);
    expect(c.grounded).toBe(true);
  });

  it('is blocked by a 55 degree ramp', () => {
    addRamp({ x: 0, z: 0 }, 55);
    const c = startBelowRamp();
    ticks(c, 90, intent({ moveZ: -1 }));
    expect(feet(c).y).toBeLessThan(0.15);
  });

  function teleportOntoRamp(deg: number): CharacterController {
    addRamp({ x: 0, z: 0 }, deg);
    const c = startBelowRamp();
    const a = (deg * Math.PI) / 180;
    // 4 m up the slope from the low edge.
    c.teleport({ x: 0, y: 4 * Math.sin(a), z: -4 * Math.cos(a) });
    return c;
  }

  it('slides down a 40 degree ramp when idle', () => {
    const c = teleportOntoRamp(40);
    ticks(c, 10);
    const y0 = feet(c).y;
    ticks(c, 90);
    expect(y0 - feet(c).y).toBeGreaterThan(0.5);
  });

  it('stays put on a 20 degree ramp when idle', () => {
    const c = teleportOntoRamp(20);
    ticks(c, 10);
    const y0 = feet(c).y;
    const z0 = feet(c).z;
    ticks(c, 90);
    expect(Math.abs(feet(c).y - y0)).toBeLessThan(0.05);
    expect(Math.abs(feet(c).z - z0)).toBeLessThan(0.05);
    expect(c.grounded).toBe(true);
  });
});

describe('CharacterController stairs', () => {
  function addStairs(): void {
    for (let i = 0; i < 8; i++) {
      const h = 0.25 * (i + 1);
      addBox({ x: 0, y: h / 2, z: 6 + i * 0.5 }, { x: 1.5, y: h / 2, z: 0.25 });
    }
  }

  it('climbs 8 steps and descends them mostly grounded', () => {
    addGround();
    addStairs();
    const c = new CharacterController(physics, { x: 0, y: 0, z: 4 });
    ticks(c, 30);
    for (let i = 0; i < 200 && feet(c).z < 9.5; i++) tick(c, intent({ moveZ: 1 }));
    expect(feet(c).y).toBeCloseTo(2.0 + GROUND_SKIN, 1);

    let groundedTicks = 0;
    let total = 0;
    for (let i = 0; i < 200 && feet(c).z > 5.2; i++) {
      tick(c, intent({ moveZ: -1 }));
      total++;
      if (c.grounded) groundedTicks++;
    }
    expect(total).toBeGreaterThan(20);
    expect(groundedTicks / total).toBeGreaterThanOrEqual(0.8);
  });
});

describe('CharacterController teleport', () => {
  function settleAfterTeleport(target: Vec3): void {
    const c = spawnOnGround({ x: 0, y: 0, z: 4 });
    c.teleport(target);
    for (let i = 0; i < 120; i++) {
      tick(c);
      expect(feet(c).y).toBeGreaterThan(-0.02);
    }
    expect(feet(c).y).toBeCloseTo(GROUND_SKIN, 1);
    expect(feet(c).x).toBeCloseTo(target.x, 2);
    expect(feet(c).z).toBeCloseTo(target.z, 2);
    expect(c.grounded).toBe(true);
  }

  it('lands on the ground after teleporting to a new spot', () => settleAfterTeleport({ x: -5, y: 0, z: -5 }));
  it('lands on the ground after teleporting to the same spot', () => settleAfterTeleport({ x: 0, y: 0, z: 4 }));
  it('lands on the ground after teleporting far away', () => settleAfterTeleport({ x: 40, y: 0, z: 30 }));

  // Regression: a capsule placed inside the controller's offset skin could fall through the floor.
  it.each([
    [0, 0],
    [0.4, -0.3],
    [-0.7, 0.7],
  ])('stays on a box top after teleporting exactly onto it at (%d, %d)', (dx, dz) => {
    const c = spawnOnGround({ x: 0, y: 0, z: 4 });
    addBox({ x: 10, y: 0.5, z: 10 }, { x: 1, y: 0.5, z: 1 });
    physics.step();
    c.teleport({ x: 10 + dx, y: 1, z: 10 + dz });
    for (let i = 0; i < 120; i++) {
      tick(c);
      expect(feet(c).y).toBeGreaterThan(0.98);
    }
    expect(c.grounded).toBe(true);
  });

  it('resets interpolation and grounded state', () => {
    const c = spawnOnGround({ x: 0, y: 0, z: 4 });
    ticks(c, 5, intent({ moveX: 1 }));
    expect(c.grounded).toBe(true);
    c.teleport({ x: -20, y: 0, z: -20 });
    for (const alpha of [0, 0.5, 1]) {
      const f = c.interpolatedFeet(alpha, { x: 0, y: 0, z: 0 });
      expect(f.x).toBeCloseTo(-20, 5);
      expect(f.z).toBeCloseTo(-20, 5);
    }
    expect(c.grounded).toBe(false);
    tick(c);
    expect(c.grounded).toBe(true);
  });

  it('clears vertical velocity', () => {
    addGround();
    const c = new CharacterController(physics, { x: 0, y: 100, z: 0 });
    ticks(c, 60);
    c.teleport({ x: 0, y: 100, z: 0 });
    const y0 = feet(c).y;
    tick(c);
    expect(y0 - feet(c).y).toBeLessThan(0.1);
  });
});

describe('CharacterController.interpolatedFeet', () => {
  it('blends between the previous and current tick positions', () => {
    const c = spawnOnGround();
    const before = feet(c);
    tick(c, intent({ moveX: 1 }));
    const after = feet(c);
    expect(after.x).toBeGreaterThan(before.x + 0.05);
    const at = (a: number) => c.interpolatedFeet(a, { x: 0, y: 0, z: 0 });
    expect(at(0).x).toBeCloseTo(before.x, 6);
    expect(at(1).x).toBeCloseTo(after.x, 6);
    expect(at(0.5).x).toBeCloseTo((before.x + after.x) / 2, 6);
  });

  it('writes into and returns the provided object', () => {
    const c = spawnOnGround();
    const out = { x: 0, y: 0, z: 0 };
    expect(c.interpolatedFeet(1, out)).toBe(out);
  });
});

describe('CharacterController.dispose', () => {
  it('removes the body and collider', () => {
    addGround();
    const c = new CharacterController(physics, { x: 0, y: 0, z: 0 });
    const bodies = physics.world.bodies.len();
    expect(physics.world.colliders.contains(c.collider.handle)).toBe(true);
    expect(() => c.dispose()).not.toThrow();
    expect(physics.world.bodies.len()).toBe(bodies - 1);
    expect(physics.world.colliders.contains(c.collider.handle)).toBe(false);
    expect(() => physics.step()).not.toThrow();
  });
});
