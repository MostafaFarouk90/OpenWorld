// Act 5 N9 (asked by N6): Vey's Spare window on screen. The boss bar already flags "Spare open"; this adds the centred line and
// the countdown. Pure timer: `boss.releaseWindow` opens and closes it; the clock counts down locally from the window length.
export const SPARE_CUE_BOSSES: readonly string[] = ['vey'];
/** Vey's last-break window (N6: 6 s). */
export const SPARE_WINDOW_S = 6;

export class SpareCue {
  private left = 0;
  private open = false;

  constructor(private readonly bosses: readonly string[] = SPARE_CUE_BOSSES, private readonly windowS = SPARE_WINDOW_S) {}

  /** `boss.releaseWindow`. */
  window(e: { bossId?: unknown; open?: unknown } | null | undefined): void {
    if (!e || typeof e.bossId !== 'string' || !this.bosses.includes(e.bossId)) return;
    if (e.open === true) {
      this.open = true;
      this.left = this.windowS;
    } else {
      this.open = false;
      this.left = 0;
    }
  }

  tick(dt: number): void {
    if (!this.open || !(dt > 0)) return;
    this.left = Math.max(0, this.left - dt);
  }

  /** A load or a boss ending clears it. */
  reset(): void {
    this.open = false;
    this.left = 0;
  }

  /** Whole seconds left while open (never 0 while time remains), or null when hidden. */
  get seconds(): number | null {
    return this.open ? Math.max(0, Math.ceil(this.left)) : null;
  }
}
