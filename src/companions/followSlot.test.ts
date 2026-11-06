// Act 4 (L4): per-companion rest slots (Act 3 playthrough L5, Aelfreda's hat filled the camera foreground) and the slot
// override a storm uses to keep companions on the rope-line.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CAMERA } from '../config/constants';
import { AELFREDA, AELFREDA_FOLLOW_SLOT } from './aelfreda';
import { FollowModel, behind, type FollowInput, type FollowSlot, type Vec3 } from './FollowModel';
import { HROLF } from './hrolf';
import { TOBB } from './tobb';
import { COMPANION_TUNING } from './tuning';
import { pupTuning } from './followers';

const DT = 1 / 60;
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const input = (player: Vec3, yaw = 0): FollowInput => ({ dt: DT, player, playerYaw: yaw, groundAt: () => 0 });
const settle = (m: FollowModel, player: Vec3, yaw = 0, steps = 900) => {
  for (let i = 0; i < steps; i++) m.step(input(player, yaw));
};
const near = (m: FollowModel, x: number, z: number) => Math.hypot(m.pos.x - x, m.pos.z - z);

/** Where a point lands in the default third-person view: depth from the camera along its axis and the NDC x. */
function frame(slot: FollowSlot): { depth: number; ndcX: number } {
  const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 5000);
  // the default rig: CAMERA.distance behind the player (yaw 0 faces -Z, so behind is +Z), looking at targetHeight
  cam.position.set(0, CAMERA.targetHeight, CAMERA.distance);
  cam.lookAt(0, CAMERA.targetHeight, 0);
  cam.updateMatrixWorld(true);
  const p = behind(v(0, 0, 0), 0, slot.back, slot.side);
  const head = new THREE.Vector3(p.x, 1.6, p.z);
  const depth = head.clone().applyMatrix4(cam.matrixWorldInverse).z * -1;
  const ndc = head.clone().project(cam);
  return { depth, ndcX: ndc.x };
}

describe('per-companion rest slots (L4)', () => {
  it('Aelfreda rests 1 m back and 2.2 m to the left; Tobb and Hrolf keep the shared slot', () => {
    expect(AELFREDA.followSlot).toBe(AELFREDA_FOLLOW_SLOT);
    expect(TOBB.followSlot).toBeUndefined();
    expect(HROLF.followSlot).toBeUndefined();
    const m = new FollowModel(v(0, 0, 0), 0, COMPANION_TUNING, AELFREDA_FOLLOW_SLOT);
    settle(m, v(0, 0, 0));
    expect(near(m, -2.2, 1.0)).toBeLessThanOrEqual(COMPANION_TUNING.arriveRadius + 1e-9);
  });

  it('her slot is out of the camera foreground: no nearer the camera than 1.5 m behind Cael, and off the centre third', () => {
    const player = CAMERA.distance;
    const mine = frame(AELFREDA_FOLLOW_SLOT);
    expect(mine.depth).toBeGreaterThanOrEqual(player - 1.5);
    expect(Math.abs(mine.ndcX)).toBeGreaterThan(1 / 3);
    expect(Math.abs(mine.ndcX)).toBeLessThan(1); // still on screen
    // the shared slot fails the depth rule: that was the bug
    const shared = frame({ back: COMPANION_TUNING.slotBack, side: COMPANION_TUNING.slotSide });
    expect(shared.depth).toBeLessThan(player - 1.5);
  });

  it('the slot turns with the player', () => {
    const m = new FollowModel(v(0, 0, 0), Math.PI / 2, COMPANION_TUNING, AELFREDA_FOLLOW_SLOT);
    settle(m, v(0, 0, 0), Math.PI / 2);
    const want = behind(v(0, 0, 0), Math.PI / 2, 1.0, -2.2);
    expect(near(m, want.x, want.z)).toBeLessThanOrEqual(COMPANION_TUNING.arriveRadius + 1e-9);
  });

  it('an override (the storm rope slot) replaces the slot while set and the own slot comes back when cleared', () => {
    const m = new FollowModel(v(0, 0, 0), 0, COMPANION_TUNING, AELFREDA_FOLLOW_SLOT);
    m.slotOverride = { back: 1.5, side: 0 };
    settle(m, v(0, 0, 0));
    expect(near(m, 0, 1.5)).toBeLessThanOrEqual(COMPANION_TUNING.arriveRadius + 1e-9);
    m.slotOverride = null;
    settle(m, v(0, 0, 0));
    expect(near(m, -2.2, 1.0)).toBeLessThanOrEqual(COMPANION_TUNING.arriveRadius + 1e-9);
  });

  it('with no slot given the shared one is unchanged (3 m back, 1.2 m right)', () => {
    const m = new FollowModel(v(0, 0, 0));
    settle(m, v(0, 0, 0));
    expect(near(m, 1.2, 3)).toBeLessThanOrEqual(COMPANION_TUNING.arriveRadius + 1e-9);
  });

  it("a tuning-only follower keeps its tuning's side (the Ember pup rests on the left, as shipped)", () => {
    const t = pupTuning();
    expect(t.slotSide).toBeLessThan(0);
    const m = new FollowModel(v(0, 0, 0), 0, t);
    settle(m, v(0, 0, 0));
    expect(near(m, t.slotSide, t.slotBack)).toBeLessThanOrEqual(t.arriveRadius + 1e-9);
  });
});
