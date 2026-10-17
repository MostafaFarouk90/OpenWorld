import * as THREE from 'three';
import { PLAYER } from '../config/constants';
import { CharacterController } from '../physics/CharacterController';
import type { PhysicsWorld, Vec3 } from '../physics/PhysicsWorld';
import type { InputSnapshot } from '../input/InputManager';

/** Fall below this height and the player respawns. */
const KILL_PLANE_Y = -50;

/**
 * The player character: a kinematic capsule plus its placeholder mesh. Simulation runs in
 * `fixedUpdate`; `render` places the mesh at the position interpolated between ticks.
 * The capsule mesh is replaced by a KayKit Adventurer once the asset loader lands.
 */
export class Player {
  readonly controller: CharacterController;
  readonly mesh: THREE.Object3D;
  /** Interpolated feet position from the latest `render` call. */
  readonly feet = new THREE.Vector3();
  private readonly facing = new THREE.Quaternion();

  constructor(
    scene: THREE.Scene,
    physics: PhysicsWorld,
    private readonly spawn: Vec3,
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
    const group = new THREE.Group();
    group.add(body, nose);
    scene.add(group);
    this.mesh = group;
  }

  /** `moveX`/`moveZ` are the input axes already rotated into world space by the camera. */
  fixedUpdate(input: InputSnapshot, moveX: number, moveZ: number): void {
    this.controller.fixedUpdate({ moveX, moveZ, sprint: input.sprint, jump: input.jump });
    if (moveX !== 0 || moveZ !== 0) {
      // Mesh faces -Z at rest; turn it towards the movement direction.
      this.facing.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.atan2(-moveX, -moveZ));
    }
  }

  /** Call after `PhysicsWorld.step` so the respawn check sees this tick's result. */
  postStep(): void {
    const t = this.controller.body.translation();
    if (t.y < KILL_PLANE_Y) this.controller.teleport(this.spawn);
  }

  render(alpha: number, frameTime: number): void {
    this.controller.interpolatedFeet(alpha, this.feet);
    this.mesh.position.copy(this.feet);
    this.mesh.quaternion.slerp(this.facing, 1 - Math.exp(-15 * frameTime));
  }
}
