import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { PLAYER } from '../config/constants';
import type { InputSnapshot } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { flatGround } from '../physics/flatGround';
import { Player, type MoveModifierState } from './Player';

// v0.5: a move modifier's speedScale above 1 boosts walk and sprint speed (class sprint boosts, up to 1.5).
const WALK: InputSnapshot = { moveRight: 0, moveForward: 0, sprint: false, jump: false, attack: 0 };
const SPRINT: InputSnapshot = { ...WALK, sprint: true };

let mod: MoveModifierState;

beforeEach(() => {
  mod = { speedScale: 1, lockMove: false, lockFacing: false };
});

/** Metres travelled along -Z in one second at full stick, after settling. */
async function travelled(input: InputSnapshot, stick = 1): Promise<number> {
  // A fresh world per run, so one run's player body never blocks the next.
  const physics = new PhysicsWorld();
  await physics.init();
  physics.addHeightfield(flatGround(400));
  const p = new Player(new THREE.Scene(), physics, { x: 0, y: 0, z: 0 }, { moveModifier: () => mod });
  const step = (i: InputSnapshot, z: number) => {
    p.fixedUpdate(i, 0, z);
    physics.step();
    p.postStep();
  };
  for (let i = 0; i < 40; i++) step(WALK, 0);
  const z0 = p.controller.interpolatedFeet(1, { x: 0, y: 0, z: 0 }).z;
  for (let i = 0; i < 60; i++) step(input, -stick);
  return z0 - p.controller.interpolatedFeet(1, { x: 0, y: 0, z: 0 }).z;
}

/** Distance with the current modifier over the same run with no modifier (the controller ramps speed, so compare like with like). */
async function ratio(input: InputSnapshot, stick = 1): Promise<number> {
  const scaled = await travelled(input, stick);
  const saved = mod;
  mod = { speedScale: 1, lockMove: false, lockFacing: false };
  const base = await travelled(input, stick);
  mod = saved;
  return scaled / base;
}

describe('Player speedScale (v0.5 boosts)', async () => {
  it('1 leaves walk speed alone, and sprint is faster than walk', async () => {
    expect(await travelled(WALK)).toBeCloseTo(PLAYER.walkSpeed, 1);
    expect(await travelled(SPRINT)).toBeGreaterThan(await travelled(WALK));
  });

  it('a boost scales both walk and sprint', async () => {
    mod.speedScale = 1.3;
    expect(await ratio(WALK)).toBeCloseTo(1.3, 1);
    expect(await ratio(SPRINT)).toBeCloseTo(1.3, 1);
  });

  it('a boost keeps a partial stick partial, and an over-long stick is still clamped to unit length', async () => {
    mod.speedScale = 1.5;
    expect(await ratio(WALK, 0.5)).toBeCloseTo(1.5, 1);
    expect(await travelled(WALK, 3)).toBeCloseTo(await travelled(WALK, 1), 3);
  });

  it('a slow still scales down as before', async () => {
    mod.speedScale = 0.5;
    expect(await ratio(WALK)).toBeCloseTo(0.5, 1);
  });

  it('lockMove wins over a boost', async () => {
    mod.speedScale = 1.5;
    mod.lockMove = true;
    expect(await travelled(SPRINT)).toBeCloseTo(0, 2);
  });
});
