import type RAPIER_API from '@dimforge/rapier3d';
import { CHARACTER_CONTROLLER, FIXED_TIMESTEP, PLAYER } from '../config/constants';
import type { PhysicsWorld, Vec3 } from './PhysicsWorld';

export interface MoveIntent {
  /** Desired horizontal direction in world space (x, z); length is clamped to 1. */
  moveX: number;
  moveZ: number;
  sprint: boolean;
  jump: boolean;
  /** When finite and > 0, replaces the walk/sprint speed for this tick (m/s); direction is still clamped. */
  speedOverride?: number;
  /** Launch vertical speed (m/s) for a grounded jump this tick; defaults to PLAYER.jumpSpeed. */
  jumpSpeed?: number;
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
/** A hit normal at least this upright is ground the controller can climb. */
const WALKABLE_NORMAL_Y = Math.cos(CHARACTER_CONTROLLER.maxSlopeClimbAngle);

export class CharacterController {
  readonly body: RAPIER_API.RigidBody;
  readonly collider: RAPIER_API.Collider;
  private readonly controller: RAPIER_API.KinematicCharacterController;

  private verticalVelocity = 0;
  private _grounded = false;
  /** Extra jumps allowed while airborne (double jump); 0 disables. Reset on landing. */
  airJumps = 0;
  /** Launch speed (m/s) of an air jump; when unset the air jump uses the grounded jump's speed. */
  airJumpSpeed?: number;
  private airJumpsLeft = 0;
  private prevJump = false;
  private platformSource: ((collider: RAPIER_API.Collider) => Vec3 | null) | undefined;
  private groundCollider_: RAPIER_API.Collider | null = null;
  private wallNormal: Vec3 | null = null;
  private wallSlideMax: number | null = null;
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

  /** Supplies the frame translation of a moving platform; while grounded on one, the character is carried by it. */
  setPlatformSource(fn: ((collider: RAPIER_API.Collider) => Vec3 | null) | undefined): void {
    this.platformSource = fn;
  }

  /** The collider the character stood on after the last move, or null when airborne. */
  groundCollider(): RAPIER_API.Collider | null {
    return this._grounded ? this.groundCollider_ : null;
  }

  /** The first near-vertical surface (|normal.y| < 0.3) touched by the last move, or null. */
  wallContact(): { normal: Vec3 } | null {
    return this.wallNormal ? { normal: { ...this.wallNormal } } : null;
  }

  /** One-tick request: on the next fixedUpdate, touching a wall while falling is clamped to `maxFallSpeed` m/s. */
  wallSlide(maxFallSpeed: number): void {
    this.wallSlideMax = maxFallSpeed;
  }

  /** Sets the vertical speed (m/s, up positive) for the next fixedUpdate: a scripted launch such as a wall kick. */
  launch(speed: number): void {
    if (Number.isFinite(speed)) this.verticalVelocity = speed;
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
    const override = intent.speedOverride;
    const speed =
      override !== undefined && Number.isFinite(override) && override > 0
        ? override
        : intent.sprint
          ? PLAYER.sprintSpeed
          : PLAYER.walkSpeed;

    const jumpEdge = intent.jump && !this.prevJump;
    this.prevJump = intent.jump;
    if (this._grounded) this.airJumpsLeft = this.airJumps;
    else if (this.airJumpsLeft > this.airJumps) this.airJumpsLeft = Math.max(0, this.airJumps);
    if (this._grounded && intent.jump) {
      this.verticalVelocity = intent.jumpSpeed ?? PLAYER.jumpSpeed;
    } else if (!this._grounded && jumpEdge && this.airJumpsLeft > 0) {
      this.airJumpsLeft--;
      this.verticalVelocity = this.airJumpSpeed ?? intent.jumpSpeed ?? PLAYER.jumpSpeed;
    } else if (this._grounded && this.verticalVelocity < 0) {
      // Keep a small downward push while grounded so ground detection and snapping stay engaged.
      this.verticalVelocity = -1;
    }
    this.verticalVelocity = Math.max(this.verticalVelocity - PLAYER.gravity * dt, -PLAYER.maxFallSpeed);
    const slideMax = this.wallSlideMax;
    this.wallSlideMax = null;
    if (slideMax !== null && this.wallNormal && !this._grounded && this.verticalVelocity < -slideMax) {
      this.verticalVelocity = -slideMax;
    }

    const desired = { x: mx * speed * dt, y: this.verticalVelocity * dt, z: mz * speed * dt };
    // The platform's own frame translation, added after the collision move: the move is resolved against the
    // platform where it still is (so snap-to-ground keeps the feet on it), then rides along with it.
    const carry = this._grounded && this.platformSource && this.groundCollider_ ? this.platformSource(this.groundCollider_) : null;
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

    this.readContacts(move, desired);

    // Hitting a ceiling cancels upward velocity instead of gluing the player to it.
    if (this.verticalVelocity > 0 && move.y < desired.y * 0.5) this.verticalVelocity = 0;

    if (carry) {
      // Rapier already rides a kinematic ground at the body's last-step velocity; add only the difference so
      // the character follows the platform's actual frame translation exactly, with or without that support.
      const v = this.groundCollider_?.parent()?.linvel();
      move = {
        x: move.x + carry.x - (v ? v.x * dt : 0),
        y: move.y + carry.y - (v ? v.y * dt : 0),
        z: move.z + carry.z - (v ? v.z * dt : 0),
      };
    }
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
    this.groundCollider_ = null;
    this.wallNormal = null;
    this.readFeet(this.curr);
    Object.assign(this.prev, this.curr);
  }

  /**
   * Holds the character where it is for this tick: no move, no gravity (cutscenes, kneeling). The
   * interpolation pair collapses so rendering does not drift.
   */
  hold(): void {
    Object.assign(this.prev, this.curr);
    this.verticalVelocity = 0;
    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x, y: t.y, z: t.z });
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
      if (!hit) return null;
      if (hit.toi > CHARACTER_CONTROLLER.offset) {
        // Far from the origin float32 rounding tilts a heightfield's normal by a few degrees where the capsule
        // crosses a cell diagonal, and Rapier stops the move on that phantom floor just outside the skin. A walkable
        // terrain floor never blocks a horizontal move, so skip it; steps, boxes and steeper ground are real obstacles.
        if (hit.normal1.y >= WALKABLE_NORMAL_Y && hit.collider?.shape.type === this.physics.rapier.ShapeType.HeightField) {
          continue;
        }
        return null;
      }
      const into = dx * hit.normal1.x + dz * hit.normal1.z;
      const horizontal = hit.normal1.x * hit.normal1.x + hit.normal1.z * hit.normal1.z;
      if (into < 0 && horizontal > 1e-6) {
        dx -= (into * hit.normal1.x) / horizontal;
        dz -= (into * hit.normal1.z) / horizontal;
      }
    }
    return { x: dx, y: 0, z: dz };
  }

  /** Ground collider and wall normal from the last computed move. */
  private readContacts(move: Vec3, desired: Vec3): void {
    this.wallNormal = null;
    let ground: RAPIER_API.Collider | null = null;
    let groundToi = Infinity;
    const n = this.controller.numComputedCollisions();
    for (let i = 0; i < n; i++) {
      const hit = this.controller.computedCollision(i);
      if (!hit) continue;
      if (hit.normal1.y > 0.7) {
        if (hit.collider && hit.toi < groundToi) {
          ground = hit.collider;
          groundToi = hit.toi;
        }
      }
      else if (!this.wallNormal && Math.abs(hit.normal1.y) < 0.3) {
        this.wallNormal = { x: hit.normal1.x, y: hit.normal1.y, z: hit.normal1.z };
      }
    }
    // A character pressed into a wall inside the skin gets no collision back; probe along the blocked move.
    const wanted = Math.hypot(desired.x, desired.z);
    if (!this.wallNormal && wanted > 1e-6 && Math.hypot(move.x, move.z) < wanted * 0.9) {
      const t = this.body.translation();
      const hit = this.physics.raycast(
        { x: t.x + move.x, y: t.y + move.y, z: t.z + move.z },
        { x: desired.x / wanted, y: 0, z: desired.z / wanted },
        PLAYER.radius + CHARACTER_CONTROLLER.offset * 3,
        this.collider,
      );
      if (hit && Math.abs(hit.normal.y) < 0.3) this.wallNormal = { ...hit.normal };
    }
    // Snap-to-ground ticks can report no ground hit; a short ray finds what is under the feet (only when carrying).
    if (this._grounded && !ground && this.platformSource) {
      const t = this.body.translation();
      const hit = this.physics.raycast(
        { x: t.x + move.x, y: t.y + move.y - CENTRE_HEIGHT + 0.1, z: t.z + move.z },
        { x: 0, y: -1, z: 0 },
        0.1 + CHARACTER_CONTROLLER.snapToGround + CHARACTER_CONTROLLER.offset * 2,
        this.collider,
      );
      ground = hit?.collider ?? null;
    }
    this.groundCollider_ = this._grounded ? ground : null;
  }

  private readFeet(out: Vec3): void {
    const t = this.body.translation();
    out.x = t.x;
    out.y = t.y - CENTRE_HEIGHT;
    out.z = t.z;
  }
}
