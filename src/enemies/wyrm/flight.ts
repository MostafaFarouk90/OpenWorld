import { EMBER_WYRM } from './tuning';

/**
 * The Ember Wyrm's flight (plans/act2-A6a.md 1.3), pure: no scene, physics or events. The overlay feeds it the
 * brain's view each tick and carries out what it asks (take off, land at a point, fall). Modes:
 *
 * perched -> takeoff (0.8 s) -> circle (9 to 12 m out, 2.5 to 4 s) -> two strafes or one dive -> landing (1.0 s)
 * -> ground (8 to 10 s of the brain's own chase) -> takeoff again. A poise break or a stun in the air (takeoff and
 * landing count) is a 0.5 s fall; after a broken wing it stays on the ground for good (`downed`).
 */
export type FlightMode = 'perched' | 'takeoff' | 'circle' | 'strafe' | 'dive' | 'landing' | 'ground' | 'falling';

export interface XZ {
  x: number;
  z: number;
}

export interface FlightInput {
  self: XZ;
  /** The brain's target position, or null without one. */
  target: XZ | null;
  /** The brain holds a target. */
  engaged: boolean;
  /** The brain is in its telegraph or attack state (a dive in progress). */
  swinging: boolean;
  /** The brain is in its attack state (the dive's window: the stoop). */
  striking: boolean;
  /** The brain is free to act (not staggered, yielding or recovering): only then does it lift off. */
  free: boolean;
}

/** What the overlay should do with the brain's intent this tick (null: leave it). */
export interface FlightSteer {
  goal: XZ | null;
  speed: number;
  face: XZ | null;
}

export interface FlightOptions {
  /** False indoors: the wyrm never leaves the ground. */
  canFly: boolean;
  /** An `aggro` spawn (a wave closer) skips the perch. */
  startEngaged?: boolean;
  rng: () => number;
}

/** Requests for the overlay, read and cleared each tick. */
export interface FlightRequests {
  /** Take off now (mover onto the heightfield, collider off). */
  takeoff: boolean;
  /** Touch down at this point (null: where it is). Set once per landing. */
  touchdown: { at: XZ | null; reason: 'landing' | 'dive' | 'fall' } | null;
  /** Pick a landing spot near this point: the overlay answers with `landAt(spot)` or `landingBlocked()`. */
  findLanding: XZ | null;
}

const AIRBORNE: ReadonlySet<FlightMode> = new Set<FlightMode>(['takeoff', 'circle', 'strafe', 'dive', 'landing']);

export class WyrmFlight {
  private _mode: FlightMode = 'perched';
  private t = 0;
  private alt = 0;
  private downedForGood = false;
  private fallFrom = 0;
  private fallCause: 'wing' | 'stun' = 'wing';
  private radius = 10;
  private circleSeconds = 3;
  private groundSeconds = 9;
  private angle = 0;
  private dir = 1;
  private strafes = 0;
  private strafeEnd: XZ = { x: 0, z: 0 };
  private landing: XZ | null = null;
  private landingAlt = 0;
  private retry = 0;
  private waitingSpot = false;
  /** The dive is allowed now (the overlay offers `wyrm.dive` only then). */
  private diveReady = false;
  private readonly req: FlightRequests = { takeoff: false, touchdown: null, findLanding: null };

  constructor(private readonly opts: FlightOptions) {
    if (!opts.canFly) this._mode = 'ground';
    else if (opts.startEngaged) this.beginTakeoff();
  }

  get mode(): FlightMode {
    return this._mode;
  }

  /** Height of the body above its feet, metres. */
  get altitude(): number {
    return this.alt;
  }

  /** In the air, falling included (no Calm, no pulls). */
  get airborne(): boolean {
    return AIRBORNE.has(this._mode) || this._mode === 'falling';
  }

  /** In the air and not already falling: a poise break or stun here makes it fall. */
  get flying(): boolean {
    return AIRBORNE.has(this._mode);
  }

  /** Brought down by a broken wing: never flies again this life. */
  get downed(): boolean {
    return this.downedForGood;
  }

  get falling(): boolean {
    return this._mode === 'falling';
  }

  get canDive(): boolean {
    return this.diveReady && this._mode === 'circle';
  }

  /** The requests made this tick; the overlay clears them after acting. */
  get requests(): FlightRequests {
    return this.req;
  }

  clearRequests(): void {
    this.req.takeoff = false;
    this.req.touchdown = null;
    this.req.findLanding = null;
  }

  /** Air moves only in the circle, ground moves only on the ground. */
  allows(flight: 'air' | 'ground' | undefined): boolean {
    if (flight === 'air') return this.canDive;
    if (flight === 'ground') return this._mode === 'ground' || this._mode === 'perched';
    return !this.airborne;
  }

  /** A poise break (`cause` wing) or a stun in the air: a 0.5 s fall. False when not flying (the brain handles it). */
  fall(cause: 'wing' | 'stun'): boolean {
    if (!this.flying) return false;
    this.fallCause = cause;
    this.fallFrom = this.alt;
    this.diveReady = false;
    this.landing = null;
    this.waitingSpot = false;
    this.enter('falling');
    return true;
  }

  /** The dive telegraphed: committed. */
  diveStarted(): void {
    if (this._mode !== 'circle') return;
    this.diveReady = false;
    this.enter('dive');
  }

  /** The overlay found an open landing spot. */
  landAt(spot: XZ): void {
    if (!this.waitingSpot) return;
    this.waitingSpot = false;
    this.landing = { x: spot.x, z: spot.z };
    this.landingAlt = this.alt;
    this.enter('landing');
  }

  /** No open spot: keep circling and try again 1 s later. */
  landingBlocked(): void {
    if (!this.waitingSpot) return;
    this.waitingSpot = false;
    this.retry = EMBER_WYRM.landingRetrySeconds;
    if (this._mode !== 'circle') this.enterCircle(null);
  }

  /** Dormant or teleported: drop to the ground at once (perched again unless downed). */
  forceGround(): void {
    const wasAir = this.airborne;
    this.alt = 0;
    this.diveReady = false;
    this.waitingSpot = false;
    this.landing = null;
    if (!this.opts.canFly) this._mode = 'ground';
    else this.enter(this.downedForGood ? 'ground' : 'perched');
    if (wasAir) this.req.touchdown = { at: null, reason: 'landing' };
  }

  step(dt: number, input: FlightInput): FlightSteer | null {
    if (!(dt > 0) || !Number.isFinite(dt)) return null;
    this.t += dt;
    if (this.retry > 0) this.retry = Math.max(0, this.retry - dt);
    switch (this._mode) {
      case 'perched':
        if (input.engaged && input.free && this.opts.canFly && !this.downedForGood) this.beginTakeoff();
        return null;
      case 'ground':
        if (!this.opts.canFly || this.downedForGood || input.swinging || !input.free) return null;
        if (input.engaged && this.t >= this.groundSeconds) this.beginTakeoff();
        else if (!input.engaged && this.t >= this.groundSeconds) this.t = this.groundSeconds; // waits, engaged again it lifts
        return null;
      case 'takeoff':
        this.approach(EMBER_WYRM.cruiseAltitude, dt, EMBER_WYRM.cruiseAltitude / EMBER_WYRM.takeoffSeconds);
        if (this.t >= EMBER_WYRM.takeoffSeconds) this.enterCircle(input);
        return { goal: null, speed: 0, face: input.target };
      case 'circle':
        return this.circle(dt, input);
      case 'strafe':
        return this.strafe(dt, input);
      case 'dive':
        if (input.swinging) {
          // Hovering through the telegraph; once the window opens the brain's leap carries it down.
          if (input.striking) this.alt = Math.max(0, this.alt - (dt * EMBER_WYRM.cruiseAltitude) / EMBER_WYRM.diveStoopSeconds);
          return null;
        }
        // The swing ended (or was cancelled before its window): on the ground where it is.
        this.alt = 0;
        this.req.touchdown = { at: null, reason: 'dive' };
        this.enterGround();
        return null;
      case 'landing': {
        const k = Math.min(1, this.t / EMBER_WYRM.landingSeconds);
        this.alt = this.landingAlt * (1 - k);
        const spot = this.landing!;
        if (k >= 1) {
          this.req.touchdown = { at: spot, reason: 'landing' };
          this.enterGround();
          return { goal: null, speed: 0, face: input.target };
        }
        const remaining = Math.max(dt, EMBER_WYRM.landingSeconds - this.t);
        const d = Math.hypot(spot.x - input.self.x, spot.z - input.self.z);
        return { goal: spot, speed: d / remaining, face: input.target };
      }
      case 'falling': {
        const k = Math.min(1, this.t / EMBER_WYRM.fallSeconds);
        this.alt = this.fallFrom * (1 - k * k);
        if (k >= 1) {
          this.alt = 0;
          if (this.fallCause === 'wing') this.downedForGood = true;
          this.req.touchdown = { at: null, reason: 'fall' };
          this.enterGround();
        }
        return { goal: null, speed: 0, face: null };
      }
    }
  }

  // ---- internals --------------------------------------------------------------------------------

  private circle(dt: number, input: FlightInput): FlightSteer | null {
    this.approach(EMBER_WYRM.cruiseAltitude, dt);
    if (!input.engaged || !input.target) return this.requestLanding(input.self);
    if (this.diveReady && this.t >= this.circleSeconds + 3) {
      // The brain never took the dive (no token, out of range): land instead.
      this.diveReady = false;
      return this.requestLanding(input.target);
    }
    if (!this.diveReady && this.t >= this.circleSeconds && !this.waitingSpot) {
      if (this.strafes >= EMBER_WYRM.strafesPerFlight) return this.requestLanding(input.target);
      if (this.strafes === 0 && this.opts.rng() < 0.4) this.diveReady = true;
      else return this.beginStrafe(input);
    }
    const c = input.target;
    const omega = (EMBER_WYRM.flySpeed / this.radius) * this.dir;
    this.angle += omega * dt;
    // A point a little ahead on the circle, so the steering curves round it.
    const lead = this.angle + 0.35 * this.dir;
    const goal = { x: c.x + Math.cos(lead) * this.radius, z: c.z + Math.sin(lead) * this.radius };
    if (this.diveReady) return { goal, speed: EMBER_WYRM.flySpeed * 0.4, face: c };
    return { goal, speed: EMBER_WYRM.flySpeed, face: null };
  }

  private beginStrafe(input: FlightInput): FlightSteer {
    const c = input.target!;
    const dx = c.x - input.self.x;
    const dz = c.z - input.self.z;
    const len = Math.hypot(dx, dz) || 1;
    // A straight pass over the player and out the far side.
    this.strafeEnd = { x: c.x + (dx / len) * EMBER_WYRM.strafeOvershoot, z: c.z + (dz / len) * EMBER_WYRM.strafeOvershoot };
    this.enter('strafe');
    return { goal: this.strafeEnd, speed: EMBER_WYRM.flySpeed, face: null };
  }

  private strafe(dt: number, input: FlightInput): FlightSteer | null {
    this.approach(EMBER_WYRM.strafeAltitude, dt);
    const d = Math.hypot(this.strafeEnd.x - input.self.x, this.strafeEnd.z - input.self.z);
    if (d < 1.5 || this.t > 4) {
      this.strafes++;
      this.enterCircle(input);
      return this.circle(0, input);
    }
    return { goal: this.strafeEnd, speed: EMBER_WYRM.flySpeed, face: null };
  }

  private requestLanding(near: XZ): FlightSteer | null {
    if (this.retry > 0 || this.waitingSpot) return null;
    this.waitingSpot = true;
    this.req.findLanding = { x: near.x, z: near.z };
    return null;
  }

  private beginTakeoff(): void {
    this.req.takeoff = true;
    this.strafes = 0;
    this.diveReady = false;
    this.enter('takeoff');
  }

  private enterCircle(input: FlightInput | null): void {
    const [r0, r1] = EMBER_WYRM.circleRadius;
    const [s0, s1] = EMBER_WYRM.circleSeconds;
    this.radius = r0 + (r1 - r0) * this.opts.rng();
    this.circleSeconds = s0 + (s1 - s0) * this.opts.rng();
    this.dir = this.opts.rng() < 0.5 ? -1 : 1;
    if (input?.target) this.angle = Math.atan2(input.self.z - input.target.z, input.self.x - input.target.x);
    this.enter('circle');
  }

  private enterGround(): void {
    const [g0, g1] = EMBER_WYRM.groundSeconds;
    this.groundSeconds = g0 + (g1 - g0) * this.opts.rng();
    this.landing = null;
    this.diveReady = false;
    this.enter('ground');
  }

  private approach(target: number, dt: number, maxRate = Infinity): void {
    const k = Math.min(1, EMBER_WYRM.altitudeRate * dt);
    const step = (target - this.alt) * k;
    if (!Number.isFinite(maxRate)) {
      this.alt += step;
      return;
    }
    const cap = maxRate * dt;
    this.alt += Math.max(-cap, Math.min(cap, step));
  }

  private enter(mode: FlightMode): void {
    this._mode = mode;
    this.t = 0;
  }
}
