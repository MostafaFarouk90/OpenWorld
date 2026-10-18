import type { BarClock } from './barClock';

/**
 * Region handover planning (design 6.1 trigger 6): the old track fades to silence so it reaches 0
 * exactly on a bar line of its own clock, and the new track starts at full on that line.
 */

/** Audio time of the first bar line of `clock` at least one fade plus one tick ahead of `now`. */
export function planHandover(clock: BarClock, now: number, rampSeconds: number, tickSeconds = 1 / 60): number {
  const earliest = now + rampSeconds + tickSeconds;
  const k = Math.max(0, Math.ceil((earliest - clock.startedAt) / clock.barSeconds - 1e-9));
  return clock.startedAt + k * clock.barSeconds;
}

export type HandoverPhase = 'idle' | 'loading' | 'committed';

export interface HandoverView {
  phase: HandoverPhase;
  /** The track being switched to (loading or committed). */
  target: string | null;
  /** A different request received while committed; runs after the swap. */
  queued: string | null;
  /** Audio time of the swap while committed. */
  at: number | null;
}

/**
 * The handover state machine: Idle, Loading, Committed (the new mixer is scheduled), then Swapped,
 * which is Idle again on the new track. "Last wins" holds only in Loading; once the new mixer is
 * scheduled a different request queues until the swap.
 */
export class HandoverMachine {
  private phase: HandoverPhase = 'idle';
  private target: string | null = null;
  private queued: string | null = null;
  private at: number | null = null;

  constructor(private active: string) {}

  get activeTrack(): string {
    return this.active;
  }

  view(): HandoverView {
    return { phase: this.phase, target: this.target, queued: this.queued, at: this.at };
  }

  /** A region says `trackId` should play. Returns true when the machine wants it loaded. */
  request(trackId: string): boolean {
    if (this.phase === 'committed') {
      // Back to what is committed, or to what is playing, cancels a queued request.
      this.queued = trackId === this.target ? null : trackId;
      return false;
    }
    if (trackId === this.active) {
      this.phase = 'idle';
      this.target = null;
      return false;
    }
    if (this.phase === 'loading' && trackId === this.target) return false;
    this.phase = 'loading';
    this.target = trackId;
    return true;
  }

  /** The new mixer is scheduled to start at `at`. Only valid for the current target. */
  commit(trackId: string, at: number): boolean {
    if (this.phase !== 'loading' || this.target !== trackId) return false;
    this.phase = 'committed';
    this.at = at;
    return true;
  }

  /** The load for the target failed: keep the old track. */
  fail(trackId: string): void {
    if (this.phase === 'loading' && this.target === trackId) {
      this.phase = 'idle';
      this.target = null;
    }
  }

  /** The swap time came: the target is now active. Returns a queued track that needs loading, if any. */
  swap(): string | null {
    if (this.phase !== 'committed' || this.target === null) return null;
    this.active = this.target;
    this.phase = 'idle';
    this.target = null;
    this.at = null;
    const next = this.queued;
    this.queued = null;
    return next !== null && this.request(next) ? next : null;
  }

  /** Drops any pending handover (dispose, save load). The active track stays. */
  reset(active?: string): void {
    if (active !== undefined) this.active = active;
    this.phase = 'idle';
    this.target = null;
    this.queued = null;
    this.at = null;
  }
}
