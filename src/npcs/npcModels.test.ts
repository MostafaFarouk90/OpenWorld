import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { describe, expect, it } from 'vitest';
import { NPC_DEFS } from './npcDefs';
import { buildPlaceholder, disposePlaceholder, loadNpcModel, pickIdleClip } from './npcModels';
import type { NpcModelId, NpcModelLoader } from './types';

export function makeSource() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const geo = new THREE.BoxGeometry(1, 2, 1);
  const root = new THREE.Group();
  const bone = new THREE.Bone();
  bone.name = 'root';
  root.add(bone);
  const body = new THREE.Mesh(geo, mat);
  body.name = 'Body';
  const sword = new THREE.Mesh(geo, mat);
  sword.name = '1H_Sword';
  root.add(body, sword);
  const clips = [new THREE.AnimationClip('Idle', 1, [new THREE.VectorKeyframeTrack('root.position', [0, 1], [0, 0, 0, 0, 1, 0])])];
  return { mat, geo, root, clips };
}

export function fakeLoader(src = makeSource()): NpcModelLoader & { src: ReturnType<typeof makeSource>; loads: string[] } {
  const loads: string[] = [];
  return {
    src,
    loads,
    load: async (id: NpcModelId) => void loads.push(id),
    instantiate: () => SkeletonUtils.clone(src.root),
    animations: () => src.clips,
  };
}

const gaut = NPC_DEFS.find((d) => d.id === 'gaut')!;
const wynn = NPC_DEFS.find((d) => d.id === 'wynn')!;

describe('buildPlaceholder', () => {
  it('is about 1.8 m tall with feet on the origin and disposable', () => {
    const p = buildPlaceholder(gaut);
    const box = new THREE.Box3().setFromObject(p);
    expect(box.min.y).toBeCloseTo(0, 2);
    expect(box.max.y).toBeCloseTo(1.8, 2);
    expect(() => disposePlaceholder(p)).not.toThrow();
  });
  it('applies the def scale', () => {
    expect(new THREE.Box3().setFromObject(buildPlaceholder(wynn)).max.y).toBeCloseTo(1.8 * 0.95, 2);
  });
});

describe('loadNpcModel', () => {
  it('scales, tints cloned materials only, hides held items and leaves the model facing +Z', async () => {
    const l = fakeLoader();
    const { model, clips } = await loadNpcModel(l, gaut);
    expect(clips).toBe(l.src.clips);
    expect(model.rotation.y).toBe(0);
    expect(model.scale.x).toBeCloseTo(0.78);
    expect(l.src.mat.color.getHex()).toBe(0xffffff);
    const body = model.getObjectByName('Body') as THREE.Mesh;
    expect(body.material).not.toBe(l.src.mat);
    expect((body.material as THREE.MeshStandardMaterial).color.getHex()).not.toBe(0xffffff);
    expect(model.getObjectByName('1H_Sword')!.visible).toBe(false);
    expect(body.visible).toBe(true);
  });
  it('applies the def scale on top of the base scale', async () => {
    const { model } = await loadNpcModel(fakeLoader(), wynn);
    expect(model.scale.x).toBeCloseTo(0.78 * 0.95);
  });
  it('keeps colours when tint is null (still cloning materials)', async () => {
    const l = fakeLoader();
    const { model } = await loadNpcModel(l, { ...gaut, tint: null });
    const m = (model.getObjectByName('Body') as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(m.color.getHex()).toBe(0xffffff);
    expect(m).not.toBe(l.src.mat);
  });
  it('two NPCs from one GLB get distinct clones', async () => {
    const l = fakeLoader();
    const a = await loadNpcModel(l, gaut);
    const b = await loadNpcModel(l, gaut);
    expect(a.model).not.toBe(b.model);
    expect((a.model.getObjectByName('Body') as THREE.Mesh).material).not.toBe((b.model.getObjectByName('Body') as THREE.Mesh).material);
  });
  it('rejects when the load fails', async () => {
    const l = fakeLoader();
    l.load = () => Promise.reject(new Error('404'));
    await expect(loadNpcModel(l, gaut)).rejects.toThrow('404');
  });
});

describe('pickIdleClip', () => {
  const c = (n: string) => new THREE.AnimationClip(n, 1, []);
  it('prefers the exact name, then any Idle clip, then nothing', () => {
    expect(pickIdleClip([c('Walk'), c('Idle_B'), c('Idle')], 'Idle')!.name).toBe('Idle');
    expect(pickIdleClip([c('Walk'), c('Idle_B')], 'Idle')!.name).toBe('Idle_B');
    expect(pickIdleClip([c('Walk')], 'Idle')).toBeUndefined();
    expect(pickIdleClip([], 'Idle')).toBeUndefined();
  });
});
