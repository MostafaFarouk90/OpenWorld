import { SPEARS } from './tuning';

/**
 * The four spear racks' state (plans/act3-K8.md 3.3, the R06 principle: every class can finish): each rack holds
 * `SPEARS.perRack` spears and refills one every `SPEARS.refillSeconds`; the player carries one spear at most. Pure, so the
 * encounter's interactables and the tests share it.
 */
export class SpearRacks {
  private readonly counts: number[];
  private readonly refill: number[];
  /** The rack the carried spear came from, or -1. */
  private from = -1;

  constructor(readonly racks: number) {
    this.counts = Array.from({ length: racks }, () => SPEARS.perRack);
    this.refill = Array.from({ length: racks }, () => 0);
  }

  get carrying(): boolean {
    return this.from >= 0;
  }

  count(rack: number): number {
    return this.counts[rack] ?? 0;
  }

  canTake(rack: number): boolean {
    return !this.carrying && this.count(rack) > 0;
  }

  /** Takes one spear from `rack`; false when already carrying or the rack is empty. */
  take(rack: number): boolean {
    if (!this.canTake(rack)) return false;
    this.counts[rack]--;
    this.from = rack;
    return true;
  }

  /** The carried spear leaves the hand (thrown); returns its rack, or -1 when nothing was carried. */
  throw(): number {
    const r = this.from;
    this.from = -1;
    return r;
  }

  /** The carried spear goes back on its rack (a reset, a death, the player left). No-op when not carrying. */
  putBack(): void {
    if (this.from < 0) return;
    this.counts[this.from] = Math.min(SPEARS.perRack, this.counts[this.from] + 1);
    this.from = -1;
  }

  /** A spear that missed returns to the rack it came from. */
  returnTo(rack: number): void {
    if (rack < 0 || rack >= this.racks) return;
    this.counts[rack] = Math.min(SPEARS.perRack, this.counts[rack] + 1);
  }

  /** Refills each short rack by one every `SPEARS.refillSeconds`. */
  tick(dt: number): void {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    for (let i = 0; i < this.racks; i++) {
      if (this.counts[i] >= SPEARS.perRack) {
        this.refill[i] = 0;
        continue;
      }
      this.refill[i] += dt;
      if (this.refill[i] >= SPEARS.refillSeconds) {
        this.refill[i] = 0;
        this.counts[i]++;
      }
    }
  }

  /** Every rack full, nothing carried (an arena reset). */
  reset(): void {
    this.from = -1;
    this.counts.fill(SPEARS.perRack);
    this.refill.fill(0);
  }
}
