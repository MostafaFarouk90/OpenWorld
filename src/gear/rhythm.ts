import type { BeatClock } from '../shrine/beat';
import { GEAR_TUNING } from './tuning';

export type Judgement = 'perfect' | 'good' | 'miss';
export type StrikeOutcome = Judgement | 'stray' | 'rebased';

/** Strike steps of the 16-step bar per gear tier (R4). Steps are at least 2 apart (319 ms) so one press cannot claim two. */
export const PATTERNS: Readonly<Record<1 | 2 | 3, readonly number[]>> = {
  1: [0, 4, 8, 12],
  2: [0, 4, 6, 10, 12],
  3: [0, 2, 6, 8, 12, 14],
};

export const patternForTier = (tier: number): readonly number[] => PATTERNS[tier >= 3 ? 3 : tier === 2 ? 2 : 1];

export interface RunResult {
  judged: Judgement[];
  strays: number;
  /** Every strike perfect and no stray press. */
  perfect: boolean;
}

export interface RhythmOptions {
  /** One step in ms; the default is a 94 BPM bar split in four. */
  stepMs?: number;
  perfectMs?: number;
  goodMs?: number;
}

/**
 * One bar of strikes over a step clock (an `AdaptiveBeatClock` built with `divisions` 4, so its indices are steps).
 * It starts after a one-beat count-in. Pure: the caller passes `performance.now()` style times.
 * A press matches the one pattern step within the good window (none can be shared: steps are 319 ms apart and the
 * window is 100 ms either side); a press near no step, near a step already judged, or in the count-in is a stray.
 */
export class RhythmRun {
  readonly steps: readonly number[];
  private barStart = 0;
  private gen = 0;
  private judgedAt: (Judgement | null)[] = [];
  private strayCount = 0;
  private readonly stepMs: number;
  private readonly perfectMs: number;
  private readonly goodMs: number;

  constructor(
    private readonly clock: BeatClock,
    tier: number,
    startMs: number,
    opts: RhythmOptions = {},
  ) {
    const r = GEAR_TUNING.rhythm;
    this.steps = patternForTier(tier);
    this.stepMs = opts.stepMs ?? 60000 / r.bpm / r.divisions;
    this.perfectMs = opts.perfectMs ?? r.perfectMs;
    this.goodMs = opts.goodMs ?? r.goodMs;
    this.rebase(startMs);
  }

  /** Step index of the first strike step on the clock's grid. */
  get start(): number {
    return this.barStart;
  }

  get strays(): number {
    return this.strayCount;
  }

  /** The clock re-based itself (music started or stopped): the bar starts over from `tMs`. */
  private rebase(tMs: number): void {
    const idx = this.clock.locate(tMs).index;
    const beat = GEAR_TUNING.rhythm.countInSteps;
    this.barStart = Math.ceil((idx + beat) / beat) * beat;
    this.gen = this.clock.generation();
    this.judgedAt = this.steps.map(() => null);
    this.strayCount = 0;
  }

  strike(tMs: number): StrikeOutcome {
    if (this.clock.generation() !== this.gen) {
      this.rebase(tMs);
      return 'rebased';
    }
    const loc = this.clock.locate(tMs);
    let hit = -1;
    let hitOff = Infinity;
    for (let k = 0; k < this.steps.length; k++) {
      // Press time relative to the centre of step k.
      const off = loc.errorMs + (loc.index - (this.barStart + this.steps[k])) * this.stepMs;
      if (Math.abs(off) <= this.goodMs && Math.abs(off) < Math.abs(hitOff)) {
        hit = k;
        hitOff = off;
      }
    }
    if (hit < 0 || this.judgedAt[hit] !== null) {
      this.strayCount++;
      return 'stray';
    }
    const j: Judgement = Math.abs(hitOff) <= this.perfectMs ? 'perfect' : 'good';
    this.judgedAt[hit] = j;
    return j;
  }

  /** Per strike: its judgement, a miss once its window has closed, or null while it may still come. */
  judged(tMs: number): (Judgement | null)[] {
    const closed = this.clock.passedIndex(tMs, this.goodMs);
    return this.judgedAt.map((j, k) => j ?? (closed >= this.barStart + this.steps[k] ? 'miss' : null));
  }

  finished(tMs: number): boolean {
    return this.clock.passedIndex(tMs, this.goodMs) >= this.barStart + this.steps[this.steps.length - 1];
  }

  /** Where `tMs` sits in the bar, in steps (negative in the count-in). */
  position(tMs: number): number {
    const loc = this.clock.locate(tMs);
    return loc.index - this.barStart + loc.errorMs / this.stepMs;
  }

  result(tMs: number): RunResult {
    const judged = this.judged(tMs).map((j) => j ?? 'miss');
    return { judged, strays: this.strayCount, perfect: this.strayCount === 0 && judged.every((j) => j === 'perfect') };
  }
}
