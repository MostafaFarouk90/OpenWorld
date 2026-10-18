import type * as THREE from 'three';
import type { ClassId } from '../actors/classes';
import type { AnimationController } from './AnimationController';
import type { LocomotionInput } from './locomotionState';

/**
 * Any class kit the player wears (contracts/actors-and-damage.md section 9, v0.5). It is what the core,
 * `World`, `WorldCombat` and the plugins use; `KnightAvatar` is the first implementation. Thread 12 swaps
 * kits with `ctx.player.swapAvatar`.
 */
export interface PlayerAvatar {
  readonly classId: ClassId;
  /** Holds the avatar with its feet at the origin; added under the Player's mesh. */
  readonly root: THREE.Object3D;
  readonly model: THREE.Object3D;
  readonly controller: AnimationController;
  readonly skeleton: THREE.Skeleton;
  /** The main-hand weapon and the empty markers on it that the weapon sweep traces. */
  readonly weapon: THREE.Object3D;
  readonly weaponHilt: THREE.Object3D;
  readonly weaponTip: THREE.Object3D;
  /** The Knight's shield; null for two-handed and dual kits. */
  readonly offhand: THREE.Object3D | null;
  readonly events: AnimationController['events'];
  bone(name: string): THREE.Bone;
  /** One fixed tick of animation, after the physics step (contracts/animation-events.md). */
  fixedUpdate(input: LocomotionInput): void;
  dispose(): void;
}
