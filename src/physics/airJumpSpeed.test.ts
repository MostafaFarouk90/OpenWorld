import { beforeEach, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP, PLAYER } from '../config/constants';
import { CharacterController, type MoveIntent } from './CharacterController';
import { PhysicsWorld } from './PhysicsWorld';
import { flatGround } from './flatGround';

const DT = FIXED_TIMESTEP;
const IDLE: MoveIntent = { moveX: 0, moveZ: 0, sprint: false, jump: false };
let physics: PhysicsWorld;

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  physics.addHeightfield(flatGround(200));
});

function rig(airJumps = 1) {
  const c = new CharacterController(physics, { x: 0, y: 0, z: 0 });
  c.airJumps = airJumps; // read while grounded, so a jump is banked before the ground jump
  const y = (): number => c.interpolatedFeet(1, { x: 0, y: 0, z: 0 }).y;
  const step = (jump = false, extra: Partial<MoveIntent> = {}): number => {
    c.fixedUpdate({ ...IDLE, jump, ...extra });
    physics.step();
    return y();
  };
  for (let i = 0; i < 30; i++) step();
  step(true);
  for (let i = 0; i < 12; i++) step();
  return { c, step, y };
}

/** Vertical speed of the tick that presses jump in the air. */
function airPressSpeed(r: ReturnType<typeof rig>, extra: Partial<MoveIntent> = {}): number {
  const y0 = r.y();
  r.step(true, extra);
  return (r.y() - y0) / DT;
}

describe('CharacterController airJumpSpeed', () => {
  it('replaces the speed of the air jump only: unset keeps the ground jump speed, set launches at it', () => {
    const plain = rig();
    expect(airPressSpeed(plain)).toBeCloseTo(PLAYER.jumpSpeed - PLAYER.gravity * DT, 1);
    const set = rig();
    set.c.airJumpSpeed = 4;
    expect(airPressSpeed(set)).toBeCloseTo(4 - PLAYER.gravity * DT, 1);
  });

  it('wins over the intent jumpSpeed in the air and leaves the grounded jump alone', () => {
    const r = rig();
    r.c.airJumpSpeed = 4;
    expect(airPressSpeed(r, { jumpSpeed: 9 })).toBeCloseTo(4 - PLAYER.gravity * DT, 1);
    for (let i = 0; i < 400 && !r.c.grounded; i++) r.step();
    for (let i = 0; i < 5; i++) r.step();
    const y0 = r.y();
    r.step(true, { jumpSpeed: 9 });
    expect((r.y() - y0) / DT).toBeCloseTo(9 - PLAYER.gravity * DT, 1);
  });

  it('lowering airJumps to 0 in the air also takes the banked air jump away', () => {
    const r = rig();
    r.step();
    r.c.airJumps = 0;
    r.step();
    const y0 = r.y();
    r.step();
    const fall = (r.y() - y0) / DT;
    const y1 = r.y();
    r.step(true);
    expect((r.y() - y1) / DT).toBeLessThan(fall + 1);
  });
});
