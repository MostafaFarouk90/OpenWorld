// The Party option (plans/act2-A5.md sections 1.2 and 8): a waystone rest with two or more joined companions opens a
// window in which the party may change; A15 draws the screen from `party.offered`, `options()` and `change()`.
import './events';

export const PARTY_TUNING = {
  /** The window closes once Cael is this far from the stone he rested at. */
  leaveDistance: 8,
  /** ...or after this long. */
  windowSeconds: 120,
} as const;

export interface PartyOption {
  id: string;
  nameKey: string;
  role: 'support' | 'tank' | 'healer';
  rank: number;
  active: boolean;
}

export interface PartyService {
  /** True inside the window after a waystone rest; never for an inn rest. */
  canChange(): boolean;
  /** Joined companions, in def order. */
  options(): PartyOption[];
  /** Refused outside the window, else `companions.setActive(ids)`. */
  change(ids: readonly string[]): boolean;
}

/** Open from a waystone rest until Cael walks away, time runs out, or a load. */
export class PartyWindow {
  private at: { x: number; z: number } | null = null;
  private age = 0;

  get isOpen(): boolean {
    return this.at !== null;
  }

  open(at: { x: number; z: number }): void {
    this.at = { x: at.x, z: at.z };
    this.age = 0;
  }

  close(): void {
    this.at = null;
    this.age = 0;
  }

  tick(dt: number, player: { x: number; z: number }): void {
    const a = this.at;
    if (!a) return;
    this.age += dt > 0 ? dt : 0;
    if (this.age >= PARTY_TUNING.windowSeconds || Math.hypot(player.x - a.x, player.z - a.z) > PARTY_TUNING.leaveDistance) {
      this.close();
    }
  }
}

declare module '../core/Services' {
  interface GameServices {
    /** A5's Party option (A15 draws the screen). */
    party: PartyService;
  }
}
