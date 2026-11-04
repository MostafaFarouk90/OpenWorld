import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { VfxServiceImpl } from '../VfxServiceImpl';
import { ASHBLADE_T4_EFFECT_IDS, ASHBLADE_T4_PARTICLES, ASHBLADE_T5_EFFECT_IDS, ASHBLADE_T5_PARTICLES } from './ashblade';

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

describe('Ashblade tier 5 presets (K11 PR 3, design 11.5)', () => {
  it('are known ids that spawn without a warning', () => {
    for (const id of ASHBLADE_T5_EFFECT_IDS) {
      const { vfx, warn } = make();
      const h = vfx.spawnEffect(id, { position: { x: 1, y: 0, z: 1 } });
      frames(vfx, 0.1);
      expect(warn, id).not.toHaveBeenCalled();
      expect(h.alive, id).toBe(true);
    }
  });

  it('measured peak live points stay inside the declared table and every preset ends clean', () => {
    // The pool jitters a point's life by x0.75..x1.25 with Math.random: pin it to the maximum so the measured peak is the deterministic worst case.
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    // One cast of each: 12 hops a quarter second apart; the Ghost for 12 s; five foes passed at once; one dash.
    const spawnsOf = (id: string): Array<{ at: number }> =>
      id === 'sparks-hop' ? Array.from({ length: 12 }, (_, i) => ({ at: i * 0.25 })) : id === 'flicker-hit' ? Array.from({ length: 5 }, () => ({ at: 0 })) : [{ at: 0 }];
    for (const id of ASHBLADE_T5_EFFECT_IDS) {
      const { vfx, scene } = make();
      const base = scene.children.length;
      const handles: Array<{ alive: boolean }> = [];
      let max = 0;
      const total = id === 'ghost-hearth' ? 12 : 4;
      const spawns = spawnsOf(id);
      for (let f = 0; f < Math.round(total * 60); f++) {
        const now = f / 60;
        while (spawns.length && spawns[0].at <= now + 1e-9) {
          spawns.shift();
          handles.push(vfx.spawnEffect(id, { position: { x: 0, y: 0, z: 0 }, yaw: 0 }, id === 'ghost-hearth' ? { seconds: 12 } : { length: 6 }));
        }
        vfx.update(1 / 60, false);
        max = Math.max(max, vfx.points.liveCount);
      }
      expect(max, id).toBeLessThanOrEqual(ASHBLADE_T5_PARTICLES[id]);
      if (ASHBLADE_T5_PARTICLES[id] > 0) expect(max, id).toBeGreaterThan(0);
      expect(Math.max(...Object.values(ASHBLADE_T5_PARTICLES)), id).toBeLessThan(220);
      frames(vfx, 13);
      expect(handles.every((h) => !h.alive), id).toBe(true);
      expect(scene.children.length, id).toBe(base);
      expect(vfx.points.liveCount, id).toBe(0);
    }
    rnd.mockRestore();
  });

  it('stop removes the meshes at once', () => {
    for (const id of ASHBLADE_T5_EFFECT_IDS) {
      const { vfx, scene } = make();
      const base = scene.children.length;
      const h = vfx.spawnEffect(id, { position: { x: 0, y: 0, z: 0 } });
      frames(vfx, 0.1);
      h.stop();
      frames(vfx, 0.1);
      expect(h.alive, id).toBe(false);
      expect(scene.children.length, id).toBe(base);
    }
  });

  it('the Ghost shimmer rides the attached root: no extra offset when attached (a non-zero root)', () => {
    const { vfx, scene } = make();
    const root = new THREE.Object3D();
    scene.add(root);
    vfx.spawnEffect('ghost-hearth', { position: { x: 0, y: 0, z: 0 }, attach: root }, { seconds: 2 });
    const shimmer = scene.children.find((c) => c !== root && c.type === 'Group') as THREE.Object3D;
    root.position.set(4, 1, -3);
    root.updateMatrixWorld(true);
    frames(vfx, 0.1);
    expect(shimmer.position.x).toBeCloseTo(4);
    expect(shimmer.position.y).toBeCloseTo(1);
    expect(shimmer.position.z).toBeCloseTo(-3);
  });

  it('the dash ribbon runs along the facing and the afterimages sit on the path', () => {
    const { vfx, scene } = make();
    vfx.spawnEffect('flicker-dash', { position: { x: 10, y: 0, z: 5 }, yaw: Math.PI / 2 }, { length: 6 });
    frames(vfx, 0.05);
    const group = scene.children.find((c) => c.type === 'Group') as THREE.Group;
    // yaw +90 degrees faces -X: the afterimages are at x = 10 - 1.5, 10 - 3, 10 - 4.5.
    const xs = group.children.filter((c) => (c as THREE.Mesh).geometry?.type === 'CapsuleGeometry').map((c) => group.position.x + c.position.x);
    expect(xs.map((x) => Math.round(x * 100) / 100)).toEqual([8.5, 7, 5.5]);
  });

  it('the new ids stay inside the 4,000-point cap and bad params do not throw', () => {
    expect(Object.values(ASHBLADE_T5_PARTICLES).reduce((a, b) => a + b, 0)).toBeLessThan(220);
    const { vfx } = make();
    for (const id of ASHBLADE_T5_EFFECT_IDS) {
      expect(() => vfx.spawnEffect(id, { position: { x: 0, y: 0, z: 0 } }, { seconds: 'long' as never, length: NaN })).not.toThrow();
    }
    frames(vfx, 1);
  });
});
