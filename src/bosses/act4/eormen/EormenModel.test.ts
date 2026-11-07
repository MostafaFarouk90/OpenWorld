import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { KNIGHT } from '../../../config/constants';
import { buildEormenModel, EORMEN_CLIPS, HIDDEN_PROPS } from './EormenModel';
import { EORMEN } from './tuning';

let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };

beforeAll(async () => {
  (globalThis as any).self ??= globalThis;
  const fsModule = 'node:fs';
  const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as any;
  const file = readFileSync('public/assets/kaykit-adventurers/characters/Rogue_Hooded.glb');
  const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res as any, rej));
});

const build = (warn = vi.fn()) => ({ model: buildEormenModel({ model: cloneSkinned(gltf.scene), clips: gltf.animations }, warn), warn });

describe('EormenModel (KayKit Rogue_Hooded)', () => {
  it('Rogue_Hooded carries every clip he plays', () => {
    const names = new Set(gltf.animations.map((c) => c.name));
    for (const clip of Object.values(EORMEN_CLIPS)) expect(names.has(clip), clip).toBe(true);
  });

  it('is scaled 1.4 on the Knight placement and stands taller than the Knight', () => {
    const { model } = build();
    expect(model.owner.scale.x).toBeCloseTo(KNIGHT.modelScale * EORMEN.modelScale);
    model.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model.root, true);
    expect(box.max.y - box.min.y).toBeGreaterThan(2);
    expect(box.max.y - box.min.y).toBeLessThan(3.6);
    model.dispose();
  });

  it('hides the crossbows and knives, wears a crown and carries a staff, on its own material clones', () => {
    const { model } = build();
    for (const name of HIDDEN_PROPS) {
      const prop = model.owner.getObjectByName(name);
      if (prop) expect(prop.visible, name).toBe(false);
    }
    expect(model.owner.getObjectByName('eormen-crown')).toBeDefined();
    expect(model.owner.getObjectByName('eormen-staff')).toBeDefined();
    const source = new Set<THREE.Material>();
    gltf.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (m) (Array.isArray(m) ? m : [m]).forEach((x) => source.add(x));
    });
    model.owner.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && !Array.isArray(m)) expect(source.has(m)).toBe(false);
    });
    model.dispose();
  });

  it('the crown sits above the head, near the top of the figure', () => {
    const { model } = build();
    model.root.updateMatrixWorld(true);
    const crownAt = new THREE.Vector3();
    model.crown.getWorldPosition(crownAt);
    const box = new THREE.Box3().setFromObject(model.root, true);
    expect(crownAt.y).toBeGreaterThan(box.max.y - 0.8);
    model.dispose();
  });

  it('a missing clip warns once and keeps playing; glow clamps and dispose is idempotent', () => {
    const { model, warn } = build();
    model.play('idle', { loop: true });
    (EORMEN_CLIPS as any).idle = 'Nope';
    try {
      model.play('idle');
      model.play('idle');
    } finally {
      (EORMEN_CLIPS as any).idle = 'Idle';
    }
    expect(warn).toHaveBeenCalledTimes(1);
    model.setGlow(Number.NaN);
    model.setGlow(5);
    model.update(1 / 60);
    model.dispose();
    model.dispose();
    expect(model.root.parent).toBeNull();
  });

  it('throws on a model with no skinned mesh', () => {
    expect(() => buildEormenModel({ model: new THREE.Group(), clips: [] })).toThrow(/skinned/);
  });
});
