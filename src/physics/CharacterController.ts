import type RAPIER_API from '@dimforge/rapier3d';
import { CHARACTER_CONTROLLER, FIXED_TIMESTEP, PLAYER } from '../config/constants';
import type { PhysicsWorld, Vec3 } from './PhysicsWorld';

export interface MoveIntent {
  /** Desired horizontal direction in world space (x, z); length is clamped to 1. */
  moveX: number;
  moveZ: number;
  sprint: boolean;
  jump: boolean;
}

/**
 * Capsule character driven by Rapier's KinematicCharacterController rather than a dynamic rigid
 * body, so it does not bounce or stick to slopes. Gravity and jumping are integrated here; Rapier
 * resolves collisions, slope limits, stepping and ground snapping.
 * Reference: Orillusion's CharacterController.ts.
 */
/** Distance from the capsule centre down to the feet. */
const CENTRE_HEIGHT = PLAYER.halfHeight + PLAYER.radius;
/**
 * A capsule placed inside the controller's `offset` skin confuses Rapier's ground contact (stalled
 * moves, drifting off the ground while idle), so spawns and teleports start this far above the
 * requested feet height and settle onto the ground on the next tick.
 */
const PLACEMENT_LIFT = CHARACTER_CONTROLLER.offset * 2;

export class CharacterController {
  readonly body: RAPIER_API.RigidBody;
  readonly collider: RAPIER_API.Collider;
  private readonly controller: RAPIER_API.KinematicCharacterController;

  private verticalVelocity = 0;
  private _grounded = false;
  private readonly prev = { x: 0, y: 0, z: 0 };
  private readonly curr = { x: 0, y: 0, z: 0 };

  constructor(
    private readonly physics: PhysicsWorld,
    spawn: Vec3,
  ) {
    const { rapier, world } = physics;
    this.body = world.createRigidBody(
      rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(
        spawn.x,
        spawn.y + CENTRE_HEIGHT + PLACEMENT_LIFT,
        spawn.z,
      ),
    );
    this.collider = world.createCollider(rapier.ColliderDesc.capsule(PLAYER.halfHeight, PLAYER.radius), this.body);

    const c = CHARACTER_CONTROLLER;
    this.controller = world.createCharacterController(c.offset);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.setMaxSlopeClimbAngle(c.maxSlopeClimbAngle);
    this.controller.setMinSlopeSlideAngle(c.minSlopeSlideAngle);
    this.controller.setSlideEnabled(true);
    this.controller.enableSnapToGround(c.snapToGround);
    this.controller.enableAutostep(c.autoStep.maxHeight, c.autoStep.minWidth, c.autoStep.includeDynamicBodies);
    this.controller.setApplyImpulsesToDynamicBodies(true);

    this.readFeet(this.curr);
    Object.assign(this.prev, this.curr);
  }

  get grounded(): boolean {
    return this._grounded;
  }

  /**
   * Computes this tick's movement and queues it as the body's next kinematic translation.
   * Call once per fixed tick (FIXED_TIMESTEP), before `PhysicsWorld.step`.
   */
  fixedUpdate(intent: MoveIntent): void {
    const dt = FIXED_TIMESTEP;
    Object.assign(this.prev, this.curr);

    let mx = intent.moveX;
    let mz = intent.moveZ;
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    const speed = intent.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;

    if (this._grounded && intent.jump) {
      this.verticalVelocity = PLAYER.jumpSpeed;
    } else if (this._grounded && this.verticalVelocity < 0) {
      // Keep a small downward push while grounded so ground detection and snapping stay engaged.
      this.verticalVelocity = -1;
    }
    this.verticalVelocity = Math.max(this.verticalVelocity - PLAYER.gravity * dt, -PLAYER.maxFallSpeed);

    const desired = { x: mx * speed * dt, y: this.verticalVelocity * dt, z: mz * speed * dt };
    this.controller.computeColliderMovement(this.collider, desired);
    let move = this.controller.computedMovement();
    this._grounded = this.controller.computedGrounded();

    // Near the edge of the controller's offset skin, Rapier sometimes reports near-zero-distance
    // hits (floor, or floor plus a wall being slid along) and drops the rest of the move instead of
    // sliding, stalling the player for a tick. Retry the horizontal part alone (keeps auto-step
    // working), then, if a wall still blocks it, the move slid along the hit surfaces. Never on a
    // rising tick, so a retry cannot swallow a jump.
    const wanted = Math.hypot(desired.x, desired.z);
    const stalled = () => Math.hypot(move.x, move.z) < wanted * 0.5;
    if (wanted > 0 && stalled() && this._grounded && this.verticalVelocity <= 0) {
      const slid = this.slideAlongSkinHits(desired.x, desired.z);
      if (slid) {
        this.controller.computeColliderMovement(this.collider, { x: desired.x, y: 0, z: desired.z });
        move = this.controller.computedMovement();
        if (stalled()) {
          this.controller.computeColliderMovement(this.collider, slid);
          move = this.controller.computedMovement();
        }
      }
    }

    // Hitting a ceiling cancels upward velocity instead of gluing the player to it.
    if (this.verticalVelocity > 0 && move.y < desired.y * 0.5) this.verticalVelocity = 0;

    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + move.x, y: t.y + move.y, z: t.z + move.z });
    this.curr.x = t.x + move.x;
    this.curr.y = t.y + move.y - CENTRE_HEIGHT;
    this.curr.z = t.z + move.z;
  }

  /** Feet position blended between the last two ticks; `alpha` comes from the game loop. */
  interpolatedFeet<T extends Vec3>(alpha: number, out: T): T {
    out.x = this.prev.x + (this.curr.x - this.prev.x) * alpha;
    out.y = this.prev.y + (this.curr.y - this.prev.y) * alpha;
    out.z = this.prev.z + (this.curr.z - this.prev.z) * alpha;
    return out;
  }

  /**
   * Moves the character instantly (respawn, teleport) without interpolating across the jump.
   * `feet` should be on or above walkable ground; the capsule starts PLACEMENT_LIFT above it.
   */
  teleport(feet: Vec3): void {
    const centre = { x: feet.x, y: feet.y + CENTRE_HEIGHT + PLACEMENT_LIFT, z: feet.z };
    this.body.setTranslation(centre, true);
    this.body.setNextKinematicTranslation(centre);
    // The collider only follows its body during a world step; sync it now so the next
    // computeColliderMovement starts from the new position instead of the old one.
    this.physics.world.propagateModifiedBodyPositionsToColliders();
    this.verticalVelocity = 0;
    this._grounded = false;
    this.readFeet(this.curr);
    Object.assign(this.prev, this.curr);
  }

  dispose(): void {
    this.physics.world.removeCharacterController(this.controller);
    this.physics.world.removeRigidBody(this.body);
  }

  /**
   * If every collision from the last move happened within the offset skin, returns the horizontal
   * move (dx, dz) with the part pushing into each hit surface removed; otherwise null.
   */
  private slideAlongSkinHits(dx: number, dz: number): Vec3 | null {
    const n = this.controller.numComputedCollisions();
    if (n === 0) return null;
    for (let i = 0; i < n; i++) {
      const hit = this.controller.computedCollision(i);
      if (!hit || hit.toi > CHARACTER_CONTROLLER.offset) return null;
      const into = dx * hit.normal1.x + dz * hit.normal1.z;
      const horizontal = hit.normal1.x * hit.normal1.x + hit.normal1.z * hit.normal1.z;
      if (into < 0 && horizontal > 1e-6) {
        dx -= (into * hit.normal1.x) / horizontal;
        dz -= (into * hit.normal1.z) / horizontal;
      }
    }
    return { x: dx, y: 0, z: dz };
  }

  private readFeet(out: Vec3): void {
    const t = this.body.translation();
    out.x = t.x;
    out.y = t.y - CENTRE_HEIGHT;
    out.z = t.z;
  }
}
