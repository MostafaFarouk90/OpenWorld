import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { VfxServiceImpl } from '../VfxServiceImpl';
import { PATHFINDER_T4_EFFECT_IDS, PATHFINDER_T4_PARTICLES, PATHFINDER_T5_EFFECT_IDS, PATHFINDER_T5_PARTICLES } from './pathfinder';

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

describe('Pathfinder tier 5 presets (K11 PR 4, design 11.5)', () => {
  /** What one cast spawns, with the params it passes. */
  const PARAMS: Record<string, Record<string, number>> = {
    'dragonbane-bolt': { length: 30, pitch: 0.1 },
    'dragonbane-impact': {},
    'hunters-web': { seconds: 1, radius: 12 },
    'hunters-web-pop': { radius: 12, hits: 3 },
    'skyhawk-dive': { length: 12, pitch: -0.6, seconds: 0.3 },
    'skyhawk-impact': {},
    'skyhawk-carry': { seconds: 1.2 },
  };
  const LIFE: Record<string, number> = {
    'dragonbane-bolt': 0.5,
    'dragonbane-impact': 0.6,
    'hunters-web': 1.2,
    'hunters-web-pop': 1.5,
    'skyhawk-dive': 0.7,
    'skyhawk-impact': 0.6,
    'skyhawk-carry': 2.5,
  };

  it('are known ids that spawn without a warning', () => {
    for (const id of PATHFINDER_T5_EFFECT_IDS) {
      const { vfx, warn } = make();
      const h = vfx.spawnEffect(id, { position: { x: 1, y: 0, z: 1 } }, PARAMS[id]);
      frames(vfx, 0.05);
      expect(warn, id).not.toHaveBeenCalled();
      expect(h.alive, id).toBe(true);
    }
  });

  it('measured peak live points stay inside the declared table and every preset ends clean', () => {
    // The pool jitters a point's life by x0.75..x1.25 with Math.random: pin it to the maximum so the measured peak is the deterministic worst case.
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    try {
      // One cast of each. The Bolt's flare and its ribbon are two spawns (the ribbon lands later); the others are one spawn.
      for (const id of PATHFINDER_T5_EFFECT_IDS) {
        const { vfx, scene } = make();
        const base = scene.children.length;
        const handles = [vfx.spawnEffect(id, { position: { x: 0, y: 0, z: 0 }, yaw: 0 }, id === 'dragonbane-bolt' ? { flare: 1 } : PARAMS[id])];
        let max = vfx.points.liveCount;
        const total = LIFE[id] + 1;
        let spawnedRibbon = id !== 'dragonbane-bolt';
        for (let f = 0; f < Math.round(total * 60); f++) {
          if (!spawnedRibbon && f / 60 >= 0.3) {
            spawnedRibbon = true;
            handles.push(vfx.spawnEffect(id, { position: { x: 0, y: 0, z: 0 }, yaw: 0 }, PARAMS[id]));
          }
          vfx.update(1 / 60, false);
          max = Math.max(max, vfx.points.liveCount);
        }
        expect(max, id).toBeLessThanOrEqual(PATHFINDER_T5_PARTICLES[id]);
        if (PATHFINDER_T5_PARTICLES[id] > 0) expect(max, id).toBeGreaterThan(0);
        frames(vfx, 3);
        expect(handles.every((h) => !h.alive), id).toBe(true);
        expect(scene.children.length, id).toBe(base);
        expect(vfx.points.liveCount, id).toBe(0);
      }
    } finally {
      rnd.mockRestore();
    }
  });

  it('the web arming plus its pop (the cast as a whole) stay under 220 live points; every preset is under it alone', () => {
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    try {
      const { vfx } = make();
      vfx.spawnEffect('hunters-web', { position: { x: 0, y: 0, z: 0 } }, PARAMS['hunters-web']);
      let max = 0;
      frames(vfx, 1, () => (max = Math.max(max, vfx.points.liveCount)));
      vfx.spawnEffect('hunters-web-pop', { position: { x: 0, y: 0, z: 0 } }, PARAMS['hunters-web-pop']);
      max = Math.max(max, vfx.points.liveCount);
      frames(vfx, 2, () => (max = Math.max(max, vfx.points.liveCount)));
      expect(max).toBeLessThan(220);
      expect(Math.max(...Object.values(PATHFINDER_T5_PARTICLES))).toBeLessThan(220);
    } finally {
      rnd.mockRestore();
    }
  });

  it('stop removes the meshes at once and nothing is left behind', () => {
    for (const id of PATHFINDER_T5_EFFECT_IDS) {
      const { vfx, scene } = make();
      const base = scene.children.length;
      const h = vfx.spawnEffect(id, { position: { x: 0, y: 0, z: 0 } }, PARAMS[id]);
      frames(vfx, 0.1);
      h.stop();
      frames(vfx, 0.1);
      expect(h.alive, id).toBe(false);
      expect(scene.children.length, id).toBe(base);
      frames(vfx, 2);
      expect(vfx.points.liveCount, id).toBe(0);
    }
  });

  it('the Web ring is 12 m, with 12 runes and a net; the pop opens 8 net cones', () => {
    const { vfx, scene } = make();
    vfx.spawnEffect('hunters-web', { position: { x: 4, y: 0, z: -2 } }, { radius: 12, seconds: 1 });
    const group = scene.children.find((c) => c.type === 'Group') as THREE.Group;
    expect(group.position.x).toBe(4);
    const outer = (c: THREE.Object3D): number => ((c as THREE.Mesh).geometry as THREE.RingGeometry).parameters.outerRadius;
    const ringMesh = group.children.find((c) => (c as THREE.Mesh).geometry?.type === 'RingGeometry' && outer(c) === 12);
    expect(ringMesh).toBeDefined();
    expect(group.children.filter((c) => (c as THREE.Mesh).geometry?.type === 'RingGeometry' && outer(c) < 1)).toHaveLength(12);
    const { vfx: v2, scene: s2 } = make();
    v2.spawnEffect('hunters-web-pop', { position: { x: 0, y: 0, z: 0 } }, { radius: 12 });
    const pop = s2.children.find((c) => c.type === 'Group') as THREE.Group;
    expect(pop.children.filter((c) => (c as THREE.Mesh).geometry?.type === 'ConeGeometry')).toHaveLength(8);
    // Open to 2 m in 0.2 s: the cone's 0.5 m radius at scale 4 is a 4 m wide net (2 m across the radius).
    frames(v2, 0.25);
    const cone = pop.children.find((c) => (c as THREE.Mesh).geometry?.type === 'ConeGeometry') as THREE.Mesh;
    expect(cone.scale.x * 0.5).toBeCloseTo(2, 1);
  });

  it('the bolt ribbon runs along the aim for the given length and the flare is a separate spawn', () => {
    const { vfx, scene } = make();
    vfx.spawnEffect('dragonbane-bolt', { position: { x: 0, y: 1, z: 0 }, yaw: 0 }, { length: 40, pitch: 0 });
    const group = scene.children.find((c) => c.type === 'Group') as THREE.Group;
    const ribbon = group.children[0] as THREE.Mesh;
    expect((ribbon.geometry as THREE.BoxGeometry).parameters.depth).toBe(40);
    // Yaw 0 faces -Z: the ribbon's middle is 20 m ahead of the muzzle.
    expect(ribbon.position.z).toBeCloseTo(-20, 3);
    expect(ribbon.position.y).toBeCloseTo(1, 3);
    const { vfx: v2, scene: s2 } = make();
    v2.spawnEffect('dragonbane-bolt', { position: { x: 0, y: 1, z: 0 }, yaw: 0 }, { flare: 1 });
    const flare = s2.children.find((c) => c.type === 'Group') as THREE.Group;
    expect(flare.children.filter((c) => (c as THREE.Mesh).geometry?.type === 'PlaneGeometry')).toHaveLength(2);
    expect(v2.points.liveCount).toBeGreaterThanOrEqual(0);
  });

  it('the carry feathers ride the attached root: no extra offset, and they follow it (a non-zero root)', () => {
    const { vfx, scene } = make();
    const root = new THREE.Object3D();
    scene.add(root);
    root.position.set(40, 2, -30);
    root.updateMatrixWorld(true);
    const emitted: Array<{ x: number; y: number; z: number }> = [];
    const orig = vfx.points.emit.bind(vfx.points);
    vi.spyOn(vfx.points, 'emit').mockImplementation(((kind: never, pos: { x: number; y: number; z: number }, ...rest: never[]) => (emitted.push({ ...pos }), (orig as any)(kind, pos, ...rest))) as never);
    vfx.spawnEffect('skyhawk-carry', { position: { x: 0, y: 0, z: 0 }, attach: root }, { seconds: 0.5 });
    frames(vfx, 0.05);
    root.position.set(50, 2, -30);
    root.updateMatrixWorld(true);
    frames(vfx, 0.3);
    expect(emitted.length).toBeGreaterThanOrEqual(2);
    expect(emitted[0].x).toBeCloseTo(40);
    expect(emitted[0].y).toBeCloseTo(3);
    expect(emitted[emitted.length - 1].x).toBeCloseTo(50);
  });

  it('bad params do not throw', () => {
    const { vfx } = make();
    for (const id of PATHFINDER_T5_EFFECT_IDS) {
      expect(() => vfx.spawnEffect(id, { position: { x: 0, y: 0, z: 0 } }, { seconds: 'long' as never, radius: NaN, length: NaN, pitch: NaN, flare: NaN, hits: NaN })).not.toThrow();
    }
    frames(vfx, 3);
  });
});
