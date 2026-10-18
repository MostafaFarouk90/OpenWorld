import * as THREE from 'three';
import { KNIGHT } from '../config/constants';
import { HurtboxSet } from '../combat/HurtboxSet';
import { WeaponTracer } from '../combat/WeaponTracer';
import {
  EMBEDDED_SHIELD,
  EMBEDDED_SWORD,
  EMBEDDED_WEAPONS,
} from '../characters/knightClips';
import type { EnemyDef } from './types';

/** Bone the wraith's claw follows (Three.js strips the dot from glTF `hand.r`). */
export const CLAW_BONE = 'handr';
/**
 * Claw reach from the hand bone's origin (the wrist end of the hand) to the claw tip, in metres.
 * KayKit hands are about 0.08 m long at the 0.78 scale, so the tip sits about 0.27 m past the fingers.
 */
export const CLAW_LENGTH = 0.35;

export interface WeaponChannelParts {
  /** The object the tracer follows (sword, shield, or the empty claw). */
  object: THREE.Object3D;
  /** Empty markers (children of `object`) at the blade's two ends. */
  hilt: THREE.Object3D;
  tip: THREE.Object3D;
}

export interface EnemyModel {
  /** Feet at the origin; place and turn this. Holds `owner` (the glTF scene). */
  readonly root: THREE.Group;
  /** The Knight glTF scene, turned to face -Z and scaled to metres. The HurtboxSet and tracer owner. */
  readonly owner: THREE.Object3D;
  readonly skeleton: THREE.Skeleton;
  /** This instance's own (cloned, tinted) materials. */
  readonly materials: THREE.Material[];
  readonly weapons: { right: WeaponChannelParts; left?: WeaponChannelParts };
  readonly hurtboxes: HurtboxSet;
  readonly tracers: { right: WeaponTracer; left?: WeaponTracer };
  /** A bone of the skeleton by its Three.js name (dots stripped: `handr`). @throws when missing. */
  bone(name: string): THREE.Bone;
  /** Emissive boost 0..1 towards `color` on this instance only (fallback; thread 7 owns real flashes). */
  setTelegraph(t: number, color?: THREE.ColorRepresentation): void;
  /** Fades this instance's materials (transparent below 1). */
  setOpacity(o: number): void;
  /** Disposes the cloned materials and the hurtbox mesh, and detaches `root`. Shared geometry stays. */
  dispose(): void;
}

export interface EnemyModelSource {
  /** An already-cloned Knight scene (AssetLoader.instantiate / SkeletonUtils.clone). */
  model: THREE.Object3D;
  clips: readonly THREE.AnimationClip[];
}

type Tintable = THREE.Material & { color?: THREE.Color; emissive?: THREE.Color };

/**
 * Builds one enemy's visual from a cloned Knight scene: the same placement as KnightAvatar (turned by PI,
 * scaled by KNIGHT.modelScale), per-instance tinted materials, the recipe's weapons, weapon markers per
 * channel, the hurtboxes and one WeaponTracer per channel (no bus; the core registry wires it).
 *
 * @throws Error when the model has no skinned mesh, or a bone or embedded weapon the recipe needs is missing.
 */
export function buildEnemyModel(source: EnemyModelSource, def: EnemyDef): EnemyModel {
  const root = new THREE.Group();
  root.name = `enemy-${def.kind}`;
  const model = source.model;
  model.rotation.y = Math.PI;
  model.scale.setScalar(KNIGHT.modelScale);
  root.add(model);

  let skeleton: THREE.Skeleton | null = null;
  model.traverse((o) => {
    const skinned = o as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh && !skeleton) skeleton = skinned.skeleton;
  });
  if (!skeleton) throw new Error(`buildEnemyModel(${def.kind}): the model has no skinned mesh`);
  const skel: THREE.Skeleton = skeleton;
  const bone = (name: string): THREE.Bone => {
    const b = skel.bones.find((x) => x.name === name);
    if (!b) throw new Error(`buildEnemyModel(${def.kind}): bone "${name}" not found`);
    return b;
  };

  // Per-instance materials: each original material is cloned once, so meshes that shared one still share
  // the clone within this instance, and nothing is shared with other instances or the asset cache.
  const clones = new Map<THREE.Material, Tintable>();
  const tint = new THREE.Color(def.model.tint);
  const cloneOf = (m: THREE.Material): THREE.Material => {
    let c = clones.get(m);
    if (!c) {
      c = m.clone() as Tintable;
      c.name = `${m.name || 'material'}#${def.kind}`;
      if (c.color) c.color.multiply(tint);
      if (c.emissive && def.model.emissive !== undefined) c.emissive.setHex(def.model.emissive);
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
  const materials: THREE.Material[] = [...clones.values()];
  const baseEmissive = new Map<THREE.Material, THREE.Color>();
  const baseTransparent = new Map<THREE.Material, boolean>();
  for (const m of materials as Tintable[]) {
    if (m.emissive) baseEmissive.set(m, m.emissive.clone());
    baseTransparent.set(m, m.transparent);
  }

  // Weapons: hide every embedded one, then show what the recipe carries.
  const embedded = new Map<string, THREE.Object3D>();
  for (const name of EMBEDDED_WEAPONS) {
    const obj = model.getObjectByName(name);
    if (obj) {
      obj.visible = false;
      embedded.set(name, obj);
    }
  }
  const need = (name: string): THREE.Object3D => {
    const obj = embedded.get(name);
    if (!obj) throw new Error(`buildEnemyModel(${def.kind}): embedded weapon "${name}" not found in the Knight`);
    obj.visible = true;
    return obj;
  };

  root.updateMatrixWorld(true);
  let weapons: EnemyModel['weapons'];
  if (def.model.weapons === 'sword-shield') {
    const sword = need(EMBEDDED_SWORD);
    const shield = need(EMBEDDED_SHIELD);
    // KayKit blades run along local +Y from the grip (y = 0) to the tip (as KnightAvatar).
    const blade = localBounds(sword);
    const right = markers(sword, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, blade.isEmpty() ? 1 : blade.max.y, 0), 'sword');
    // The shield's edge-to-edge line across its widest local axis, through the bounds centre.
    const sb = localBounds(shield);
    const size = sb.getSize(new THREE.Vector3());
    const axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
    const centre = sb.getCenter(new THREE.Vector3());
    const a = centre.clone();
    const b = centre.clone();
    a[axis] = sb.min[axis];
    b[axis] = sb.max[axis];
    const left = markers(shield, a, b, 'shield');
    weapons = { right, left };
  } else {
    // Claw: an empty on the right hand. KayKit bones point local +Y at their child (handslot.r sits at
    // +0.096 Y, with a 0.058 palm offset in -Z), so the claw runs from the hand origin along +Y.
    const hand = bone(CLAW_BONE);
    const claw = new THREE.Object3D();
    claw.name = 'enemy-claw';
    hand.add(claw);
    claw.updateWorldMatrix(true, false);
    const s = new THREE.Vector3().setFromMatrixScale(claw.matrixWorld).y || 1;
    const right = markers(claw, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, CLAW_LENGTH / s, 0), 'claw');
    weapons = { right };
  }

  const owner = model;
  const hurtboxes = new HurtboxSet(model, undefined, owner);
  const tracer = (w: WeaponChannelParts): WeaponTracer =>
    new WeaponTracer({ attacker: owner, weapon: w.object, hilt: w.hilt, tip: w.tip, ownHurtboxes: hurtboxes });
  const tracers: EnemyModel['tracers'] = { right: tracer(weapons.right) };
  if (weapons.left) tracers.left = tracer(weapons.left);

  let disposed = false;
  const telegraphColor = new THREE.Color();
  return {
    root,
    owner,
    skeleton: skel,
    materials,
    weapons,
    hurtboxes,
    tracers,
    bone,
    setTelegraph(t: number, color: THREE.ColorRepresentation = 0xffffff): void {
      const k = THREE.MathUtils.clamp(Number.isFinite(t) ? t : 0, 0, 1);
      telegraphColor.set(color);
      for (const [m, base] of baseEmissive) (m as Tintable).emissive!.copy(base).lerp(telegraphColor, k);
    },
    setOpacity(o: number): void {
      const v = THREE.MathUtils.clamp(Number.isFinite(o) ? o : 1, 0, 1);
      for (const m of materials) {
        const transparent = v < 1 || baseTransparent.get(m) === true;
        if (m.transparent !== transparent) m.needsUpdate = true;
        m.transparent = transparent;
        m.opacity = v;
      }
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const m of materials) m.dispose();
      hurtboxes.dispose();
      root.removeFromParent();
    },
  };
}

/** Adds named hilt and tip markers (local positions in `object` space) under `object`. */
function markers(object: THREE.Object3D, hiltAt: THREE.Vector3, tipAt: THREE.Vector3, label: string): WeaponChannelParts {
  const hilt = new THREE.Object3D();
  const tip = new THREE.Object3D();
  hilt.name = `${label}-hilt`;
  tip.name = `${label}-tip`;
  hilt.position.copy(hiltAt);
  tip.position.copy(tipAt);
  object.add(hilt, tip);
  object.updateWorldMatrix(true, true);
  return { object, hilt, tip };
}

/** Bounding box of every mesh under `root`, in `root`'s local space. */
function localBounds(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  const toRoot = new THREE.Matrix4();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    toRoot.identity();
    for (let n: THREE.Object3D | null = mesh; n && n !== root; n = n.parent) {
      n.updateMatrix();
      toRoot.premultiply(n.matrix);
    }
    box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(toRoot));
  });
  return box;
}
