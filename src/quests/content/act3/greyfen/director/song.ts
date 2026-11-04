// R13's water-song at the altar: two runs of the shipped rhythm runner (drawn on the tempering bar's own strip, see songBar.ts) (`RhythmRun`, the tempering bar's pure judge) on a
// metronome. The first is the lesson, the second the real song; a miss or too many strays restarts that run, it never fails the
// quest. The altar's interact presses are the strikes; the first press only starts the bar (a count-in plays first).
import { RhythmRun, type Judgement } from '../../../../../gear/rhythm';
import { AdaptiveBeatClock, type BeatClock } from '../../../../../shrine/beat';
import { GEAR_TUNING } from '../../../../../gear/tuning';

export type SongKind = 'lesson' | 'real';
export interface SongPorts {
  now(): number;
  /** A fresh clock (a metronome at the tempering tempo by default). */
  makeClock?(): BeatClock;
  toast(textKey: string): void;
  /** The lesson was sung right. */
  onLesson(): void;
  /** The real song was sung right. */
  onSung(): void;
  lessonDone(): boolean;
  /** Failed bars so far (persisted by the director). */
  fails(): number;
  /** A bar failed: the director adds one to the count. */
  failed(): void;
}

/** After this many failed bars the hit window widens (R13 is on M34's path, so it can never loop for ever)... */
export const WIDEN_AFTER = 3;
/** ...and after this many the next bar is sung for the player. */
export const ASSIST_AFTER = 5;
export const WIDE_GOOD_MS = 260;

/** What the song bar draws: the pattern steps, each strike's judgement, the playhead in steps (negative in the count-in). */
export interface SongView { kind: SongKind; steps: readonly number[]; judged: (Judgement | null)[]; position: number; stepsInBar: number; wide: boolean }

export const STRAYS_ALLOWED = 3;
/** Gear-tier patterns: the lesson is the 4-strike bar, the song the 5-strike bar. */
export const SONG_TIER: Record<SongKind, number> = { lesson: 1, real: 2 };

export class WaterSong {
  private run: RhythmRun | null = null;
  private kind: SongKind = 'lesson';
  private wide = false;
  constructor(private readonly p: SongPorts) {}

  get running(): boolean {
    return this.run !== null;
  }

  get current(): SongKind | null {
    return this.run ? this.kind : null;
  }

  private clock(): BeatClock {
    return this.p.makeClock?.() ?? new AdaptiveBeatClock({ beat: () => null, toAudioTime: () => undefined, nowMs: () => this.p.now() }, GEAR_TUNING.rhythm.bpm, GEAR_TUNING.rhythm.divisions);
  }

  /** The altar was pressed: starts the bar when none is running, else strikes. */
  press(): void {
    const now = this.p.now();
    if (!this.run) {
      this.kind = this.p.lessonDone() ? 'real' : 'lesson';
      this.wide = this.p.fails() >= WIDEN_AFTER;
      this.run = new RhythmRun(this.clock(), SONG_TIER[this.kind], now, this.wide ? { goodMs: WIDE_GOOD_MS } : {});
      this.p.toast(this.kind === 'lesson' ? 'greyfen.q.r13.lesson' : 'greyfen.q.r13.real');
      return;
    }
    const o = this.run.strike(now);
    if (o === 'rebased') return;
    this.p.toast(o === 'stray' ? 'greyfen.q.r13.stray' : `greyfen.q.r13.${o as Judgement}`);
  }

  /** Call a few times a second: judges the bar once it is over. */
  update(): void {
    if (!this.run) return;
    const now = this.p.now();
    if (!this.run.finished(now)) return;
    const r = this.run.result(now);
    const kind = this.kind;
    this.run = null;
    if ((r.judged.every((j) => j !== 'miss') && r.strays <= STRAYS_ALLOWED) || this.p.fails() >= ASSIST_AFTER) {
      if (kind === 'lesson') this.p.onLesson();
      else this.p.onSung();
    } else {
      this.p.failed();
      this.p.toast(this.p.fails() >= ASSIST_AFTER ? 'greyfen.q.r13.assist' : 'greyfen.q.r13.falter');
    }
  }

  /** The bar as the HUD draws it, or null when none is running. */
  view(): SongView | null {
    if (!this.run) return null;
    const now = this.p.now();
    return { kind: this.kind, steps: this.run.steps, judged: this.run.judged(now), position: this.run.position(now), stepsInBar: 16, wide: this.wide };
  }

  reset(): void {
    this.run = null;
  }
}
