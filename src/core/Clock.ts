import { FIXED_TIMESTEP } from '../config/constants';

/** Longest single hit-stop, in seconds (design 11.0 tops out at 100 ms). */
export const MAX_HIT_STOP = 0.2;

/**
 * Simulated time. Hit-stop and pause skip whole fixed ticks (so weapon sweeps stay deterministic);
 * `tick` and `seconds` count only ticks that were simulated.
 */
export class Clock {
  private _tick = 0;
  private hitStopLeft = 0;
  private readonly pauses = new Set<string>();

  constructor(private readonly step = FIXED_TIMESTEP) {}

  get tick(): number {
    return this._tick;
  }

  get seconds(): number {
    return this._tick * this.step;
  }

  get paused(): boolean {
    return this.pauses.size > 0;
  }

  /** True while hit-stop or any pause reason holds the simulation. */
  get frozen(): boolean {
    return this.paused || this.hitStopLeft > 0;
  }

  get hitStopRemaining(): number {
    return this.hitStopLeft;
  }

  /** Freezes the simulation for `seconds` (capped); overlapping requests keep the longest. */
  hitStop(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    this.hitStopLeft = Math.max(this.hitStopLeft, Math.min(seconds, MAX_HIT_STOP));
  }

  setPaused(reason: string, paused: boolean): void {
    if (paused) this.pauses.add(reason);
    else this.pauses.delete(reason);
  }

  /**
   * Called once per fixed step by the game. Returns true when this step simulates; false when it is
   * skipped by a pause or swallowed by hit-stop (hit-stop counts down in real fixed steps).
   */
  beginTick(): boolean {
    if (this.paused) return false;
    if (this.hitStopLeft > 0) {
      this.hitStopLeft = Math.max(0, this.hitStopLeft - this.step);
      // Treat float residue below a microsecond as done.
      if (this.hitStopLeft < 1e-6) this.hitStopLeft = 0;
      return false;
    }
    this._tick++;
    return true;
  }
}
