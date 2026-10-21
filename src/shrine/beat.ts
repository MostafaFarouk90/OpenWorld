import { SHRINE_TUNING } from './tuning';

/** The subset of thread 9's `BeatInfo` (music-states.md section 6) this module reads. */
export interface BeatInfoLike {
  beatSeconds: number;
  nextBeatTime: number;
}

export interface BeatLocation {
  /** Index of the beat nearest the time, on this clock's grid. */
  index: number;
  /** Signed error in ms: negative is early, positive is late. A half-beat tie reads as late. */
  errorMs: number;
}

export type BeatSource = 'music' | 'metronome';

/** Times are `performance.now()` milliseconds. */
export interface BeatClock {
  /** The source in use right now; switches when audio unlocks or the music beat goes away. */
  source(): BeatSource;
  /** Changes whenever the grid is re-based (a source switch or a re-sync), so judges reset. */
  generation(): number;
  locate(tMs: number): BeatLocation;
  /** Highest beat index whose hit window (+- windowMs) has closed by `tMs`. */
  passedIndex(tMs: number, windowMs: number): number;
}

export interface BeatClockPorts {
  /** `music.beat()`, or undefined when the music service is missing. May return null or throw. */
  beat(): BeatInfoLike | null | undefined;
  /** `music.toAudioTime`: a performance timestamp to AudioContext seconds. */
  toAudioTime(performanceMs: number): number | undefined;
  nowMs(): number;
}

/** A grid of beats at `epoch + k * period` (same unit for both). */
class Grid {
  constructor(
    readonly epoch: number,
    readonly period: number,
  ) {}

  locate(t: number): { index: number; error: number } {
    const index = Math.ceil((t - this.epoch) / this.period - 0.5);
    return { index, error: t - (this.epoch + index * this.period) };
  }

  passed(t: number, window: number): number {
    // Strict: a beat is gone only once its window is passed, and +window itself is still a hit.
    return Math.ceil((t - window - this.epoch) / this.period) - 1;
  }
}

const RESYNC_DRIFT_MS = 15;

/**
 * Judges against the music clock when it exists, else against a metronome at the track's tempo
 * (headless runs, locked audio, thread 9 not merged), so the rhythm never blocks the player.
 */
export class AdaptiveBeatClock implements BeatClock {
  private readonly metronome: Grid;
  private music: { grid: Grid } | null = null;
  private gen = 0;
  private readonly divisions: number;

  /**
   * `divisions` (A10, default 1) splits every beat into that many equal steps for both grids, so `locate` and
   * `passedIndex` count steps (4 gives the tempering bar's 16 steps). Anything but a whole number >= 1 reads as 1.
   */
  constructor(
    private readonly ports: BeatClockPorts,
    bpm: number = SHRINE_TUNING.wardstones.bpm,
    divisions = 1,
  ) {
    this.divisions = Number.isInteger(divisions) && divisions >= 1 ? divisions : 1;
    this.metronome = new Grid(ports.nowMs(), 60000 / bpm / this.divisions);
  }

  source(): BeatSource {
    this.refresh();
    return this.music ? 'music' : 'metronome';
  }

  generation(): number {
    this.refresh();
    return this.gen;
  }

  locate(tMs: number): BeatLocation {
    this.refresh();
    if (this.music) {
      const a = this.ports.toAudioTime(tMs);
      if (a !== undefined && Number.isFinite(a)) {
        const r = this.music.grid.locate(a);
        return { index: r.index, errorMs: r.error * 1000 };
      }
    }
    const r = this.metronome.locate(tMs);
    return { index: r.index, errorMs: r.error };
  }

  passedIndex(tMs: number, windowMs: number): number {
    this.refresh();
    if (this.music) {
      const a = this.ports.toAudioTime(tMs);
      if (a !== undefined && Number.isFinite(a)) return this.music.grid.passed(a, windowMs / 1000);
    }
    return this.metronome.passed(tMs, windowMs);
  }

  /** Reads `music.beat()` once and re-bases the grid when the source or its tempo changes. */
  private refresh(): void {
    let info: BeatInfoLike | null | undefined = null;
    try {
      info = this.ports.beat();
    } catch {
      info = null;
    }
    const ok = !!info && Number.isFinite(info.beatSeconds) && info.beatSeconds > 0 && Number.isFinite(info.nextBeatTime);
    if (!ok) {
      if (this.music) {
        this.music = null;
        this.gen++;
      }
      return;
    }
    const b = info as BeatInfoLike;
    // Without a usable audio-time conversion the music grid cannot be judged against.
    const probe = this.ports.toAudioTime(this.ports.nowMs());
    if (probe === undefined || !Number.isFinite(probe)) {
      if (this.music) {
        this.music = null;
        this.gen++;
      }
      return;
    }
    if (!this.music) {
      this.music = { grid: new Grid(b.nextBeatTime, b.beatSeconds / this.divisions) };
      this.gen++;
      return;
    }
    // Same tempo and a next-beat time that still sits on the grid: nothing changes.
    const g = this.music.grid;
    const off = ((b.nextBeatTime - g.epoch) / g.period) % 1;
    const driftMs = Math.min(Math.abs(off), 1 - Math.abs(off)) * g.period * 1000;
    if (Math.abs(b.beatSeconds / this.divisions - g.period) > 1e-6 || driftMs > RESYNC_DRIFT_MS) {
      this.music = { grid: new Grid(b.nextBeatTime, b.beatSeconds / this.divisions) };
      this.gen++;
    }
  }
}
