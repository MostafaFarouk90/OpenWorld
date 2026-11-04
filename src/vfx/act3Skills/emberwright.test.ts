import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { VfxServiceImpl } from '../VfxServiceImpl';
import { EMBERWRIGHT_T4_EFFECT_IDS, EMBERWRIGHT_T4_PARTICLES, EMBERWRIGHT_T5_EFFECT_IDS, EMBERWRIGHT_T5_PARTICLES } from './emberwright';

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

describe('Emberwright tier 5 presets (K11 PR 4, design 11.5)', () => {
  const fresnel = (scene: THREE.Scene): THREE.Mesh[] => {
    const out: THREE.Mesh[] = [];
    scene.traverse((o) => void (o.name === 'fresnelShell' && out.push(o as THREE.Mesh)));
    return out;
  };

  it('are known ids that spawn without a warning', () => {
    for (const id of EMBERWRIGHT_T5_EFFECT_IDS) {
      const { vfx, warn } = make();
      const h = vfx.spawnEffect(id, { position: { x: 1, y: 0, z: 1 } });
      frames(vfx, 0.1);
      expect(warn, id).not.toHaveBeenCalled();
      expect(h.alive, id).toBe(true);
    }
  });

  it('measured peak live points stay inside the declared table, under 220 each, and every preset ends clean', () => {
    // The pool jitters a point's life by x0.75..x1.25 with Math.random: pin it to the maximum so the measured peak is the deterministic worst case.
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    try {
      const lasts: Record<string, number> = { 'sunfire-charge': 0.6, 'sunfire-nova': 0.8, 'sunfire-ground': 6, 'colossus-rise': 1.5, 'colossus-slag': 30, 'colossus-slam': 0.4, 'keepers-breath': 2, 'keepers-heal': 1 };
      for (const id of EMBERWRIGHT_T5_EFFECT_IDS) {
        const { vfx, scene } = make();
        const h = vfx.spawnEffect(id, { position: { x: 0, y: 0, z: 0 }, yaw: 0 });
        const max = peak(vfx, lasts[id] + 2);
        expect(max, id).toBeLessThanOrEqual(EMBERWRIGHT_T5_PARTICLES[id]);
        if (EMBERWRIGHT_T5_PARTICLES[id] > 0) expect(max, id).toBeGreaterThan(0);
        expect(EMBERWRIGHT_T5_PARTICLES[id], id).toBeLessThan(220);
        frames(vfx, 2);
        expect(h.alive, id).toBe(false);
        expect(own(scene), id).toHaveLength(0);
        expect(vfx.points.liveCount, id).toBe(0);
      }
    } finally {
      rnd.mockRestore();
    }
  });

  it('stop removes the meshes at once and the effect emits nothing afterwards', () => {
    for (const id of EMBERWRIGHT_T5_EFFECT_IDS) {
      const { vfx, scene } = make();
      const h = vfx.spawnEffect(id, { position: { x: 0, y: 0, z: 0 } });
      frames(vfx, 0.1);
      h.stop();
      frames(vfx, 0.1);
      expect(h.alive, id).toBe(false);
      expect(own(scene), id).toHaveLength(0);
      frames(vfx, 3);
      expect(vfx.points.liveCount, id).toBe(0);
    }
  });

  it('the attached presets ride a non-zero root with a zero offset', () => {
    for (const [id, params] of [['sunfire-charge', { seconds: 0.6 }], ['colossus-slag', { seconds: 5 }], ['keepers-heal', {}]] as const) {
      const { vfx, scene } = make();
      const root = new THREE.Object3D();
      scene.add(root);
      root.position.set(4, 1, -3);
      root.updateMatrixWorld(true);
      vfx.spawnEffect(id, { position: { x: 0, y: 0, z: 0 }, attach: root }, params);
      const group = scene.children.find((c) => c !== root && c.type === 'Group') as THREE.Object3D;
      frames(vfx, 0.1);
      expect(group.position.x, id).toBeCloseTo(4);
      expect(group.position.z, id).toBeCloseTo(-3);
      expect(group.position.y, id).toBeGreaterThanOrEqual(1);
      root.position.set(-6, 0, 8);
      root.updateMatrixWorld(true);
      frames(vfx, 0.1);
      expect(group.position.x, id).toBeCloseTo(-6);
      expect(group.position.z, id).toBeCloseTo(8);
    }
  });

  it('the Nova sphere grows from nothing to the 10 m ring in 0.5 s while it fades, and the shock ring expands with it', () => {
    const { vfx, scene } = make();
    vfx.spawnEffect('sunfire-nova', { position: { x: 3, y: 0, z: 2 } }, { radius: 10, seconds: 0.5 });
    const shell = fresnel(scene)[0];
    frames(vfx, 0.05);
    const early = shell.scale.x;
    frames(vfx, 0.25);
    const mid = shell.scale.x;
    frames(vfx, 0.3);
    expect(early).toBeLessThan(2);
    expect(mid).toBeGreaterThan(early);
    expect(shell.scale.x).toBeCloseTo(10, 1);
    const fade = (shell.material as THREE.ShaderMaterial).uniforms.uProgress.value as number;
    expect(fade).toBeGreaterThan(0.9);
    const group = scene.children.find((c) => c.type === 'Group') as THREE.Group;
    expect(group.position.x).toBeCloseTo(3);
    expect(group.position.z).toBeCloseTo(2);
  });

  it('the burning ground is 6 m wide and stays 6 s', () => {
    const { vfx, scene } = make();
    const h = vfx.spawnEffect('sunfire-ground', { position: { x: 0, y: 0, z: 0 } }, { radius: 6, seconds: 6 });
    frames(vfx, 0.2);
    const ringMesh = own(scene)[0].children.find((c) => (c as THREE.Mesh).geometry?.type === 'RingGeometry') as THREE.Mesh;
    expect((ringMesh.geometry as THREE.RingGeometry).parameters.outerRadius).toBe(6);
    frames(vfx, 5.5);
    expect(h.alive).toBe(true);
    frames(vfx, 0.5);
    expect(h.alive).toBe(false);
  });

  it('the Breath cone opens along the facing, 8 m long and 35 degrees either side', () => {
    const { vfx, scene } = make();
    const yaw = Math.PI / 2; // faces -X
    vfx.spawnEffect('keepers-breath', { position: { x: 10, y: 0, z: 5 }, yaw }, { seconds: 2, range: 8, halfAngle: 35 });
    frames(vfx, 0.1);
    const group = scene.children.find((c) => c.type === 'Group') as THREE.Group;
    group.updateMatrixWorld(true);
    const cone = group.children[0].children[0] as THREE.Mesh;
    const params = (cone.geometry as THREE.ConeGeometry).parameters;
    expect(params.height).toBe(8);
    expect(params.radius).toBeCloseTo(8 * Math.tan((35 * Math.PI) / 180), 6);
    const baseCentre = cone.localToWorld(new THREE.Vector3(0, -8, 0));
    expect(baseCentre.x).toBeCloseTo(10 - 8, 4);
    expect(baseCentre.z).toBeCloseTo(5, 4);
    const apex = cone.localToWorld(new THREE.Vector3(0, 0, 0));
    expect(apex.x).toBeCloseTo(10, 4);
  });

  it('the golem rises over 1.5 s with a 200-point throw and a floor decal, and the slag shell stays up 30 s', () => {
    const { vfx } = make();
    const h = vfx.spawnEffect('colossus-rise', { position: { x: 0, y: 0, z: 0 } });
    frames(vfx, 0.05);
    expect(vfx.points.liveCount).toBe(200);
    expect(vfx.decals.liveCount).toBeGreaterThan(0);
    frames(vfx, 1.5);
    expect(h.alive).toBe(false);
    const s = vfx.spawnEffect('colossus-slag', { position: { x: 0, y: 0, z: 0 } });
    frames(vfx, 29);
    expect(s.alive).toBe(true);
    frames(vfx, 1.2);
    expect(s.alive).toBe(false);
  });

  it('the five capstone presets of a cast stay far inside the 4,000-point cap, and bad params do not throw', () => {
    expect(Math.max(...Object.values(EMBERWRIGHT_T5_PARTICLES))).toBeLessThan(220);
    const { vfx } = make();
    for (const id of EMBERWRIGHT_T5_EFFECT_IDS) {
      expect(() => vfx.spawnEffect(id, { position: { x: 0, y: 0, z: 0 } }, { seconds: 'long' as never, radius: NaN, range: NaN, halfAngle: NaN, scale: NaN })).not.toThrow();
    }
    frames(vfx, 1);
  });
});
