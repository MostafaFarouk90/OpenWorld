import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ModelLibrary } from '../../assets/swap/ModelLibrary';
import { SWAP_ASSETS } from '../../assets/swap/swapModels';
import { diskSource } from '../../assets/swap/testing/diskSource';
import { buildEnemyModel } from '../EnemyModel';
import { EnemyManager } from '../EnemyManager';
import { FakeHost } from '../testing/fakeHost';
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
  it('the spearman holds the env spear (procedural fallback) and the harpooner holds the pack crossbow', () => {
    expect(HUNTER_SPEARMAN.model.props?.map((p) => p.id)).toEqual(['env/spear-hunter']);
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

  it('through the real EnemyManager body path: a harpooner spawned before the crossbow loads holds the harpoon, and despawning frees it', () => {
    const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: -30 } });
    // The model factory has no pack props: prop() finds nothing, as before the crossbow has loaded.
    const manager = new EnemyManager(fake.host, () => ({ model: SkeletonUtils.clone(gltf.scene), clips: gltf.animations, prop: () => null }), { spawners: [], seed: 3 });
    const id = manager.spawnLoose('hunter-harpooner', { x: 0, y: 0, z: 0 });
    expect(id).not.toBeNull();
    const enemy = manager.get(id!)!;
    const held = heldProps(enemy.body.root);
    expect(held.map((c) => c.name)).toEqual(['enemy-prop:proc/hunter-harpoon']);
    const geometries: THREE.BufferGeometry[] = [];
    held[0].traverse((n) => {
      const m = n as THREE.Mesh;
      if (m.isMesh) geometries.push(m.geometry);
    });
    expect(geometries.length).toBeGreaterThan(0);
    const disposed = new Set<THREE.BufferGeometry>();
    const spy = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose').mockImplementation(function (this: THREE.BufferGeometry) {
      disposed.add(this);
    });
    try {
      enemy.despawn();
    } finally {
      spy.mockRestore();
    }
    for (const g of geometries) expect(disposed.has(g)).toBe(true);
    expect(held[0].parent).toBeNull();
  });
});
