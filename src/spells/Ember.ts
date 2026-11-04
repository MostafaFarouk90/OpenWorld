import { EMBER } from '../vfx/tuning';

/** A saved maximum above this is ignored. */
const MAX_SAVED_MAX = 1000;

export type EmberSaveData = { ember: number; max?: number };

/** The Heartshard's fuel: 0..EMBER.max, regenerates after a delay since the last spend. */
export class Ember {
  readonly key = 'ember';
  readonly version = 1;
  onChange: ((value: number, previous: number) => void) | null = null;
  private _value: number = EMBER.start;
  private lastNotified: number = EMBER.start;
  private sinceSpend = Infinity;
  private _max: number = EMBER.max;
  private readonly regenMultipliers = new Map<string, () => number>();

  get value(): number {
    return this._value;
  }
  get max(): number {
    return this._max;
  }

  /** A class row sets the maximum (design 9). The current value is kept, clamped to the new maximum; false for a bad number. */
  setMax(n: number): boolean {
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return false;
    this._max = n;
    this.set(this._value);
    return true;
  }

  /** n <= 0 is a successful no-op, NaN fails, insufficient Ember fails and spends nothing. */
  spend(n: number): boolean {
    if (Number.isNaN(n)) return false;
    if (n <= 0) return true;
    if (!(n <= this._value)) return false;
    this.sinceSpend = 0;
    this.set(this._value - n);
    return true;
  }

  restore(n: number): void {
    if (!(n > 0) || !Number.isFinite(n)) return;
    this.set(this._value + n);
  }

  /**
   * K11 (Banner of the Sunforge): multiplies the regeneration rate while registered (several multiply together; the same id replaces).
   * `fn` is read on every regen step; a throw, NaN or negative value counts as 1. Inert when nothing is registered. Returns the disposer.
   */
  addRegenMultiplier(id: string, fn: () => number): () => void {
    this.regenMultipliers.set(id, fn);
    return () => {
      if (this.regenMultipliers.get(id) === fn) this.regenMultipliers.delete(id);
    };
  }

  private regenScale(): number {
    let k = 1;
    for (const fn of this.regenMultipliers.values()) {
      try {
        const v = fn();
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0) k *= v;
      } catch {
        // a broken multiplier counts as 1
      }
    }
    return k;
  }

  regen(dt: number): void {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    const before = this.sinceSpend;
    this.sinceSpend += dt;
    if (this._value >= this._max) return;
    // Only the part of dt that lies after the delay regenerates.
    const delay = EMBER.regenDelayAfterSpendSeconds;
    const active = before >= delay ? dt : Math.max(0, this.sinceSpend - delay);
    if (active > 0) this.set(this._value + EMBER.regenPerSecond * active * (this.regenMultipliers.size > 0 ? this.regenScale() : 1), false);
  }

  serialize(): EmberSaveData {
    return { ember: this._value, max: this._max };
  }

  load(data: unknown, version: number): void {
    if (!Number.isInteger(version) || version < 1 || version > this.version) return;
    if (typeof data !== 'object' || data === null) return;
    const v = (data as Record<string, unknown>).ember;
    if (typeof v !== 'number' || !Number.isFinite(v)) return;
    // The class row is applied after every persistable has loaded, so the save carries the maximum its value was kept under.
    const max = (data as Record<string, unknown>).max;
    if (typeof max === 'number' && Number.isFinite(max) && max > 0 && max <= MAX_SAVED_MAX) this._max = max;
    this.sinceSpend = Infinity;
    this.set(v);
  }

  /** `always` false (regen) notifies only when the rounded, displayed value changes. The internal value stays a float. */
  private set(next: number, always = true): void {
    const clamped = Math.min(this._max, Math.max(0, next));
    const previous = this._value;
    if (clamped === previous) return;
    this._value = clamped;
    if (always || clamped === 0 || clamped === this._max || Math.round(clamped) !== Math.round(this.lastNotified)) {
      const was = this.lastNotified;
      this.lastNotified = clamped;
      this.onChange?.(clamped, was);
    }
  }
}
