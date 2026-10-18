/**
 * The visual clock effects age on. It advances by the render frame time only while the sim is not
 * frozen (hit-stop or pause), so sparks and trails freeze with the hit. `ignoreFreeze` clocks (the
 * Burn vignette) keep running through hit-stop but still stop when the game is paused.
 */
export class VisualClock {
  private t = 0;
  private last = 0;

  get now(): number {
    return this.t;
  }
  /** Seconds the last `advance` moved the clock (0 when frozen). */
  get delta(): number {
    return this.last;
  }

  advance(frameTime: number, frozen: boolean): number {
    const dt = Number.isFinite(frameTime) && frameTime > 0 ? Math.min(frameTime, 0.1) : 0;
    this.last = frozen ? 0 : dt;
    this.t += this.last;
    return this.last;
  }
}
