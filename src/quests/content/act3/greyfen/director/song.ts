// R13's water-song at the altar: two runs of the shipped rhythm runner (`RhythmRun`, the tempering bar's pure judge) on a
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
}

export const STRAYS_ALLOWED = 3;
/** Gear-tier patterns: the lesson is the 4-strike bar, the song the 5-strike bar. */
export const SONG_TIER: Record<SongKind, number> = { lesson: 1, real: 2 };

export class WaterSong {
  private run: RhythmRun | null = null;
  private kind: SongKind = 'lesson';
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
      this.run = new RhythmRun(this.clock(), SONG_TIER[this.kind], now);
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
    if (r.judged.every((j) => j !== 'miss') && r.strays <= STRAYS_ALLOWED) {
      if (kind === 'lesson') this.p.onLesson();
      else this.p.onSung();
    } else {
      this.p.toast('greyfen.q.r13.falter');
    }
  }

  reset(): void {
    this.run = null;
  }
}
