import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { HURTBOX_NAMES } from '../combat/types';
import { EMBEDDED_SHIELD, EMBEDDED_SWORD, EMBEDDED_WEAPONS } from '../characters/knightClips';
import { ASH_WRAITH, BLIGHTED_SOLDIER } from './defs';
import { buildEnemyModel, CLAW_BONE, CLAW_LENGTH } from './EnemyModel';
import type { EnemyDef } from './types';

let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };

beforeAll(async () => {
  (globalThis as any).self ??= globalThis;
  const fsModule = 'node:fs';
  const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as any;
  const file = readFileSync('public/assets/kaykit-adventurers/characters/Knight.glb');
  const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  gltf = await new Promise<any>((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
  warn.mockRestore();
  error.mockRestore();
});

const build = (def: EnemyDef) => buildEnemyModel({ model: SkeletonUtils.clone(gltf.scene), clips: gltf.animations }, def);

function sourceMaterials(): Set<THREE.Material> {
  const set = new Set<THREE.Material>();
  gltf.scene.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (m) for (const x of ([] as THREE.Material[]).concat(m)) set.add(x);
  });
  return set;
}

function meshMaterials(root: THREE.Object3D): Set<THREE.Material> {
  const set = new Set<THREE.Material>();
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (m) for (const x of ([] as THREE.Material[]).concat(m)) set.add(x);
  });
  return set;
}

describe('buildEnemyModel', () => {
  it('places the Knight like KnightAvatar: turned to face -Z, scaled to metres, feet at the origin', () => {
    const m = build(ASH_WRAITH);
    expect(m.owner.parent).toBe(m.root);
    expect(m.owner.rotation.y).toBeCloseTo(Math.PI);
    expect(m.owner.scale.x).toBeCloseTo(0.78);
    expect(m.bone('hips').isBone).toBe(true);
    expect(() => m.bone('nope')).toThrow(/nope/);
  });

  it('gives two instances independent skeletons', () => {
    const a = build(ASH_WRAITH);
    const b = build(ASH_WRAITH);
    expect(a.skeleton).not.toBe(b.skeleton);
    expect(a.bone('handr')).not.toBe(b.bone('handr'));
    a.bone('handr').rotation.x = 1;
    expect(b.bone('handr').rotation.x).not.toBe(1);
  });

  it('clones materials per instance, keeping sharing within it, and leaves the source untouched', () => {
    const source = sourceMaterials();
    const before = [...source].map((m) => ({ m, color: (m as THREE.MeshStandardMaterial).color.getHex(), emissive: (m as THREE.MeshStandardMaterial).emissive.getHex(), opacity: m.opacity, transparent: m.transparent }));
    const a = build(ASH_WRAITH);
    const b = build(ASH_WRAITH);
    const matsA = meshMaterials(a.root);
    const matsB = meshMaterials(b.root);
    // Knight.glb shares one material across all meshes; the clone stays shared inside one instance.
    expect(matsA.size).toBe(source.size);
    expect(a.materials).toEqual([...matsA]);
    for (const m of matsA) {
      expect(source.has(m)).toBe(false);
      expect(matsB.has(m)).toBe(false);
    }

    const ma = a.materials[0] as THREE.MeshStandardMaterial;
    const mb = b.materials[0] as THREE.MeshStandardMaterial;
    const src = [...source][0] as THREE.MeshStandardMaterial;
    const expected = src.color.clone().multiply(new THREE.Color(ASH_WRAITH.model.tint));
    expect(ma.color.getHex()).toBe(expected.getHex());
    expect(ma.emissive.getHex()).toBe(ASH_WRAITH.model.emissive);

    a.setTelegraph(1, 0xff0000);
    expect(ma.emissive.getHex()).toBe(0xff0000);
    expect(mb.emissive.getHex()).toBe(ASH_WRAITH.model.emissive);
    a.setTelegraph(0);
    expect(ma.emissive.getHex()).toBe(ASH_WRAITH.model.emissive);

    a.setOpacity(0.3);
    expect(ma.opacity).toBeCloseTo(0.3);
    expect(ma.transparent).toBe(true);
    expect(mb.opacity).toBe(1);
    expect(mb.transparent).toBe(false);
    a.setOpacity(1);
    expect(ma.transparent).toBe(false);

    for (const { m, color, emissive, opacity, transparent } of before) {
      const s = m as THREE.MeshStandardMaterial;
      expect(s.color.getHex()).toBe(color);
      expect(s.emissive.getHex()).toBe(emissive);
      expect(s.opacity).toBe(opacity);
      expect(s.transparent).toBe(transparent);
    }
  });

  it('tints each kind differently and gives the soldier its recipe emissive', () => {
    const w = build(ASH_WRAITH).materials[0] as THREE.MeshStandardMaterial;
    const s = build(BLIGHTED_SOLDIER).materials[0] as THREE.MeshStandardMaterial;
    expect(w.color.getHex()).not.toBe(s.color.getHex());
    expect(s.emissive.getHex()).toBe(BLIGHTED_SOLDIER.model.emissive);
  });

  it('shows the sword and shield for sword-shield and hides every other embedded weapon', () => {
    const m = build(BLIGHTED_SOLDIER);
    for (const name of EMBEDDED_WEAPONS) {
      const obj = m.owner.getObjectByName(name)!;
      expect(obj.visible, name).toBe(name === EMBEDDED_SWORD || name === EMBEDDED_SHIELD);
    }
    expect(m.weapons.right.object.name).toBe(EMBEDDED_SWORD);
    expect(m.weapons.left!.object.name).toBe(EMBEDDED_SHIELD);
    expect(m.tracers.left).toBeDefined();
    m.root.updateMatrixWorld(true);
    const hilt = m.weapons.right.hilt.getWorldPosition(new THREE.Vector3());
    const tip = m.weapons.right.tip.getWorldPosition(new THREE.Vector3());
    // KayKit 1H sword is about 0.7 m long at the 0.78 scale.
    expect(hilt.distanceTo(tip)).toBeGreaterThan(0.4);
    expect(hilt.distanceTo(tip)).toBeLessThan(1.2);
    const sh = m.weapons.left!;
    const shieldSpan = sh.hilt.getWorldPosition(new THREE.Vector3()).distanceTo(sh.tip.getWorldPosition(new THREE.Vector3()));
    expect(shieldSpan).toBeGreaterThan(0.3);
    expect(shieldSpan).toBeLessThan(1.2);
  });

  it('hides every embedded weapon for the wraith and puts claw markers on handr', () => {
    const m = build(ASH_WRAITH);
    for (const name of EMBEDDED_WEAPONS) expect(m.owner.getObjectByName(name)!.visible, name).toBe(false);
    expect(m.weapons.left).toBeUndefined();
    expect(m.tracers.left).toBeUndefined();
    const claw = m.weapons.right;
    expect(claw.object.parent).toBe(m.bone(CLAW_BONE));
    expect(claw.hilt.parent).toBe(claw.object);
    expect(claw.tip.parent).toBe(claw.object);
    m.root.updateMatrixWorld(true);
    const hilt = claw.hilt.getWorldPosition(new THREE.Vector3());
    const tip = claw.tip.getWorldPosition(new THREE.Vector3());
    const hand = m.bone(CLAW_BONE).getWorldPosition(new THREE.Vector3());
    expect(hilt.distanceTo(hand)).toBeLessThan(1e-6);
    expect(hilt.distanceTo(tip)).toBeCloseTo(CLAW_LENGTH, 3);
    // The tip lies beyond the fingers: further from the wrist than the hand slot.
    const wrist = m.bone('wristr').getWorldPosition(new THREE.Vector3());
    const slot = m.bone('handslotr').getWorldPosition(new THREE.Vector3());
    expect(tip.distanceTo(wrist)).toBeGreaterThan(slot.distanceTo(wrist) + 0.2);
  });

  it('covers the 12 Knight hurtboxes with the model as owner, and tracers attack as the model', () => {
    for (const def of [ASH_WRAITH, BLIGHTED_SOLDIER]) {
      const m = build(def);
      expect(m.hurtboxes.missing).toEqual([]);
      expect(m.hurtboxes.count).toBe(HURTBOX_NAMES.length);
      expect(m.hurtboxes.capsules.map((c) => c.name).sort()).toEqual([...HURTBOX_NAMES].sort());
      expect(m.hurtboxes.owner).toBe(m.owner);
      expect(m.tracers.right.attacker).toBe(m.owner);
    }
  });

  it('dispose frees the cloned materials only and detaches the root', () => {
    const parent = new THREE.Group();
    const a = build(ASH_WRAITH);
    const b = build(ASH_WRAITH);
    parent.add(a.root, b.root);
    const disposed: THREE.Material[] = [];
    const listen = (m: THREE.Material) => m.addEventListener('dispose', () => disposed.push(m));
    for (const m of [...a.materials, ...b.materials, ...sourceMaterials()]) listen(m);
    const geometries = new Set<THREE.BufferGeometry>();
    a.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) geometries.add((o as THREE.Mesh).geometry);
    });
    const geoDisposed = vi.fn();
    for (const g of geometries) g.addEventListener('dispose', geoDisposed);
    a.dispose();
    expect(disposed).toEqual(a.materials);
    expect(a.root.parent).toBeNull();
    expect(b.root.parent).toBe(parent);
    expect(geoDisposed).not.toHaveBeenCalled();
    a.dispose();
    expect(disposed.length).toBe(a.materials.length);
  });
});
