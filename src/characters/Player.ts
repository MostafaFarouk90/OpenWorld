import * as THREE from 'three';
import { FIXED_TIMESTEP, PLAYER } from '../config/constants';
import { CharacterController } from '../physics/CharacterController';
import type { PhysicsWorld, Vec3 } from '../physics/PhysicsWorld';
import type { InputSnapshot } from '../input/InputManager';
import { gateMovement, type LocomotionInput } from './locomotionState';

/** Fall below this height and the player respawns. */
const KILL_PLANE_Y = -50;

export interface PlayerOptions {
  /** Asked every tick; while it returns true horizontal movement and jumps are ignored (attacks). */
  movementLocked?: () => boolean;
  /** Called after a kill-plane respawn has moved the player back to the spawn point. */
  onRespawn?: (spawn: Vec3) => void;
  /** Asked every tick: the combined movement modifiers of the game core (PlayerHandle.addMoveModifier). */
  moveModifier?: () => MoveModifierState;
}

/** Combined movement restriction for one tick; `speedScale` in [0, 1]. */
export interface MoveModifierState {
  speedScale: number;
  lockMove: boolean;
  lockFacing: boolean;
  /** No gravity and no controller move at all this tick. */
  freeze?: boolean;
}

/** A scripted horizontal move (dodge, knockback): unit direction (x, z) in world space and speed in m/s. */
export interface ForcedMove {
  x: number;
  z: number;
  speed: number;
  /** Turn the Knight along the move. Default false: knockback must not spin the player away from the enemy. */
  turn?: boolean;
}

/**
 * The player character: a kinematic capsule plus its visual. Simulation runs in `fixedUpdate`;
 * `render` places the mesh at the position interpolated between ticks. The visual is a placeholder
 * capsule until `setAvatar` swaps in a character model (it stays if the model fails to load).
 */
export class Player {
  readonly controller: CharacterController;
  readonly mesh: THREE.Object3D;
  /** Interpolated feet position from the latest `render` call. */
  readonly feet = new THREE.Vector3();
  private readonly facing = new THREE.Quaternion();
  /** Smoothed render orientation; kept apart from `mesh.quaternion`, which ticks also overwrite. */
  private readonly renderFacing = new THREE.Quaternion();
  private readonly placeholder: THREE.Object3D;
  private readonly tickPrev = { x: 0, y: 0, z: 0 };
  private readonly tickCurr = { x: 0, y: 0, z: 0 };
  private facingOverride: number | null = null;
  private forcedMove: ForcedMove | null = null;

  constructor(
    scene: THREE.Scene,
    physics: PhysicsWorld,
    readonly spawn: Vec3,
    private readonly options: PlayerOptions = {},
  ) {
    this.controller = new CharacterController(physics, spawn);

    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(PLAYER.radius, PLAYER.halfHeight * 2, 4, 12),
      new THREE.MeshStandardMaterial({ color: 0x3d5a80 }),
    );
    body.position.y = PLAYER.halfHeight + PLAYER.radius;
    body.castShadow = true;
    // A nose so facing direction is visible.
    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.15, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xe0c060 }),
    );
    nose.position.set(0, PLAYER.halfHeight + PLAYER.radius * 1.6, -PLAYER.radius);
    this.placeholder = new THREE.Group();
    this.placeholder.add(body, nose);
    const group = new THREE.Group();
    group.add(this.placeholder);
    scene.add(group);
    this.mesh = group;
  }

  /** Replaces the placeholder capsule with `avatar` (feet at its origin, facing -Z). */
  setAvatar(avatar: THREE.Object3D): void {
    this.placeholder.removeFromParent();
    this.mesh.add(avatar);
  }

  /** Heading of the simulation, in radians about +Y (0 = facing -Z). */
  get facingYaw(): number {
    return 2 * Math.atan2(this.facing.y, this.facing.w);
  }

  /**
   * While set, the simulated facing is this yaw (radians about +Y, 0 = facing -Z, same convention as
   * `facingYaw`) instead of the movement heading. `null` restores normal turning (the heading is kept
   * until the player next moves).
   */
  setFacingOverride(yaw: number | null): void {
    this.facingOverride = yaw !== null && Number.isFinite(yaw) ? yaw : null;
    if (this.facingOverride !== null) this.facing.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, this.facingOverride);
  }

  /**
   * While set, every tick moves along `m` at `m.speed` instead of the input movement, even while
   * `movementLocked` is true; jump is suppressed and sprint is off. Uses the same collision path as
   * normal movement. `null` gives control back to the input.
   */
  setForcedMove(m: ForcedMove | null): void {
    this.forcedMove = m ? { x: m.x, z: m.z, speed: m.speed, turn: m.turn === true } : null;
  }

  /** What the controller actually did over the last tick, for animation. */
  locomotion(): LocomotionInput {
    this.controller.interpolatedFeet(0, this.tickPrev);
    this.controller.interpolatedFeet(1, this.tickCurr);
    const dx = this.tickCurr.x - this.tickPrev.x;
    const dz = this.tickCurr.z - this.tickPrev.z;
    return {
      grounded: this.controller.grounded,
      horizontalSpeed: Math.hypot(dx, dz) / FIXED_TIMESTEP,
      verticalSpeed: (this.tickCurr.y - this.tickPrev.y) / FIXED_TIMESTEP,
    };
  }

  /**
   * Puts the mesh at the simulated (not interpolated) feet and heading and updates its world
   * matrices, so bone positions read during the fixed tick match the simulation.
   */
  syncSimulatedPose(): void {
    this.controller.interpolatedFeet(1, this.mesh.position);
    this.mesh.quaternion.copy(this.facing);
    this.mesh.updateWorldMatrix(true, false);
  }

  /** `moveX`/`moveZ` are the input axes already rotated into world space by the camera. */
  fixedUpdate(input: InputSnapshot, moveX: number, moveZ: number): void {
    const mod = this.options.moveModifier?.();
    if (mod?.freeze) {
      this.controller.hold();
      return;
    }
    const forced = this.forcedMove;
    if (forced) {
      moveX = forced.x;
      moveZ = forced.z;
      this.controller.fixedUpdate({ moveX, moveZ, sprint: false, jump: false, speedOverride: forced.speed });
    } else {
      const locked = (this.options.movementLocked?.() ?? false) || (mod?.lockMove ?? false);
      let jump: boolean;
      ({ moveX, moveZ, jump } = gateMovement(locked, { moveX, moveZ, jump: input.jump }));
      if (mod && mod.speedScale < 1) {
        const len = Math.hypot(moveX, moveZ);
        const scale = Math.max(0, mod.speedScale) / Math.max(1, len);
        moveX *= scale;
        moveZ *= scale;
      }
      this.controller.fixedUpdate({ moveX, moveZ, sprint: input.sprint, jump });
    }
    if (this.facingOverride !== null) {
      this.facing.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, this.facingOverride);
    } else if ((moveX !== 0 || moveZ !== 0) && !mod?.lockFacing && (!forced || forced.turn)) {
      // Mesh faces -Z at rest; turn it towards the movement direction.
      this.facing.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.atan2(-moveX, -moveZ));
    }
  }

  /** Turns the simulation (and the next render) to `yaw` (0 = facing -Z), e.g. after a teleport. */
  setFacingYaw(yaw: number): void {
    this.facing.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    this.renderFacing.copy(this.facing);
  }

  /** Call after `PhysicsWorld.step` so the respawn check sees this tick's result. */
  postStep(): void {
    const t = this.controller.body.translation();
    if (t.y < KILL_PLANE_Y) {
      this.controller.teleport(this.spawn);
      this.options.onRespawn?.(this.spawn);
    }
  }

  render(alpha: number, frameTime: number): void {
    this.controller.interpolatedFeet(alpha, this.feet);
    this.mesh.position.copy(this.feet);
    this.renderFacing.slerp(this.facing, 1 - Math.exp(-15 * frameTime));
    this.mesh.quaternion.copy(this.renderFacing);
  }
}
