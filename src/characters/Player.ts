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
    const locked = this.options.movementLocked?.() ?? false;
    let jump: boolean;
    ({ moveX, moveZ, jump } = gateMovement(locked, { moveX, moveZ, jump: input.jump }));
    this.controller.fixedUpdate({ moveX, moveZ, sprint: input.sprint, jump });
    if (moveX !== 0 || moveZ !== 0) {
      // Mesh faces -Z at rest; turn it towards the movement direction.
      this.facing.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.atan2(-moveX, -moveZ));
    }
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
