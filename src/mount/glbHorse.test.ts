import * as THREE from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { HurtboxSet } from '../combat/HurtboxSet';
import { diskSource } from '../assets/swap/testing/diskSource';
import { GALLOP_CLIP, GlbHorse, gallopPose, type HorseAsset } from './glbHorse';
import { loadHorseVisual } from './horseVisual';
import { HORSE, QuadrupedGait, modeOf, type GaitMode } from './rig';

let asset: HorseAsset;

beforeAll(async () => {
  const src = await diskSource();
  await src.load('horse');
  asset = { instantiate: () => src.instantiate('horse'), clips: src.animations('horse') };
});

const world = (o: THREE.Object3D): THREE.Vector3 => o.getWorldPosition(new THREE.Vector3());
const run = (h: GlbHorse, speed: number, seconds: number, slope = 0): void => {
  for (let i = 0; i < Math.round(seconds * 60); i++) h.update(speed, slope, 1 / 60);
  h.root.updateMatrixWorld(true);
};

describe('GlbHorse gallop', () => {
  it('the asset has no gallop clip (Run is the base) and the gallop plays Run faster than the canter', () => {
    expect(asset.clips.some((c) => c.name === GALLOP_CLIP)).toBe(false);
    const canter = new GlbHorse(asset);
    run(canter, 9, 1.5);
    const gallop = new GlbHorse(asset);
    run(gallop, 12, 1.5);
    expect(canter.mode).toBe('canter');
    expect(gallop.mode).toBe('gallop');
    expect(canter.playing!.clip).toBe('Run');
    expect(gallop.playing!.clip).toBe('Run');
    expect(gallop.playing!.timeScale).toBeGreaterThan(canter.playing!.timeScale + 0.2);
  });
  it('leans nose down and bobs at the gallop, level at the canter, and settles when he slows', () => {
    const h = new GlbHorse(asset);
    run(h, 9, 1.5);
    expect(h.rig.rotation.x).toBeCloseTo(0, 6);
    run(h, 12, 1.5);
    expect(h.rig.rotation.x).toBeLessThan(-0.03);
    let maxLift = 0;
    for (let i = 0; i < 90; i++) { h.update(12, 0, 1 / 60); maxLift = Math.max(maxLift, h.rig.position.y); }
    expect(maxLift).toBeGreaterThan(0.01);
    expect(maxLift).toBeLessThanOrEqual(0.0501);
    run(h, 3, 2);
    expect(Math.abs(h.rig.rotation.x)).toBeLessThan(0.002);
    h.reset();
    expect(h.rig.rotation.x).toBe(0);
    expect(h.rig.position.y).toBe(0);
  });
  it('the lean adds to the slope', () => {
    const h = new GlbHorse(asset);
    run(h, 12, 2, 0.2);
    expect(h.rig.rotation.x).toBeCloseTo(0.2 - 0.05, 1);
  });
  it('picks up a real Gallop clip when the asset has one', () => {
    const gallopClip = asset.clips.find((c) => c.name === 'Run')!.clone();
    gallopClip.name = GALLOP_CLIP;
    const h = new GlbHorse({ instantiate: asset.instantiate, clips: [...asset.clips, gallopClip] });
    run(h, 12, 1.5);
    expect(h.playing!.clip).toBe(GALLOP_CLIP);
    run(h, 9, 2);
    expect(h.playing!.clip).toBe('Run');
  });
  it('gallopPose is bounded and ignores bad input', () => {
    expect(Math.abs(gallopPose(0, 0.25).pitch)).toBe(0);
    expect(gallopPose(0, 0.25).lift).toBe(0);
    const p = gallopPose(1, 0.25);
    expect(p.pitch).toBeLessThan(0);
    expect(p.lift).toBeCloseTo(0.05, 6);
    expect(gallopPose(5, 0.25).lift).toBeLessThanOrEqual(0.05 + 1e-9);
    expect(Math.abs(gallopPose(NaN, 0.25).pitch)).toBe(0);
    expect(gallopPose(NaN, 0.25).lift).toBe(0);
  });
});

describe('GlbHorse', () => {
  it('stands on the ground, 2 m tall, facing -Z, with the saddle where a rider sits', () => {
    const h = new GlbHorse(asset);
    const box = new THREE.Box3();
    h.rig.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) {
        const m = o as THREE.SkinnedMesh;
        const v = new THREE.Vector3();
        for (let i = 0; i < m.geometry.attributes.position.count; i += 7) {
          m.getVertexPosition(i, v);
          box.expandByPoint(v.multiplyScalar(0.3));
        }
      }
    });
    expect(box.min.y).toBeGreaterThanOrEqual(-0.05);
    expect(box.min.y).toBeLessThan(0.1);
    expect(box.max.y).toBeGreaterThan(1.8);
    expect(box.max.y).toBeLessThan(2.4);
    const saddle = world(h.saddle);
    expect(saddle.y).toBeGreaterThan(1.2);
    expect(saddle.y).toBeLessThan(1.7);
    expect(Math.abs(saddle.x)).toBeLessThan(0.05);
    // The head is ahead (-Z) of the saddle, the tail behind it.
    expect(world(h.rig.getObjectByName('socket.head')!).z).toBeLessThan(saddle.z - 0.8);
    expect(world(h.rig.getObjectByName('socket.tail')!).z).toBeGreaterThan(saddle.z + 0.4);
    expect(h.length).toBeGreaterThan(1.2);
    expect(h.length).toBeLessThan(2.4);
  });

  it('carries the five socket names the rig contract names, with -Z along the part', () => {
    const h = new GlbHorse(asset);
    for (const n of ['socket.saddle', 'socket.mane', 'socket.head', 'socket.tail', 'socket.collar']) expect(h.rig.getObjectByName(n)).toBeTruthy();
    const mane = h.rig.getObjectByName('socket.mane')!;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(mane.getWorldQuaternion(new THREE.Quaternion()));
    // The neck rises toward the head: forward along it is ahead of the horse and not downward.
    expect(fwd.z).toBeLessThan(-0.3);
    expect(fwd.y).toBeGreaterThan(-0.2);
    const collar = world(h.rig.getObjectByName('socket.collar')!);
    expect(collar.z).toBeLessThan(world(h.saddle).z - 0.6);
  });

  it('shows the same gait mode as the procedural horse at every speed', () => {
    const ref = new QuadrupedGait(HORSE.legLength, QuadrupedGait.tuningFor(HORSE));
    for (const [speed, mode] of [[0, 'idle'], [2, 'walk'], [6, 'trot'], [9, 'canter'], [12, 'gallop']] as Array<[number, GaitMode]>) {
      const h = new GlbHorse(asset);
      ref.reset();
      for (let i = 0; i < 90; i++) ref.step(speed, 1 / 60);
      run(h, speed, 1.5);
      expect(h.mode).toBe(mode);
      expect(h.mode).toBe(modeOf(ref));
      h.dispose();
    }
  });

  it('animates: the legs move at a trot, the saddle stays near its height and finite', () => {
    const h = new GlbHorse(asset);
    run(h, 6, 0.5);
    const foot = h.rig.getObjectByName('FrontFootL')!;
    const a = world(foot);
    run(h, 6, 0.2);
    const b = world(foot);
    expect(a.distanceTo(b)).toBeGreaterThan(0.05);
    for (let i = 0; i < 120; i++) {
      run(h, 12, 1 / 60);
      const s = world(h.saddle);
      expect([s.x, s.y, s.z].every(Number.isFinite)).toBe(true);
      expect(s.y).toBeGreaterThan(1.2);
    }
    h.dispose();
  });

  it('pitches the whole body with the slope', () => {
    const h = new GlbHorse(asset);
    run(h, 0, 1, 0);
    const level = world(h.rig.getObjectByName('socket.head')!).y;
    run(h, 0, 1, 0.3);
    expect(world(h.rig.getObjectByName('socket.head')!).y).toBeGreaterThan(level + 0.2);
    h.reset();
    run(h, 0, 0.1, 0);
    expect(world(h.rig.getObjectByName('socket.head')!).y).toBeCloseTo(level, 1);
  });

  it('hurtboxes bind to the three bones and follow the body: torso along the body, neck and head forward', () => {
    const h = new GlbHorse(asset);
    run(h, 0, 0.5);
    const set = new HurtboxSet(h.rig, h.hurtboxDefs, 'test');
    expect(set.missing).toEqual([]);
    expect(set.count).toBe(3);
    set.update();
    const cap = (n: string) => set.capsules.find((c) => c.name === n)!;
    const torso = cap('torso');
    expect(Math.abs(torso.b.z - torso.a.z)).toBeGreaterThan(0.8);
    expect(Math.abs(torso.b.y - torso.a.y)).toBeLessThan(0.5);
    expect(torso.a.y).toBeGreaterThan(0.9);
    expect(torso.a.y).toBeLessThan(1.7);
    const neck = cap('abdomen');
    const head = cap('hips');
    expect(Math.min(neck.a.z, neck.b.z)).toBeLessThan(torso.a.z);
    // Head is the highest and most forward part.
    expect(Math.max(head.a.y, head.b.y)).toBeGreaterThan(Math.max(torso.a.y, torso.b.y));
    expect(Math.min(head.a.z, head.b.z)).toBeLessThan(Math.min(neck.a.z, neck.b.z) - 0.1);
    // After moving the body they follow it.
    h.root.position.set(10, 3, -4);
    h.root.updateMatrixWorld(true);
    set.update();
    expect(cap('torso').a.x).toBeGreaterThan(9);
    expect(cap('torso').a.y).toBeGreaterThan(3.9);
    set.dispose();
  });

  it('tints the hide on private materials and leaves the shared asset untouched', () => {
    const before = new Set<number>();
    const shared = asset.instantiate();
    shared.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) before.add(((o as THREE.Mesh).material as THREE.Material).id);
    });
    const h = new GlbHorse(asset);
    const hide: number[] = [];
    h.rig.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) expect(before.has((m.material as THREE.Material).id)).toBe(false);
      if (m.isMesh) hide.push((m.material as THREE.MeshStandardMaterial).color.getHex());
    });
    expect(hide).toContain(0x2a211d);
    // The glb's materials are alpha 0 in MASK mode (three would discard every fragment): the horse must draw.
    h.rig.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.MeshStandardMaterial;
      expect(mat.opacity).toBe(1);
      expect(mat.alphaTest).toBe(0);
    });
    h.dispose();
  });

  it('reset returns to the idle pose and dispose is safe twice', () => {
    const h = new GlbHorse(asset);
    run(h, 12, 1);
    h.reset();
    expect(h.mode).toBe('idle');
    h.dispose();
    h.dispose();
    h.update(5, 0, 1 / 60);
  });
});

describe('loadHorseVisual', () => {
  it('is the procedural horse without an asset and the glb horse with one', () => {
    expect(loadHorseVisual().glb).toBeFalsy();
    expect(loadHorseVisual(null).glb).toBeFalsy();
    const g = loadHorseVisual(asset);
    expect(g.glb).toBe(true);
    g.dispose();
  });

  it('falls back to the procedural horse and reports the failure when the asset is unusable', () => {
    const bad: HorseAsset = { instantiate: () => new THREE.Group(), clips: [] };
    const failed = vi.fn();
    expect(loadHorseVisual(bad, failed).glb).toBeFalsy();
    expect(failed).toHaveBeenCalledTimes(1);
  });
});
