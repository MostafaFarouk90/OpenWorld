import { PRESSURE_SECONDS } from './tuning';

/** A countdown in simulated time. `update` returns true on the one tick that reaches zero. */
export class PressureTimer {
  private left = 0;
  private running = false;

  constructor(readonly total: number = PRESSURE_SECONDS) {
    if (!(total > 0) || !Number.isFinite(total)) throw new Error(`PressureTimer: total must be positive, got ${total}`);
  }

  get active(): boolean {
    return this.running;
  }

  remaining(): number {
    return this.running ? this.left : 0;
  }

  /** Restarts from the full duration, also while running. */
  start(): void {
    this.left = this.total;
    this.running = true;
  }

  /** Stops with no expiry (the puzzle was solved or abandoned). */
  reset(): void {
    this.running = false;
    this.left = 0;
  }

  update(dt: number): boolean {
    if (!this.running || !(dt > 0)) return false;
    this.left -= dt;
    if (this.left > 0) return false;
    this.reset();
    return true;
  }
}
