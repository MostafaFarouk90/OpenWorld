// R22's two anvil runs and M37's war-song on the table top: the shipped rhythm judge (RhythmRun, the tempering bar's) on a
// metronome, as Greyfen's water-song (R13). A prop press starts the bar (a count-in plays first) and every later press strikes;
// a miss restarts that run, never fails the quest, and the window widens, then the bar is struck for the player, after a few
// failed bars (the R13 rule). Toast keys are `<prefix>.<judgement>` and so on.
import { RhythmRun, type Judgement } from '../../../../../gear/rhythm';
import { AdaptiveBeatClock, type BeatClock } from '../../../../../shrine/beat';
import { GEAR_TUNING } from '../../../../../gear/tuning';
import { ASSIST_AFTER, STRAYS_ALLOWED, WIDE_GOOD_MS, WIDEN_AFTER, type SongView } from '../../../act3/greyfen/director/song';

export interface BeatPorts {
  now(): number;
  makeClock?(): BeatClock;
  toast(textKey: string): void;
  /** Toast and bar keys start with this. */
  prefix: string;
  fails(): number;
  failed(): void;
  /** The bar was struck right (or assisted). */
  done(tier: number): void;
}

export class BeatRun {
  private run: RhythmRun | null = null;
  private tier = 1;
  private wide = false;
  constructor(private readonly p: BeatPorts) {}

  get running(): boolean {
    return this.run !== null;
  }

  /** A press of the prop: starts a bar of `tier` (1: the 4-strike bar, 2: the 5-strike bar) when none runs, else strikes. */
  press(tier: number): void {
    const now = this.p.now();
    if (!this.run) {
      this.tier = tier;
      this.wide = this.p.fails() >= WIDEN_AFTER;
      const clock = this.p.makeClock?.() ?? new AdaptiveBeatClock({ beat: () => null, toAudioTime: () => undefined, nowMs: () => this.p.now() }, GEAR_TUNING.rhythm.bpm, GEAR_TUNING.rhythm.divisions);
      this.run = new RhythmRun(clock, tier, now, this.wide ? { goodMs: WIDE_GOOD_MS } : {});
      this.p.toast(`${this.p.prefix}.start`);
      return;
    }
    const o = this.run.strike(now);
    if (o === 'rebased') return;
    this.p.toast(o === 'stray' ? `${this.p.prefix}.stray` : `${this.p.prefix}.${o as Judgement}`);
  }

  /** Call a few times a second: judges the bar once it is over. */
  update(): void {
    if (!this.run) return;
    const now = this.p.now();
    if (!this.run.finished(now)) return;
    const r = this.run.result(now);
    this.run = null;
    if ((r.judged.every((j) => j !== 'miss') && r.strays <= STRAYS_ALLOWED) || this.p.fails() >= ASSIST_AFTER) this.p.done(this.tier);
    else {
      this.p.failed();
      this.p.toast(this.p.fails() >= ASSIST_AFTER ? `${this.p.prefix}.assist` : `${this.p.prefix}.falter`);
    }
  }

  view(): SongView | null {
    if (!this.run) return null;
    const now = this.p.now();
    return { kind: this.tier === 1 ? 'lesson' : 'real', steps: this.run.steps, judged: this.run.judged(now), position: this.run.position(now), stepsInBar: 16, wide: this.wide };
  }

  reset(): void {
    this.run = null;
  }
}

/** The toast and bar text of one beat run, under `prefix`. */
export const beatStrings = (prefix: string, t: { start: string; lesson: string; real: string; falter: string; assist: string }): Record<string, string> => ({
  [`${prefix}.start`]: t.start,
  [`${prefix}.perfect`]: 'True.',
  [`${prefix}.good`]: 'Close.',
  [`${prefix}.miss`]: 'Missed.',
  [`${prefix}.stray`]: 'Off the beat.',
  [`${prefix}.falter`]: t.falter,
  [`${prefix}.assist`]: t.assist,
  [`${prefix}.bar.count`]: 'Listen. Count yourself in.',
  [`${prefix}.bar.lesson`]: t.lesson,
  [`${prefix}.bar.real`]: t.real,
  [`${prefix}.bar.wide`]: 'Easier now. Press near the gold cells.',
});
