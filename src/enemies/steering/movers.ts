import * as THREE from 'three';
import { PLAYER } from '../../config/constants';
import { CharacterController } from '../../physics/CharacterController';
import type { PhysicsWorld, Vec3 } from '../../physics/PhysicsWorld';
import { WORLD_AI } from '../tuning';

/**
 * Rapier interaction groups: membership in the upper 16 bits, filter in the lower 16. Enemies are
 * member 0x0002 and interact with everything, so terrain, statics and the player still collide with
 * them (default colliders are 0xFFFF / 0xFFFF).
 */
export const ENEMY_COLLISION_GROUP = ((0x0002 << 16) | 0xffff) >>> 0;
/**
 * Query filter groups (castRay and friends: `filterGroups`) that skip enemy colliders but see
 * everything else: member of everything, filter excludes bit 0x0002.
 */
export const IGNORE_ENEMIES_QUERY_GROUPS = ((0xffff << 16) | 0xfffd) >>> 0;

export interface EnemyMover {
  /** The fastest the mover goes, m/s (default: a walking player's speed). Fast enemies (hounds) raise it. */
  maxSpeed: number;
  /** Simulated feet this tick. */
  readonly feet: THREE.Vector3;
  /** Horizontal world velocity in m/s; kinematic movers advance one fixed tick (the dt is ignored there). */
  move(velocity: { x: number; z: number }, dt: number): void;
  teleport(feet: Vec3): void;
  interpolatedFeet(alpha: number, out: THREE.Vector3): THREE.Vector3;
  readonly collider: unknown | null;
  dispose(): void;
}

/** Wraps the player's CharacterController: walk only, never sprint or jump. */
export class KinematicMover implements EnemyMover {
  readonly feet = new THREE.Vector3();
  maxSpeed: number = PLAYER.walkSpeed;
  private readonly controller: CharacterController;

  constructor(physics: PhysicsWorld, feet: Vec3) {
    this.controller = new CharacterController(physics, feet);
    this.controller.collider.setCollisionGroups(ENEMY_COLLISION_GROUP);
    this.syncFeet();
  }

  get collider(): unknown {
    return this.controller.collider;
  }

  get grounded(): boolean {
    return this.controller.grounded;
  }

  move(velocity: { x: number; z: number }, _dt: number): void {
    const vx = Number.isFinite(velocity.x) ? velocity.x : 0;
    const vz = Number.isFinite(velocity.z) ? velocity.z : 0;
    const speed = Math.hypot(vx, vz);
    // Faster than a walking player only when the owner raised `maxSpeed` (a hound's chase and leap): the
    // controller clamps the direction, so the speed itself is passed.
    const fast = this.maxSpeed > PLAYER.walkSpeed && speed > PLAYER.walkSpeed;
    const k = fast ? Math.min(1, this.maxSpeed / speed) : 1;
    this.controller.fixedUpdate({
      moveX: fast ? vx / speed : vx / PLAYER.walkSpeed,
      moveZ: fast ? vz / speed : vz / PLAYER.walkSpeed,
      sprint: false,
      jump: false,
      ...(fast ? { speedOverride: speed * k } : {}),
    });
    this.syncFeet();
  }

  teleport(feet: Vec3): void {
    this.controller.teleport(feet);
    this.syncFeet();
  }

  interpolatedFeet(alpha: number, out: THREE.Vector3): THREE.Vector3 {
    return this.controller.interpolatedFeet(alpha, out);
  }

  dispose(): void {
    this.controller.dispose();
  }

  private syncFeet(): void {
    this.controller.interpolatedFeet(1, this.feet);
  }
}

/** No physics: velocity times dt, y snapped to the terrain height. */
export class HeightfieldMover implements EnemyMover {
  /** Unused: the heightfield mover goes exactly as fast as asked. */
  maxSpeed = Infinity;
  readonly feet = new THREE.Vector3();
  readonly collider = null;
  private readonly prev = new THREE.Vector3();

  constructor(
    private readonly heightAt: (x: number, z: number) => number,
    feet: Vec3,
  ) {
    this.teleport(feet);
  }

  move(velocity: { x: number; z: number }, dt: number): void {
    this.prev.copy(this.feet);
    if (Number.isFinite(velocity.x) && Number.isFinite(velocity.z) && Number.isFinite(dt)) {
      this.feet.x += velocity.x * dt;
      this.feet.z += velocity.z * dt;
    }
    this.feet.y = this.heightAt(this.feet.x, this.feet.z);
  }

  teleport(feet: Vec3): void {
    this.feet.set(feet.x, feet.y, feet.z);
    this.prev.copy(this.feet);
  }

  interpolatedFeet(alpha: number, out: THREE.Vector3): THREE.Vector3 {
    return out.lerpVectors(this.prev, this.feet, alpha);
  }

  dispose(): void {}
}

/**
 * Awake: kinematic. Asleep: heightfield, while the kinematic body stays parked at the feet so the
 * player still bumps into it. Switches only on `sleep()` and `wake()`, and on `fly()` for a flier (the Ember Wyrm):
 * flying runs on the heightfield with the kinematic collider disabled, so walls do not stop it and nothing bumps an
 * invisible capsule under it; `wake()` never brings the kinematic path back while flying.
 */
export class SwitchingMover implements EnemyMover {
  private readonly kinematic: KinematicMover;
  private readonly flat: HeightfieldMover;
  private _asleep = false;
  private _flying = false;

  get maxSpeed(): number {
    return this.kinematic.maxSpeed;
  }

  set maxSpeed(v: number) {
    this.kinematic.maxSpeed = v;
  }

  constructor(physics: PhysicsWorld, heightAt: (x: number, z: number) => number, feet: Vec3) {
    this.kinematic = new KinematicMover(physics, feet);
    this.flat = new HeightfieldMover(heightAt, feet);
  }

  get asleep(): boolean {
    return this._asleep;
  }

  get flying(): boolean {
    return this._flying;
  }

  private get onFlat(): boolean {
    return this._asleep || this._flying;
  }

  get feet(): THREE.Vector3 {
    return this.onFlat ? this.flat.feet : this.kinematic.feet;
  }

  get collider(): unknown {
    return this.kinematic.collider;
  }

  move(velocity: { x: number; z: number }, dt: number): void {
    if (this.onFlat) this.flat.move(velocity, dt);
    else this.kinematic.move(velocity, dt);
  }

  teleport(feet: Vec3): void {
    this.flat.teleport(feet);
    this.kinematic.teleport(feet);
  }

  interpolatedFeet(alpha: number, out: THREE.Vector3): THREE.Vector3 {
    return this.onFlat ? this.flat.interpolatedFeet(alpha, out) : this.kinematic.interpolatedFeet(alpha, out);
  }

  /** Switch to the heightfield mover at the current feet and park the kinematic body there. */
  sleep(): void {
    if (this._asleep) return;
    if (!this._flying) {
      const f = this.kinematic.feet;
      this.flat.teleport(f);
      this.kinematic.teleport(f);
    }
    this._asleep = true;
  }

  /** Switch back: teleport the kinematic body to the current feet lifted by WORLD_AI.wakeLift (not while flying). */
  wake(): void {
    if (!this._asleep) return;
    this._asleep = false;
    if (this._flying) return;
    const f = this.flat.feet;
    this.kinematic.teleport({ x: f.x, y: f.y + WORLD_AI.wakeLift, z: f.z });
  }

  /**
   * `fly(true)`: take off onto the heightfield at the current feet and disable the kinematic collider. `fly(false, at)`:
   * touch down at `at` (default: the current feet; the owner picks an open spot), re-enable the collider and teleport
   * the kinematic body there lifted by WORLD_AI.wakeLift. Repeated calls are no-ops.
   */
  fly(on: boolean, at?: Vec3): void {
    if (on === this._flying) return;
    const collider = this.kinematic.collider as { setEnabled?(enabled: boolean): void } | null;
    if (on) {
      if (!this._asleep) this.flat.teleport(this.kinematic.feet);
      collider?.setEnabled?.(false);
      this._flying = true;
      return;
    }
    const f = at && Number.isFinite(at.x) && Number.isFinite(at.y) && Number.isFinite(at.z) ? at : this.flat.feet;
    this._flying = false;
    this.flat.teleport(f);
    collider?.setEnabled?.(true);
    if (this._asleep) this.kinematic.teleport(f);
    else this.kinematic.teleport({ x: f.x, y: f.y + WORLD_AI.wakeLift, z: f.z });
  }

  dispose(): void {
    this.kinematic.dispose();
    this.flat.dispose();
  }
}
