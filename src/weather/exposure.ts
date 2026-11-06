// Act 4 L3 (plans/act4-L3.md 2.5): exposure off the rope-lines in a storm. Pure rule plus a small accumulator; the
// plugin feeds it each fixed step and applies the damage through the resolver.
import { EXPOSURE } from './tuning';

export interface ExposureInput {
  /** In a storm, outdoors in the Waste, alive, in gameplay (not a dialogue, menu or cutscene). */
  inStorm: boolean;
  /** On a rope-line or in a shelter. */
  safe: boolean;
}

/** Health damage for one tick: 2% of the maximum, never taking health below the 10% floor (0 at or under it). */
export function exposureDamage(health: number, maxHealth: number): number {
  if (!(maxHealth > 0) || !Number.isFinite(health)) return 0;
  const floor = EXPOSURE.floor * maxHealth;
  return Math.max(0, Math.min(EXPOSURE.perTick * maxHealth, health - floor));
}

export class ExposureClock {
  private carry = 0;
  /** Continuous exposed seconds (reset when safe or out of the storm). */
  private _seconds = 0;

  get seconds(): number {
    return this._seconds;
  }

  /** Advances by `dt`; returns how many ticks fall due (0 when safe; the partial tick is dropped on safety). */
  step(dt: number, input: ExposureInput): number {
    if (!input.inStorm || input.safe || !(dt > 0)) {
      this.carry = 0;
      this._seconds = 0;
      return 0;
    }
    this._seconds += dt;
    this.carry += dt;
    let ticks = 0;
    while (this.carry >= EXPOSURE.interval - 1e-9) {
      this.carry -= EXPOSURE.interval;
      ticks++;
    }
    return ticks;
  }

  reset(): void {
    this.carry = 0;
    this._seconds = 0;
  }
}
