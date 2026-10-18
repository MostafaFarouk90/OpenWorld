// Pure dodge state machine: direction and clip choice, i-frame window, travel and recovery, in whole fixed ticks.
// The caller spends stamina and applies movement and invulnerability; the model only reports what to do each tick.
import { DODGE, STAMINA } from './tuning';

export type DodgeClip = 'Dodge_Forward' | 'Dodge_Backward' | 'Dodge_Left' | 'Dodge_Right';

export interface DodgeContext {
  stamina: { canAfford(n: number): boolean };
  exhausted: boolean;
  grounded: boolean;
  dead: boolean;
  staggered: boolean;
  busyAction: boolean;
}

export interface DodgeStartArgs {
  /** Camera-relative input already converted to a world direction; zero means none. */
  inputX: number;
  inputZ: number;
  facingYaw: number;
  lockedOn: boolean;
  /** Multiplies the travel speed (so the distance), the tick counts stay; default 1. */
  distanceScale?: number;
}

export interface DodgeStart {
  clip: DodgeClip;
  dirX: number;
  dirZ: number;
  yaw: number;
}

export interface DodgeTick {
  index: number;
  iFrames: boolean;
  move: { x: number; z: number; speed: number } | null;
  done: boolean;
}

const FIXED_DT = 1 / 60;
const EPS = 1e-9;
/** Metres per second so that (iFrameEnd + 1) ticks of travel add up to DODGE.distance. */
export const DODGE_SPEED = DODGE.distance / ((DODGE.iFrameEnd + 1) * FIXED_DT);

export class DodgeModel {
  private running = false;
  private cancelled = false;
  /** Index of the last tick reported; -1 before the first. */
  private index = -1;
  private dirX = 0;
  private dirZ = 0;
  private scale = 1;

  /** False when any blocking condition holds or a dodge is already running. */
  canStart(ctx: DodgeContext): boolean {
    if (this.running) return false;
    if (ctx.exhausted || !ctx.grounded || ctx.dead || ctx.staggered || ctx.busyAction) return false;
    return ctx.stamina.canAfford(STAMINA.dodgeCost);
  }

  start(args: DodgeStartArgs): DodgeStart {
    const { facingYaw } = args;
    const len = Math.hypot(args.inputX, args.inputZ);
    const hasInput = len > EPS;
    let dirX: number;
    let dirZ: number;
    if (hasInput) {
      dirX = args.inputX / len;
      dirZ = args.inputZ / len;
    } else {
      // Backward relative to facing; forward is (-sin yaw, -cos yaw).
      dirX = Math.sin(facingYaw);
      dirZ = Math.cos(facingYaw);
    }
    let clip: DodgeClip;
    let yaw = facingYaw;
    if (args.lockedOn) {
      const fd = -Math.sin(facingYaw) * dirX - Math.cos(facingYaw) * dirZ;
      const rd = Math.cos(facingYaw) * dirX - Math.sin(facingYaw) * dirZ;
      if (Math.abs(rd) >= Math.abs(fd) - EPS) clip = rd >= 0 ? 'Dodge_Right' : 'Dodge_Left';
      else clip = fd >= 0 ? 'Dodge_Forward' : 'Dodge_Backward';
    } else if (hasInput) {
      clip = 'Dodge_Forward';
      yaw = Math.atan2(-dirX, -dirZ);
    } else {
      clip = 'Dodge_Backward';
    }
    this.running = true;
    this.cancelled = false;
    this.index = -1;
    this.dirX = dirX;
    this.dirZ = dirZ;
    this.scale = args.distanceScale !== undefined && Number.isFinite(args.distanceScale) && args.distanceScale > 0 ? args.distanceScale : 1;
    return { clip, dirX, dirZ, yaw };
  }

  /** Advance one fixed tick. Idle models report a harmless empty tick. */
  tick(): DodgeTick {
    if (this.cancelled) {
      this.cancelled = false;
      this.running = false;
      return { index: this.index, iFrames: false, move: null, done: true };
    }
    if (!this.running) return { index: -1, iFrames: false, move: null, done: false };
    const index = ++this.index;
    const iFrames = index >= DODGE.iFrameStart && index <= DODGE.iFrameEnd;
    const move = index <= DODGE.iFrameEnd ? { x: this.dirX, z: this.dirZ, speed: DODGE_SPEED * this.scale } : null;
    const done = index >= DODGE.totalTicks - 1;
    if (done) {
      this.running = false;
      this.index = -1;
    }
    return { index, iFrames, move, done };
  }

  /** End immediately (stagger, death). The next tick reports done with no i-frames. */
  cancel(): void {
    if (!this.running) return;
    this.running = false;
    this.cancelled = true;
  }

  get active(): boolean {
    return this.running;
  }

  get recovering(): boolean {
    return this.running && this.index > DODGE.iFrameEnd;
  }

  /** An attack press is accepted only while recovering. */
  get canCancelIntoAttack(): boolean {
    return this.recovering;
  }
}
