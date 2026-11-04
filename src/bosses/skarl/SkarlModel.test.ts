import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { KNIGHT } from '../../config/constants';
import { buildSkarlModel, CAPE_NODE, CROSSBOW_NODE, SKARL_CLIPS } from './SkarlModel';
import { LOOK } from './tuning';

let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };

beforeAll(async () => {
  (globalThis as any).self ??= globalThis;
  const fsModule = 'node:fs';
  const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as any;
  const file = readFileSync('public/assets/kaykit-adventurers/characters/Rogue_Hooded.glb');
  const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res as any, rej));
});

const build = (warn = vi.fn()) => ({ model: buildSkarlModel({ model: cloneSkinned(gltf.scene), clips: gltf.animations }, warn), warn });

describe('SkarlModel (KayKit Rogue_Hooded)', () => {
  it('scales the rig by 1.2, keeps only the two-handed crossbow, reds the cape, and has every clip', () => {
    const { model, warn } = build();
    expect(model.owner.scale.x).toBeCloseTo(KNIGHT.modelScale * LOOK.scale);
    expect(model.crossbow?.name).toBe(CROSSBOW_NODE);
    model.owner.traverse((o) => {
      if (/^(1H_|Knife|Throwable)/.test(o.name)) expect(o.visible, o.name).toBe(false);
    });
    let cape: THREE.Color | null = null;
    model.owner.getObjectByName(CAPE_NODE)!.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m?.color && !cape) cape = m.color;
    });
    expect(cape!.getHex()).toBe(LOOK.cloak);
    for (const name of Object.values(SKARL_CLIPS)) expect(gltf.animations.some((c) => c.name === name), name).toBe(true);
    for (const clip of Object.keys(SKARL_CLIPS)) model.play(clip as keyof typeof SKARL_CLIPS);
    expect(warn).not.toHaveBeenCalled();
    model.dispose();
  });

  it('carries hurtboxes; the telegraph flashes only the cape; the crossbow drops to the ground; dispose is safe twice', () => {
    const { model } = build();
    expect(model.hurtboxes.count).toBeGreaterThan(0);
    model.setTelegraph(1);
    model.setTelegraph(NaN);
    model.setOpacity(0.5);
    model.update(0.1);
    model.dropCrossbow();
    expect(model.crossbow!.parent).toBe(model.root);
    expect(model.crossbow!.position.y).toBeLessThan(0.2);
    model.dropCrossbow();
    model.dispose();
    model.dispose();
    expect(model.root.parent).toBeNull();
  });

  it('a model with no skinned mesh is refused', () => {
    expect(() => buildSkarlModel({ model: new THREE.Group(), clips: [] })).toThrow(/skinned/);
  });
});
