import { CEILING } from './tuning';

/** What the ceiling drop needs from the crawler it belongs to (`Enemy` implements it; tests fake it). */
export interface CeilingEnv {
  /** The player's feet, or null when there is none. */
  playerFeet(): { x: number; y: number; z: number } | null;
  /** The crawler's feet (the floor under its anchor). */
  feet(): { x: number; y: number; z: number };
  /** Metres from the floor up to the ceiling over the anchor (a raycast up, capped); the hang height. */
  ceilingHeight(): number;
  /** The drip-and-glow telegraph, 0..1. */
  telegraph(t: number): void;
  /** The drip started (the dodge telegraph event, `lead` seconds before the drop lands). */
  dripStarted(lead: number): void;
  /** It hit the floor: apply the landing circle and start the fight. */
  landed(): void;
}

export type CeilingState = 'hanging' | 'dripping' | 'falling' | 'landed';

/**
 * The Slag Crawler's ceiling form (design 10 row 8; approved invention: it waits on a ceiling anchor and drops, it does not
 * walk on walls). Hanging, it is still and quiet and wakes only for the player (a companion does not wake it) inside
 * `CEILING.triggerRadius`; or at once when hit or cooled. A 0.8 s drip telegraph, then a fall under gravity, then the
 * landing circle (`env.landed`) and the normal floor fight. `lift` is how far the body hangs above its feet.
 */
export class CeilingDrop {
  private _state: CeilingState = 'hanging';
  private _lift: number;
  private time = 0;
  private speed = 0;

  constructor(private readonly env: CeilingEnv, _feet?: unknown) {
    this._lift = Math.max(CEILING.minHang, Math.min(CEILING.maxHang, env.ceilingHeight()));
  }

  get state(): CeilingState {
    return this._state;
  }

  /** On the floor: ordinary enemy rules apply. */
  get landed(): boolean {
    return this._state === 'landed';
  }

  /** Metres the body is raised above its feet (0 once landed). */
  get lift(): number {
    return this._lift;
  }

  /** The clip to loop while off the floor. */
  get clip(): 'Hang' | 'Drop' {
    return this._state === 'falling' ? 'Drop' : 'Hang';
  }

  /** The player came within the trigger radius (and is not above or far below the crawler). */
  private triggered(): boolean {
    const p = this.env.playerFeet();
    if (!p) return false;
    const f = this.env.feet();
    return Math.hypot(p.x - f.x, p.z - f.z) <= CEILING.triggerRadius && Math.abs(p.y - f.y) <= this._lift + CEILING.verticalSlack;
  }

  /**
   * Starts the drop: after the drip telegraph, or at once (`instant`: it was hit, cooled or calmed, so it does not wait).
   * A no-op once it is dripping, falling or landed.
   */
  wake(instant = false): void {
    if (this._state !== 'hanging') {
      if (instant && this._state === 'dripping') this.startFall();
      return;
    }
    if (instant) return this.startFall();
    this._state = 'dripping';
    this.time = 0;
    this.env.dripStarted(CEILING.dripSeconds);
  }

  /** Drops it to the floor without the landing circle (Calm accepted while hanging: it curls where it lands). */
  settleToFloor(): void {
    this._state = 'landed';
    this._lift = 0;
    this.env.telegraph(0);
  }

  step(dt: number): void {
    switch (this._state) {
      case 'hanging':
        if (this.triggered()) this.wake();
        return;
      case 'dripping':
        this.time += dt;
        this.env.telegraph(Math.min(1, this.time / CEILING.dripSeconds));
        if (this.time >= CEILING.dripSeconds) this.startFall();
        return;
      case 'falling':
        this.speed += CEILING.gravity * dt;
        this._lift -= this.speed * dt;
        if (this._lift <= 0) {
          this._lift = 0;
          this._state = 'landed';
          this.env.telegraph(0);
          this.env.landed();
        }
        return;
      case 'landed':
        return;
    }
  }

  private startFall(): void {
    this._state = 'falling';
    this.speed = 0;
    this.env.telegraph(1);
  }
}
