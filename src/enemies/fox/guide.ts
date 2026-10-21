import { FOX } from './tuning';

export interface Point {
  x: number;
  z: number;
}

export interface GuideStep {
  /** Where to walk (null: stand still), how fast, and what to face. */
  goal: Point | null;
  speed: number;
  face: Point | null;
}

export interface GuideCallbacks {
  /** The fox reached stop `index` (0-based). */
  stop?(index: number): void;
  /** The fox reached the last stop. */
  done?(): void;
}

export type GuideState = 'idle' | 'leading' | 'arrived';

/**
 * The Kindling Fox's whole brain: it idles near home, and once told to lead it walks a list of stops, stopping to wait when
 * the player lags. It never fights, flees or notices anything. Pure: the enemy feeds positions and takes a `GuideStep`.
 */
export class FoxGuide {
  private _state: GuideState = 'idle';
  private stops: Point[] = [];
  private index = 0;
  /** The player has caught up at the current stop, so the fox may head for the next. */
  private released = true;
  private cb: GuideCallbacks = {};
  private idleTime = 0;

  constructor(private readonly home: Point) {}

  get state(): GuideState {
    return this._state;
  }

  /** The stop being walked to, or the number of stops once arrived. */
  get stopIndex(): number {
    return this.index;
  }

  /** Starts leading: `stops` is non-empty and finite, or it does nothing and returns false. */
  lead(stops: readonly Point[], cb: GuideCallbacks = {}): boolean {
    if (!stops.length || stops.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.z))) return false;
    this.stops = stops.map((p) => ({ x: p.x, z: p.z }));
    this.index = 0;
    this.released = true;
    this.cb = cb;
    this._state = 'leading';
    return true;
  }

  /** Back to idling at home (the quest ended). */
  stop(): void {
    this._state = 'idle';
    this.stops = [];
    this.index = 0;
    this.cb = {};
  }

  step(dt: number, self: Point, player: Point | null, walkSpeed: number): GuideStep {
    if (this._state !== 'leading') {
      this.idleTime += dt;
      if (this._state === 'arrived' || !player) return { goal: null, speed: 0, face: player };
      // Idle: sit near home and watch the player.
      const d = Math.hypot(self.x - this.home.x, self.z - this.home.z);
      if (d > FOX.wanderRadius) return { goal: this.home, speed: walkSpeed, face: null };
      return { goal: null, speed: 0, face: player };
    }
    const target = this.stops[this.index]!;
    const toTarget = Math.hypot(target.x - self.x, target.z - self.z);
    const lag = player ? Math.hypot(player.x - self.x, player.z - self.z) : Infinity;
    if (toTarget <= FOX.arriveRadius) {
      // At the stop: report once, then wait for the player.
      if (this.released) {
        this.released = false;
        const i = this.index;
        this.cb.stop?.(i);
        if (i === this.stops.length - 1) {
          this._state = 'arrived';
          this.cb.done?.();
          return { goal: null, speed: 0, face: player };
        }
      }
      if (lag <= FOX.followRadius) {
        this.index++;
        this.released = true;
      }
      return { goal: null, speed: 0, face: player };
    }
    if (lag > FOX.waitDistance) return { goal: null, speed: 0, face: player };
    return { goal: target, speed: Math.min(walkSpeed, FOX.leadSpeed), face: null };
  }
}
