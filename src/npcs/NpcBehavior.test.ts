import { describe, expect, it } from 'vitest';
import { createNpcState, stepNpc, wrapAngle } from './NpcBehavior';
import { NPC_TUNING } from './tuning';

const run = (s: ReturnType<typeof createNpcState>, secs: number, ctx: Parameters<typeof stepNpc>[2]) => {
  for (let i = 0; i < secs * 60; i++) stepNpc(s, 1 / 60, ctx);
  return s.yaw;
};

describe('wrapAngle', () => {
  it.each([
    [0, 0],
    [Math.PI, Math.PI],
    [-Math.PI, Math.PI],
    [3 * Math.PI, Math.PI],
    [2 * Math.PI + 0.5, 0.5],
    [-2 * Math.PI - 0.5, -0.5],
    [NaN, 0],
    [Infinity, 0],
  ])('wraps %f to %f', (a, e) => expect(wrapAngle(a)).toBeCloseTo(e, 9));
});

describe('stepNpc', () => {
  const post = { x: 0, z: 0, yaw: 0 };
  it('stays at the post yaw with no player', () => {
    const s = createNpcState({ ...post, yaw: 1 });
    expect(run(s, 1, { player: null, talkingTo: false })).toBeCloseTo(1);
  });
  it('turns toward a player inside the glance radius (+X is yaw pi/2)', () => {
    const s = createNpcState(post);
    expect(run(s, 2, { player: { x: 4, z: 0 }, talkingTo: false })).toBeCloseTo(Math.PI / 2);
  });
  it('ignores a player outside the glance radius', () => {
    const s = createNpcState(post);
    expect(run(s, 1, { player: { x: 7, z: 0 }, talkingTo: false })).toBe(0);
  });
  it('turns at the idle rate, not faster', () => {
    const s = createNpcState(post);
    stepNpc(s, 0.1, { player: { x: -3, z: 0 }, talkingTo: false });
    expect(Math.abs(s.yaw)).toBeCloseTo(NPC_TUNING.idleTurnRate * 0.1);
  });
  it('returns to the post yaw after the player leaves', () => {
    const s = createNpcState(post);
    run(s, 2, { player: { x: 0, z: 3 }, talkingTo: false });
    run(s, 2, { player: { x: 0, z: -3 }, talkingTo: false });
    run(s, 2, { player: { x: 50, z: 50 }, talkingTo: false });
    expect(s.yaw).toBeCloseTo(0);
  });
  it('faces a far player while talking, at the faster rate', () => {
    const s = createNpcState(post);
    stepNpc(s, 0.1, { player: { x: 100, z: 0 }, talkingTo: true });
    expect(s.yaw).toBeCloseTo(NPC_TUNING.talkTurnRate * 0.1);
    run(s, 1, { player: { x: 100, z: 0 }, talkingTo: true });
    expect(s.yaw).toBeCloseTo(Math.PI / 2);
  });
  it('talking with a null player goes back to the post', () => {
    const s = createNpcState(post);
    run(s, 1, { player: { x: 3, z: 0 }, talkingTo: true });
    run(s, 2, { player: null, talkingTo: true });
    expect(s.yaw).toBeCloseTo(0);
  });
  it.each([NaN, -1, 0, Infinity, -Infinity])('ignores dt %f', (dt) => {
    const s = createNpcState(post);
    const r = stepNpc(s, dt, { player: { x: 3, z: 0 }, talkingTo: true });
    expect(r.yaw).toBe(0);
    expect(s.yaw).toBe(0);
  });
  it('clamps a huge dt to 0.25 s', () => {
    const s = createNpcState(post);
    stepNpc(s, 100, { player: { x: -3, z: 0 }, talkingTo: false });
    expect(Math.abs(s.yaw)).toBeCloseTo(NPC_TUNING.idleTurnRate * 0.25);
  });
  it('does not produce NaN when the player is at the NPC position', () => {
    const s = createNpcState({ x: 5, z: 5, yaw: 0.3 });
    for (const talkingTo of [false, true]) {
      stepNpc(s, 1 / 60, { player: { x: 5, z: 5 }, talkingTo });
      expect(Number.isFinite(s.yaw)).toBe(true);
    }
    expect(s.yaw).toBeCloseTo(0.3);
  });
  it('ignores a non-finite player position', () => {
    const s = createNpcState(post);
    stepNpc(s, 0.1, { player: { x: NaN, z: 1 }, talkingTo: false });
    expect(s.yaw).toBe(0);
  });
  it('takes the short way across +-pi and keeps yaw in (-pi, pi]', () => {
    const s = createNpcState({ x: 0, z: 0, yaw: Math.PI - 0.1 });
    // player behind-left: target -pi+0.1 (yaw just across the wrap); short way is +0.2 rad
    stepNpc(s, 0.05, { player: { x: -Math.sin(0.1), z: -Math.cos(0.1) }, talkingTo: false });
    // one 0.15 rad step across the seam, not 3 rad the long way
    expect(s.yaw).toBeCloseTo(-Math.PI + 0.05, 5);
    for (let i = 0; i < 20; i++) {
      stepNpc(s, 0.05, { player: { x: -Math.sin(0.1), z: -Math.cos(0.1) }, talkingTo: false });
      expect(s.yaw).toBeGreaterThan(-Math.PI);
      expect(s.yaw).toBeLessThanOrEqual(Math.PI);
    }
    expect(s.yaw).toBeCloseTo(-Math.PI + 0.1, 5);
  });
  it('normalises an out-of-range post yaw', () => {
    expect(createNpcState({ x: 0, z: 0, yaw: 3 * Math.PI }).yaw).toBeCloseTo(Math.PI);
  });
});
