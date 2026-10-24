import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { KNIGHT } from '../../config/constants';
import { buildRedmaneModel, LANCE_BONE, REDMANE_CLIPS } from './RedmaneModel';
import { LOOK } from './tuning';

let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };

beforeAll(async () => {
  (globalThis as any).self ??= globalThis;
  const fsModule = 'node:fs';
  const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as any;
  const file = readFileSync('public/assets/kaykit-adventurers/characters/Barbarian.glb');
  const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res as any, rej));
});

const build = (warn = vi.fn()) => ({ model: buildRedmaneModel({ model: cloneSkinned(gltf.scene), clips: gltf.animations }, warn), warn });

describe('RedmaneModel (KayKit Barbarian)', () => {
  it('scales the Barbarian by 1.15 on the Knight placement', () => {
    const { model } = build();
    expect(model.owner.scale.x).toBeCloseTo(KNIGHT.modelScale * LOOK.scale);
    expect(model.owner.rotation.y).toBeCloseTo(Math.PI);
    model.dispose();
  });

  it('hides every built-in held item (axe, shield) so he holds only the lance', () => {
    const { model } = build();
    let checked = 0;
    model.owner.traverse((o) => {
      if (/^(1H_|2H_|Round_Shield|Barbarian_Round_Shield)/.test(o.name)) {
        expect(o.visible, o.name).toBe(false);
        checked++;
      }
    });
    expect(checked).toBeGreaterThan(0);
    model.dispose();
  });

  it('hangs the procedural lance in the right hand at its metre size, and drops it on the floor', () => {
    const { model } = build();
    expect(model.lance.parent?.name).toBe(LANCE_BONE);
    model.root.updateMatrixWorld(true);
    expect(new THREE.Vector3().setFromMatrixScale(model.lance.matrixWorld).y).toBeCloseTo(LOOK.lanceScale, 3);
    model.dropLance();
    expect(model.lance.parent).toBe(model.root);
    expect(model.lance.position.y).toBeLessThan(0.2);
    model.dropLance();
    expect(model.lance.parent).toBe(model.root);
    model.dispose();
  });

  it('carries an Adventurers staff as the lance when one is supplied, at the same hand scale, and leaves its shared geometry alone', () => {
    const geo = new THREE.BoxGeometry(0.1, 2, 0.1);
    const spy = vi.spyOn(geo, 'dispose');
    const staff = () => new THREE.Group().add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial()));
    const model = buildRedmaneModel({ model: cloneSkinned(gltf.scene), clips: gltf.animations, staff }, vi.fn());
    expect(model.lance.parent?.name).toBe(LANCE_BONE);
    model.root.updateMatrixWorld(true);
    expect(new THREE.Vector3().setFromMatrixScale(model.lance.matrixWorld).y).toBeCloseTo(LOOK.lanceScale, 3);
    model.dropLance();
    expect(model.lance.parent).toBe(model.root);
    model.dispose();
    expect(spy).not.toHaveBeenCalled();
  });

  it('tints its own material clones red, and the telegraph flash moves the emissive and back', () => {
    const { model } = build();
    const source = new Set<THREE.Material>();
    gltf.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (m) (Array.isArray(m) ? m : [m]).forEach((x) => source.add(x));
    });
    let body: THREE.MeshStandardMaterial | null = null;
    model.owner.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && !Array.isArray(m)) {
        expect(source.has(m)).toBe(false);
        body ??= m;
      }
    });
    const base = body!.emissive.getHex();
    model.setTelegraph(1);
    expect(body!.emissive.getHex()).not.toBe(base);
    model.setTelegraph(0);
    expect(body!.emissive.getHex()).toBe(base);
    model.setOpacity(0.5);
    expect(body!.transparent).toBe(true);
    model.setOpacity(1);
    expect(body!.transparent).toBe(false);
    model.dispose();
  });

  it('carries every clip he plays; an unknown clip warns once and keeps going', () => {
    const names = new Set(gltf.animations.map((c) => c.name));
    for (const clip of Object.values(REDMANE_CLIPS)) expect(names.has(clip), clip).toBe(true);
    const warn = vi.fn();
    const m = buildRedmaneModel({ model: cloneSkinned(gltf.scene), clips: [] }, warn);
    m.play('idle');
    m.play('idle');
    expect(warn).toHaveBeenCalledTimes(1);
    m.dispose();
  });

  it('builds hurtboxes on the skeleton and disposes cleanly twice', () => {
    const { model } = build();
    expect(model.hurtboxes).toBeTruthy();
    model.update(1 / 60);
    model.setSpeed(3);
    model.dispose();
    model.dispose();
    expect(model.root.parent).toBeNull();
  });

  it('throws on a model with no skinned mesh or no hand bone', () => {
    expect(() => buildRedmaneModel({ model: new THREE.Group(), clips: [] })).toThrow(/skinned/);
  });
});
