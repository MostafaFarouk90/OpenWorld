import * as THREE from 'three';
import type { ClassId } from '../actors/classes';
import { KNIGHT } from '../config/constants';
import { AnimationController, type AnimationControllerOptions } from '../characters/AnimationController';
import { LEFT_HAND_SLOT, RIGHT_HAND_SLOT } from '../characters/knightClips';
import type { LocomotionInput } from '../characters/locomotionState';
import type { PlayerAvatar } from '../characters/PlayerAvatar';
import { HELD_ITEM } from '../npcs/npcModels';
import type { ClassKit, KitWeapon } from './types';

export { HELD_ITEM };

/** The parts of AssetLoader the avatar needs (ids are `AssetManifest` ids); tests pass stand-ins. */
export interface ClassAssetSource {
  load(id: string): Promise<unknown>;
  instantiate(id: string): THREE.Object3D;
  animations(id: string): THREE.AnimationClip[];
}

export interface ClassParts {
  model: THREE.Object3D;
  clips: readonly THREE.AnimationClip[];
  /** Separate weapon models (null: use the one built into the glb). */
  mainhand: THREE.Object3D | null;
  offhand: THREE.Object3D | null;
}

export interface ClassAvatarOptions extends AnimationControllerOptions {
  warn?: (message: string) => void;
}

/**
 * Any non-Knight class kit on the shared KayKit rig (the Knight keeps `KnightAvatar`). The glb is scaled and turned like the
 * Knight, every built-in held item is hidden, then the kit's main-hand weapon (and an off-hand shield or visual) is shown on
 * the hand slots, or the kit's separate weapon asset takes the embedded one's pose.
 */
export class ClassAvatar implements PlayerAvatar {
  readonly root = new THREE.Group();
  readonly model: THREE.Object3D;
  readonly controller: AnimationController;
  readonly skeleton: THREE.Skeleton;
  readonly weapon: THREE.Object3D;
  readonly offhand: THREE.Object3D | null;
  /** A non-shield off-hand visual (the second knife); not a guard. */
  readonly offhandVisual: THREE.Object3D | null;
  readonly weaponHilt = new THREE.Object3D();
  readonly weaponTip = new THREE.Object3D();

  /** Loads the kit's model and optional weapon assets; rejects when the model fails, falls back per weapon. */
  static async load(kit: ClassKit, assets: ClassAssetSource, options: ClassAvatarOptions = {}): Promise<ClassAvatar> {
    const warn = options.warn ?? ((m: string) => console.warn(m));
    const weapon = async (w: KitWeapon | null | undefined): Promise<THREE.Object3D | null> => {
      if (!w?.asset) return null;
      try {
        await assets.load(w.asset);
        return assets.instantiate(w.asset);
      } catch (err) {
        warn(`ClassAvatar: ${err instanceof Error ? err.message : String(err)}; using the ${w.embedded} built into ${kit.model}`);
        return null;
      }
    };
    const [, mainhand, offhand] = await Promise.all([assets.load(kit.model), weapon(kit.mainhand), weapon(kit.offhand)]);
    return new ClassAvatar(kit, { model: assets.instantiate(kit.model), clips: assets.animations(kit.model), mainhand, offhand }, options);
  }

  /** @throws Error when the skinned mesh, a hand slot or a named embedded weapon is missing. */
  constructor(
    readonly kit: Pick<ClassKit, 'classId' | 'mainhand' | 'offhand' | 'offhandVisual' | 'tip'>,
    parts: ClassParts,
    options: ClassAvatarOptions = {},
  ) {
    this.root.name = `${kit.classId}-avatar`;
    this.model = parts.model;
    this.model.rotation.y = Math.PI;
    this.model.scale.setScalar(KNIGHT.modelScale);
    this.root.add(this.model);

    let skeleton: THREE.Skeleton | null = null;
    const held = new Map<string, THREE.Object3D>();
    this.model.traverse((o) => {
      const skinned = o as THREE.SkinnedMesh;
      if (skinned.isSkinnedMesh && !skeleton) skeleton = skinned.skeleton;
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
      // Only the outermost held node: its own mesh children keep their visibility.
      if (HELD_ITEM.test(o.name) && !held.has(o.name) && !(o.parent && HELD_ITEM.test(o.parent.name))) held.set(o.name, o);
    });
    if (!skeleton) throw new Error(`ClassAvatar: the ${kit.classId} model has no skinned mesh`);
    this.skeleton = skeleton;
    for (const o of held.values()) o.visible = false;

    const right = this.bone(RIGHT_HAND_SLOT);
    const left = this.bone(LEFT_HAND_SLOT);
    this.weapon = mount(right, parts.mainhand, held.get(kit.mainhand.embedded), kit.mainhand.embedded, kit.classId);
    this.offhand = kit.offhand ? mount(left, parts.offhand, held.get(kit.offhand.embedded), kit.offhand.embedded, kit.classId) : null;
    this.offhandVisual = kit.offhandVisual ? mount(left, null, held.get(kit.offhandVisual.embedded), kit.offhandVisual.embedded, kit.classId) : null;

    if (kit.tip) this.weaponTip.position.set(kit.tip.x, kit.tip.y, kit.tip.z);
    else {
      const b = localBounds(this.weapon);
      this.weaponTip.position.set(0, b.isEmpty() ? 1 : b.max.y, 0);
    }
    this.weaponHilt.name = 'weapon-hilt';
    this.weaponTip.name = 'weapon-tip';
    this.weapon.add(this.weaponHilt, this.weaponTip);

    this.controller = new AnimationController(this.model, parts.clips, options);
  }

  get classId(): ClassId {
    return this.kit.classId;
  }

  get events(): AnimationController['events'] {
    return this.controller.events;
  }

  bone(name: string): THREE.Bone {
    const bone = this.skeleton.bones.find((b) => b.name === name);
    if (!bone) throw new Error(`ClassAvatar: bone "${name}" not found in the ${this.kit.classId} skeleton`);
    return bone;
  }

  fixedUpdate(input: LocomotionInput): void {
    this.controller.fixedUpdate(input);
  }

  dispose(): void {
    this.controller.dispose();
    this.root.removeFromParent();
  }
}

function mount(slot: THREE.Bone, weapon: THREE.Object3D | null, embedded: THREE.Object3D | undefined, name: string, classId: string): THREE.Object3D {
  if (!weapon) {
    if (!embedded) throw new Error(`ClassAvatar: no "${name}" built into the ${classId} model`);
    embedded.visible = true;
    return embedded;
  }
  if (embedded) {
    weapon.position.copy(embedded.position);
    weapon.quaternion.copy(embedded.quaternion);
    weapon.scale.copy(embedded.scale);
  }
  weapon.name = `${classId}-${name}`;
  weapon.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  slot.add(weapon);
  return weapon;
}

function localBounds(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  const toRoot = new THREE.Matrix4();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.computeBoundingBox();
    toRoot.identity();
    for (let n: THREE.Object3D | null = mesh; n && n !== root; n = n.parent) {
      n.updateMatrix();
      toRoot.premultiply(n.matrix);
    }
    box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(toRoot));
  });
  return box;
}
