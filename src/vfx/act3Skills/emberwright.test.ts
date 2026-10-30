import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { VfxServiceImpl } from '../VfxServiceImpl';
import { EMBERWRIGHT_T4_EFFECT_IDS, EMBERWRIGHT_T4_PARTICLES } from './emberwright';

const make = () => {
  const warn = vi.fn();
  const scene = new THREE.Scene();
  const vfx = new VfxServiceImpl({ scene, actorRoot: () => null }, null, warn);
  return { vfx, warn, scene };
};
const frames = (vfx: VfxServiceImpl, seconds: number, each?: () => void) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    vfx.update(1 / 60, false);
    each?.();
  }
};
/** Peak live points over `seconds`. */
const peak = (vfx: VfxServiceImpl, seconds: number) => {
  let max = 0;
  frames(vfx, seconds, () => (max = Math.max(max, vfx.points.liveCount)));
  return max;
};
/** The effect's own objects: its groups (pooled decal quads stay in the scene, hidden, by design). */
const own = (scene: THREE.Scene) => scene.children.filter((c) => c.type === 'Group');
const SECONDS = { 'cinder-rain': 3, 'temper-weapon': 20, 'emberwright-updraft': 0.8 } as const;

describe('Emberwright tier 4 presets (design 11.5)', () => {
  it('are known ids that spawn without a warning', () => {
    for (const id of EMBERWRIGHT_T4_EFFECT_IDS) {
      const { vfx, warn } = make();
      const h = vfx.spawnEffect(id, { position: { x: 1, y: 0, z: 1 } });
      frames(vfx, 0.1);
      expect(warn, id).not.toHaveBeenCalled();
      expect(h.alive, id).toBe(true);
    }
  });

  it('run for their seconds, leave no mesh in the scene, and never exceed the declared peak of live points', () => {
    for (const id of EMBERWRIGHT_T4_EFFECT_IDS) {
      const { vfx, scene } = make();
      const base = scene.children.length;
      const seconds = SECONDS[id];
      const h = vfx.spawnEffect(id, { position: { x: 0, y: 0, z: 0 }, yaw: 0 }, { seconds });
      expect(scene.children.length, id).toBeGreaterThan(base);
      expect(own(scene).length, id).toBeGreaterThan(0);
      const p = peak(vfx, seconds - 0.05);
      expect(p, id).toBeGreaterThan(0);
      expect(p, id).toBeLessThanOrEqual(EMBERWRIGHT_T4_PARTICLES[id]);
      expect(h.alive, id).toBe(true);
      frames(vfx, 0.3);
      expect(h.alive, id).toBe(false);
      frames(vfx, 3);
      expect(own(scene), id).toHaveLength(0);
      if (id !== 'cinder-rain') expect(scene.children.length, id).toBe(base);
      expect(vfx.points.liveCount, id).toBe(0);
    }
  });

  it('stop removes the meshes at once and the effect emits nothing afterwards', () => {
    for (const id of EMBERWRIGHT_T4_EFFECT_IDS) {
      const { vfx, scene } = make();
      const base = scene.children.length;
      const h = vfx.spawnEffect(id, { position: { x: 0, y: 0, z: 0 } });
      frames(vfx, 0.5);
      h.stop();
      frames(vfx, 0.1);
      expect(h.alive, id).toBe(false);
      expect(own(scene), id).toHaveLength(0);
      if (id !== 'cinder-rain') expect(scene.children.length, id).toBe(base);
      frames(vfx, 2);
      expect(vfx.points.liveCount, id).toBe(0);
    }
  });

  it('Cinder Rain is a few hundred instanced shards that thin out at the end, and drops scorch decals from the pool', () => {
    const { vfx, scene } = make();
    vfx.spawnEffect('cinder-rain', { position: { x: 0, y: 0, z: 0 } });
    frames(vfx, 0.5);
    const shards = scene.children.flatMap((c) => c.children).find((c) => (c as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh;
    expect(shards.count).toBe(300);
    expect(vfx.decals.liveCount).toBeGreaterThan(0);
    expect(vfx.decals.liveCount).toBeLessThanOrEqual(16);
    frames(vfx, 2.4);
    expect(shards.count).toBeLessThan(300);
  });

  it('Temper Weapon rides the attached root with a zero offset (a non-zero root), and emits its trail there', () => {
    const { vfx, scene } = make();
    const root = new THREE.Object3D();
    scene.add(root);
    root.position.set(4, 1, -3);
    root.updateMatrixWorld(true);
    const h = vfx.spawnEffect('temper-weapon', { position: { x: 0, y: 0, z: 0 }, attach: root });
    const group = scene.children.find((c) => c !== root && c.type === 'Group') as THREE.Object3D;
    frames(vfx, 0.1);
    expect(group.position.x).toBeCloseTo(4);
    expect(group.position.y).toBeCloseTo(1);
    expect(group.position.z).toBeCloseTo(-3);
    root.position.set(-6, 0, 8);
    root.updateMatrixWorld(true);
    frames(vfx, 0.1);
    expect(group.position.x).toBeCloseTo(-6);
    expect(group.position.z).toBeCloseTo(8);
    // The loop lasts until it is stopped: still alive well past a few seconds.
    frames(vfx, 5);
    expect(h.alive).toBe(true);
    h.stop();
  });

  it('Updraft raises its motes 1.5 m over 0.8 s', () => {
    const { vfx, scene } = make();
    vfx.spawnEffect('emberwright-updraft', { position: { x: 0, y: 0, z: 0 } });
    const motes = () => scene.children.flatMap((c) => c.children).find((c) => (c as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh;
    const m = motes();
    expect(m.instanceMatrix.count).toBe(120);
    const top = (): number => {
      let max = 0;
      const v = new THREE.Matrix4();
      for (let i = 0; i < 120; i++) {
        m.getMatrixAt(i, v);
        max = Math.max(max, v.elements[13]);
      }
      return max;
    };
    frames(vfx, 0.4);
    const mid = top();
    frames(vfx, 0.3);
    const late = top();
    expect(late).toBeGreaterThan(mid);
    expect(late).toBeGreaterThan(1.0);
    expect(late).toBeLessThanOrEqual(1.7);
  });

  it('the three together stay far inside the 4,000-point cap, and bad params do not throw', () => {
    expect(Object.values(EMBERWRIGHT_T4_PARTICLES).reduce((a, b) => a + b, 0)).toBeLessThan(100);
    const { vfx } = make();
    for (const id of EMBERWRIGHT_T4_EFFECT_IDS) {
      expect(() => vfx.spawnEffect(id, { position: { x: 0, y: 0, z: 0 } }, { seconds: 'long' as never, radius: NaN })).not.toThrow();
    }
    frames(vfx, 1);
  });
});
