import { EMBER } from '../vfx/tuning';

export type EmberSaveData = { ember: number };

/** The Heartshard's fuel: 0..EMBER.max, regenerates after a delay since the last spend. */
export class Ember {
  readonly key = 'ember';
  readonly version = 1;
  onChange: ((value: number, previous: number) => void) | null = null;
  private _value: number = EMBER.start;
  private sinceSpend = Infinity;

  get value(): number {
    return this._value;
  }
  get max(): number {
    return EMBER.max;
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

  regen(dt: number): void {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    const before = this.sinceSpend;
    this.sinceSpend += dt;
    if (this._value >= EMBER.max) return;
    // Only the part of dt that lies after the delay regenerates.
    const delay = EMBER.regenDelayAfterSpendSeconds;
    const active = before >= delay ? dt : Math.max(0, this.sinceSpend - delay);
    if (active > 0) this.set(this._value + EMBER.regenPerSecond * active);
  }

  serialize(): EmberSaveData {
    return { ember: this._value };
  }

  load(data: unknown, version: number): void {
    if (!Number.isInteger(version) || version < 1 || version > this.version) return;
    if (typeof data !== 'object' || data === null) return;
    const v = (data as Record<string, unknown>).ember;
    if (typeof v !== 'number' || !Number.isFinite(v)) return;
    this.sinceSpend = Infinity;
    this.set(v);
  }

  private set(next: number): void {
    const clamped = Math.min(EMBER.max, Math.max(0, next));
    const previous = this._value;
    if (clamped === previous) return;
    this._value = clamped;
    this.onChange?.(clamped, previous);
  }
}
