// Act 4 L3 (plans/act4-L3.md 2.1): the Waste's seeded storm clock. `phaseAt` is a pure function of (seed, t), so
// headless chains and tests see the same storms every run. `WeatherClock` holds t; it advances only on Waste time
// (the plugin decides when), and a dialogue holds it at the end of a clear phase or a warning, so a storm never
// begins during a talk.
import { makeRng } from '../world/poi/rng';
import { STORM_CLOCK } from './tuning';

export type ClockKind = 'clear' | 'warning' | 'storm';

export interface ClockPhase {
  kind: ClockKind;
  /** Seconds into this phase. */
  t: number;
  /** Zero-based cycle (one clear, one warning, one storm). */
  cycle: number;
  /** Clock time this phase started and ends. */
  startsAt: number;
  endsAt: number;
}

export interface CycleLengths {
  clear: number;
  warning: number;
  storm: number;
}

export function cycleLengths(seed: number, cycle: number): CycleLengths {
  const rng = makeRng(`weather:${seed >>> 0}:${cycle}`);
  const c = STORM_CLOCK;
  return {
    clear: c.clear + rng.range(-c.clearJitter, c.clearJitter),
    warning: c.warning,
    storm: c.storm + rng.range(-c.stormJitter, c.stormJitter),
  };
}

/** Cycle start times per seed, grown on demand (a long play is a few hundred cycles at most). */
const starts = new Map<number, number[]>();

function cycleStarts(seed: number, upTo: number): number[] {
  let s = starts.get(seed);
  if (!s) {
    s = [0];
    starts.set(seed, s);
  }
  while (s[s.length - 1] <= upTo) {
    const n = s.length - 1;
    const l = cycleLengths(seed, n);
    s.push(s[n] + l.clear + l.warning + l.storm);
  }
  return s;
}

export function phaseAt(seed: number, t: number): ClockPhase {
  const time = Number.isFinite(t) && t > 0 ? t : 0;
  const s = cycleStarts(seed, time);
  // Binary search for the last start <= time.
  let lo = 0;
  let hi = s.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (s[mid] <= time) lo = mid;
    else hi = mid - 1;
  }
  const cycle = lo;
  const l = cycleLengths(seed, cycle);
  const c0 = s[cycle];
  const w0 = c0 + l.clear;
  const st0 = w0 + l.warning;
  if (time < w0) return { kind: 'clear', t: time - c0, cycle, startsAt: c0, endsAt: w0 };
  if (time < st0) return { kind: 'warning', t: time - w0, cycle, startsAt: w0, endsAt: st0 };
  return { kind: 'storm', t: time - st0, cycle, startsAt: st0, endsAt: s[cycle + 1] };
}

/** The next change after `t`: what it becomes and the clock time it happens. */
export function nextChange(seed: number, t: number): { kind: ClockKind; at: number } {
  const p = phaseAt(seed, t);
  const kind: ClockKind = p.kind === 'clear' ? 'warning' : p.kind === 'warning' ? 'storm' : 'clear';
  return { kind, at: p.endsAt };
}

/** How close to a phase's end a held clock stops, so it stays inside the phase. */
const HOLD_EPSILON = 1e-3;

export class WeatherClock {
  private _t = 0;

  constructor(public seed: number) {}

  get t(): number {
    return this._t;
  }

  phase(): ClockPhase {
    return phaseAt(this.seed, this._t);
  }

  next(): { kind: ClockKind; at: number } {
    return nextChange(this.seed, this._t);
  }

  /**
   * Moves the clock on by `dt` seconds. With `holdNextStorm` (a dialogue runs) it stops just short of the end of a
   * clear phase or a warning; a storm already running carries on.
   */
  advance(dt: number, holdNextStorm = false): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    let target = this._t + dt;
    if (holdNextStorm) {
      const p = this.phase();
      if (p.kind !== 'storm') target = Math.min(target, Math.max(this._t, p.endsAt - HOLD_EPSILON));
    }
    this._t = target;
  }

  /** Restores a saved clock (invalid values fall back to the start). */
  restore(seed: number, t: number): void {
    this.seed = Number.isFinite(seed) ? seed >>> 0 : this.seed;
    this._t = Number.isFinite(t) && t > 0 ? t : 0;
  }
}
