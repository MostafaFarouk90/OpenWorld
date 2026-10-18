// The Leap ledges against the real character controller: a plain jump cannot reach the 1.8 m platform, and a Leap
// (apex 2.2 m, distance 6 m, thread 2's tuning) lands on it from 2.0 to 4.0 m out (measured, the rim at 4.3; the review estimated 2.1
// to 4.6) but only perches on the rim from 1.5 m, where the rise is blocked, and falls short from 4.6 m or more.
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { Player } from '../characters/Player';
import type { InputSnapshot } from '../input/InputManager';
import { PhysicsWorld, type Vec3 } from '../physics/PhysicsWorld';
import { flatGround } from '../physics/flatGround';
import { ledgeCluster } from './corridor.layout';
import { groundRange } from './geometry';

const IDLE: InputSnapshot = { moveRight: 0, moveForward: 0, sprint: false, jump: false, attack: 0 };
const LEAP = { distance: 6, apex: 2.2 } as const;

let physics: PhysicsWorld;
let player: Player;

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  physics.addHeightfield(flatGround(200));
  // The same boxes the structure builder makes: every rock is a solid cuboid from the ground to its height.
  for (const s of ledgeCluster('t', 0, 0)) {
    const range = groundRange(s, () => 0, 1);
    const h = range.max + (s.height ?? 0) - (range.min - 0.3);
    physics.addStaticCollider(
      physics.rapier.ColliderDesc.cuboid(s.footprint[0] / 2, h / 2, s.footprint[1] / 2).setTranslation(s.x, range.min - 0.3 + h / 2, s.z),
    );
  }
});

function start(distanceFromEdge: number): void {
  // The platform's south edge is at z -2.5; the approach is from the south, facing +Z (yaw pi).
  player = new Player(new THREE.Scene(), physics, { x: 0, y: 0, z: -2.5 - distanceFromEdge }, {});
  for (let i = 0; i < 40; i++) tick(0, 0, IDLE);
}

function tick(mx: number, mz: number, input: InputSnapshot): void {
  player.fixedUpdate(input, mx, mz);
  physics.step();
  player.postStep();
}

const feet = (): Vec3 => player.controller.interpolatedFeet(1, { x: 0, y: 0, z: 0 });

function leapFrom(distanceFromEdge: number): Vec3 {
  start(distanceFromEdge);
  const h = player.leap({ yaw: Math.PI, ...LEAP })!;
  expect(h).not.toBeNull();
  for (let i = 0; i < 200 && h.active; i++) tick(0, 0, IDLE);
  for (let i = 0; i < 30; i++) tick(0, 0, IDLE);
  return feet();
}

describe('the 1.8 m ledge', () => {
  it('cannot be reached by a plain running jump', () => {
    start(2);
    for (let i = 0; i < 120; i++) tick(0, 1, { ...IDLE, moveForward: 1, jump: i === 5 });
    expect(feet().y).toBeLessThan(0.5);
  });

  it.each([2.1, 3, 4])('is reached by a Leap launched %s m from the edge', (d) => {
    const f = leapFrom(d);
    expect(f.y).toBeGreaterThan(1.6);
    expect(f.z).toBeGreaterThan(-2.5);
    expect(f.z).toBeLessThan(2.5);
  });

  it('is only perched on by a Leap launched from 1.5 m, and missed from 4.6 or 7 m', () => {
    expect(leapFrom(1.5).y).toBeLessThan(1.6);
    for (const d of [4.6, 7]) expect(leapFrom(d).y, `from ${d} m`).toBeLessThan(0.5);
  });
});
