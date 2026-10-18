import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TrailManager } from './TrailManager';

const opts = { colors: [0xff0000, 0x00ff00, 0x0000ff] as [number, number, number], tail: 0.2, width: 1 };
const h = (x: number) => ({ x, y: 0, z: 0 });
const t = (x: number) => ({ x, y: 1, z: 0 });

function setup() {
  const scene = new THREE.Scene();
  return { scene, mgr: new TrailManager(scene) };
}

describe('TrailManager', () => {
  it('creates a mesh with the right buffers and material', () => {
    const { scene, mgr } = setup();
    mgr.create('a', opts);
    const mesh = scene.children[0] as THREE.Mesh;
    expect(mesh.frustumCulled).toBe(false);
    expect(mesh.geometry.getAttribute('position').count).toBe(48);
    const m = mesh.material as THREE.ShaderMaterial;
    expect(m.blending).toBe(THREE.AdditiveBlending);
    expect(m.depthWrite).toBe(false);
    expect(m.side).toBe(THREE.DoubleSide);
  });
  it('same id reuses the slot', () => {
    const { scene, mgr } = setup();
    const a = mgr.create('a', opts);
    expect(mgr.create('a', opts)).toBe(a);
    expect(mgr.liveCount).toBe(1);
    expect(scene.children.length).toBe(1);
  });
  it('7th trail recycles the oldest', () => {
    const { scene, mgr } = setup();
    const trails = Array.from({ length: 6 }, (_, i) => mgr.create(`t${i}`, opts));
    const seventh = mgr.create('t6', opts);
    expect(trails[0].alive).toBe(false);
    expect(trails[1].alive).toBe(true);
    expect(seventh.alive).toBe(true);
    expect(mgr.liveCount).toBe(6);
    expect(scene.children.length).toBe(6);
  });
  it('dispose is idempotent and removes from the scene', () => {
    const { scene, mgr } = setup();
    const a = mgr.create('a', opts);
    a.dispose();
    a.dispose();
    expect(a.alive).toBe(false);
    expect(scene.children.length).toBe(0);
    expect(mgr.liveCount).toBe(0);
    a.push(h(0), t(0), 0);
    mgr.update(1);
    mgr.dispose();
    mgr.dispose();
  });
  it('setEmitting twice is safe and gates push', () => {
    const { scene, mgr } = setup();
    const a = mgr.create('a', opts);
    a.setEmitting(false);
    a.setEmitting(false);
    expect(a.emitting).toBe(false);
    a.push(h(0), t(0), 0);
    a.push(h(1), t(1), 0.01);
    mgr.update(0.02);
    expect((scene.children[0] as THREE.Mesh).visible).toBe(false);
    a.setEmitting(true);
    a.push(h(0), t(0), 0.02);
    a.push(h(1), t(1), 0.03);
    mgr.update(0.04);
    expect((scene.children[0] as THREE.Mesh).visible).toBe(true);
  });
  it('tail fades then goes invisible once drained', () => {
    const { scene, mgr } = setup();
    const a = mgr.create('a', opts);
    for (let i = 0; i < 5; i++) a.push(h(i), t(i), i * 0.02);
    mgr.update(0.1);
    const mesh = scene.children[0] as THREE.Mesh;
    expect(mesh.visible).toBe(true);
    expect(mesh.geometry.drawRange.count).toBe(4 * 6);
    a.setEmitting(false);
    mgr.update(0.2);
    expect(mesh.visible).toBe(true);
    mgr.update(0.5);
    expect(mesh.visible).toBe(false);
    expect(mesh.geometry.drawRange.count).toBe(0);
  });
  it('never throws on NaN input', () => {
    const { mgr } = setup();
    const a = mgr.create('a', opts);
    expect(() => {
      a.push({ x: NaN, y: 0, z: 0 }, t(0), NaN);
      mgr.update(NaN);
    }).not.toThrow();
  });
  it('width scales the pair about its midpoint', () => {
    const { scene, mgr } = setup();
    const a = mgr.create('a', { ...opts, width: 2 });
    a.push(h(0), t(0), 0);
    mgr.update(0.01);
    const arr = (scene.children[0] as THREE.Mesh).geometry.getAttribute('position').array as Float32Array;
    expect(arr[1]).toBeCloseTo(-0.5);
    expect(arr[4]).toBeCloseTo(1.5);
  });
});
