// One chime phrase (Act 4 L1 PR 2): the shipped `RhythmRun` judges the timing over the phrase's own steps; this wrapper adds
// the key. A press in a step's window with the wrong attack key claims that step as a miss (not a stray). Pure.
import { RhythmRun, type Judgement, type RunResult } from '../../gear/rhythm';
import type { BeatClock } from '../../shrine/beat';
import type { ChimePhrase } from './phrases';

export type ChimeOutcome = Judgement | 'wrong' | 'stray' | 'rebased';

export class ChimeRun {
  private readonly run: RhythmRun;
  private readonly wrong = new Set<number>();
  private readonly hitAt = new Map<number, number>();

  constructor(
    clock: BeatClock,
    readonly phrase: ChimePhrase,
    startMs: number,
    opts: { stepMs: number; goodMs?: number },
  ) {
    this.run = new RhythmRun(clock, 1, startMs, { steps: phrase.steps, stepMs: opts.stepMs, ...(opts.goodMs ? { goodMs: opts.goodMs } : {}) });
  }

  get steps(): readonly number[] {
    return this.run.steps;
  }

  get strays(): number {
    return this.run.strays;
  }

  /** A press of attack key `key` (1 to 4) at `tMs`. */
  strike(tMs: number, key: number): ChimeOutcome {
    const before = this.run.judged(tMs);
    const o = this.run.strike(tMs);
    if (o === 'rebased') {
      this.wrong.clear();
      this.hitAt.clear();
    }
    if (o !== 'perfect' && o !== 'good') return o;
    const k = this.run.judged(tMs).findIndex((j, i) => j !== null && before[i] === null);
    if (k < 0) return o;
    this.hitAt.set(k, tMs);
    if (this.phrase.keys[k] !== key) {
      this.wrong.add(k);
      return 'wrong';
    }
    return o;
  }

  /** Per strike: its judgement (a wrong key reads as a miss), a miss once its window has closed, or null while it may come. */
  judged(tMs: number): (Judgement | null)[] {
    return this.run.judged(tMs).map((j, k) => (this.wrong.has(k) ? 'miss' : j));
  }

  /** Strikes that landed (any key), with when: the pillars ring for them. */
  struck(): ReadonlyMap<number, number> {
    return this.hitAt;
  }

  finished(tMs: number): boolean {
    return this.run.finished(tMs);
  }

  position(tMs: number): number {
    return this.run.position(tMs);
  }

  result(tMs: number): RunResult {
    const judged = this.judged(tMs).map((j) => j ?? 'miss');
    return { judged, strays: this.run.strays, perfect: this.run.strays === 0 && judged.every((j) => j === 'perfect') };
  }
}
