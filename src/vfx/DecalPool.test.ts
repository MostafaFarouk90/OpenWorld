import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DecalPool } from './DecalPool';
import { CAPS } from './tuning';

const P = { x: 0, y: 2, z: 0 };
const meshes = (scene: THREE.Scene) => scene.children as THREE.Mesh[];
const visible = (scene: THREE.Scene) => meshes(scene).filter((m) => m.visible).length;

describe('DecalPool', () => {
  it('places a 4x4 draped grid with polygon offset', () => {
    const scene = new THREE.Scene();
    const pool = new DecalPool(scene, (x, z) => x + z);
    expect(pool.place({ x: 1, y: 0, z: 1 }, { x: 0, y: 1, z: 0 }, 1, 0x222222, 0)).toBe(true);
    const m = meshes(scene)[0];
    const mat = m.material as THREE.ShaderMaterial;
    expect(mat.polygonOffset).toBe(true);
    expect(mat.polygonOffsetFactor).toBeLessThan(0);
    expect(mat.polygonOffsetUnits).toBeLessThan(0);
    expect(mat.depthWrite).toBe(false);
    expect(mat.transparent).toBe(true);
    const pos = m.geometry.getAttribute('position');
    expect(pos.count).toBe(16);
    expect(pos.getY(0)).toBeCloseTo(0 + 0 + 0.03); // x=0,z=0
    expect(pos.getY(15)).toBeCloseTo(4 + 0.03); // x=2,z=2
  });
  it('heightAt NaN or missing falls back to pos.y', () => {
    const scene = new THREE.Scene();
    const a = new DecalPool(scene, () => NaN);
    a.place(P, undefined, 1, 0, 0);
    expect(meshes(scene)[0].geometry.getAttribute('position').getY(5)).toBeCloseTo(2.03);
    const b = new DecalPool(scene);
    b.place(P, undefined, 1, 0, 0);
    expect(meshes(scene)[1].geometry.getAttribute('position').getY(5)).toBeCloseTo(2.03);
  });
  it('wall normal builds a plane facing the normal', () => {
    const scene = new THREE.Scene();
    const pool = new DecalPool(scene);
    expect(pool.place(P, { x: 1, y: 0, z: 0 }, 1, 0, 0)).toBe(true);
    const pos = meshes(scene)[0].geometry.getAttribute('position');
    for (let i = 0; i < 16; i++) expect(pos.getX(i)).toBeCloseTo(0.02);
  });
  it('rejects NaN inputs and non-positive radius', () => {
    const pool = new DecalPool(new THREE.Scene());
    expect(pool.place({ x: NaN, y: 0, z: 0 }, undefined, 1, 0, 0)).toBe(false);
    expect(pool.place(P, undefined, NaN, 0, 0)).toBe(false);
    expect(pool.place(P, undefined, 0, 0, 0)).toBe(false);
    expect(pool.place(P, undefined, -1, 0, 0)).toBe(false);
    expect(pool.place(P, undefined, 1, 0, NaN)).toBe(false);
    expect(pool.liveCount).toBe(0);
  });
  it('setMax(0) hides all and disables placing', () => {
    const scene = new THREE.Scene();
    const pool = new DecalPool(scene);
    pool.place(P, undefined, 1, 0, 0);
    pool.place(P, undefined, 1, 0, 1);
    pool.setMax(0);
    expect(pool.liveCount).toBe(0);
    expect(visible(scene)).toBe(0);
    expect(pool.place(P, undefined, 1, 0, 2)).toBe(false);
    pool.setMax(5);
    expect(pool.place(P, undefined, 1, 0, 3)).toBe(true);
  });
  it('lowering max drops the oldest', () => {
    const scene = new THREE.Scene();
    const pool = new DecalPool(scene);
    for (let i = 0; i < 5; i++) pool.place({ x: i * 10, y: 0, z: 0 }, undefined, 1, 0, i);
    pool.setMax(2);
    expect(pool.liveCount).toBe(2);
    expect(visible(scene)).toBe(2);
    const xs = meshes(scene).filter((m) => m.visible).map((m) => m.geometry.getAttribute('position').getX(5));
    expect(Math.min(...xs)).toBeGreaterThan(25);
  });
  it('recycles the oldest at max', () => {
    const scene = new THREE.Scene();
    const pool = new DecalPool(scene, undefined, 3);
    for (let i = 0; i < 7; i++) expect(pool.place(P, undefined, 1, 0, i)).toBe(true);
    expect(pool.liveCount).toBe(3);
    expect(scene.children.length).toBe(3);
  });
  it('fades over the fade time then frees', () => {
    const scene = new THREE.Scene();
    const pool = new DecalPool(scene);
    pool.place(P, undefined, 1, 0, 0);
    const u = (meshes(scene)[0].material as THREE.ShaderMaterial).uniforms.uOpacity;
    pool.update(0);
    const full = u.value;
    pool.update(CAPS.decalFadeSeconds / 2);
    expect(u.value).toBeLessThan(full);
    expect(pool.liveCount).toBe(1);
    pool.update(CAPS.decalFadeSeconds);
    expect(pool.liveCount).toBe(0);
    expect(visible(scene)).toBe(0);
  });
  it('dispose is idempotent', () => {
    const scene = new THREE.Scene();
    const pool = new DecalPool(scene);
    pool.place(P, undefined, 1, 0, 0);
    pool.dispose();
    pool.dispose();
    expect(scene.children.length).toBe(0);
    expect(pool.place(P, undefined, 1, 0, 0)).toBe(false);
  });
});
