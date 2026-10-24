// v0.7: Player.setVerticalIntent passes a dive's vertical speed to the controller in swim mode only.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { InputSnapshot } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { flatGround } from '../physics/flatGround';
import { Player, type MoveModifierState } from './Player';

const IDLE: InputSnapshot = { moveRight: 0, moveForward: 0, sprint: false, jump: false, attack: 0 };

/** Metres risen over one second, starting 20 m above flat ground. */
async function rise(opts: { swim: boolean; v: number | null; locked?: boolean }): Promise<number> {
  const physics = new PhysicsWorld();
  await physics.init();
  physics.addHeightfield(flatGround(400));
  const mod: MoveModifierState = { speedScale: 1, lockMove: opts.locked ?? false, lockFacing: false };
  const p = new Player(new THREE.Scene(), physics, { x: 0, y: 20, z: 0 }, { moveModifier: () => mod });
  if (opts.swim) p.controller.setMoveMode('swim');
  p.setVerticalIntent(opts.v);
  const y0 = p.controller.interpolatedFeet(1, { x: 0, y: 0, z: 0 }).y;
  for (let i = 0; i < 60; i++) {
    p.fixedUpdate(IDLE, 0, 0);
    physics.step();
    p.postStep();
  }
  return p.controller.interpolatedFeet(1, { x: 0, y: 0, z: 0 }).y - y0;
}

describe('Player.setVerticalIntent (v0.7, K7 dive)', () => {
  it('swim mode: zero holds the depth, positive rises, negative sinks', async () => {
    expect(await rise({ swim: true, v: 0 })).toBeCloseTo(0, 1);
    expect(await rise({ swim: true, v: 2 })).toBeCloseTo(2, 0);
    expect(await rise({ swim: true, v: -2 })).toBeCloseTo(-2, 0);
  });
  it('swim mode with no intent (null or not finite) holds the depth', async () => {
    expect(await rise({ swim: true, v: null })).toBeCloseTo(0, 1);
    expect(await rise({ swim: true, v: NaN })).toBeCloseTo(0, 1);
  });
  it('a move lock stops the vertical swim too', async () => {
    expect(await rise({ swim: true, v: 2, locked: true })).toBeCloseTo(0, 1);
  });
  it('ignored outside swim mode: walk falls under gravity whatever the intent', async () => {
    const fall = await rise({ swim: false, v: null });
    expect(fall).toBeLessThan(-3);
    expect(await rise({ swim: false, v: 5 })).toBeCloseTo(fall, 3);
  });
});
