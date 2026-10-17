import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { COMBAT } from '../config/constants';
import { KNIGHT_HURTBOX_DEFS } from './hurtboxLayout';
import { HurtboxSet } from './HurtboxSet';
import { HURTBOX_NAMES } from './types';

const BONES = [
  'head', 'chest', 'upperarm.l', 'upperarm.r', 'lowerarm.l', 'lowerarm.r',
  'upperleg.l', 'upperleg.r', 'lowerleg.l', 'lowerleg.r',
];

function rig(strip: boolean, skip: string[] = []): { root: THREE.Group; bones: Record<string, THREE.Object3D> } {
  const root = new THREE.Group();
  const bones: Record<string, THREE.Object3D> = {};
  BONES.forEach((n, i) => {
    if (skip.includes(n)) return;
    const b = new THREE.Bone();
    b.name = strip ? n.replace(/\./g, '') : n;
    b.position.set(i * 2, 0, 0); // spread out so capsules do not overlap
    root.add(b);
    bones[n] = b;
  });
  root.updateMatrixWorld(true);
  return { root, bones };
}

const ray = (ox: number, oy: number, oz: number, dx: number, dy: number, dz: number) =>
  new THREE.Ray(new THREE.Vector3(ox, oy, oz), new THREE.Vector3(dx, dy, dz));

describe('KNIGHT_HURTBOX_DEFS', () => {
  it('has one def per hurtbox name', () => {
    expect(KNIGHT_HURTBOX_DEFS.map((d) => d.name).sort()).toEqual([...HURTBOX_NAMES].sort());
  });
});

describe('HurtboxSet', () => {
  it('builds all 10 capsules for dotted and dot-stripped names', () => {
    for (const strip of [false, true]) {
      const { root } = rig(strip);
      const owner = {};
      const set = new HurtboxSet(root, undefined, owner);
      expect(set.count).toBe(10);
      expect(set.missing).toEqual([]);
      expect(set.owner).toBe(owner);
      expect(set.capsules).toHaveLength(10);
      const perCap = 2 * COMBAT.hurtboxRadialSegments + (2 * COMBAT.hurtboxHemisphereRings - 1) * COMBAT.hurtboxRadialSegments * 2;
      expect(set.geometry.getIndex()!.count / 3).toBe(perCap * 10);
    }
  });

  it('skips missing bones, lists them, and does not throw', () => {
    const { root } = rig(false, ['head', 'lowerleg.r']);
    const set = new HurtboxSet(root);
    expect(set.count).toBe(8);
    expect(set.missing.sort()).toEqual(['head', 'lowerLegR']);
    expect(set.capsules.find((c) => c.name === 'head')).toBeUndefined();
  });

  it('treats empty defs and a rig with no bones as valid no-ops', () => {
    const set = new HurtboxSet(new THREE.Group(), []);
    expect(set.count).toBe(0);
    expect(() => set.update()).not.toThrow();
    expect(() => set.tickFlash(0.1)).not.toThrow();
    expect(() => set.flash('head', 1)).not.toThrow();
    expect(set.nameOfTriangle(0)).toBe('');
    const none = new HurtboxSet(new THREE.Group());
    expect(none.count).toBe(0);
    expect(none.missing).toHaveLength(10);
    expect(() => none.dispose()).not.toThrow();
  });

  it('places world-space capsule endpoints from bone matrices', () => {
    const { root } = rig(true);
    const set = new HurtboxSet(root);
    const head = set.capsules.find((c) => c.name === 'head')!;
    const def = KNIGHT_HURTBOX_DEFS.find((d) => d.name === 'head')!;
    expect(head.a.y).toBeCloseTo(def.start.y);
    expect(head.b.y).toBeCloseTo(def.end.y);
  });

  it('refits after a bone moves: hits at the new place only', () => {
    const { root, bones } = rig(true);
    const set = new HurtboxSet(root);
    const headX = bones['head'].position.x;
    const down = (x: number) => ray(x, 2, 0, 0, -1, 0);
    expect(set.bvh.raycastFirst(down(headX), THREE.FrontSide)).not.toBeNull();
    bones['head'].position.x = 100;
    root.updateMatrixWorld(true);
    // not updated yet: still the old place
    expect(set.bvh.raycastFirst(down(100), THREE.FrontSide)).toBeNull();
    set.update();
    expect(set.bvh.raycastFirst(down(100), THREE.FrontSide)).not.toBeNull();
    expect(set.bvh.raycastFirst(down(headX), THREE.FrontSide)).toBeNull();
    const box = new THREE.Box3();
    set.bvh.getBoundingBox(box);
    expect(box.max.x).toBeGreaterThan(100);
  });

  it('nameOfTriangle maps ray hits to the right hurtbox', () => {
    const { root, bones } = rig(false);
    const set = new HurtboxSet(root);
    for (const def of KNIGHT_HURTBOX_DEFS) {
      const bone = bones[def.bone];
      const hit = set.bvh.raycastFirst(
        ray(bone.position.x, (def.start.y + def.end.y) / 2, 3, 0, 0, -1),
        THREE.FrontSide,
      );
      expect(hit, def.name).not.toBeNull();
      expect(set.nameOfTriangle(hit!.faceIndex!)).toBe(def.name);
    }
    expect(set.nameOfTriangle(-1)).toBe('');
    expect(set.nameOfTriangle(1e6)).toBe('');
  });

  it('has outward-facing winding (back-face hits from inside are culled)', () => {
    const { root } = rig(true);
    const set = new HurtboxSet(root);
    const x = (root.getObjectByName('head') as THREE.Object3D).position.x;
    expect(set.bvh.raycastFirst(ray(x, 0.1, 0, 0, 0, 1), THREE.FrontSide)).toBeNull();
    expect(set.bvh.raycastFirst(ray(x, 0.1, 0, 0, 0, 1), THREE.DoubleSide)).not.toBeNull();
  });

  it('follows a bone rotated 90 degrees', () => {
    const { root, bones } = rig(true);
    const set = new HurtboxSet(root);
    const bone = bones['head'];
    bone.rotation.z = -Math.PI / 2; // local +Y -> world +X
    root.updateMatrixWorld(true);
    set.update();
    const cap = set.capsules.find((c) => c.name === 'head')!;
    const def = KNIGHT_HURTBOX_DEFS.find((d) => d.name === 'head')!;
    expect(cap.b.x - cap.a.x).toBeCloseTo(def.end.y - def.start.y);
    expect(cap.b.y - cap.a.y).toBeCloseTo(0, 5);
    const x = bone.position.x;
    // a downward ray at x+0.2 now hits (capsule lies along +X), but didn't before
    expect(set.bvh.raycastFirst(ray(x + 0.2, 2, 0, 0, -1, 0), THREE.FrontSide)).not.toBeNull();
    expect(set.bvh.raycastFirst(ray(x, 0.4, 0, 0, -1, 0), THREE.FrontSide)).not.toBeNull();
    expect(set.bvh.raycastFirst(ray(x, 2, 2, 0, -1, 0), THREE.FrontSide)).toBeNull();
    // no NaNs even when the axis is degenerate
    bone.scale.set(1, 0, 1);
    root.updateMatrixWorld(true);
    set.update();
    const arr = set.geometry.getAttribute('position').array as Float32Array;
    expect(arr.every(Number.isFinite)).toBe(true);
  });

  it('debug mesh, flash and tickFlash', () => {
    const { root } = rig(true);
    const set = new HurtboxSet(root);
    expect(set.debugMesh.visible).toBe(false);
    expect(set.debugMesh.matrixAutoUpdate).toBe(false);
    expect(set.debugMesh.frustumCulled).toBe(false);
    set.setDebugVisible(true);
    expect(set.debugMesh.visible).toBe(true);
    set.setDebugVisible(false);
    expect(set.debugMesh.visible).toBe(false);

    const col = set.geometry.getAttribute('color') as THREE.BufferAttribute;
    const headIdx = set.capsules.findIndex((c) => c.name === 'head');
    const vp = col.count / set.count;
    const before = col.getX(headIdx * vp);
    set.flash('head', 0.2);
    const flashed = col.getX(headIdx * vp);
    expect(flashed).toBeGreaterThan(before);
    expect(col.getX(((headIdx + 1) % set.count) * vp)).toBeCloseTo(before);
    set.tickFlash(0.1);
    const mid = col.getX(headIdx * vp);
    expect(mid).toBeLessThan(flashed);
    expect(mid).toBeGreaterThan(before);
    set.tickFlash(1);
    expect(col.getX(headIdx * vp)).toBeCloseTo(before);
    set.flash('nope', 1); // unknown name is ignored
  });

  it('dispose is safe to call twice and update afterwards is a no-op', () => {
    const { root } = rig(true);
    const set = new HurtboxSet(root);
    set.dispose();
    expect(() => set.dispose()).not.toThrow();
    expect(() => set.update()).not.toThrow();
  });

  it('scales capsule radius with the bone world scale', () => {
    const { root } = rig(false);
    root.scale.setScalar(0.5);
    root.updateMatrixWorld(true);
    const set = new HurtboxSet(root);
    set.update();
    const torso = set.capsules.find((c) => c.name === 'torso')!;
    expect(torso.radius).toBeCloseTo(KNIGHT_HURTBOX_DEFS.find((d) => d.name === 'torso')!.radius * 0.5);
  });
});
