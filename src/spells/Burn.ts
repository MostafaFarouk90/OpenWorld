import { BURN } from '../vfx/tuning';
import { BURN_MAX_HEALTH_PENALTY_ENABLED, BURN_ZONE_PENALTY, SCAR } from './tuning';

export type BurnZone = 'warm' | 'blaze' | 'cinder';
export type BurnSaveData = { burn: number; scars: number };

/**
 * Heartshard Burn (design 9.7): 0..100 heat that decays out of combat and clears on rest, plus permanent Scars.
 *
 * `healthMultiplier()` (zone penalty times Scar penalty) is registered with progression as a max-health modifier.
 * Scars come only from `useShard()`: a shard use at Burn 75 or more (read before the gain) adds one.
 */
export class Burn {
  readonly key = 'burn';
  readonly version = 1;
  onChange: ((value: number, previous: number) => void) | null = null;
  private _value = 0;
  private lastNotified = 0;
  private _scars = 0;

  get value(): number {
    return this._value;
  }
  get scars(): number {
    return this._scars;
  }

  /** Adds (or with a negative n removes) Burn; returns the actual change. NaN is ignored. */
  add(n: number, _source: string): number {
    if (!Number.isFinite(n)) return 0;
    return this.set(this._value + n);
  }

  clear(_reason: string): void {
    this.set(0);
  }

  /** Decays 1 per 5 s, only out of combat. dt <= 0 or NaN is ignored. */
  decay(dt: number, inCombat: boolean): void {
    if (inCombat || !(dt > 0) || !Number.isFinite(dt)) return;
    this.set(this._value - BURN.decayPerSecond * dt, false);
  }

  zone(): BurnZone {
    // Zones are on whole numbers (39 warm, 40 blaze, 74 blaze, 75 cinder); fractions fall to the lower zone.
    const v = Math.floor(this._value);
    if (v >= BURN.cinderAt) return 'cinder';
    if (v >= BURN.blazeAt) return 'blaze';
    return 'warm';
  }

  /** Internal to the spells plugin and tests; game code goes through `useShard`. */
  addScar(n = 1): void {
    if (!Number.isFinite(n) || n <= 0) return;
    this._scars += Math.floor(n);
  }

  /** Removes up to `n` Scars (the Hearth Rite, A5), never below 0; returns how many went. */
  removeScars(n: number): number {
    if (!Number.isFinite(n) || n <= 0) return 0;
    const removed = Math.min(this._scars, Math.floor(n));
    this._scars -= removed;
    return removed;
  }

  /**
   * A shard use (Surge, Leap, rekindle, Release): the Scar is decided on the Burn at the press, before the gain, so
   * a use that starts at 75 or more scars even when the gain is clamped at 100. `scarred` lets a caller decide at the press
   * (the Leap charges at takeoff, a few ticks later). A fractional 74.6 does not scar
   * (`zone()` floors, like every other Burn threshold).
   */
  useShard(gain: number, source: string, scarred: boolean = this.zone() === 'cinder'): { gained: number; scarred: boolean } {
    if (scarred) this.addScar(1);
    const gained = this.add(gain, source);
    return { gained, scarred };
  }

  /** Fraction of max health that remains: scars (2% each, max 30%) times the zone penalty. */
  healthMultiplier(penaltyEnabled: boolean = BURN_MAX_HEALTH_PENALTY_ENABLED): number {
    if (!penaltyEnabled) return 1;
    const scarLoss = Math.min(SCAR.maxPenalty, this._scars * SCAR.healthPerScar);
    return (1 - scarLoss) * (1 - this.zonePenalty());
  }

  /** Fraction (0..0.4) of max health lost to the current zone. */
  private zonePenalty(): number {
    const v = this._value;
    if (v < BURN.blazeAt) return BURN_ZONE_PENALTY.warmMax * (Math.min(v, 39) / 39);
    const z = BURN_ZONE_PENALTY;
    if (v < BURN.cinderAt) {
      const t = (v - BURN.blazeAt) / (BURN.cinderAt - 1 - BURN.blazeAt);
      return z.blaze.from + (z.blaze.to - z.blaze.from) * Math.min(1, t);
    }
    const t = (v - BURN.cinderAt) / (BURN.max - BURN.cinderAt);
    return z.cinder.from + (z.cinder.to - z.cinder.from) * Math.min(1, t);
  }

  serialize(): BurnSaveData {
    return { burn: this._value, scars: this._scars };
  }

  /** Bad data or a newer version leaves the current (default) state untouched. */
  load(data: unknown, version: number): void {
    if (!Number.isInteger(version) || version < 1 || version > this.version) return;
    if (typeof data !== 'object' || data === null) return;
    const d = data as Record<string, unknown>;
    const burn = d.burn;
    const scars = d.scars;
    if (typeof burn !== 'number' || !Number.isFinite(burn)) return;
    if (typeof scars !== 'number' || !Number.isFinite(scars) || scars < 0) return;
    this._scars = Math.floor(scars);
    this.set(burn);
  }

  /** `always` false (decay) notifies only when the rounded, displayed value changes. The internal value stays a float. */
  private set(next: number, always = true): number {
    const clamped = Math.min(BURN.max, Math.max(0, next));
    const previous = this._value;
    if (clamped === previous) return 0;
    this._value = clamped;
    if (always || clamped === 0 || clamped === BURN.max || Math.round(clamped) !== Math.round(this.lastNotified)) {
      const was = this.lastNotified;
      this.lastNotified = clamped;
      this.onChange?.(clamped, was);
    }
    return clamped - previous;
  }
}
