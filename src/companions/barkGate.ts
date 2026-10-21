// One voice at a time (plans/act2-A5-review.md): with two companions in the party, a bark from one holds the other
// quiet for `gapSeconds` (plan section 8, "Also": a shared 45 s gate), so the party never talks over itself.

export const BARK_GATE_TUNING = { gapSeconds: 45 } as const;

export class BarkGate {
  private quiet = 0;
  private last: string | null = null;

  constructor(private readonly gapSeconds: number = BARK_GATE_TUNING.gapSeconds) {}

  tick(dt: number): void {
    if (dt > 0) this.quiet = Math.max(0, this.quiet - dt);
  }

  /** True when `id` may speak now; a companion is never held back by its own last bark (its director paces it). */
  claim(id: string): boolean {
    if (this.quiet > 0 && this.last !== id) return false;
    this.quiet = this.gapSeconds;
    this.last = id;
    return true;
  }

  reset(): void {
    this.quiet = 0;
    this.last = null;
  }
}
