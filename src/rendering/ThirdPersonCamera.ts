import * as THREE from 'three';
import type RAPIER_API from '@dimforge/rapier3d';
import { CAMERA } from '../config/constants';
import type { InputManager } from '../input/InputManager';
import type { PhysicsQueries } from '../physics/PhysicsWorld';

const LOCK_SMOOTHING = 8;
const LOCK_PITCH = -0.25;

/**
 * Orbiting third-person camera. Mouse look updates yaw/pitch every rendered frame for
 * responsiveness; the simulation reads `yaw` when it samples input so movement is camera-relative.
 * A physics raycast pulls the camera in front of anything between it and the player.
 */
export class ThirdPersonCamera {
  yaw = 0;
  pitch = -0.3;
  /** Returns the lock-on target point (world space) while locked, else null. Set by the player controller. */
  lockTarget: (() => { x: number; y: number; z: number } | null) | null = null;
  /** Receives the frame's horizontal mouse delta in pixels while locked (feeds the lock-on swap gesture). */
  onLockLook: ((dx: number) => void) | null = null;
  private distance: number = CAMERA.distance;
  private readonly target = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly input: InputManager,
    private readonly physics: PhysicsQueries,
    private readonly ignore: RAPIER_API.Collider,
  ) {}

  /** Converts camera-relative strafe/forward axes into a world-space (x, z) direction. */
  toWorld(right: number, forward: number): { x: number; z: number } {
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // Yaw 0 looks down -Z; forward is the camera's horizontal view direction.
    return { x: right * cos - forward * sin, z: -right * sin - forward * cos };
  }

  /** Places the camera behind `feet` (the interpolated player position). Call once per frame. */
  update(feet: THREE.Vector3, frameTime = 1 / 60): void {
    const { dx, dy } = this.input.consumeMouseDelta();
    const lock = this.lockTarget?.() ?? null;
    if (lock) {
      this.onLockLook?.(dx);
      this.easeToward(feet, lock, frameTime);
    } else {
      this.yaw -= dx * CAMERA.mouseSensitivity;
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * CAMERA.mouseSensitivity, CAMERA.minPitch, CAMERA.maxPitch);
    }
    this.distance = THREE.MathUtils.clamp(
      this.distance + this.input.consumeWheel() * 0.5,
      CAMERA.minDistance,
      CAMERA.maxDistance,
    );

    this.target.set(feet.x, feet.y + CAMERA.targetHeight, feet.z);
    // While locked, aim a third of the way to the target so both stay in frame.
    if (lock) this.target.lerp(this.tmp.set(lock.x, lock.y, lock.z), 1 / 3);
    // Direction from the target back to the camera.
    this.offset.set(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      -Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );

    let dist = this.distance;
    const hit = this.physics.raycast(this.target, this.offset, dist + CAMERA.collisionMargin, this.ignore);
    if (hit) dist = Math.max(hit.distance - CAMERA.collisionMargin, 0.3);

    this.camera.position.copy(this.target).addScaledVector(this.offset, dist);
    this.camera.lookAt(this.target);
  }

  /** Eases yaw toward the target bearing (shortest arc, never overshooting) and pitch toward the lock pitch. */
  private easeToward(feet: THREE.Vector3, lock: { x: number; y: number; z: number }, frameTime: number): void {
    const k = 1 - Math.exp(-LOCK_SMOOTHING * frameTime);
    const hx = lock.x - feet.x;
    const hz = lock.z - feet.z;
    // Zero horizontal distance has no bearing: keep the previous yaw.
    if (Math.hypot(hx, hz) > 1e-6) {
      const desired = Math.atan2(-hx, -hz);
      const diff = Math.atan2(Math.sin(desired - this.yaw), Math.cos(desired - this.yaw));
      this.yaw += diff * k;
    }
    const pitchGoal = THREE.MathUtils.clamp(LOCK_PITCH, CAMERA.minPitch, CAMERA.maxPitch);
    this.pitch += (pitchGoal - this.pitch) * k;
  }
}
