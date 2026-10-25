import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { VfxServiceImpl } from '../VfxServiceImpl';
import { ASHBLADE_T4_EFFECT_IDS, ASHBLADE_T4_PARTICLES } from './ashblade';

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

describe('Ashblade tier 4 presets (design 11.5)', () => {
  it('are known ids that spawn without a warning', () => {
    for (const id of ASHBLADE_T4_EFFECT_IDS) {
      const { vfx, warn } = make();
      const h = vfx.spawnEffect(id, { position: { x: 1, y: 0, z: 1 } });
      frames(vfx, 0.1);
      expect(warn, id).not.toHaveBeenCalled();
      expect(h.alive, id).toBe(true);
    }
  });

  it('run for their seconds, leave no mesh in the scene, and never exceed the declared peak of live points', () => {
    for (const id of ASHBLADE_T4_EFFECT_IDS) {
      const { vfx, scene } = make();
      const base = scene.children.length;
      const seconds = id === 'cinder-mark' ? 10 : id === 'decoy-footprints' ? 6 : 4;
      const h = vfx.spawnEffect(id, { position: { x: 0, y: 0, z: 0 }, yaw: 0 }, { seconds });
      expect(scene.children.length, id).toBeGreaterThan(base);
      const p = peak(vfx, seconds - 0.1);
      expect(p, id).toBeGreaterThan(0);
      expect(p, id).toBeLessThanOrEqual(ASHBLADE_T4_PARTICLES[id]);
      expect(h.alive, id).toBe(true);
      frames(vfx, 0.3);
      expect(h.alive, id).toBe(false);
      frames(vfx, 3);
      expect(scene.children.length, id).toBe(base);
      expect(vfx.points.liveCount, id).toBe(0);
    }
  });

  it('stop removes the meshes at once and the effect emits nothing afterwards', () => {
    for (const id of ASHBLADE_T4_EFFECT_IDS) {
      const { vfx, scene } = make();
      const base = scene.children.length;
      const h = vfx.spawnEffect(id, { position: { x: 0, y: 0, z: 0 } });
      frames(vfx, 0.5);
      h.stop();
      frames(vfx, 0.1);
      expect(h.alive, id).toBe(false);
      expect(scene.children.length, id).toBe(base);
      frames(vfx, 2);
      expect(vfx.points.liveCount, id).toBe(0);
    }
  });

  it('Cinder Mark rides the attached root', () => {
    const { vfx, scene } = make();
    const root = new THREE.Object3D();
    scene.add(root);
    vfx.spawnEffect('cinder-mark', { position: { x: 0, y: 0, z: 0 }, attach: root }, { seconds: 2 });
    const glyph = scene.children.find((c) => c !== root && c.type === 'Group') as THREE.Object3D;
    root.position.set(4, 1, -3);
    root.updateMatrixWorld(true);
    frames(vfx, 0.1);
    expect(glyph.position.x).toBeCloseTo(4);
    expect(glyph.position.y).toBeCloseTo(1);
    expect(glyph.position.z).toBeCloseTo(-3);
  });

  it('the three together stay far inside the 4,000-point cap, and bad params do not throw', () => {
    expect(Object.values(ASHBLADE_T4_PARTICLES).reduce((a, b) => a + b, 0)).toBeLessThan(200);
    const { vfx } = make();
    for (const id of ASHBLADE_T4_EFFECT_IDS) {
      expect(() => vfx.spawnEffect(id, { position: { x: 0, y: 0, z: 0 } }, { seconds: 'long' as never, radius: NaN })).not.toThrow();
    }
    frames(vfx, 1);
  });
});
