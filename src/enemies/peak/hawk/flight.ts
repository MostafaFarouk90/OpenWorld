import { HAWK } from '../tuning';

/**
 * The Rime Hawk's flight (plans/act3-K6b-pr2.md section 2), pure: no scene, physics or events. The overlay feeds it the
 * brain's view each tick and carries out what it asks (take off, touch down). Modes:
 *
 * perched -> takeoff (0.8 s) -> soar (circles 14 m up, out of reach) -> stoop (the 0.8 s hover telegraph easing down to 7 m,
 * then the dive along the brain's leap) -> low (1.2 s skimming at 0.8 m, the rake's moment) -> climb (1.4 s) -> soar.
 * Knocked down (a projectile in the hover or the dive, or a poise break in the air) it falls for 0.5 s and lies grounded until
 * the brain's stagger ends, then takes off again. A nest hawk with nothing to fight flies home and perches.
 */
export type HawkMode = 'perched' | 'takeoff' | 'soar' | 'stoop' | 'low' | 'climb' | 'falling' | 'grounded';

export interface XZ {
  x: number;
  z: number;
}

export interface HawkInput {
  self: XZ;
  /** The brain's target position, or null without one. */
  target: XZ | null;
  engaged: boolean;
  /** The brain is in its telegraph or attack state. */
  swinging: boolean;
  /** The brain is in its attack state (the window: the dive). */
  striking: boolean;
  /** The brain is free to act (not staggered, recovering or leaving). */
  free: boolean;
  /** The brain is walking home after losing its target (the overlay lets it fly straight back). */
  returning: boolean;
}

export interface HawkSteer {
  goal: XZ | null;
  speed: number;
  face: XZ | null;
}

export interface HawkFlightOptions {
  /** Where it circles with nothing to fight. */
  home: XZ;
  /** Its nest: starts perched there and returns there to perch. */
  nest?: XZ | null;
  /** Start in the air (an ambient or parent hawk with no nest perch), else perched. */
  startAirborne: boolean;
  /** Circle radius round home (the parents circle the nest tighter). */
  homeRadius?: number;
  rng: () => number;
}

export interface HawkRequests {
  /** Take off now (mover onto the heightfield path, collider off). */
  takeoff: boolean;
  /** Touch down where it is (`fall`: knocked down) or at the nest (`perch`). */
  touchdown: { reason: 'fall' | 'perch' | 'land'; at: XZ | null } | null;
}

const AIRBORNE: ReadonlySet<HawkMode> = new Set<HawkMode>(['takeoff', 'soar', 'stoop', 'low', 'climb', 'falling']);

export class HawkFlight {
  private _mode: HawkMode;
  private t = 0;
  private alt = 0;
  private fallFrom = 0;
  private angle = 0;
  private readonly dir: number;
  private nextStoop: number;
  private strikeFrom = 0;
  private strikeTime = 0;
  private stoopHit = false;
  private readonly req: HawkRequests = { takeoff: false, touchdown: null };

  constructor(private readonly opts: HawkFlightOptions) {
    this.dir = opts.rng() < 0.5 ? -1 : 1;
    this.nextStoop = this.rollStoop();
    this.angle = opts.rng() * Math.PI * 2;
    if (opts.startAirborne || !opts.nest) {
      this._mode = 'soar';
      this.alt = HAWK.soarAltitude;
      this.req.takeoff = true;
    } else this._mode = 'perched';
  }

  get mode(): HawkMode {
    return this._mode;
  }

  /** Height of the body above its feet, metres. */
  get altitude(): number {
    return this.alt;
  }

  get airborne(): boolean {
    return AIRBORNE.has(this._mode);
  }

  /** On the ground: knocked down, or perched on its nest (the Calm precondition). */
  get grounded(): boolean {
    return this._mode === 'grounded' || this._mode === 'perched';
  }

  /** The stoop may start now (the overlay offers `hawk.stoop` only then). */
  get canStoop(): boolean {
    return this._mode === 'soar' && this.t >= this.nextStoop;
  }

  /** The rake may start now: skimming low after a stoop that hit nothing. */
  get canRake(): boolean {
    return this._mode === 'low' && !this.stoopHit;
  }

  /** In the hover or the dive: a projectile here knocks it down. */
  get stooping(): boolean {
    return this._mode === 'stoop';
  }

  get requests(): HawkRequests {
    return this.req;
  }

  clearRequests(): void {
    this.req.takeoff = false;
    this.req.touchdown = null;
  }

  /** The stoop telegraphed (the hover begins). */
  stoopStarted(): void {
    if (this._mode !== 'soar') return;
    this.stoopHit = false;
    this.enter('stoop');
  }

  /** The stoop's talons landed: no rake follows it. */
  stoopLanded(): void {
    this.stoopHit = true;
  }

  /** The hover was called off (the target went into water or out of sight): climb back up, no dive. */
  abortStoop(): void {
    if (this._mode !== 'stoop') return;
    this.enter('climb');
  }

  /** Knocked down in the air: a 0.5 s fall, then grounded. False when not airborne (the brain handles it). */
  knockDown(): boolean {
    if (!this.airborne || this._mode === 'falling') return false;
    this.fallFrom = this.alt;
    this.enter('falling');
    return true;
  }

  /** Dormant, dead, teleported or a calm revoked mid-leave: on the ground at once (a quiet `land`, never a stagger). */
  forceGround(): void {
    const wasAir = this.airborne;
    this.alt = 0;
    this.enter('grounded');
    if (wasAir) this.req.touchdown = { reason: 'land', at: null };
  }

  step(dt: number, input: HawkInput): HawkSteer | null {
    if (!(dt > 0) || !Number.isFinite(dt)) return null;
    this.t += dt;
    switch (this._mode) {
      case 'perched':
        this.alt = 0;
        if (input.engaged && input.free) this.beginTakeoff();
        return null;
      case 'grounded':
        this.alt = 0;
        if (input.free && this.t >= 0.3) this.beginTakeoff();
        return null;
      case 'takeoff':
        this.approach(HAWK.soarAltitude, dt, HAWK.soarAltitude / HAWK.takeoffSeconds);
        if (this.t >= HAWK.takeoffSeconds) this.enter('soar');
        return { goal: null, speed: 0, face: input.target };
      case 'soar':
        return this.soar(dt, input);
      case 'stoop':
        if (input.swinging) {
          if (!input.striking) {
            // The hover: easing down to hover height, wings spread (the brain holds it in place, facing its target).
            this.approach(HAWK.hoverAltitude, dt, Infinity, HAWK.hoverRate);
            this.strikeFrom = this.alt;
            this.strikeTime = 0;
          } else {
            // The dive: straight down to skimming height over about the window (the brain's leap carries it across).
            this.strikeTime += dt;
            const k = Math.min(1, this.strikeTime / HAWK.diveSeconds);
            this.alt = this.strikeFrom + (HAWK.lowAltitude - this.strikeFrom) * k;
          }
          return null;
        }
        // The swing ended (or was cancelled in the hover): skim if it dived, climb if it never did.
        if (this.alt <= HAWK.lowAltitude + 0.5) this.enter('low');
        else this.enter('climb');
        return null;
      case 'low':
        this.approach(HAWK.lowAltitude, dt);
        if (input.swinging) return null;
        if (this.t >= HAWK.lowSeconds) this.enter('climb');
        return { goal: null, speed: 0, face: input.target };
      case 'climb': {
        this.approach(HAWK.soarAltitude, dt, HAWK.soarAltitude / HAWK.climbSeconds);
        if (this.t >= HAWK.climbSeconds) {
          this.nextStoop = this.rollStoop();
          this.enter('soar');
        }
        // Up and away from its target, out of reach.
        if (!input.target) return { goal: null, speed: 0, face: null };
        const dx = input.self.x - input.target.x;
        const dz = input.self.z - input.target.z;
        const len = Math.hypot(dx, dz) || 1;
        return { goal: { x: input.self.x + (dx / len) * 6, z: input.self.z + (dz / len) * 6 }, speed: HAWK.flySpeed * 0.7, face: null };
      }
      case 'falling': {
        const k = Math.min(1, this.t / HAWK.fallSeconds);
        this.alt = this.fallFrom * (1 - k * k);
        if (k >= 1) {
          this.alt = 0;
          this.req.touchdown = { reason: 'fall', at: null };
          this.enter('grounded');
        }
        return { goal: null, speed: 0, face: null };
      }
    }
  }

  // ---- internals --------------------------------------------------------------------------------

  private soar(dt: number, input: HawkInput): HawkSteer | null {
    this.approach(HAWK.soarAltitude, dt);
    if (input.returning) return null; // the brain flies it home in a straight line
    const engaged = input.engaged && input.target !== null;
    const nest = this.opts.nest ?? null;
    if (!engaged && nest) {
      // Home to the nest and perch.
      const d = Math.hypot(nest.x - input.self.x, nest.z - input.self.z);
      if (d <= HAWK.perchRadius) {
        this.alt = 0;
        this.req.touchdown = { reason: 'perch', at: { x: nest.x, z: nest.z } };
        this.enter('perched');
        return { goal: null, speed: 0, face: null };
      }
      return { goal: nest, speed: Math.min(HAWK.flySpeed, d / Math.max(dt, 0.25)), face: null };
    }
    const c = engaged ? input.target! : this.opts.home;
    const radius = engaged ? HAWK.soarRadius : (this.opts.homeRadius ?? HAWK.soarRadius);
    this.angle += (HAWK.flySpeed / radius) * this.dir * dt;
    const lead = this.angle + 0.35 * this.dir;
    const goal = { x: c.x + Math.cos(lead) * radius, z: c.z + Math.sin(lead) * radius };
    // Ready to stoop: slow and face the target, so the brain's facing check passes.
    if (engaged && this.canStoop) return { goal, speed: HAWK.flySpeed * 0.4, face: c };
    return { goal, speed: HAWK.flySpeed, face: null };
  }

  private beginTakeoff(): void {
    this.req.takeoff = true;
    this.nextStoop = Math.min(this.nextStoop, 1.5);
    this.enter('takeoff');
  }

  private rollStoop(): number {
    const [a, b] = HAWK.stoopEvery;
    return a + (b - a) * this.opts.rng();
  }

  private approach(target: number, dt: number, maxRate = Infinity, rate: number = HAWK.altitudeRate): void {
    const k = Math.min(1, rate * dt);
    const step = (target - this.alt) * k;
    if (!Number.isFinite(maxRate)) {
      this.alt += step;
      return;
    }
    const cap = maxRate * dt;
    this.alt += Math.max(-cap, Math.min(cap, step));
  }

  private enter(mode: HawkMode): void {
    this._mode = mode;
    this.t = 0;
  }
}
