import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import * as gait from '../enemies/quadruped/gait';
import { HORSE, QuadrupedGait, QuadrupedRig, applyPose, bodyPitch, modeOf } from './rig';

describe('rig boundary (thread 5 API the mount relies on)', () => {
  it('tripwire: the ruled rig API is what thread 5 exports', () => {
    expect(typeof gait.QuadrupedGait).toBe('function');
    expect(typeof gait.bodyPitch).toBe('function');
    expect(typeof QuadrupedRig.sockets).toBe('function');
    expect(typeof QuadrupedGait.tuningFor).toBe('function');
    const g = new QuadrupedGait(1, QuadrupedGait.tuningFor(HORSE));
    for (const k of ['step', 'reset', 'pose'] as const) expect(typeof g[k]).toBe('function');
  });

  it('the horse walks, trots, canters at 9 and gallops at 12 m/s', () => {
    const g = new QuadrupedGait(HORSE.legLength, QuadrupedGait.tuningFor(HORSE));
    const at = (v: number) => {
      g.step(v, 1 / 60);
      return modeOf(g);
    };
    expect(at(0)).toBe('idle');
    expect(at(2)).toBe('walk');
    expect(at(6)).toBe('trot');
    expect(at(9)).toBe('canter');
    expect(at(12)).toBe('gallop');
    g.reset();
    expect(g.phase).toBe(0);
    expect(modeOf(g)).toBe('idle');
  });

  it('builds with sockets, poses without NaN and slopes the body', () => {
    const rig = QuadrupedRig.build(HORSE);
    const s = QuadrupedRig.sockets(rig);
    const g = new QuadrupedGait(HORSE.legLength, QuadrupedGait.tuningFor(HORSE));
    for (let i = 0; i < 120; i++) g.step(12, 1 / 60);
    applyPose(rig, g.pose(), bodyPitch(1, 0, 2));
    rig.updateMatrixWorld(true);
    const p = s.saddle.getWorldPosition(new THREE.Vector3());
    expect([p.x, p.y, p.z].every(Number.isFinite)).toBe(true);
    expect(p.y).toBeGreaterThan(1.2);
    expect(QuadrupedRig.joints(rig).spine.rotation.x).toBeGreaterThan(0.3);
    QuadrupedRig.dispose(rig);
  });
});
