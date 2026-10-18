import type { BarClock } from './barClock';

/** contracts/music-states.md section 6. All times are AudioContext seconds. */
export interface BeatInfo {
  bpm: number;
  beatSeconds: number;
  barSeconds: number;
  /** Bars since the mixer started (not wrapped at the loop). */
  bar: number;
  /** 0..3 */
  beat: number;
  /** Sixteenth within the bar, 0..15. */
  step: number;
  /** 0..1 within the beat. */
  phase: number;
  /** The audio time of this beat's line. */
  audioTime: number;
  nextBeatTime: number;
}

export const BEATS_PER_BAR = 4;
export const STEPS_PER_BAR = 16;

/** Beat position at `now`. Before the mixer's start time everything is at beat 0 and `nextBeatTime` is the start. */
export function beatInfoAt(clock: BarClock, bpm: number, now: number): BeatInfo {
  const barSeconds = clock.barSeconds;
  const beatSeconds = barSeconds / BEATS_PER_BAR;
  const elapsed = now - clock.startedAt;
  if (!(elapsed >= 0)) {
    return {
      bpm, beatSeconds, barSeconds, bar: 0, beat: 0, step: 0, phase: 0,
      audioTime: clock.startedAt, nextBeatTime: clock.startedAt,
    };
  }
  const index = Math.floor(elapsed / beatSeconds + 1e-9);
  const audioTime = clock.startedAt + index * beatSeconds;
  const inBar = (elapsed / barSeconds) % 1;
  return {
    bpm,
    beatSeconds,
    barSeconds,
    bar: Math.floor(index / BEATS_PER_BAR),
    beat: index % BEATS_PER_BAR,
    step: Math.min(STEPS_PER_BAR - 1, Math.floor(inBar * STEPS_PER_BAR + 1e-9)),
    phase: Math.min(1, Math.max(0, (now - audioTime) / beatSeconds)),
    audioTime,
    nextBeatTime: audioTime + beatSeconds,
  };
}

/** Beat `index` (since the mixer start) as a BeatInfo. */
export function beatInfoAtIndex(clock: BarClock, bpm: number, index: number): BeatInfo {
  const beatSeconds = clock.barSeconds / BEATS_PER_BAR;
  return beatInfoAt(clock, bpm, clock.startedAt + index * beatSeconds + 1e-6);
}

export interface BeatSchedulerOptions {
  /** Beats due within this many seconds ahead are emitted early. */
  lookaheadSeconds?: number;
  /** A beat older than this fraction of a beat when first seen is dropped (stall, pause). */
  staleBeats?: number;
  /** Guard: never emit more than this many beats in one update. */
  maxPerUpdate?: number;
}

/**
 * Emits each beat once, a little before it sounds, from the fixed tick. A long stall (pause,
 * hit-stop, a backgrounded tab) drops the beats that are already stale instead of replaying them.
 */
export class BeatScheduler {
  private readonly listeners = new Set<(b: BeatInfo) => void>();
  private lastEmitted = -1;
  private warned = false;
  private readonly lookahead: number;
  private readonly stale: number;
  private readonly cap: number;

  constructor(options: BeatSchedulerOptions = {}) {
    this.lookahead = options.lookaheadSeconds ?? 0.12;
    this.stale = options.staleBeats ?? 0.5;
    this.cap = options.maxPerUpdate ?? 8;
  }

  onBeat(cb: (b: BeatInfo) => void): () => void {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  /** Forget what was emitted (the mixer restarted). */
  reset(): void {
    this.lastEmitted = -1;
  }

  update(clock: BarClock | null, bpm: number, audioNow: number): void {
    if (!clock || this.listeners.size === 0 || !Number.isFinite(audioNow)) return;
    const beatSeconds = clock.barSeconds / BEATS_PER_BAR;
    const horizon = audioNow + this.lookahead - clock.startedAt;
    if (horizon < 0) return;
    const newest = Math.floor(horizon / beatSeconds + 1e-9);
    // The oldest beat still worth reporting.
    const oldest = Math.max(this.lastEmitted + 1, Math.ceil((audioNow - this.stale * beatSeconds - clock.startedAt) / beatSeconds - 1e-9), 0);
    let emitted = 0;
    for (let i = oldest; i <= newest && emitted < this.cap; i++, emitted++) {
      this.lastEmitted = i;
      const info = beatInfoAtIndex(clock, bpm, i);
      for (const cb of [...this.listeners]) {
        if (!this.listeners.has(cb)) continue; // unsubscribed by an earlier callback
        try {
          cb(info);
        } catch (err) {
          if (!this.warned) {
            this.warned = true;
            console.warn('Music: an onBeat callback threw:', err);
          }
        }
      }
    }
    if (newest > this.lastEmitted && emitted >= this.cap) this.lastEmitted = newest; // drop the rest, never replay
    if (oldest > this.lastEmitted + 1) this.lastEmitted = Math.max(this.lastEmitted, oldest - 1);
  }
}

export interface AudioClockLike {
  readonly currentTime: number;
  readonly state?: string;
  readonly baseLatency?: number;
  readonly outputLatency?: number;
  getOutputTimestamp?: () => { contextTime?: number; performanceTime?: number };
}

/**
 * Converts a `performance.now()`-style timestamp (an input event's `timeStamp`) to AudioContext
 * time. Uses the context's own pairing when it reports one, else extrapolates from now and
 * subtracts the output latency so the result is when the player's press happened against what
 * they were hearing.
 */
export function performanceToAudioTime(
  ctx: AudioClockLike,
  performanceMs: number,
  nowMs: number = performance.now(),
  offsetSeconds = 0,
): number {
  let t: number | null = null;
  try {
    const stamp = ctx.getOutputTimestamp?.();
    if (
      stamp && Number.isFinite(stamp.contextTime) && Number.isFinite(stamp.performanceTime) &&
      (stamp.performanceTime as number) > 0 && (stamp.contextTime as number) > 0
    ) {
      t = (stamp.contextTime as number) + (performanceMs - (stamp.performanceTime as number)) / 1000;
    }
  } catch {
    t = null;
  }
  if (t === null) {
    const latency = ctx.outputLatency ?? ctx.baseLatency ?? 0;
    t = ctx.currentTime + (performanceMs - nowMs) / 1000 - (Number.isFinite(latency) ? latency : 0);
  }
  return t + offsetSeconds;
}
