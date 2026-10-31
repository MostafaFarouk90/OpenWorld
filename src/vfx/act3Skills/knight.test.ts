import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { EFFECTS, num, origin, ring, timedMesh } from '../effects/index';
import { VfxServiceImpl } from '../VfxServiceImpl';
import { KNIGHT_T4_EFFECT_IDS, KNIGHT_T4_PARTICLES, KNIGHT_T5_EFFECT_IDS, KNIGHT_T5_PARTICLES } from './knight';

function fx() {
  const scene = new THREE.Scene();
  const emitted: number[] = [];
  const ctx = {
    scene,
    now: () => 0,
    points: { emit: vi.fn((_k: string, _p: unknown, n: number) => (emitted.push(n), n)) },
    sparks: { burst: vi.fn() },
    decals: { place: vi.fn(() => true) },
    lights: { flash: vi.fn() },
    dissolver: {},
  };
  return { ctx: ctx as never, scene, emitted, raw: ctx };
}

describe('knight tier 4 presets', () => {
  it('are registered and the shared helpers are the same ones', () => {
    for (const id of KNIGHT_T4_EFFECT_IDS) expect(EFFECTS[id as keyof typeof EFFECTS], id).toBeTypeOf('function');
    expect(typeof ring + typeof timedMesh + typeof origin + typeof num).toBe('functionfunctionfunctionfunction');
  });

  it('bastion-wall builds 8 cards and a fan, follows time, and leaves nothing in the scene when stopped', () => {
    const f = fx();
    const e = (EFFECTS as any)['bastion-wall'](f.ctx, { position: { x: 0, y: 0, z: 0 }, yaw: 0 }, { seconds: 8 });
    expect(f.scene.children).toHaveLength(1);
    expect(f.scene.children[0].children).toHaveLength(9);
    expect(e.update(1)).toBe(true);
    e.stop();
    expect(f.scene.children).toHaveLength(0);
  });

  it('bastion-wall with attach lands on the attached root once: position {0,0,0} puts the group at the root, feet + feet doubles it', () => {
    const root = new THREE.Object3D();
    root.position.set(15000, 3, 15000);
    root.updateMatrixWorld(true);
    const f = fx();
    const e = (EFFECTS as any)['bastion-wall'](f.ctx, { position: { x: 0, y: 0, z: 0 }, yaw: 0, attach: root }, { seconds: 8 });
    expect(f.scene.children[0].position.toArray()).toEqual([15000, 3, 15000]);
    e.stop();
    // The mistake the plugin used to make: the world feet as the offset on top of the attached root.
    const g = fx();
    (EFFECTS as any)['bastion-wall'](g.ctx, { position: { x: 15000, y: 3, z: 15000 }, yaw: 0, attach: root }, { seconds: 8 });
    expect(g.scene.children[0].position.toArray()).toEqual([30000, 6, 30000]);
  });

  it('bastion-wall flicker is a short flash that ends by itself and emits at most 6 points', () => {
    const f = fx();
    const e = (EFFECTS as any)['bastion-wall'](f.ctx, { position: { x: 0, y: 0, z: 0 } }, { flicker: 1 });
    expect(f.emitted).toEqual([6]);
    expect(e.update(0.1)).toBe(true);
    expect(e.update(0.2)).toBe(false);
    expect(f.scene.children).toHaveLength(0);
  });

  it("executioners-arc sweeps a half-disc, places the scorch and ends in 0.4 s", () => {
    const f = fx();
    const e = (EFFECTS as any)['executioners-arc'](f.ctx, { position: { x: 0, y: 0, z: 0 }, yaw: 0 }, {});
    expect(f.raw.decals.place).toHaveBeenCalledTimes(1);
    expect(f.emitted).toEqual([20]);
    expect(e.update(0.1)).toBe(true);
    expect(e.update(0.5)).toBe(false);
    expect(f.scene.children).toHaveLength(0);
  });

  it('hearthfire-motes emits 40 motes, and a heart for a healed actor', () => {
    const f = fx();
    (EFFECTS as any)['hearthfire-motes'](f.ctx, { position: { x: 0, y: 0, z: 0 } }, {});
    expect(f.emitted).toEqual([40]);
    const h = (EFFECTS as any)['hearthfire-motes'](f.ctx, { position: { x: 1, y: 0, z: 0 } }, { heart: 1 });
    expect(f.scene.children).toHaveLength(1);
    expect(h.update(0.5)).toBe(true);
    expect(h.update(1)).toBe(false);
    expect(f.scene.children).toHaveLength(0);
  });

  it('the particle table stays far below the 4,000-point cap', () => {
    const total = Object.values(KNIGHT_T4_PARTICLES).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThan(400);
  });
});

describe('knight tier 5 presets (K11 PR 3)', () => {
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

  it('are registered, known to the service and spawn without a warning', () => {
    for (const id of KNIGHT_T5_EFFECT_IDS) {
      expect(EFFECTS[id as keyof typeof EFFECTS], id).toBeTypeOf('function');
      const { vfx, warn } = make();
      const h = vfx.spawnEffect(id, { position: { x: 1, y: 0, z: 1 } });
      frames(vfx, 0.1);
      expect(warn, id).not.toHaveBeenCalled();
      expect(h.alive, id).toBe(true);
    }
  });

  it('run for their seconds, leave nothing in the scene, and never exceed the declared peak of live points (each under 220)', () => {
    // The pool jitters a point's life by x0.75..x1.25 with Math.random: pin it to the maximum so the measured peak is the deterministic worst case.
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    for (const id of KNIGHT_T5_EFFECT_IDS) {
      const { vfx, scene } = make();
      const base = scene.children.length;
      const seconds = id === 'sunforge-banner' ? 20 : 8;
      const h = vfx.spawnEffect(id, { position: { x: 0, y: 0, z: 0 }, yaw: 0 }, { seconds });
      expect(scene.children.length, id).toBeGreaterThan(base);
      const p = peak(vfx, seconds - 0.1);
      expect(p, id).toBeGreaterThan(0);
      expect(p, id).toBeLessThanOrEqual(KNIGHT_T5_PARTICLES[id]);
      expect(KNIGHT_T5_PARTICLES[id], id).toBeLessThan(220);
      expect(h.alive, id).toBe(true);
      frames(vfx, 0.3);
      expect(h.alive, id).toBe(false);
      frames(vfx, 4);
      expect(scene.children.length, id).toBe(base);
      expect(vfx.points.liveCount, id).toBe(0);
    }
    rnd.mockRestore();
  });

  it('the declared peaks are close to the measured ones (not padded)', () => {
    // The pool jitters a point's life by x0.75..x1.25 with Math.random: pin it to the maximum so the measured peak is the deterministic worst case.
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    for (const id of KNIGHT_T5_EFFECT_IDS) {
      const { vfx } = make();
      const seconds = id === 'sunforge-banner' ? 20 : 8;
      vfx.spawnEffect(id, { position: { x: 0, y: 0, z: 0 } }, { seconds });
      const p = peak(vfx, seconds - 0.1);
      expect(p, id).toBeGreaterThanOrEqual(KNIGHT_T5_PARTICLES[id] * 0.7);
    }
    rnd.mockRestore();
  });

  it('stop removes the meshes at once and nothing more is emitted', () => {
    for (const id of KNIGHT_T5_EFFECT_IDS) {
      const { vfx, scene } = make();
      const base = scene.children.length;
      const h = vfx.spawnEffect(id, { position: { x: 0, y: 0, z: 0 } });
      frames(vfx, 0.5);
      h.stop();
      frames(vfx, 0.1);
      expect(h.alive, id).toBe(false);
      expect(scene.children.length, id).toBe(base);
      frames(vfx, 4);
      expect(vfx.points.liveCount, id).toBe(0);
    }
  });

  it('unbroken-oath rides the attached root once (a non-zero root, offset {0,0,0})', () => {
    const { vfx, scene } = make();
    const root = new THREE.Object3D();
    root.position.set(15000, 3, 15000);
    root.updateMatrixWorld(true);
    scene.add(root);
    vfx.spawnEffect('unbroken-oath', { position: { x: 0, y: 0, z: 0 }, attach: root }, { seconds: 8 });
    const shell = scene.children.find((c) => c.type === 'Group') as THREE.Object3D;
    expect(shell.position.x).toBeCloseTo(15000);
    expect(shell.position.y).toBeCloseTo(4);
    root.position.set(15010, 3, 15000);
    root.updateMatrixWorld(true);
    frames(vfx, 0.1);
    expect(shell.position.x).toBeCloseTo(15010);
  });

  it('heartshard-blade follows the attached weapon: its position, its +Y axis and a length of 5 m', () => {
    const { vfx, scene } = make();
    const weapon = new THREE.Object3D();
    weapon.position.set(15000, 2, 15000);
    weapon.rotation.z = -Math.PI / 2; // the blade now points along world +X
    weapon.updateMatrixWorld(true);
    scene.add(weapon);
    vfx.spawnEffect('heartshard-blade', { position: { x: 0, y: 0, z: 0 }, attach: weapon }, { seconds: 8, length: 5 });
    const blade = scene.children.find((c) => c.type === 'Group') as THREE.Group;
    frames(vfx, 0.1);
    expect(blade.position.toArray().map(Math.round)).toEqual([15000, 2, 15000]);
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(blade.quaternion);
    expect(axis.x).toBeCloseTo(1);
    const outer = blade.children[0] as THREE.Mesh;
    expect((outer.geometry as THREE.CylinderGeometry).parameters.height).toBe(5);
  });

  it('sunforge-banner draws a 20 m dome and a beam at the banner', () => {
    const { vfx, scene } = make();
    vfx.spawnEffect('sunforge-banner', { position: { x: 5, y: 1, z: -7 } }, { radius: 20, seconds: 20 });
    const g = scene.children.find((c) => c.type === 'Group') as THREE.Group;
    expect(g.position.toArray()).toEqual([5, 1, -7]);
    const dome = g.children[0] as THREE.Mesh;
    expect((dome.geometry as THREE.SphereGeometry).parameters.radius).toBe(20);
  });
});
