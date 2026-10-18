import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { KNIGHT } from '../../config/constants';
import { buildCenser, buildPriorModel, HIDDEN_PROPS, PRIOR_CLIPS, PRIOR_SCALE } from './PriorModel';

let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };

beforeAll(async () => {
  (globalThis as any).self ??= globalThis;
  const fsModule = 'node:fs';
  const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as any;
  const file = readFileSync('public/assets/kaykit-adventurers/characters/Mage.glb');
  const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res as any, rej));
});

const build = (warn = vi.fn()) => ({ model: buildPriorModel({ model: cloneSkinned(gltf.scene), clips: gltf.animations }, warn), warn });

describe('PriorModel (KayKit Mage)', () => {
  it('the Mage carries every clip the Prior plays', () => {
    const names = new Set(gltf.animations.map((c) => c.name));
    for (const clip of Object.values(PRIOR_CLIPS)) expect(names.has(clip), clip).toBe(true);
  });

  it('scales the Mage by 1.3 on the Knight placement, about 1.3x the Knight height', () => {
    const { model } = build();
    expect(model.owner.scale.x).toBeCloseTo(KNIGHT.modelScale * PRIOR_SCALE);
    expect(model.owner.rotation.y).toBeCloseTo(Math.PI);
    model.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model.root, true);
    const height = box.max.y - box.min.y;
    expect(height).toBeGreaterThan(1.8);
    expect(height).toBeLessThan(3.2);
    model.dispose();
  });

  it('hides the staff, wand and books, keeps the hat, and tints its own material clones', () => {
    const { model } = build();
    for (const name of HIDDEN_PROPS) {
      const prop = model.owner.getObjectByName(name);
      if (prop) expect(prop.visible, name).toBe(false);
    }
    expect(model.owner.getObjectByName('Mage_Hat')?.visible).toBe(true);
    const source = new Set<THREE.Material>();
    gltf.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (m) (Array.isArray(m) ? m : [m]).forEach((x) => source.add(x));
    });
    model.owner.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && !Array.isArray(m) && !(m.name ?? '').startsWith('censer')) {
        if ((o as THREE.Object3D).parent?.name === 'prior-censer') return;
        expect(source.has(m)).toBe(false);
      }
    });
    model.dispose();
  });

  it('hangs the censer in the right hand at its metre size', () => {
    const { model } = build();
    expect(model.censer.parent?.name).toBe('handslotr');
    model.root.updateMatrixWorld(true);
    const s = new THREE.Vector3().setFromMatrixScale(model.censer.matrixWorld);
    expect(s.y).toBeCloseTo(1, 3);
    model.dispose();
  });

  it('builds hurtboxes on the Mage skeleton', () => {
    const { model } = build();
    expect(model.hurtboxes).toBeDefined();
    model.dispose();
  });

  it('plays clips and steps the mixer; an unknown clip warns once', () => {
    const { model, warn } = build();
    model.play('censerLift');
    model.update(0.5);
    model.update(NaN);
    model.play('idle', { loop: true });
    model.update(0.1);
    expect(warn).not.toHaveBeenCalled();
    const broken = buildPriorModel({ model: cloneSkinned(gltf.scene), clips: [] }, warn);
    broken.play('death');
    broken.play('death');
    expect(warn).toHaveBeenCalledTimes(1);
    broken.dispose();
    model.dispose();
  });

  it('setGlow ramps the emissive toward white and back', () => {
    const { model } = build();
    const bowl = model.censer.getObjectByName('censer-bowl') as THREE.Mesh;
    const mat = bowl.material as THREE.MeshStandardMaterial;
    model.setGlow(1);
    expect(mat.emissive.getHex()).toBe(0xffffff);
    model.setGlow(0);
    expect(mat.emissive.getHex()).toBe(0x000000);
    model.setGlow(NaN);
    expect(mat.emissive.getHex()).toBe(0x000000);
    model.dispose();
  });

  it('dispose detaches the root and is idempotent', () => {
    const { model } = build();
    const parent = new THREE.Group();
    parent.add(model.root);
    model.dispose();
    model.dispose();
    expect(model.root.parent).toBeNull();
  });

  it('throws on a model without a skinned mesh', () => {
    expect(() => buildPriorModel({ model: new THREE.Group(), clips: [] })).toThrow(/no skinned mesh/);
  });

  it('the censer has eight chain links, a bowl and an ember core', () => {
    const c = buildCenser();
    expect(c.children.filter((o) => o.name.startsWith('censer-link-'))).toHaveLength(8);
    expect(c.getObjectByName('censer-bowl')).toBeDefined();
    expect(c.getObjectByName('censer-ember')).toBeDefined();
  });

  it('setGlow still reaches the bowl after a dissolve swapped its material for a clone', () => {
    const { model } = build();
    const bowl = model.censer.getObjectByName('censer-bowl') as THREE.Mesh;
    const original = bowl.material as THREE.MeshStandardMaterial;
    const swapped = original.clone();
    bowl.material = swapped;
    model.setGlow(1);
    expect(swapped.emissive.getHex()).toBe(0xffffff);
    model.dispose();
    bowl.material = original;
  });
});
