import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { VfxServiceImpl } from '../VfxServiceImpl';
import { PATHFINDER_T4_EFFECT_IDS, PATHFINDER_T4_PARTICLES } from './pathfinder';

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
const peak = (vfx: VfxServiceImpl, seconds: number) => {
  let max = 0;
  frames(vfx, seconds, () => (max = Math.max(max, vfx.points.liveCount)));
  return max;
};
const LIFE: Record<string, number> = { 'triple-shot': 0.18, 'caltrop-field': 10, 'sure-foot': 0.25 };

describe('Pathfinder tier 4 presets (design 11.5)', () => {
  it('are known ids that spawn without a warning', () => {
    for (const id of PATHFINDER_T4_EFFECT_IDS) {
      const { vfx, warn } = make();
      const h = vfx.spawnEffect(id, { position: { x: 1, y: 0, z: 1 } });
      frames(vfx, 0.05);
      expect(warn, id).not.toHaveBeenCalled();
      expect(h.alive, id).toBe(true);
    }
  });

  it('run for their time, leave no mesh in the scene, and never exceed the declared peak of live points', () => {
    for (const id of PATHFINDER_T4_EFFECT_IDS) {
      const { vfx, scene } = make();
      const base = scene.children.length;
      const h = vfx.spawnEffect(id, { position: { x: 0, y: 0, z: 0 }, yaw: 0 }, id === 'caltrop-field' ? { seconds: 10 } : {});
      const p = Math.max(vfx.points.liveCount, peak(vfx, LIFE[id] - 0.05));
      if (PATHFINDER_T4_PARTICLES[id] > 0) expect(p, id).toBeGreaterThan(0);
      expect(p, id).toBeLessThanOrEqual(PATHFINDER_T4_PARTICLES[id]);
      expect(h.alive, id).toBe(true);
      frames(vfx, 0.3);
      expect(h.alive, id).toBe(false);
      frames(vfx, 3);
      expect(scene.children.length, id).toBe(base);
      expect(vfx.points.liveCount, id).toBe(0);
    }
  });

  it('the field is 60 instanced spikes in one InstancedMesh, and a dust puff adds points only', () => {
    const { vfx, scene } = make();
    vfx.spawnEffect('caltrop-field', { position: { x: 0, y: 0, z: 0 } });
    const group = scene.children.find((c) => c.type === 'Group') as THREE.Group;
    const inst = group.children.find((c) => (c as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh;
    expect(inst.count).toBe(60);
    const before = scene.children.length;
    // Six foes slowed at once: six puffs, 60 points, no mesh.
    for (let i = 0; i < 6; i++) vfx.spawnEffect('caltrop-field', { position: { x: i, y: 0, z: 0 } }, { dust: 1 });
    expect(scene.children.length).toBe(before);
    frames(vfx, 0.02);
    expect(vfx.points.liveCount).toBeGreaterThanOrEqual(60);
    expect(vfx.points.liveCount).toBeLessThanOrEqual(PATHFINDER_T4_PARTICLES['caltrop-field']);
    frames(vfx, 1);
  });

  it('triple-shot draws only the two side tracers, turned by the cone angle, as long as the launch range', () => {
    const { vfx, scene } = make();
    vfx.spawnEffect('triple-shot', { position: { x: 0, y: 1, z: 0 }, yaw: 0 }, { degrees: 7.5, length: 38 });
    const group = scene.children.find((c) => c.type === 'Group') as THREE.Group;
    const parts = group.children as THREE.Mesh[];
    const tracers = parts.filter((c) => c.geometry?.type === 'BoxGeometry');
    expect(tracers).toHaveLength(2);
    expect(parts).toHaveLength(2);
    expect(vfx.points.liveCount).toBe(0);
    const ends = tracers.map((m) => m.position.clone().multiplyScalar(2).sub(new THREE.Vector3(0, 1, 0)));
    // Yaw 0 faces -Z: the two tracers are +-7.5 degrees to either side, and 38 m long.
    const angles = ends.map((e) => (Math.atan2(e.x, -e.z) * 180) / Math.PI).sort((a, b) => a - b);
    expect(angles[0]).toBeCloseTo(-7.5, 1);
    expect(angles[1]).toBeCloseTo(7.5, 1);
    for (const e of ends) expect(e.length()).toBeCloseTo(38, 1);
  });

  it('triple-shot draws a side only when that bolt launched', () => {
    const { vfx, scene } = make();
    vfx.spawnEffect('triple-shot', { position: { x: 0, y: 1, z: 0 }, yaw: 0 }, { plus: 1, minus: 0 });
    const group = scene.children.find((c) => c.type === 'Group') as THREE.Group;
    expect(group.children).toHaveLength(1);
  });

  it('stop removes the meshes at once and the effect emits nothing afterwards', () => {
    for (const id of PATHFINDER_T4_EFFECT_IDS) {
      const { vfx, scene } = make();
      const base = scene.children.length;
      const h = vfx.spawnEffect(id, { position: { x: 0, y: 0, z: 0 } });
      frames(vfx, 0.1);
      h.stop();
      frames(vfx, 0.05);
      expect(h.alive, id).toBe(false);
      expect(scene.children.length, id).toBe(base);
      frames(vfx, 2);
      expect(vfx.points.liveCount, id).toBe(0);
    }
  });

  it('together they stay far inside the 4,000-point cap, and bad params do not throw', () => {
    expect(Object.values(PATHFINDER_T4_PARTICLES).reduce((a, b) => a + b, 0)).toBeLessThan(100);
    const { vfx } = make();
    for (const id of PATHFINDER_T4_EFFECT_IDS) {
      expect(() => vfx.spawnEffect(id, { position: { x: 0, y: 0, z: 0 } }, { seconds: 'long' as never, radius: NaN, pitch: NaN, degrees: NaN, dust: NaN })).not.toThrow();
    }
    frames(vfx, 1);
  });
});
