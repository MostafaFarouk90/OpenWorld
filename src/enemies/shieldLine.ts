// The warhost's shield line (contracts v0.9 item 11, plan Part 3.4): a line of warhost members breaks when two of its
// shield members are staggered within one second; then every staggered member of the line kneels and offers Spare. Pure
// and headless: N5 wires it to the enemies' stagger events and the mercy prompt.
import type { WarhostRole } from './types';

/** Two shield staggers within this many seconds break the line. */
export const SHIELD_LINE_WINDOW_S = 1;

export class ShieldLine {
  private readonly members = new Map<string, WarhostRole>();
  /** Last stagger time per member (seconds, the caller's clock). */
  private readonly staggers = new Map<string, number>();
  private broken_ = false;

  constructor(readonly id: string) {}

  join(memberId: string, role: WarhostRole): void {
    this.members.set(memberId, role);
  }

  leave(memberId: string): void {
    this.members.delete(memberId);
    this.staggers.delete(memberId);
  }

  get size(): number {
    return this.members.size;
  }

  get broken(): boolean {
    return this.broken_;
  }

  /**
   * A member was staggered at time `t` (seconds). Returns the members that kneel now: every member staggered within the
   * window (the shield pair and any pike or torch caught with them) when this makes two shield staggers inside it; else
   * empty. A broken line answers each later stagger with that member alone (it kneels too). Unknown members are ignored.
   */
  staggered(memberId: string, t: number): string[] {
    if (!this.members.has(memberId) || !Number.isFinite(t)) return [];
    this.staggers.set(memberId, t);
    if (this.broken_) return [memberId];
    const recent = [...this.staggers].filter(([, at]) => t - at <= SHIELD_LINE_WINDOW_S && t >= at).map(([id]) => id);
    const shields = recent.filter((id) => this.members.get(id) === 'shield');
    if (shields.length < 2) return [];
    this.broken_ = true;
    return recent;
  }

  /** Back to whole (a rest, a reload). */
  reset(): void {
    this.staggers.clear();
    this.broken_ = false;
  }
}
