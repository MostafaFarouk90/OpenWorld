import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP, PLAYER } from '../../config/constants';
import { CharacterController } from '../../physics/CharacterController';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { flatGround } from '../../physics/flatGround';
import { WORLD_AI } from '../tuning';
import {
  ENEMY_COLLISION_GROUP,
  HeightfieldMover,
  IGNORE_ENEMIES_QUERY_GROUPS,
  KinematicMover,
  SwitchingMover,
} from './movers';

let physics: PhysicsWorld;
beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
});

function tick(m: { move(v: { x: number; z: number }, dt: number): void }, v: { x: number; z: number }, n = 1) {
  for (let i = 0; i < n; i++) {
    m.move(v, FIXED_TIMESTEP);
    physics.step();
  }
}

describe('KinematicMover', () => {
  it('walks on flat ground at the requested speed', () => {
    physics.addHeightfield(flatGround(200));
    physics.step();
    const m = new KinematicMover(physics, { x: 0, y: 0, z: 0 });
    tick(m, { x: 0, z: 0 }, 30);
    const x0 = m.feet.x;
    const seconds = 2;
    tick(m, { x: 2.5, z: 0 }, Math.round(seconds / FIXED_TIMESTEP));
    expect((m.feet.x - x0) / seconds).toBeGreaterThan(2.5 * 0.9);
    expect((m.feet.x - x0) / seconds).toBeLessThan(2.5 * 1.1);
    expect(Math.abs(m.feet.y)).toBeLessThan(0.1);
    m.dispose();
  });

  it('never exceeds the walk speed and ignores non-finite velocity', () => {
    physics.addHeightfield(flatGround(200));
    physics.step();
    const m = new KinematicMover(physics, { x: 0, y: 0, z: 0 });
    tick(m, { x: 0, z: 0 }, 30);
    const x0 = m.feet.x;
    tick(m, { x: 50, z: 0 }, 60);
    expect((m.feet.x - x0) / (60 * FIXED_TIMESTEP)).toBeLessThan(PLAYER.walkSpeed * 1.05);
    const before = m.feet.clone();
    tick(m, { x: Number.NaN, z: Number.POSITIVE_INFINITY }, 10);
    expect(Number.isFinite(m.feet.x) && Number.isFinite(m.feet.z)).toBe(true);
    expect(m.feet.distanceTo(before)).toBeLessThan(0.05);
  });

  it('stops at a wall', () => {
    physics.addHeightfield(flatGround(200));
    physics.addStaticCollider(physics.rapier.ColliderDesc.cuboid(0.25, 2, 5).setTranslation(4, 2, 0));
    physics.step();
    const m = new KinematicMover(physics, { x: 0, y: 0, z: 0 });
    tick(m, { x: 3, z: 0 }, 200);
    expect(m.feet.x).toBeLessThan(3.75 - PLAYER.radius + 0.05);
    expect(m.feet.x).toBeGreaterThan(2.5);
  });

  it('sits in the enemy collision group, collides with others, and is skipped by filtered queries', () => {
    physics.addHeightfield(flatGround(200));
    physics.step();
    const m = new KinematicMover(physics, { x: 0, y: 0, z: 0 });
    tick(m, { x: 0, z: 0 }, 20);
    const c = m.collider as import('@dimforge/rapier3d').Collider;
    expect(c.collisionGroups()).toBe(ENEMY_COLLISION_GROUP);
    expect(m.collider).not.toBeNull();
    const ray = new physics.rapier.Ray({ x: -3, y: 1, z: 0 }, { x: 1, y: 0, z: 0 });
    const world = physics.world;
    expect(world.castRay(ray, 10, true)?.collider.handle).toBe(c.handle);
    expect(world.castRay(ray, 10, true, undefined, IGNORE_ENEMIES_QUERY_GROUPS)).toBeNull();
    // Terrain stays visible to the filtered ray.
    const down = new physics.rapier.Ray({ x: 5, y: 2, z: 0 }, { x: 0, y: -1, z: 0 });
    expect(world.castRay(down, 10, true, undefined, IGNORE_ENEMIES_QUERY_GROUPS)).not.toBeNull();
  });

  it('is solid to a player capsule (shoved, then pinned against a wall)', () => {
    physics.addHeightfield(flatGround(200));
    // Wall face at x = 6. The two kinematic controllers shove each other, so the wall is what
    // makes the pair a solid stack; the player can never get past the enemy.
    physics.addStaticCollider(physics.rapier.ColliderDesc.cuboid(0.25, 2, 5).setTranslation(6.25, 2, 0));
    physics.step();
    const enemy = new KinematicMover(physics, { x: 4, y: 0, z: 0 });
    tick(enemy, { x: 0, z: 0 }, 30);
    const player = new CharacterController(physics, { x: 0, y: 0, z: 0 });
    for (let i = 0; i < 400; i++) {
      player.fixedUpdate({ moveX: 1, moveZ: 0, sprint: false, jump: false });
      enemy.move({ x: 0, z: 0 }, FIXED_TIMESTEP);
      physics.step();
    }
    const p = player.interpolatedFeet(1, { x: 0, y: 0, z: 0 });
    expect(enemy.feet.x).toBeLessThan(6 - PLAYER.radius + 0.05);
    // The player slides round the enemy's round capsule but the two never overlap.
    expect(Math.hypot(p.x - enemy.feet.x, p.z - enemy.feet.z)).toBeGreaterThan(2 * PLAYER.radius - 0.05);
  });

  it('teleport moves the feet', () => {
    physics.addHeightfield(flatGround(200));
    physics.step();
    const m = new KinematicMover(physics, { x: 0, y: 0, z: 0 });
    m.teleport({ x: 10, y: 0, z: -4 });
    expect(m.feet.x).toBeCloseTo(10);
    expect(m.feet.z).toBeCloseTo(-4);
    const out = new THREE.Vector3();
    expect(m.interpolatedFeet(0.5, out).x).toBeCloseTo(10);
  });
});

describe('HeightfieldMover', () => {
  it('follows heightAt up a slope', () => {
    const h = (x: number) => 0.3 * x;
    const m = new HeightfieldMover(h, { x: 0, y: 0, z: 0 });
    for (let i = 0; i < 60; i++) m.move({ x: 2, z: 0 }, 0.05);
    expect(m.feet.x).toBeCloseTo(6);
    expect(m.feet.y).toBeCloseTo(1.8);
    expect(m.collider).toBeNull();
    const out = new THREE.Vector3();
    expect(m.interpolatedFeet(0, out).x).toBeCloseTo(6 - 0.1);
    expect(m.interpolatedFeet(1, out).x).toBeCloseTo(6);
  });
});

describe('SwitchingMover', () => {
  it('sleep keeps the position, wake lifts and continues', () => {
    physics.addHeightfield(flatGround(200));
    physics.step();
    const m = new SwitchingMover(physics, () => 0, { x: 0, y: 0, z: 0 });
    tick(m, { x: 0, z: 0 }, 30);
    tick(m, { x: 2, z: 0 }, 30);
    const at = m.feet.clone();

    m.sleep();
    expect(m.asleep).toBe(true);
    expect(m.feet.distanceTo(at)).toBeLessThan(1e-9);
    m.move({ x: 2, z: 0 }, 1);
    expect(m.feet.x).toBeCloseTo(at.x + 2);
    expect(m.feet.y).toBeCloseTo(0);
    const asleepAt = m.feet.clone();

    // Parked body: the player-like capsule is stopped by it at the parked spot.
    const c = m.collider as import('@dimforge/rapier3d').Collider;
    const t = c.translation();
    expect(t.x).toBeCloseTo(at.x, 3);
    expect(t.z).toBeCloseTo(at.z, 3);

    m.wake();
    expect(m.asleep).toBe(false);
    expect(m.feet.x).toBeCloseTo(asleepAt.x);
    expect(m.feet.y).toBeGreaterThanOrEqual(WORLD_AI.wakeLift - 1e-9);
    const x0 = m.feet.x;
    tick(m, { x: 2, z: 0 }, 60);
    expect(m.feet.x - x0).toBeGreaterThan(1.5);
    m.dispose();
  });

  it('sleep and wake are idempotent', () => {
    physics.addHeightfield(flatGround(200));
    physics.step();
    const m = new SwitchingMover(physics, () => 0, { x: 1, y: 0, z: 1 });
    m.wake();
    m.sleep();
    m.sleep();
    m.wake();
    m.wake();
    expect(m.asleep).toBe(false);
    expect(m.feet.x).toBeCloseTo(1);
  });
});
