import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClassAvatar, HELD_ITEM, type ClassAssetSource } from './ClassAvatar';
import { DEFAULT_KITS } from './kits';
import type { ClassKit } from './types';

afterEach(() => vi.restoreAllMocks());

const quiet = { warn: () => {} };
const grounded = { grounded: true, horizontalSpeed: 0, verticalSpeed: 0 };

const FILES: Record<string, string> = {
  barbarian: 'Barbarian.glb',
  mage: 'Mage.glb',
  rogue: 'Rogue.glb',
  rogueHooded: 'Rogue_Hooded.glb',
};

async function loadGlb(model: string): Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }> {
  (globalThis as any).self ??= globalThis;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const fsModule = 'node:fs';
  const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as {
    readFileSync: (p: string) => Uint8Array & { buffer: ArrayBuffer; byteOffset: number; byteLength: number };
  };
  const file = readFileSync(`public/assets/kaykit-adventurers/characters/${FILES[model]}`);
  const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  return new Promise((resolve, reject) => new GLTFLoader().parse(buf, '', resolve as never, reject));
}

/** A minimal skinned rig with both hand slots and the given held items on them. */
function rig(right: string[], left: string[] = []) {
  const model = new THREE.Group();
  const bone = (name: string, parent?: THREE.Object3D) => {
    const b = new THREE.Bone();
    b.name = name;
    parent?.add(b);
    return b;
  };
  const root = bone('root');
  const slotR = bone('handslotr', root);
  const slotL = bone('handslotl', root);
  const item = (name: string, parent: THREE.Object3D) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), new THREE.MeshBasicMaterial());
    m.geometry.translate(0, 0.4, 0);
    m.name = name;
    m.position.set(0.05, 0.1, 0.2);
    parent.add(m);
    return m;
  };
  const items = new Map<string, THREE.Mesh>();
  for (const n of right) items.set(n, item(n, slotR));
  for (const n of left) items.set(n, item(n, slotL));
  const bones: THREE.Bone[] = [];
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone);
  });
  const skinned = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  skinned.add(root);
  skinned.bind(new THREE.Skeleton(bones));
  model.add(skinned);
  const idle = new THREE.AnimationClip('Idle', 1, [new THREE.VectorKeyframeTrack('root.position', [0, 1], [0, 0, 0, 0, 0, 0])]);
  return { model, clips: [idle], items };
}

describe('ClassAvatar on a synthetic rig', () => {
  const warden = DEFAULT_KITS.warden;

  it('hides every held item and shows only the kit weapon, with markers at grip and blade top', () => {
    const r = rig(['2H_Axe', '1H_Axe', 'Mug'], ['Barbarian_Round_Shield', '1H_Axe_Offhand']);
    const a = new ClassAvatar(warden, { model: r.model, clips: r.clips, mainhand: null, offhand: null }, quiet);
    expect(a.classId).toBe('warden');
    expect(a.weapon).toBe(r.items.get('2H_Axe'));
    expect(a.weapon.visible).toBe(true);
    for (const n of ['1H_Axe', 'Mug', 'Barbarian_Round_Shield', '1H_Axe_Offhand']) expect(r.items.get(n)!.visible).toBe(false);
    expect(a.offhand).toBeNull();
    expect(a.weaponHilt.parent).toBe(a.weapon);
    expect(a.weaponTip.position.y).toBeCloseTo(0.8, 5);
    expect(a.model.rotation.y).toBeCloseTo(Math.PI);
  });

  it('puts a separate weapon asset on the slot with the embedded pose', () => {
    const r = rig(['2H_Axe']);
    const axe = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const a = new ClassAvatar(warden, { model: r.model, clips: r.clips, mainhand: axe, offhand: null }, quiet);
    expect(a.weapon).toBe(axe);
    expect(axe.parent?.name).toBe('handslotr');
    expect(axe.position.toArray()).toEqual(r.items.get('2H_Axe')!.position.toArray());
    expect(r.items.get('2H_Axe')!.visible).toBe(false);
    expect(axe.castShadow).toBe(true);
  });

  it('shows an off-hand visual without making it a guard, and honours a tip offset', () => {
    const r = rig(['Knife'], ['Knife_Offhand']);
    const kit: ClassKit = { ...DEFAULT_KITS.ashblade, tip: { x: 0, y: 0.3, z: 0.1 } };
    const a = new ClassAvatar(kit, { model: r.model, clips: r.clips, mainhand: null, offhand: null }, quiet);
    expect(a.offhand).toBeNull();
    expect(a.offhandVisual).toBe(r.items.get('Knife_Offhand'));
    expect(a.offhandVisual!.visible).toBe(true);
    expect(a.weaponTip.position.toArray()).toEqual([0, 0.3, 0.1]);
  });

  it('throws naming the weapon, the skin or the bone that is missing', () => {
    const r = rig(['1H_Axe']);
    expect(() => new ClassAvatar(warden, { model: r.model, clips: r.clips, mainhand: null, offhand: null }, quiet)).toThrow(/2H_Axe/);
    expect(() => new ClassAvatar(warden, { model: new THREE.Group(), clips: r.clips, mainhand: null, offhand: null }, quiet)).toThrow(
      /skinned mesh/,
    );
    const a = new ClassAvatar(warden, { model: rig(['2H_Axe']).model, clips: r.clips, mainhand: null, offhand: null }, quiet);
    expect(() => a.bone('nope')).toThrow(/nope/);
  });

  it('load falls back to the embedded weapon when the asset fails, and rejects when the model fails', async () => {
    const r = rig(['2H_Axe']);
    const warn = vi.fn();
    const assets: ClassAssetSource = {
      load: (id) => (id === 'axe' ? Promise.reject(new Error('404 axe')) : Promise.resolve({})),
      instantiate: () => r.model,
      animations: () => r.clips,
    };
    const a = await ClassAvatar.load({ ...warden, mainhand: { embedded: '2H_Axe', asset: 'axe' } }, assets, { warn });
    expect(a.weapon).toBe(r.items.get('2H_Axe'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('404 axe'));
    const broken: ClassAssetSource = { ...assets, load: () => Promise.reject(new Error('no model')) };
    await expect(ClassAvatar.load(warden, broken, { warn })).rejects.toThrow('no model');
  });

  it('dispose detaches the root', () => {
    const r = rig(['2H_Axe']);
    const a = new ClassAvatar(warden, { model: r.model, clips: r.clips, mainhand: null, offhand: null }, quiet);
    const parent = new THREE.Group();
    parent.add(a.root);
    a.dispose();
    expect(a.root.parent).toBeNull();
  });
});

describe('ClassAvatar with the real KayKit glbs', () => {
  for (const id of ['warden', 'emberwright', 'ashblade', 'pathfinder'] as const) {
    it(`dresses the ${id} kit: one visible held item per hand at most, a plausible height`, async () => {
      const kit = DEFAULT_KITS[id];
      const gltf = await loadGlb(kit.model);
      const a = new ClassAvatar(kit, { model: gltf.scene, clips: gltf.animations, mainhand: null, offhand: null }, quiet);
      expect(a.weapon.name).toBe(kit.mainhand.embedded);
      const visibleHeld: string[] = [];
      a.model.traverse((o) => {
        if (HELD_ITEM.test(o.name) && !(o.parent && HELD_ITEM.test(o.parent.name)) && o.visible) visibleHeld.push(o.name);
      });
      expect(visibleHeld.sort()).toEqual([kit.mainhand.embedded, ...(kit.offhandVisual ? [kit.offhandVisual.embedded] : [])].sort());
      expect(gltf.animations.map((c) => c.name)).toContain('Idle');
      a.fixedUpdate(grounded);
      a.root.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(a.root, true);
      expect(bb.min.y).toBeCloseTo(0, 0);
      expect(bb.max.y).toBeGreaterThan(1.4);
      expect(bb.max.y).toBeLessThan(2.6);
    });
  }
});
