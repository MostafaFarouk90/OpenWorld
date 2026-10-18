import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Player } from '../characters/Player';
import { flatGround } from '../physics/flatGround';
import { PhysicsWorld, type Vec3 } from '../physics/PhysicsWorld';
import { LEAP } from './tuning';

const NO = { moveRight: 0, moveForward: 0, sprint: false, jump: false, attack: 0 };

/** Drives the real Player through a Leap toward a 1.5 m high box whose near face is `face` metres ahead (-Z). */
async function leapAt(face: number | null) {
  const physics = new PhysicsWorld();
  await physics.init();
  physics.addHeightfield(flatGround(200));
  if (face !== null) physics.addStaticCollider(physics.rapier.ColliderDesc.cuboid(5, 0.75, 10).setTranslation(0, 0.75, -face - 10));
  const p = new Player(new THREE.Scene(), physics, { x: 0, y: 0, z: 0 }, { moveModifier: () => ({ speedScale: 1, lockMove: false, lockFacing: false }) });
  const tick = () => { p.fixedUpdate(NO as never, 0, 0); physics.step(); p.postStep(); };
  for (let i = 0; i < 40; i++) tick();
  const h = p.leap({ yaw: 0, distance: LEAP.distance, apex: LEAP.apex })!;
  for (let n = 0; h.active && n < 300; n++) tick();
  const f = p.controller.interpolatedFeet(1, { x: 0, y: 0, z: 0 } as Vec3);
  return { landed: h.landed, y: f.y, z: f.z };
}

// A symmetric 6 m arc is back at ground level at 6 m, so "ledge reach" is: a ledge up to 1.5 m high whose face is within 4 m.
describe('Leap reach on the real Player', () => {
  it('covers about 6 m over flat ground', async () => {
    const r = await leapAt(null);
    expect(r.landed).toBe(true);
    expect(-r.z).toBeGreaterThan(5.5);
    expect(-r.z).toBeLessThan(6.5);
  });
  it.each([2, 3, 4])('lands on top of a 1.5 m ledge whose face is %s m away', async (face) => {
    const r = await leapAt(face);
    expect(r.landed).toBe(true);
    expect(r.y).toBeGreaterThan(1.4);
  });
  it('does not make a ledge whose face is at 6 m', async () => {
    const r = await leapAt(6);
    expect(r.y).toBeLessThan(1.4);
  });
});
