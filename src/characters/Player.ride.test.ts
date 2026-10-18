import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import type { InputSnapshot } from '../input/InputManager';
import { PhysicsWorld, type Vec3 } from '../physics/PhysicsWorld';
import { flatGround } from '../physics/flatGround';
import { Player, type MoveModifierState } from './Player';

const NO_INPUT: InputSnapshot = { moveRight: 0, moveForward: 0, sprint: false, jump: false, attack: 0 };

let physics: PhysicsWorld;
let scene: THREE.Scene;
let mod: MoveModifierState;

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  scene = new THREE.Scene();
  mod = { speedScale: 1, lockMove: false, lockFacing: false };
  physics.addHeightfield(flatGround(400));
});

const make = () => new Player(scene, physics, { x: 0, y: 0, z: 0 }, { moveModifier: () => mod });
function tick(p: Player, input: InputSnapshot = NO_INPUT, mx = 0, mz = 0): void {
  p.fixedUpdate(input, mx, mz);
  physics.step();
  p.postStep();
}
const feet = (p: Player): Vec3 => p.controller.interpolatedFeet(1, { x: 0, y: 0, z: 0 });
const box = (c: Vec3, h: Vec3) =>
  physics.addStaticCollider(physics.rapier.ColliderDesc.cuboid(h.x, h.y, h.z).setTranslation(c.x, c.y, c.z));
const ride = (speed: number) => ({ x: 0, z: -1, speed, yaw: 0 });

describe('Player ride slot (the Ashmare)', () => {
  it('rides at 12 m/s along the heading, ignoring the input, and faces the ride yaw', () => {
    const p = make();
    for (let i = 0; i < 30; i++) tick(p);
    p.setRide(ride(12));
    const z0 = feet(p).z;
    for (let i = 0; i < 60; i++) tick(p, { ...NO_INPUT, moveRight: 1, jump: true }, 1, 0);
    expect(z0 - feet(p).z).toBeGreaterThan(11.5);
    expect(Math.abs(feet(p).x)).toBeLessThan(0.05);
    expect(p.facingYaw).toBeCloseTo(0, 5);
    expect(p.controller.grounded).toBe(true);
    expect(p.seated).toBe(true);
    expect(p.locomotion().horizontalSpeed).toBe(0);
  });

  it('stands still at speed 0 instead of falling back to the walk speed', () => {
    const p = make();
    for (let i = 0; i < 30; i++) tick(p);
    p.setRide(ride(0));
    const f0 = feet(p);
    for (let i = 0; i < 60; i++) tick(p, { ...NO_INPUT, moveForward: 1 }, 0, -1);
    expect(Math.hypot(feet(p).x - f0.x, feet(p).z - f0.z)).toBeLessThan(0.01);
  });

  it('a forced move (dodge, knockback) wins over the ride, and lockMove stops it', () => {
    const p = make();
    for (let i = 0; i < 30; i++) tick(p);
    p.setRide(ride(12));
    p.setForcedMove({ x: 1, z: 0, speed: 6 });
    const f0 = feet(p);
    for (let i = 0; i < 30; i++) tick(p);
    expect(feet(p).x - f0.x).toBeGreaterThan(2.5);
    expect(Math.abs(feet(p).z - f0.z)).toBeLessThan(0.05);
    p.setForcedMove(null);
    mod = { ...mod, lockMove: true };
    const f1 = feet(p);
    for (let i = 0; i < 30; i++) tick(p);
    expect(Math.hypot(feet(p).x - f1.x, feet(p).z - f1.z)).toBeLessThan(0.01);
  });

  it('autoStep climbs a 0.3 m step and a wall stops it', () => {
    const p = make();
    for (let i = 0; i < 30; i++) tick(p);
    box({ x: 0, y: 0.15, z: -6 - 20 }, { x: 5, y: 0.15, z: 20 });
    p.setRide(ride(9));
    for (let i = 0; i < 90; i++) tick(p);
    expect(feet(p).y).toBeGreaterThan(0.25);
    box({ x: 0, y: 3, z: -30 }, { x: 5, y: 3, z: 0.5 });
    for (let i = 0; i < 240; i++) tick(p);
    expect(feet(p).z).toBeGreaterThan(-29.6);
  });

  it('setRide(null) gives control back and invalid rides are ignored', () => {
    const p = make();
    p.setRide({ x: 0, z: -1, speed: Number.NaN, yaw: 0 });
    expect(p.seated).toBe(false);
    p.setRide(ride(5));
    p.setRide(null);
    expect(p.seated).toBe(false);
  });
});
