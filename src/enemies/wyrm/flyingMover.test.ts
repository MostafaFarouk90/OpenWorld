import { beforeEach, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP, PLAYER } from '../../config/constants';
import { CharacterController } from '../../physics/CharacterController';
import { flatGround } from '../../physics/flatGround';
import { PhysicsWorld, type Vec3 } from '../../physics/PhysicsWorld';
import { SwitchingMover } from '../steering/movers';
import { findLandingSpot } from './landing';

const DT = FIXED_TIMESTEP;
let physics: PhysicsWorld;

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  physics.addHeightfield(flatGround(200));
});

function addBox(centre: Vec3, half: Vec3) {
  return physics.addStaticCollider(physics.rapier.ColliderDesc.cuboid(half.x, half.y, half.z).setTranslation(centre.x, centre.y, centre.z));
}

const raycast = (mover: SwitchingMover) => (o: Vec3, d: Vec3, l: number) => {
  const hit = physics.raycast(o, d, l, mover.collider as never);
  return hit ? { distance: hit.distance } : null;
};

function settle(m: SwitchingMover, n = 10) {
  for (let i = 0; i < n; i++) {
    m.move({ x: 0, z: 0 }, DT);
    physics.step();
  }
}

describe('SwitchingMover.fly (physics on)', () => {
  it('walking it stops at a 3 m wall; flying it passes over, and lands on the far side with its collider back', () => {
    addBox({ x: 0, y: 1.5, z: -5 }, { x: 6, y: 1.5, z: 0.25 });
    const walker = new SwitchingMover(physics, () => 0, { x: 0, y: 0.2, z: 0 });
    physics.step();
    settle(walker);
    for (let i = 0; i < 180; i++) {
      walker.move({ x: 0, z: -4 }, DT);
      physics.step();
    }
    expect(walker.feet.z).toBeGreaterThan(-5);

    const flier = new SwitchingMover(physics, () => 0, { x: 3, y: 0.2, z: 0 });
    flier.maxSpeed = 9;
    physics.step();
    settle(flier);
    flier.fly(true);
    expect(flier.flying).toBe(true);
    for (let i = 0; i < 120; i++) {
      flier.move({ x: 0, z: -8 }, DT);
      physics.step();
    }
    expect(flier.feet.z).toBeLessThan(-10);
    const spot = findLandingSpot({ x: flier.feet.x, z: flier.feet.z }, { heightAt: () => 0, raycast: raycast(flier) })!;
    flier.fly(false, spot);
    expect(flier.flying).toBe(false);
    physics.step();
    settle(flier, 30);
    expect(flier.feet.z).toBeLessThan(-10);
    expect(Math.abs(flier.feet.y)).toBeLessThan(0.1);
    // Collider back on: walking back it hits the wall from the far side.
    for (let i = 0; i < 240; i++) {
      flier.move({ x: 0, z: 4 }, DT);
      physics.step();
    }
    expect(flier.feet.z).toBeLessThan(-5);
    walker.dispose();
    flier.dispose();
  });

  it('the player walks under a flying wyrm without touching it', () => {
    const flier = new SwitchingMover(physics, () => 0, { x: 0, y: 0.2, z: -6 });
    physics.step();
    settle(flier);
    flier.fly(true);
    const player = new CharacterController(physics, { x: 0, y: 0.2, z: 0 });
    physics.step();
    for (let i = 0; i < 180; i++) {
      player.fixedUpdate({ moveX: 0, moveZ: -1, sprint: false, jump: false });
      physics.step();
    }
    const p = player.interpolatedFeet(1, { x: 0, y: 0, z: 0 } as never) as unknown as Vec3;
    // About 3 s of walking: well past where the parked capsule stood.
    expect(p.z).toBeLessThan(-6 - PLAYER.walkSpeed);
    player.dispose();
    flier.dispose();
  });

  it('asleep while flying: wake keeps it on the heightfield path; a repeated fly call is a no-op', () => {
    const m = new SwitchingMover(physics, () => 0, { x: 0, y: 0.2, z: 0 });
    physics.step();
    m.fly(true);
    m.fly(true);
    m.sleep();
    m.wake();
    expect(m.flying).toBe(true);
    m.move({ x: 3, z: 0 }, 1);
    expect(m.feet.x).toBeCloseTo(3, 6);
    m.fly(false);
    m.fly(false);
    expect(m.flying).toBe(false);
    m.dispose();
  });
});

describe('landing on a shelf (physics on)', () => {
  it('a 20 m shelf next to a drop: the spot is on the shelf, clear of the edge wall', () => {
    // Shelf top at y 20 for x < 0 (a big box), the hold floor at 0 beyond.
    addBox({ x: -10, y: 10, z: 0 }, { x: 10, y: 10, z: 10 });
    const heightAt = (x: number, z: number) => (x < 0 && Math.abs(z) < 10 && x > -20 ? 20 : 0);
    const m = new SwitchingMover(physics, heightAt, { x: -5, y: 20.2, z: 0 });
    physics.step();
    const spot = findLandingSpot({ x: -3, z: 0 }, { heightAt, raycast: raycast(m) });
    expect(spot).not.toBeNull();
    expect(spot!.y).toBe(20);
    m.dispose();
  });

  it('a roof over every candidate: no spot (it keeps circling)', () => {
    addBox({ x: 0, y: 6, z: 0 }, { x: 10, y: 0.2, z: 10 });
    const m = new SwitchingMover(physics, () => 0, { x: 30, y: 0.2, z: 30 });
    physics.step();
    expect(findLandingSpot({ x: 0, z: 0 }, { heightAt: () => 0, raycast: raycast(m) })).toBeNull();
    m.dispose();
  });
});
