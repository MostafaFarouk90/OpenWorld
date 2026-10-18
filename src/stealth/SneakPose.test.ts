import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SNEAK_POSE, SneakPose } from './SneakPose';

const DT = 1 / 60;

/** A two-legged stand-in skeleton, facing -Z, feet at y 0, optionally scaled and turned like a loaded model. */
function rig(scale = 1, yaw = 0) {
  const root = new THREE.Object3D();
  root.scale.setScalar(scale);
  root.rotation.y = yaw;
  const bone = (name: string, parent: THREE.Object3D, x: number, y: number, z: number) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    parent.add(b);
    return b;
  };
  const s = 1 / scale;
  const hips = bone('hips', root, 0, 1 * s, 0);
  const spine = bone('spine', hips, 0, 0.15 * s, 0);
  const head = bone('head', spine, 0, 0.5 * s, 0);
  const leg = (side: number) => {
    const upper = bone('upperleg', hips, 0.1 * side * s, -0.05 * s, 0);
    const lower = bone('lowerleg', upper, 0, -0.45 * s, 0);
    const foot = bone('foot', lower, 0, -0.45 * s, 0);
    return { upper, lower, foot };
  };
  const legs = [leg(1), leg(-1)];
  root.updateMatrixWorld(true);
  return { root, hips, spine, head, legs };
}

const world = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());

describe('SneakPose', () => {
  for (const [scale, yaw] of [[1, 0], [0.01, 0], [2.5, Math.PI / 3]] as const) {
    it(`drops the hips, keeps the feet planted, bends the knees forward and leans (scale ${scale}, yaw ${yaw.toFixed(2)})`, () => {
      const r = rig(scale, yaw);
      const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const feet0 = r.legs.map((l) => world(l.foot));
      const hips0 = world(r.hips);
      const knee0 = world(r.legs[0].lower);
      const head0 = world(r.head);
      const pose = new SneakPose({ hips: r.hips, spine: r.spine, legs: r.legs });
      let w = 0;
      for (let i = 0; i < 20; i++) w = pose.apply(true, forward, DT);
      expect(w).toBe(1);
      r.root.updateMatrixWorld(true);
      expect(hips0.y - world(r.hips).y).toBeCloseTo(SNEAK_POSE.hipDrop, 3);
      r.legs.forEach((l, i) => expect(world(l.foot).distanceTo(feet0[i])).toBeLessThan(2e-3));
      expect(world(r.legs[0].lower).sub(knee0).dot(forward)).toBeGreaterThan(0.05);
      expect(world(r.head).sub(head0).dot(forward)).toBeGreaterThan(0.05);
    });
  }

  it('a mixer that rewrites the bones every tick gets the same pose each tick (no accumulation either way)', () => {
    const r = rig();
    const bones = [r.hips, r.spine, ...r.legs.flatMap((l) => [l.upper, l.lower])];
    const bind = bones.map((b) => ({ p: b.position.clone(), q: b.quaternion.clone() }));
    const pose = new SneakPose({ hips: r.hips, spine: r.spine, legs: r.legs });
    const hips0 = world(r.hips).y;
    const drops: number[] = [];
    for (let i = 0; i < 30; i++) {
      bones.forEach((b, j) => (b.position.copy(bind[j].p), b.quaternion.copy(bind[j].q))); // the mixer
      r.root.updateMatrixWorld(true);
      pose.apply(true, { x: 0, y: 0, z: -1 }, DT);
      drops.push(hips0 - world(r.hips).y);
    }
    expect(drops.at(-1)).toBeCloseTo(SNEAK_POSE.hipDrop, 3);
    expect(drops.at(-2)).toBeCloseTo(SNEAK_POSE.hipDrop, 3);
  });

  it('blends in and out over the blend time and does nothing at zero weight', () => {
    const r = rig();
    const pose = new SneakPose({ hips: r.hips, spine: r.spine, legs: r.legs });
    const n = Math.round(SNEAK_POSE.blendSeconds / DT);
    for (let i = 0; i < n - 1; i++) pose.apply(true, { x: 0, y: 0, z: -1 }, DT);
    expect(pose.blend).toBeLessThan(1);
    pose.apply(true, { x: 0, y: 0, z: -1 }, DT);
    expect(pose.blend).toBeCloseTo(1);
    for (let i = 0; i < n; i++) pose.apply(false, { x: 0, y: 0, z: -1 }, DT);
    expect(pose.blend).toBe(0);
    const before = r.hips.position.clone();
    expect(pose.apply(false, { x: 0, y: 0, z: -1 }, DT)).toBe(0);
    expect(r.hips.position.equals(before)).toBe(true);
  });

  it('edge: a zero forward falls back to -Z; setBlend clamps NaN', () => {
    const r = rig();
    const pose = new SneakPose({ hips: r.hips, spine: r.spine, legs: r.legs });
    pose.setBlend(NaN);
    expect(pose.blend).toBe(0);
    pose.setBlend(1);
    expect(() => pose.apply(true, { x: 0, y: 0, z: 0 }, DT)).not.toThrow();
  });
});
