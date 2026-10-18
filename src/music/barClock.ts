/**
 * Position in the music loop on the audio clock. All stems start together at `startedAt`, so bar
 * boundaries are `startedAt + k * barSeconds`; the loop is `bars` bars and repeats exactly.
 */
export class BarClock {
  readonly barSeconds: number;

  constructor(
    readonly startedAt: number,
    readonly loopSeconds: number,
    readonly bars: number,
  ) {
    if (!(loopSeconds > 0) || !(bars > 0)) throw new Error('BarClock needs a positive loop length and bar count');
    this.barSeconds = loopSeconds / bars;
  }

  /** Bars elapsed in the current loop, in [0, bars). Before the start time it is 0. */
  position(now: number): number {
    if (!(now > this.startedAt)) return 0;
    const bars = (now - this.startedAt) / this.barSeconds;
    return bars % this.bars;
  }

  /** Audio time of the bar line `barsAhead` bars after the current position (position in bars). */
  timeAtBarPosition(now: number, targetBars: number): number {
    return now + (targetBars - this.position(now)) * this.barSeconds;
  }

  /**
   * Next bar line at or after now (a position within `epsilon` bars of a line counts as on it).
   * Returns a position in bars, which may equal `bars` (the loop wrap).
   */
  nextBar(now: number, epsilon = 1e-6): number {
    const pos = this.position(now);
    const k = Math.ceil(pos - epsilon);
    return Math.min(this.bars, Math.max(k, 0));
  }

  /** Next half-loop boundary (0, bars/2, bars) at or after now, as a position in bars. */
  nextHalf(now: number, epsilon = 1e-6): number {
    const half = this.bars / 2;
    return Math.min(this.bars, Math.ceil(this.position(now) / half - epsilon) * half);
  }

  /** First half boundary strictly after the given bar position. */
  halfAfter(positionBars: number): number {
    const half = this.bars / 2;
    return (Math.floor(positionBars / half + 1e-9) + 1) * half;
  }
}
