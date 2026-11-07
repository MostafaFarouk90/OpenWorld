// Archwraith Eormen's look (design: Rogue_Hooded at 1.4 with a crown and the dissolve shader; plans/act4-L6.md "PR 2", A and
// E): the KayKit Rogue_Hooded on the Knight's placement scaled 1.4, a grey-white robe with a pale blue ghost emissive (the vfx
// dissolve patches these materials), the crossbows, knives and throwable hidden, a primitive iron-gold crown on the head bone
// and a primitive ash staff in the right hand (the close swipe). Built on the Ashen Prior pattern (PriorModel.ts).
import * as THREE from 'three';
import { HurtboxSet } from '../../../combat/HurtboxSet';
import { KNIGHT } from '../../../config/constants';
import { EORMEN, LOOK } from './tuning';

export const EORMEN_CLIPS = {
  idle: 'Idle',
  glide: 'Walking_C',
  blades: 'Spellcast_Shoot',
  toll: 'Spellcast_Raise',
  swipe: '1H_Melee_Attack_Slice_Horizontal',
  hit: 'Hit_A',
  death: 'Death_A',
} as const;

export type EormenClip = keyof typeof EORMEN_CLIPS;

/** Rogue_Hooded props he does not carry. */
export const HIDDEN_PROPS = ['1H_Crossbow', '2H_Crossbow', 'Knife', 'Knife_Offhand', 'Throwable'] as const;
/** Three.js strips the dot from glTF `handslot.r`. */
export const STAFF_BONE = 'handslotr';
export const CROWN_BONE = 'head';

export interface EormenModelSource {
  /** An already-cloned Rogue_Hooded scene (AssetLoader.instantiate). */
  model: THREE.Object3D;
  clips: readonly THREE.AnimationClip[];
}

export interface EormenModel {
  /** Feet at the origin; place and turn this (yaw 0 faces -Z, like the Knight). */
  readonly root: THREE.Group;
  readonly owner: THREE.Object3D;
  readonly hurtboxes: HurtboxSet;
  readonly crown: THREE.Group;
  play(clip: EormenClip, opts?: { loop?: boolean; fade?: number }): void;
  update(dt: number): void;
  /** Emissive boost 0..1 toward the ghost blue-white (the blades' flash, the toll's raised hands). */
  setGlow(t: number): void;
  dispose(): void;
}

type Tintable = THREE.Material & { color?: THREE.Color; emissive?: THREE.Color; emissiveIntensity?: number };

/**
 * @throws Error when the model has no skinned mesh, or no `handslot.r` or `head` bone.
 */
export function buildEormenModel(source: EormenModelSource, warn: (m: string) => void = () => {}): EormenModel {
  const root = new THREE.Group();
  root.name = 'boss-eormen';
  const model = source.model;
  model.rotation.y = Math.PI;
  model.scale.setScalar(KNIGHT.modelScale * EORMEN.modelScale);
  root.add(model);

  let skeleton: THREE.Skeleton | null = null;
  model.traverse((o) => {
    const skinned = o as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh && !skeleton) skeleton = skinned.skeleton;
  });
  if (!skeleton) throw new Error('buildEormenModel: the model has no skinned mesh');
  const bones = (skeleton as THREE.Skeleton).bones;
  const hand = bones.find((b) => b.name === STAFF_BONE);
  const head = bones.find((b) => b.name === CROWN_BONE);
  if (!hand) throw new Error(`buildEormenModel: bone "${STAFF_BONE}" not found`);
  if (!head) throw new Error(`buildEormenModel: bone "${CROWN_BONE}" not found`);

  for (const name of HIDDEN_PROPS) {
    const prop = model.getObjectByName(name);
    if (prop) prop.visible = false;
  }

  const tint = new THREE.Color(LOOK.robe);
  const ghost = new THREE.Color(LOOK.ghost);
  const clones = new Map<THREE.Material, Tintable>();
  const cloneOf = (m: THREE.Material): THREE.Material => {
    let c = clones.get(m);
    if (!c) {
      c = m.clone() as Tintable;
      c.name = `${m.name || 'material'}#eormen`;
      if (c.color) c.color.lerp(tint, 0.8);
      if (c.emissive) c.emissive.copy(ghost).multiplyScalar(0.12);
      clones.set(m, c);
    }
    return c;
  };
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(cloneOf) : cloneOf(mesh.material);
  });

  root.updateMatrixWorld(true);
  const crown = buildCrown();
  const headScale = new THREE.Vector3().setFromMatrixScale(head.matrixWorld).y || 1;
  crown.scale.setScalar(1 / headScale);
  crown.position.y = 0.62 / headScale;
  head.add(crown);
  const staff = buildStaff();
  const handScale = new THREE.Vector3().setFromMatrixScale(hand.matrixWorld).y || 1;
  staff.scale.setScalar(1 / handScale);
  hand.add(staff);

  const hurtboxes = new HurtboxSet(model, undefined, model);
  const own: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = [];
  for (const g of [crown, staff]) {
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) own.push({ geometry: mesh.geometry, material: mesh.material as THREE.Material });
    });
  }

  const mixer = new THREE.AnimationMixer(model);
  const byName = new Map(source.clips.map((c) => [c.name, c]));
  const warned = new Set<string>();
  let current: THREE.AnimationAction | null = null;
  let disposed = false;
  const base = new THREE.Color();
  const white = new THREE.Color(LOOK.blade);

  return {
    root,
    owner: model,
    hurtboxes,
    crown,
    play(clip, opts = {}) {
      const name = EORMEN_CLIPS[clip];
      const c = byName.get(name);
      if (!c) {
        if (!warned.has(name)) {
          warned.add(name);
          warn(`eormen: clip "${name}" missing`);
        }
        return;
      }
      const next = mixer.clipAction(c);
      const loop = opts.loop ?? false;
      next.reset();
      next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
      next.clampWhenFinished = !loop;
      next.play();
      if (current && current !== next) next.crossFadeFrom(current, opts.fade ?? 0.15, false);
      current = next;
    },
    update(dt) {
      if (Number.isFinite(dt) && dt > 0) mixer.update(dt);
    },
    setGlow(t) {
      const k = THREE.MathUtils.clamp(Number.isFinite(t) ? t : 0, 0, 1);
      base.copy(ghost).multiplyScalar(0.12).lerp(white, k * 0.7);
      // Read the meshes' materials each time: after a dissolve they are the vfx clones, which are what render.
      model.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Tintable[]) m.emissive?.copy(base);
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mixer.stopAllAction();
      for (const m of clones.values()) m.dispose();
      for (const part of own) {
        part.geometry.dispose();
        part.material.dispose();
      }
      hurtboxes.dispose();
      root.removeFromParent();
    },
  };
}

/** An old iron-gold crown: a band with seven points (metres, centred on the head's top). */
export function buildCrown(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'eormen-crown';
  const gold = new THREE.MeshStandardMaterial({ color: LOOK.crown, metalness: 0.8, roughness: 0.45 });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.16, 0.07, 14, 1, true), gold);
  band.name = 'crown-band';
  group.add(band);
  const pointGeo = new THREE.ConeGeometry(0.025, 0.11, 4);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const p = new THREE.Mesh(i === 0 ? pointGeo : pointGeo.clone(), gold);
    p.position.set(Math.sin(a) * 0.165, 0.085, Math.cos(a) * 0.165);
    p.name = `crown-point-${i}`;
    group.add(p);
  }
  return group;
}

/** An ash-grey staff, 1.6 m, held at a third of its length. */
export function buildStaff(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'eormen-staff';
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a5650, roughness: 0.9 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.6, 6), wood);
  shaft.position.y = 0.25;
  shaft.name = 'staff-shaft';
  group.add(shaft);
  return group;
}
