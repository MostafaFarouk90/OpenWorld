import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ModelLibrary } from '../../assets/swap/ModelLibrary';
import { buildEnemyModel } from '../EnemyModel';
import { HELD_PROP_ROTATION, HUNTER_SPEAR_LENGTH, HUNTER_SPEAR_PROP, REDMANE_LANCE_PROP } from '../envProp';
import { makeGroundProp } from '../ranged/props';
import type { EnemyDef } from '../types';
import { HUNTER_SPEARMAN } from './def';

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

/** A stand-in for the glb: origin at the grip, an empty at the butt (z = back) and one at the point (z = front). */
function fakeWeapon(back: number, front: number): THREE.Object3D {
  const g = new THREE.Group();
  const butt = new THREE.Object3D();
  butt.name = 'butt';
  butt.position.z = back;
  const tip = new THREE.Object3D();
  tip.name = 'tip';
  tip.position.z = front;
  g.add(butt, tip);
  return g;
}

const bodyWith = (pack: (id: string) => THREE.Object3D | null, def: EnemyDef = HUNTER_SPEARMAN) =>
  buildEnemyModel({ model: SkeletonUtils.clone(gltf.scene), clips: gltf.animations, prop: (id) => (id.startsWith('proc/') ? makeGroundProp(id) : pack(id)) }, def);
const held = (root: THREE.Object3D) => root.getObjectByName('handslotr')!.children.filter((c) => c.name.startsWith('enemy-prop:'));
const worldEnds = (weapon: THREE.Object3D) => ({
  butt: weapon.getObjectByName('butt')!.getWorldPosition(new THREE.Vector3()),
  tip: weapon.getObjectByName('tip')!.getWorldPosition(new THREE.Vector3()),
});

describe('hunter spear (env/spear-hunter)', () => {
  it('the def points at the env model with the procedural spear as fallback, on the right-hand slot, zero offset', () => {
    expect(HUNTER_SPEARMAN.model.props).toEqual([
      { id: 'env/spear-hunter', bone: 'handslotr', position: [0, 0, 0], rotation: HELD_PROP_ROTATION, scale: 1, fallback: 'proc/hunter-spear' },
    ]);
    expect(HUNTER_SPEAR_PROP).toBe('env/spear-hunter');
    expect(REDMANE_LANCE_PROP).toBe('env/lance-redmane');
  });

  it('holds the model at 2.2 m in the world and points the tip along the bone, grip on the bone origin', () => {
    const model = bodyWith((id) => (id === HUNTER_SPEAR_PROP ? fakeWeapon(-0.89, 1.31) : null));
    const [spear] = held(model.root);
    expect(spear.name).toBe('enemy-prop:env/spear-hunter');
    expect(spear.position.toArray()).toEqual([0, 0, 0]);
    model.root.updateMatrixWorld(true);
    const { butt, tip } = worldEnds(spear);
    expect(tip.distanceTo(butt)).toBeCloseTo(HUNTER_SPEAR_LENGTH, 3);
    const boneY = new THREE.Vector3(0, 1, 0).transformDirection(spear.parent!.matrixWorld);
    expect(tip.clone().sub(butt).normalize().dot(boneY)).toBeCloseTo(1, 4);
    expect(spear.getWorldPosition(new THREE.Vector3()).distanceTo(spear.parent!.getWorldPosition(new THREE.Vector3()))).toBeCloseTo(0, 5);
  });

  it('divides out a scaled rig: still 2.2 m with the model scale at 0.78 x 1.5', () => {
    const big: EnemyDef = { ...HUNTER_SPEARMAN, model: { ...HUNTER_SPEARMAN.model, scale: 1.5 } };
    const model = bodyWith((id) => (id === HUNTER_SPEAR_PROP ? fakeWeapon(-0.89, 1.31) : null), big);
    model.root.updateMatrixWorld(true);
    const { butt, tip } = worldEnds(held(model.root)[0]);
    expect(tip.distanceTo(butt)).toBeCloseTo(HUNTER_SPEAR_LENGTH, 3);
  });

  it('shows the procedural spear when the glb is missing', async () => {
    expect(held(bodyWith(() => null).root).map((c) => c.name)).toEqual(['enemy-prop:proc/hunter-spear']);
    const lib = new ModelLibrary(undefined, () => undefined);
    await lib.preload([HUNTER_SPEAR_PROP]);
    expect(held(bodyWith((id) => (lib.peek(id) ? ModelLibrary.object(lib.peek(id)!) : null)).root).map((c) => c.name)).toEqual(['enemy-prop:proc/hunter-spear']);
  });

  it('the procedural fallback is not turned by the model\'s rotation: its +Y lies along the bone, not sideways', () => {
    const model = bodyWith(() => null);
    const [spear] = held(model.root);
    expect(spear.name).toBe('enemy-prop:proc/hunter-spear');
    model.root.updateMatrixWorld(true);
    const along = new THREE.Vector3(0, 1, 0).transformDirection(spear.matrixWorld);
    const boneY = new THREE.Vector3(0, 1, 0).transformDirection(spear.parent!.matrixWorld);
    expect(along.dot(boneY)).toBeCloseTo(1, 4);
  });

  it('a fallbackRotation / fallbackPosition on the prop apply to the fallback only', () => {
    const def: EnemyDef = {
      ...HUNTER_SPEARMAN,
      model: { ...HUNTER_SPEARMAN.model, props: [{ ...HUNTER_SPEARMAN.model.props![0], fallbackRotation: [0, 1, 0], fallbackPosition: [0, 0.1, 0] }] },
    };
    const [fb] = held(bodyWith(() => null, def).root);
    expect(fb.rotation.y).toBeCloseTo(1, 6);
    expect(fb.rotation.x).toBe(0);
    expect(fb.position.y).toBeGreaterThan(0);
    const [real] = held(bodyWith((id) => (id === HUNTER_SPEAR_PROP ? fakeWeapon(-0.89, 1.31) : null), def).root);
    expect(real.rotation.x).toBeCloseTo(-Math.PI / 2, 6);
    expect(real.position.y).toBe(0);
  });

  it('the loaded glb spear keeps casting shadows (ModelLibrary.object turns them off)', () => {
    const glb = () => {
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 2), new THREE.MeshBasicMaterial());
      m.castShadow = false;
      g.add(m);
      return g;
    };
    const [spear] = held(bodyWith((id) => (id === HUNTER_SPEAR_PROP ? glb() : null)).root);
    const meshes: THREE.Mesh[] = [];
    spear.traverse((o) => void ((o as THREE.Mesh).isMesh && meshes.push(o as THREE.Mesh)));
    expect(meshes.length).toBeGreaterThan(0);
    expect(meshes.every((m) => m.castShadow)).toBe(true);
  });
});
