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
  /** Called when a scripted leap starts, lands or is cancelled (`to` is the landing feet, on 'land' only). */
  onLeap?: (e: { phase: 'start' | 'land' | 'cancel'; from: Vec3; to?: Vec3 }) => void;
}

/** A scripted ballistic jump: `distance` metres along `yaw`, peaking `apex` metres above the launch point. */
export interface LeapOptions {
  /** Radians about +Y, 0 = facing -Z. Default: the current facing. */
  yaw?: number;
  distance: number;
  apex: number;
  /** Simulated-time limit before the leap is cancelled. Default 1.5. */
  maxSeconds?: number;
}

export interface LeapHandle {
  readonly active: boolean;
  /** True once the leap ended by touching ground again (not by cancel). */
  readonly landed: boolean;
  cancel(): void;
}

const LEAP_DEFAULT_SECONDS = 1.5;
/** A leap whose controller is still grounded after this many ticks was blocked and is cancelled. */
const LEAP_LIFTOFF_TICKS = 3;

interface ActiveLeap {
  dirX: number;
  dirZ: number;
  yaw: number;
  speed: number;
  jumpSpeed: number;
  ticks: number;
  maxTicks: number;
  leftGround: boolean;
  landed: boolean;
  active: boolean;
  from: Vec3;
}

/** Combined movement restriction for one tick; `speedScale` in [0, 1.5] (above 1 boosts walk and sprint speed). */
export interface MoveModifierState {
  speedScale: number;
  lockMove: boolean;
  lockFacing: boolean;
  /** No gravity and no controller move at all this tick. */
  freeze?: boolean;
  /** v0.7: the sprint input is ignored this tick (wading water, a hauled sled). */
  noSprint?: boolean;
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
 * The mount's ride (thread 20): the capsule moves along the unit heading (x, z) at `speed` m/s. At speed 0 it
 * stands still (it never falls back to walking). `yaw` is the facing (0 = -Z).
 */
export interface RideMove {
  x: number;
  z: number;
  speed: number;
  yaw: number;
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
  private ride: RideMove | null = null;
  private verticalIntent: number | null = null;
  /** Leap start, land and cancel; the game core maps it to the `player.leap` event. Defaults to `options.onLeap`. */
  onLeap: PlayerOptions['onLeap'] | null = null;
  private leapState: ActiveLeap | null = null;

  constructor(
    scene: THREE.Scene,
    physics: PhysicsWorld,
    readonly spawn: Vec3,
    private readonly options: PlayerOptions = {},
  ) {
    this.controller = new CharacterController(physics, spawn);
    this.onLeap = options.onLeap ?? null;

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

  /**
   * While set, the player is seated on the mount: the move follows `m` instead of the input, jump is suppressed
   * and `locomotion()` reports a standing rider. A leap and a forced move (dodge, knockback) still win; move locks
   * and `speedScale` apply as to normal input. `null` gives control back to the input.
   */
  setRide(m: RideMove | null): void {
    this.ride = m && [m.x, m.z, m.speed, m.yaw].every(Number.isFinite) ? { ...m } : null;
  }

  /**
   * v0.7 (K7's dive): the vertical speed, m/s with up positive, passed to the controller while it is in swim mode; read
   * only by the input branch and only in swim mode, and 0 while movement is locked. `null` (or a non-finite value)
   * clears it. Walk and glide never read it.
   */
  setVerticalIntent(v: number | null): void {
    this.verticalIntent = v !== null && Number.isFinite(v) ? v : null;
  }

  /** True while a ride is set (the player is seated). */
  get seated(): boolean {
    return this.ride !== null;
  }

  /**
   * Starts a scripted leap: a ballistic jump covering `distance` along `yaw` with its peak `apex`
   * above the launch point, through the normal collision path. It takes precedence over forced moves
   * and ignores `lockMove`, `speedScale` and `movementLocked`. Returns null (and does nothing) when
   * the inputs are invalid, the player is airborne or frozen, or a leap is already running.
   */
  leap(opts: LeapOptions): LeapHandle | null {
    const maxSeconds = opts.maxSeconds ?? LEAP_DEFAULT_SECONDS;
    const yaw = opts.yaw ?? this.facingYaw;
    const ok = (n: number) => Number.isFinite(n) && n > 0;
    if (!ok(opts.distance) || !ok(opts.apex) || !ok(maxSeconds) || !Number.isFinite(yaw)) return null;
    if (this.leapState || !this.controller.grounded || this.options.moveModifier?.()?.freeze) return null;

    const g = PLAYER.gravity;
    const jumpSpeed = Math.sqrt(2 * g * opts.apex);
    const airtime = (2 * jumpSpeed) / g;
    const from = this.controller.interpolatedFeet(1, { x: 0, y: 0, z: 0 });
    const state: ActiveLeap = {
      dirX: -Math.sin(yaw),
      dirZ: -Math.cos(yaw),
      yaw,
      speed: opts.distance / airtime,
      jumpSpeed,
      ticks: 0,
      maxTicks: Math.max(1, Math.ceil(maxSeconds / FIXED_TIMESTEP)),
      leftGround: false,
      landed: false,
      active: true,
      from,
    };
    this.leapState = state;
    this.onLeap?.({ phase: 'start', from: { ...from } });
    return {
      get active() {
        return state.active;
      },
      get landed() {
        return state.landed;
      },
      cancel: () => {
        if (this.leapState === state) this.endLeap('cancel');
      },
    };
  }

  /** Ends a running leap (teleports, respawns); gravity continues, forced horizontal motion stops. No-op otherwise. */
  cancelLeap(): void {
    if (this.leapState) this.endLeap('cancel');
  }

  private endLeap(phase: 'land' | 'cancel'): void {
    const state = this.leapState;
    if (!state) return;
    this.leapState = null;
    state.active = false;
    if (phase === 'land') {
      state.landed = true;
      this.onLeap?.({
        phase,
        from: { ...state.from },
        to: this.controller.interpolatedFeet(1, { x: 0, y: 0, z: 0 }),
      });
    } else {
      this.onLeap?.({ phase, from: { ...state.from } });
    }
  }

  /** What the controller actually did over the last tick, for animation. */
  locomotion(): LocomotionInput {
    this.controller.interpolatedFeet(0, this.tickPrev);
    this.controller.interpolatedFeet(1, this.tickCurr);
    const dx = this.tickCurr.x - this.tickPrev.x;
    const dz = this.tickCurr.z - this.tickPrev.z;
    return {
      grounded: this.controller.grounded,
      // Seated in the saddle: the rider stands still while the horse moves.
      horizontalSpeed: this.ride ? 0 : Math.hypot(dx, dz) / FIXED_TIMESTEP,
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
      this.cancelLeap();
      this.controller.hold();
      return;
    }
    const leap = this.leapState;
    const forced = leap ? null : this.forcedMove;
    const ride = leap || forced ? null : this.ride;
    if (leap) {
      moveX = leap.dirX;
      moveZ = leap.dirZ;
      this.controller.fixedUpdate({
        moveX,
        moveZ,
        sprint: false,
        jump: leap.ticks === 0,
        speedOverride: leap.speed,
        jumpSpeed: leap.jumpSpeed,
      });
      leap.ticks++;
      if (!this.controller.grounded) leap.leftGround = true;
      if (leap.leftGround && this.controller.grounded) this.endLeap('land');
      else if (!leap.leftGround && leap.ticks >= LEAP_LIFTOFF_TICKS) this.endLeap('cancel');
      else if (leap.ticks >= leap.maxTicks) this.endLeap('cancel');
    } else if (forced) {
      moveX = forced.x;
      moveZ = forced.z;
      this.controller.fixedUpdate({ moveX, moveZ, sprint: false, jump: false, speedOverride: forced.speed });
    } else if (ride) {
      const locked = (this.options.movementLocked?.() ?? false) || (mod?.lockMove ?? false);
      const speed = locked ? 0 : ride.speed * Math.min(1, Math.max(0, mod?.speedScale ?? 1));
      // Zero direction at speed 0: the controller would otherwise fall back to the walk speed.
      moveX = speed > 0 ? ride.x : 0;
      moveZ = speed > 0 ? ride.z : 0;
      this.controller.fixedUpdate({ moveX, moveZ, sprint: false, jump: false, speedOverride: speed > 0 ? speed : undefined });
    } else {
      const locked = (this.options.movementLocked?.() ?? false) || (mod?.lockMove ?? false);
      let jump: boolean;
      ({ moveX, moveZ, jump } = gateMovement(locked, { moveX, moveZ, jump: input.jump }));
      let speedOverride: number | undefined;
      const sprint = input.sprint && !mod?.noSprint;
      if (mod && mod.speedScale < 1) {
        const len = Math.hypot(moveX, moveZ);
        const scale = Math.max(0, mod.speedScale) / Math.max(1, len);
        moveX *= scale;
        moveZ *= scale;
      } else if (mod && mod.speedScale > 1) {
        // A boost raises the speed itself; the move vector keeps its unit-length clamp.
        speedOverride = (sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed) * mod.speedScale;
      }
      const swim = this.controller.moveMode === 'swim';
      const verticalSpeed = swim && this.verticalIntent !== null ? (locked ? 0 : this.verticalIntent) : undefined;
      this.controller.fixedUpdate({ moveX, moveZ, sprint, jump, speedOverride, ...(verticalSpeed !== undefined ? { verticalSpeed } : {}) });
    }
    if (this.facingOverride !== null) {
      this.facing.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, this.facingOverride);
    } else if (ride && !mod?.lockFacing) {
      this.facing.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, ride.yaw);
    } else if ((moveX !== 0 || moveZ !== 0) && !mod?.lockFacing && (leap || !forced || forced.turn)) {
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
      this.cancelLeap();
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
