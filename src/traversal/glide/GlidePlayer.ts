// The Dragonspine Glide (contracts v0.7 item 5; K7 PR 2): the launch from a ledge, the flight along its lane, the four
// endings and the catch. Pure behind its ports, driven once per fixed tick in the `intent` phase, so the forced move and
// the lift it sets apply to the same tick's move. The shared controller is touched only through K0's hooks
// (`setMoveMode('glide', { sinkRate })`, `launch`, `Player.setForcedMove`).
import type { MoveModifier } from '../../core/MoveModifiers';
import type { Vec3Like } from '../../core/events';
import { GLIDE_TUNING, type GlideEndReason, type MovementMode } from '../../movement/types';
import type { Act3GlideLedgeId } from '../../region/act3/act3Glide';
import { GLIDE_LANES, GLIDE_RULES, GLIDE_UPDRAFTS, clampToLane, inBox, inCorridor, inLanding, liftAt, wrapAngle, type GlideLane } from './lanes';

export const GLIDE_SOURCE = 'traversal.glide';
export const GLIDE_RETURN_SOURCE = 'traversal.glide.return';
/** The controller's gravity (PLAYER.gravity): a lift is applied as `launch(vy + gravity * dt)`, which the glide clamp keeps. */
export const GLIDE_GRAVITY = 20;
/** Lift-off: the feet this far over the ground (the controller reports airborne the tick after any teleport). */
export const LIFT_OFF_HEIGHT = 0.5;
/** The fade a return to the stand plays (out, hold for the move, in). */
export const RETURN_FADE = { out: 0.35, in: 0.5 } as const;

/** No attacks, block, dodge, Surge, abilities, mount, mercy, sneak or lock-on in the air; interact stays free to let go. */
export const GLIDE_LOCKS = [
  'attack1', 'attack2', 'attack3', 'attack4', 'block', 'dodge', 'surge', 'surgeLeap',
  'ability1', 'ability2', 'ability3', 'ability4', 'ability5', 'ability6', 'mount', 'mercy', 'sneak', 'lockOn', 'jump', 'sprint',
] as const;

export type GlideRefusal = 'closed' | 'mode' | 'busy' | 'unknown';
export type GlideState = 'idle' | 'launching' | 'gliding';

export interface GlidePlayerPorts {
  feet(): Vec3Like;
  grounded(): boolean;
  /** The walkable surface under (x, z), probed down from `fromY`. */
  groundAt(x: number, z: number, fromY: number): number;
  /** Sets the next tick's vertical speed (CharacterController.launch). */
  launch(vy: number): void;
  setControllerMode(mode: 'walk' | 'glide', sinkRate?: number): void;
  setForcedMove(m: { x: number; z: number; speed: number; turn: boolean } | null): void;
  /** The steering axis: -1 left, +1 right (moveLeft / moveRight). */
  steer(): number;
  addModifier(source: string, mod: MoveModifier): () => void;
  movementMode(): MovementMode;
  setMovementMode(mode: MovementMode, safe?: { position: Vec3Like; yaw: number } | null): void;
  /** A teleport K7 makes (remembered, so no other K7 system reads it as someone else's). */
  teleport(p: Vec3Like, yaw?: number): void;
  fade(opacity: number, seconds: number): void;
  /** The ledge is open (`openWhen`). */
  isOpen(lane: GlideLane): boolean;
  /** Where a glide from `lane` starts and a catch returns: K4's launch anchor when placed, else K1's lip. */
  stand(lane: GlideLane): Vec3Like;
  /** Dead, in a menu or a dialogue: no launch. */
  busy(): boolean;
  /** The player died (a glide in progress ends; a corpse is never caught). */
  dead(): boolean;
  mounted(): boolean;
  dismount(): void;
  emit(type: 'glide.started', p: { ledgeId: string }): void;
  emit(type: 'glide.landed', p: { at: Vec3Like }): void;
  emit(type: 'glide.ended', p: { reason: GlideEndReason }): void;
  toast(key: string): void;
}

interface Returning {
  lane: GlideLane;
  t: number;
  placed: boolean;
}

export class GlidePlayer {
  private state_: GlideState = 'idle';
  private lane_: GlideLane | null = null;
  private yaw_ = 0;
  private t = 0;
  private lift_ = 0;
  private above = 0;
  private lockOff: (() => void) | null = null;
  private freezeOff: (() => void) | null = null;
  private lastFeet: Vec3Like | null = null;
  private expected: Vec3Like | null = null;
  /** The lane whose catch is armed: from the launch until the player next stands on ground (or is returned). */
  private armed: GlideLane | null = null;
  private returning: Returning | null = null;

  constructor(
    private readonly ports: GlidePlayerPorts,
    private readonly lanes: readonly GlideLane[] = GLIDE_LANES,
  ) {}

  get state(): GlideState {
    return this.state_;
  }
  get lane(): GlideLane | null {
    return this.lane_;
  }
  get yaw(): number {
    return this.yaw_;
  }
  /** The lift (m/s) this tick: thermals plus slope wind. */
  get lift(): number {
    return this.lift_;
  }
  get heightAboveGround(): number {
    return this.above;
  }
  /** True while a glide runs, a fall after one can still be caught, or a return plays (K4's walk catch stands down). */
  get catchArmed(): boolean {
    return this.state_ !== 'idle' || this.armed !== null || this.returning !== null;
  }

  laneFor(site: string): GlideLane | null {
    return this.lanes.find((l) => l.site.id === site || l.def.id === site) ?? null;
  }

  /** Why a launch from `site` is refused now, or null. */
  refusal(site: Act3GlideLedgeId | string): GlideRefusal | null {
    const lane = this.laneFor(site);
    if (!lane) return 'unknown';
    if (this.state_ !== 'idle' || this.returning || this.ports.busy()) return 'busy';
    if (!this.ports.isOpen(lane)) return 'closed';
    if (this.ports.movementMode() !== 'walk') return 'mode';
    return null;
  }

  /** Starts a glide from `site`; returns the refusal (toasted) or null. */
  launch(site: Act3GlideLedgeId | string): GlideRefusal | null {
    const why = this.refusal(site);
    if (why) {
      if (why !== 'unknown') this.ports.toast(`glide.refused.${why}`);
      return why;
    }
    const lane = this.laneFor(site)!;
    const p = this.ports;
    if (p.mounted()) p.dismount();
    const stand = p.stand(lane);
    this.place(stand, lane.def.heading);
    p.setMovementMode('glide', { position: { ...stand }, yaw: lane.def.heading });
    p.setControllerMode('glide', GLIDE_TUNING.sinkRate);
    this.lockOff = p.addModifier(GLIDE_SOURCE, { lockActions: GLIDE_LOCKS });
    this.lane_ = lane;
    this.yaw_ = lane.def.heading;
    this.t = 0;
    this.lift_ = 0;
    this.armed = lane;
    this.state_ = 'launching';
    p.emit('glide.started', { ledgeId: lane.def.id });
    return null;
  }

  /** F: let go mid-air (the player falls; the catch is armed). Before lift-off it is a plain cancel. */
  letGo(): void {
    if (this.state_ !== 'idle') this.end('cancelled');
  }

  /** A direct hit (the plugin filters `damage.dealt`): the glide ends into a fall. */
  onHit(): void {
    if (this.state_ !== 'idle') this.end('hit');
  }

  /** Core containment put the player back inside the open area. */
  onContained(): void {
    if (this.state_ !== 'idle') this.end('contained');
  }

  /** A load placed the player (on the stand, through the safe point): drop everything without events. */
  reset(): void {
    if (this.state_ !== 'idle') this.restore(false);
    this.state_ = 'idle';
    this.lane_ = null;
    this.armed = null;
    this.endReturn(false);
    this.lastFeet = null;
    this.expected = null;
  }

  /** Another K7 system is moving the player (so the glide never reads it as someone else's teleport). */
  expect(p: Vec3Like): void {
    this.expected = { x: p.x, y: p.y, z: p.z };
  }

  fixedUpdate(dt: number): void {
    const p = this.ports;
    const f = p.feet();
    const jumped = this.jumpedExternally(f);
    this.lastFeet = { x: f.x, y: f.y, z: f.z };

    if (this.returning) {
      this.tickReturn(dt);
      return;
    }
    if (this.state_ === 'idle') {
      this.tickCatch(f, jumped);
      return;
    }
    const lane = this.lane_!;
    if (p.dead()) {
      this.end('hit', false);
      this.armed = null;
      return;
    }
    if (jumped) {
      // Someone else's teleport (a cutscene, a capture): the glide ends where they put the player.
      this.end('contained', false);
      this.armed = null;
      return;
    }
    this.t += dt;
    const grounded = p.grounded();
    const ground = p.groundAt(f.x, f.z, f.y + 1);
    this.above = Math.max(0, f.y - ground);
    if (this.state_ === 'launching') {
      // The run-up: the forced move carries the player off the lip (or a thermal lifts them) within the timeout.
      if (!grounded && this.above > LIFT_OFF_HEIGHT) this.state_ = 'gliding';
      else if (this.t >= GLIDE_RULES.launchTimeout) {
        this.end('cancelled');
        return;
      }
    } else if (grounded) {
      p.emit('glide.landed', { at: { x: f.x, y: f.y, z: f.z } });
      this.end('landed');
      return;
    }
    if (!inCorridor(lane, f.x, f.z) || f.z > GLIDE_RULES.maxZ) {
      this.end('contained');
      return;
    }

    const steer = p.steer();
    if (steer !== 0) this.yaw_ = clampToLane(lane, this.yaw_ - steer * GLIDE_RULES.turnRate * dt);
    p.setForcedMove({ x: -Math.sin(this.yaw_), z: -Math.cos(this.yaw_), speed: GLIDE_TUNING.forwardSpeed, turn: true });

    this.lift_ = liftAt(lane, f, ground, GLIDE_UPDRAFTS);
    // The glide clamp keeps max(v - g dt, -sink): launching (target + g dt) leaves exactly the target speed.
    if (this.lift_ > 0) p.launch(Math.min(GLIDE_RULES.maxClimb, -GLIDE_TUNING.sinkRate + this.lift_) + GLIDE_GRAVITY * dt);
  }

  private tickCatch(f: Vec3Like, jumped: boolean): void {
    const lane = this.armed;
    if (!lane) return;
    if (jumped) {
      this.armed = null;
      return;
    }
    const s = lane.site;
    if (this.ports.dead()) {
      this.armed = null;
      return;
    }
    // Never over a landing area: on some lanes the whole landing lies under the catch floor.
    if (f.y < s.catchFloorY && inBox(s.catchBox, f.x, f.z) && !inLanding(lane, f.x, f.z)) {
      this.startReturn(lane);
      return;
    }
    if (this.ports.grounded()) this.armed = null;
  }

  private end(reason: GlideEndReason, returnToStand = reason === 'contained'): void {
    const lane = this.lane_;
    this.restore(true);
    this.state_ = 'idle';
    this.lane_ = null;
    this.lift_ = 0;
    this.ports.emit('glide.ended', { reason });
    // On the ground (a landing, a launch that never lifted off) there is no fall to catch.
    if (reason === 'landed' || this.ports.grounded()) this.armed = null;
    if (returnToStand && lane) this.startReturn(lane);
  }

  /** Back to walking: the controller, the forced move, the actions and the movement mode. */
  private restore(setWalk: boolean): void {
    const p = this.ports;
    p.setForcedMove(null);
    p.setControllerMode('walk');
    this.lockOff?.();
    this.lockOff = null;
    if (setWalk && p.movementMode() === 'glide') p.setMovementMode('walk');
  }

  private startReturn(lane: GlideLane): void {
    this.armed = null;
    this.returning = { lane, t: 0, placed: false };
    this.freezeOff = this.ports.addModifier(GLIDE_RETURN_SOURCE, { freeze: true, lockActions: GLIDE_LOCKS });
    this.ports.fade(1, RETURN_FADE.out);
  }

  private tickReturn(dt: number): void {
    const r = this.returning!;
    r.t += dt;
    if (!r.placed && r.t >= RETURN_FADE.out) {
      r.placed = true;
      this.place(this.ports.stand(r.lane), r.lane.def.heading);
      this.ports.fade(0, RETURN_FADE.in);
      this.endReturn(true);
    }
  }

  private endReturn(placed: boolean): void {
    if (!this.returning) return;
    if (!placed) this.ports.fade(0, 0);
    this.returning = null;
    this.freezeOff?.();
    this.freezeOff = null;
  }

  private place(p: Vec3Like, yaw: number): void {
    this.expect(p);
    this.ports.teleport({ x: p.x, y: p.y, z: p.z }, wrapAngle(yaw));
  }

  private jumpedExternally(f: Vec3Like): boolean {
    const exp = this.expected;
    if (exp) {
      this.expected = null;
      if (Math.hypot(f.x - exp.x, f.y - exp.y, f.z - exp.z) <= GLIDE_RULES.teleportJump) return false;
    }
    const last = this.lastFeet;
    return last !== null && Math.hypot(f.x - last.x, f.y - last.y, f.z - last.z) > GLIDE_RULES.teleportJump;
  }
}
