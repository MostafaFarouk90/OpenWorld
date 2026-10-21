// The Ashmare's riding model: heading, speed and the horse's own stamina, one fixed tick at a time. Pure: no
// three.js, no rapier; the plugin feeds it the input, the free distance from the casts and the terrain residency.
import { MOUNT_TUNING } from './tuning';

export interface RideInput {
  /** World-space move direction (camera-relative input already rotated); (0, 0) for no input. */
  dirX: number;
  dirZ: number;
  /** Shift held: gallop. */
  gallop: boolean;
}

export interface RideEnv {
  /** Metres free in front of the nose (Infinity when nothing is in reach). */
  freeAhead: number;
  /** Metres free behind the rump. */
  freeBehind: number;
  /** False while the collider patch ahead is not built yet. */
  residentAhead: boolean;
  /** A region cap in m/s (the Ashen Waste's drifts later); Infinity for none. */
  speedCap: number;
}

export const OPEN_ENV: Readonly<RideEnv> = { freeAhead: Infinity, freeBehind: Infinity, residentAhead: true, speedCap: Infinity };

type Tuning = typeof MOUNT_TUNING;

const finite = (x: number, d = 0): number => (Number.isFinite(x) ? x : d);
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
/** Facing yaw (0 = -Z, as Player) of a world direction. */
export const yawOf = (x: number, z: number): number => Math.atan2(-x, -z);

/** Fastest speed from which the horse still stops within `free` metres at the braking rate. */
export function stoppingSpeed(free: number, braking: number): number {
  if (!(free > 0)) return 0;
  return free === Infinity ? Infinity : Math.sqrt(2 * braking * free);
}

export class RideModel {
  /** Heading yaw, radians (0 = -Z). */
  heading = 0;
  /** Signed speed along the heading, m/s (negative backs up). */
  speed = 0;
  stamina: number;
  exhausted = false;
  /** True on a tick that drained stamina. */
  galloping = false;
  private sinceGallop = Infinity;
  private bonuses: (() => number)[] = [];
  private lastMax: number;

  constructor(private readonly t: Tuning = MOUNT_TUNING) {
    this.stamina = t.staminaMax;
    this.lastMax = t.staminaMax;
  }

  /** The stamina cap: the tuned maximum plus every added bonus (the Ashmare saddle). */
  get max(): number {
    let extra = 0;
    for (const f of this.bonuses) {
      const n = f();
      if (Number.isFinite(n) && n > 0) extra += n;
    }
    return this.t.staminaMax + extra;
  }

  /** Adds a source of extra maximum stamina; returns the undo. */
  addStaminaBonus(fn: () => number): () => void {
    this.bonuses.push(fn);
    this.lastMax = this.max;
    return () => {
      this.bonuses = this.bonuses.filter((f) => f !== fn);
      this.syncMax();
    };
  }

  /** Keeps the bar's fill proportional when the cap changes (a bonus gained or lost). */
  syncMax(): number {
    const max = this.max;
    if (max !== this.lastMax) {
      this.stamina = Math.min(max, this.stamina * (max / this.lastMax));
      this.lastMax = max;
    }
    return max;
  }

  /** Unit direction of the heading. */
  get dirX(): number {
    return -Math.sin(this.heading);
  }
  get dirZ(): number {
    return -Math.cos(this.heading);
  }

  /** Starts a ride standing still, facing `yaw`. Stamina is kept. */
  start(yaw: number): void {
    this.heading = finite(yaw);
    this.speed = 0;
    this.galloping = false;
  }

  /** Refills the bar (a rest). */
  refill(): void {
    this.stamina = this.syncMax();
    this.exhausted = false;
  }

  setStamina(v: number): void {
    const max = this.syncMax();
    this.stamina = Math.min(max, Math.max(0, finite(v, max)));
    this.exhausted = this.stamina <= 0;
  }

  /** One tick; returns the signed speed. Non-finite or non-positive `dt` changes nothing. */
  step(input: RideInput, env: Readonly<RideEnv>, dt: number): number {
    const t = this.t;
    if (!(dt > 0) || !Number.isFinite(dt)) return this.speed;
    this.syncMax();
    dt = Math.min(dt, 0.25);
    const ix = finite(input.dirX);
    const iz = finite(input.dirZ);
    const has = Math.hypot(ix, iz) > 1e-6;

    const canGallop = input.gallop && !this.exhausted && this.stamina > 0;
    let target = 0;
    if (has) {
      const diff = wrap(yawOf(ix, iz) - this.heading);
      if (Math.abs(diff) > t.reverseAngle && this.speed < t.reverseBelow) {
        target = -t.reverseSpeed;
      } else {
        const fast = Math.min(1, Math.max(0, this.speed / t.gallopSpeed));
        const rate = t.turnRateSlow + (t.turnRateFast - t.turnRateSlow) * fast;
        const turn = Math.max(-rate * dt, Math.min(rate * dt, diff));
        this.heading = wrap(this.heading + turn);
        target = canGallop ? t.gallopSpeed : t.canterSpeed;
        if (Math.abs(diff) > t.brakeTurnAngle && this.speed > t.brakeTurnAbove) target = Math.min(target, t.brakeTurnAbove);
      }
    }
    // Caps: unbuilt terrain ahead, a region cap, and whatever the casts leave room to stop in.
    if (!env.residentAhead) target = Math.min(target, t.unresidentCap);
    const cap = finite(env.speedCap, Infinity);
    if (cap >= 0 && cap < Infinity) target = Math.max(-cap, Math.min(target, cap));
    const fwdLimit = stoppingSpeed(env.freeAhead, t.braking);
    const backLimit = stoppingSpeed(env.freeBehind, t.braking);
    target = Math.max(-backLimit, Math.min(target, fwdLimit));

    // Toward the target: accelerate while gaining speed in the same direction, brake otherwise.
    const gaining = Math.sign(target) === Math.sign(this.speed) || this.speed === 0 ? Math.abs(target) > Math.abs(this.speed) : false;
    const rate = gaining ? t.acceleration : t.braking;
    const delta = target - this.speed;
    this.speed += Math.max(-rate * dt, Math.min(rate * dt, delta));
    // An obstacle closer than the braking distance stops the horse at once (it never runs into the wall).
    this.speed = Math.max(-backLimit, Math.min(this.speed, fwdLimit));
    if (Math.abs(this.speed) < 1e-4 && target === 0) this.speed = 0;

    this.galloping = canGallop && has && this.speed > t.canterSpeed;
    if (this.galloping) {
      this.sinceGallop = 0;
      this.stamina = Math.max(0, this.stamina - t.gallopDrain * dt);
      if (this.stamina <= 0) this.exhausted = true;
    } else {
      this.sinceGallop += dt;
      if (this.sinceGallop >= t.regenDelay) this.stamina = Math.min(this.max, this.stamina + t.staminaRegen * dt);
    }
    if (this.exhausted && this.stamina >= t.exhaustedUntil) this.exhausted = false;
    return this.speed;
  }

  /** Stamina regenerates while unmounted too (the horse rests), with the same delay. */
  rest(dt: number): void {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    this.syncMax();
    this.speed = 0;
    this.galloping = false;
    this.sinceGallop += dt;
    if (this.sinceGallop >= this.t.regenDelay) this.stamina = Math.min(this.max, this.stamina + this.t.staminaRegen * dt);
    if (this.exhausted && this.stamina >= this.t.exhaustedUntil) this.exhausted = false;
  }
}
