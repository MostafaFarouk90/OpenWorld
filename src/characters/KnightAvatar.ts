import * as THREE from 'three';
import { KNIGHT } from '../config/constants';
import { AnimationController, type AnimationControllerOptions } from './AnimationController';
import {
  EMBEDDED_SHIELD,
  EMBEDDED_SWORD,
  EMBEDDED_WEAPONS,
  LEFT_HAND_SLOT,
  RIGHT_HAND_SLOT,
} from './knightClips';
import type { LocomotionInput } from './locomotionState';

/** The parts of AssetLoader the avatar needs; tests pass stand-ins. */
export interface KnightAssetSource {
  load(id: 'knight' | 'sword' | 'shieldRound'): Promise<unknown>;
  instantiate(id: 'knight' | 'sword' | 'shieldRound'): THREE.Object3D;
  animations(id: 'knight'): THREE.AnimationClip[];
}

export interface KnightParts {
  /** The Knight's glTF scene (already cloned, skeleton intact). */
  model: THREE.Object3D;
  clips: readonly THREE.AnimationClip[];
  /** Separate weapon models; null uses the weapons embedded in Knight.glb. */
  sword: THREE.Object3D | null;
  shield: THREE.Object3D | null;
}

export interface KnightAvatarOptions extends AnimationControllerOptions {
  warn?: (message: string) => void;
}

/**
 * The KayKit Knight as the player's visual: the glTF scene scaled to the capsule and turned to face
 * -Z, the sword and shield on the hand slots, and the animation controller.
 *
 * `root` holds the avatar with its feet at the origin. Add it under the Player's mesh (setAvatar),
 * then call `fixedUpdate` once per fixed tick after the physics step; see
 * contracts/animation-events.md for the timing combat relies on.
 */
export class KnightAvatar {
  readonly root = new THREE.Group();
  readonly model: THREE.Object3D;
  readonly controller: AnimationController;
  readonly skeleton: THREE.Skeleton;
  readonly weapon: THREE.Object3D;
  readonly shield: THREE.Object3D;
  /** Empty markers on the blade, for weapon sweeps. */
  readonly weaponHilt = new THREE.Object3D();
  readonly weaponTip = new THREE.Object3D();

  /**
   * Loads the Knight and its weapons. Rejects with the asset loader's error (asset id and URL) when
   * the Knight itself fails; a weapon that fails is replaced by the one embedded in Knight.glb.
   */
  static async load(assets: KnightAssetSource, options: KnightAvatarOptions = {}): Promise<KnightAvatar> {
    const warn = options.warn ?? ((m: string) => console.warn(m));
    const weapon = async (id: 'sword' | 'shieldRound'): Promise<THREE.Object3D | null> => {
      try {
        await assets.load(id);
        return assets.instantiate(id);
      } catch (err) {
        warn(`KnightAvatar: ${err instanceof Error ? err.message : String(err)}; using the weapon built into Knight.glb`);
        return null;
      }
    };
    const [, sword, shield] = await Promise.all([assets.load('knight'), weapon('sword'), weapon('shieldRound')]);
    return new KnightAvatar(
      { model: assets.instantiate('knight'), clips: assets.animations('knight'), sword, shield },
      options,
    );
  }

  /** @throws Error when a hand slot bone, the skinned mesh, or the idle clip is missing. */
  constructor(parts: KnightParts, options: KnightAvatarOptions = {}) {
    this.root.name = 'knight-avatar';
    this.model = parts.model;
    // KayKit characters face +Z; the player faces -Z.
    this.model.rotation.y = Math.PI;
    this.model.scale.setScalar(KNIGHT.modelScale);
    this.root.add(this.model);

    let skeleton: THREE.Skeleton | null = null;
    this.model.traverse((o) => {
      const skinned = o as THREE.SkinnedMesh;
      if (skinned.isSkinnedMesh && !skeleton) skeleton = skinned.skeleton;
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    if (!skeleton) throw new Error('KnightAvatar: the Knight model has no skinned mesh');
    this.skeleton = skeleton;

    const rightSlot = this.bone(RIGHT_HAND_SLOT);
    const leftSlot = this.bone(LEFT_HAND_SLOT);
    const embedded = new Map<string, THREE.Object3D>();
    for (const name of EMBEDDED_WEAPONS) {
      const obj = this.model.getObjectByName(name);
      if (obj) {
        obj.visible = false;
        embedded.set(name, obj);
      }
    }
    this.weapon = mount(rightSlot, parts.sword, embedded.get(EMBEDDED_SWORD), 'sword');
    this.shield = mount(leftSlot, parts.shield, embedded.get(EMBEDDED_SHIELD), 'shield');

    // KayKit blades run along local +Y from the grip (y = 0) to the tip.
    const blade = localBounds(this.weapon);
    this.weaponTip.position.set(0, blade.isEmpty() ? 1 : blade.max.y, 0);
    this.weaponHilt.name = 'weapon-hilt';
    this.weaponTip.name = 'weapon-tip';
    this.weapon.add(this.weaponHilt, this.weaponTip);

    this.controller = new AnimationController(this.model, parts.clips, options);
  }

  get events(): AnimationController['events'] {
    return this.controller.events;
  }

  /** A bone of the Knight's skeleton by its Three.js name (dots stripped: `handslotr`). */
  bone(name: string): THREE.Bone {
    const bone = this.skeleton.bones.find((b) => b.name === name);
    if (!bone) throw new Error(`KnightAvatar: bone "${name}" not found in the Knight skeleton`);
    return bone;
  }

  /**
   * Advances the animation by one fixed tick. The avatar's parent (the Player mesh) must already be
   * at the simulated pose (Player.syncSimulatedPose) so bone world matrices match the simulation.
   */
  fixedUpdate(input: LocomotionInput): void {
    this.controller.fixedUpdate(input);
  }

  dispose(): void {
    this.controller.dispose();
    this.root.removeFromParent();
  }
}

/**
 * Puts `weapon` on `slot` with the pose of the matching embedded weapon, or shows the embedded one
 * when `weapon` is null.
 */
function mount(
  slot: THREE.Bone,
  weapon: THREE.Object3D | null,
  embedded: THREE.Object3D | undefined,
  label: string,
): THREE.Object3D {
  if (!weapon) {
    if (!embedded) throw new Error(`KnightAvatar: no ${label} model and none built into the Knight`);
    embedded.visible = true;
    return embedded;
  }
  if (embedded) {
    weapon.position.copy(embedded.position);
    weapon.quaternion.copy(embedded.quaternion);
    weapon.scale.copy(embedded.scale);
  }
  weapon.name = `knight-${label}`;
  weapon.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  slot.add(weapon);
  return weapon;
}

/** Bounding box of every mesh under `root`, in `root`'s local space. */
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
