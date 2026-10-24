import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ModelLibrary } from '../../assets/swap/ModelLibrary';
import { SWAP_ASSETS } from '../../assets/swap/swapModels';
import { diskSource } from '../../assets/swap/testing/diskSource';
import { buildEnemyModel } from '../EnemyModel';
import { makeGroundProp } from '../ranged/props';
import { HUNTER_HARPOONER, HUNTER_HARPOON_PROP, HUNTER_SPEARMAN } from './def';

let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  (globalThis as any).self ??= globalThis;
  const fsModule = 'node:fs';
  const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as any;
  const file = readFileSync('public/assets/kaykit-adventurers/characters/Knight.glb');
  const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  const quiet = [vi.spyOn(console, 'warn').mockImplementation(() => {}), vi.spyOn(console, 'error').mockImplementation(() => {})];
  gltf = await new Promise<any>((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
  for (const q of quiet) q.mockRestore();
});

/** The prop source the enemy manager gives the builder: `proc/` ids are procedural, the rest come from the (maybe not loaded) library. */
const bodyWith = (def: typeof HUNTER_HARPOONER, pack: (id: string) => THREE.Object3D | null) =>
  buildEnemyModel({ model: SkeletonUtils.clone(gltf.scene), clips: gltf.animations, prop: (id) => (id.startsWith('proc/') ? makeGroundProp(id) : pack(id)) }, def);
const heldProps = (root: THREE.Object3D) => {
  const slot = root.getObjectByName('handslotr')!;
  return slot.children.filter((c) => c.name.startsWith('enemy-prop:'));
};

describe('hunter weapons', () => {
  it('the spearman keeps its procedural spear and the harpooner holds the pack crossbow', () => {
    expect(HUNTER_SPEARMAN.model.props?.map((p) => p.id)).toEqual(['proc/hunter-spear']);
    expect(HUNTER_HARPOONER.model.props?.[0]).toMatchObject({ id: 'wpn/crossbow_2handed', bone: 'handslotr', fallback: 'proc/hunter-harpoon' });
    expect(SWAP_ASSETS[HUNTER_HARPOON_PROP]).toBeDefined();
  });

  it('shows the procedural harpoon while the crossbow is not loaded, so the hunter is never empty-handed', () => {
    const model = bodyWith(HUNTER_HARPOONER, () => null);
    expect(heldProps(model.root).map((c) => c.name)).toEqual(['enemy-prop:proc/hunter-harpoon']);
    const spear = bodyWith(HUNTER_SPEARMAN, () => null);
    expect(heldProps(spear.root).map((c) => c.name)).toEqual(['enemy-prop:proc/hunter-spear']);
  });

  it('holds the crossbow once it has loaded (and not the harpoon), and falls back when the load fails', async () => {
    const lib = new ModelLibrary(await diskSource());
    await lib.preload([HUNTER_HARPOON_PROP]);
    const loaded = lib.peek(HUNTER_HARPOON_PROP);
    expect(loaded).not.toBeNull();
    const held = heldProps(bodyWith(HUNTER_HARPOONER, (id) => (lib.peek(id) ? ModelLibrary.object(lib.peek(id)!) : null)).root);
    expect(held.map((c) => c.name)).toEqual(['enemy-prop:wpn/crossbow_2handed']);
    expect(new THREE.Box3().setFromObject(held[0]).isEmpty()).toBe(false);

    // A library with no source never loads it: the harpoon shows.
    const missing = new ModelLibrary(undefined, () => undefined);
    await missing.preload([HUNTER_HARPOON_PROP]);
    const fallback = heldProps(bodyWith(HUNTER_HARPOONER, (id) => (missing.peek(id) ? ModelLibrary.object(missing.peek(id)!) : null)).root);
    expect(fallback.map((c) => c.name)).toEqual(['enemy-prop:proc/hunter-harpoon']);
  });
});
