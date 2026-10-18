import { CAPS } from './tuning';

/** Shared live-particle allowance for sparks and points. Quality scales the limit. */
export class ParticleBudget {
  private _used = 0;
  private _scale = 1;

  constructor(private readonly cap: number = CAPS.particlesTotal) {}

  get scale(): number {
    return this._scale;
  }
  set scale(v: number) {
    this.setScale(v);
  }
  setScale(v: number): void {
    this._scale = Number.isFinite(v) ? Math.min(1, Math.max(0.1, v)) : 1;
  }

  get used(): number {
    return this._used;
  }
  get limit(): number {
    return Math.floor(this.cap * this._scale);
  }

  /** Returns how many of `n` were granted (0 for non-positive or non-finite requests). */
  request(n: number): number {
    if (!Number.isFinite(n) || n <= 0) return 0;
    const granted = Math.max(0, Math.min(Math.floor(n), this.limit - this._used));
    this._used += granted;
    return granted;
  }

  release(n: number): void {
    if (!Number.isFinite(n) || n <= 0) return;
    this._used = Math.max(0, this._used - Math.floor(n));
  }
}
