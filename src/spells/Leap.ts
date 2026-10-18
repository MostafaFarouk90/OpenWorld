import type { BurnZone } from './Burn';
import { LEAP } from './tuning';

export type LeapRefusal = 'not-learned' | 'dead' | 'cooldown' | 'staggered' | 'blocked' | 'busy' | 'casting' | 'rejected';
export type LeapPress = { ok: true } | { ok: false; reason: LeapRefusal };

export interface LeapHandleLike {
  readonly active: boolean;
  cancel(): void;
}

/** What the Leap needs from the game; the plugin wires it, the tests fake it. */
export interface LeapHost {
  /** The flag `ability.surge-leap.learned` (the single source). */
  learned(): boolean;
  alive(): boolean;
  /** Why the player cannot start a Leap right now (stagger, dialogue or modal, attack, block, dodge, a cast), or null. */
  busyReason(): Exclude<LeapRefusal, 'not-learned' | 'dead' | 'cooldown' | 'rejected'> | null;
  zone(): BurnZone;
  feetY(): number;
  /** Core's `player.leap`; null when it refuses (airborne, frozen, already leaping). */
  startLeap(opts: { distance: number; apex: number }): LeapHandleLike | null;
  /** The shard-use path; `scarred` was decided at the press. */
  useShard(gain: number, source: string, scarred: boolean): void;
  /** Takeoff succeeded: effects. */
  onLaunch?(): void;
}

/** Height above the launch point that counts as having left the ground. */
const LIFTOFF_RISE = 0.05;

interface Pending {
  handle: LeapHandleLike;
  startY: number;
  scarred: boolean;
}

/**
 * The Surge Leap (design 9.7, 11.5). V starts core's scripted leap; the 8 Burn, the Scar and the 4 s cooldown are
 * charged once the player has actually left the ground, so a Leap into a wall costs nothing. Burn is read at the press.
 */
export class LeapController {
  private readyAt = 0;
  private pending: Pending | null = null;

  constructor(private readonly host: LeapHost) {}

  /** Seconds left on the cooldown at sim time `now`. */
  remaining(now: number): number {
    return Math.max(0, this.readyAt - now);
  }

  press(now: number): LeapPress {
    const h = this.host;
    if (!h.learned()) return { ok: false, reason: 'not-learned' };
    if (!h.alive()) return { ok: false, reason: 'dead' };
    if (this.pending || this.remaining(now) > 0) return { ok: false, reason: 'cooldown' };
    const busy = h.busyReason();
    if (busy) return { ok: false, reason: busy };
    const scarred = h.zone() === 'cinder';
    const startY = h.feetY();
    const handle = h.startLeap({ distance: LEAP.distance, apex: LEAP.apex });
    if (!handle) return { ok: false, reason: 'rejected' };
    this.pending = { handle, startY, scarred };
    return { ok: true };
  }

  /** Once per fixed tick, after the player moved: commits the cost when the feet have left the launch height. */
  update(now: number): void {
    const p = this.pending;
    if (!p) return;
    if (this.host.feetY() > p.startY + LIFTOFF_RISE) this.commit(p, now);
    else if (!p.handle.active) this.pending = null; // ended before it ever lifted: nothing was spent
  }

  /** `player.leap` phases. A cancel before liftoff spends nothing; a landing implies liftoff. */
  onPhase(phase: 'start' | 'land' | 'cancel', now: number): void {
    const p = this.pending;
    if (!p || phase === 'start') return;
    if (phase === 'land' || this.host.feetY() > p.startY + LIFTOFF_RISE) this.commit(p, now);
    else this.pending = null;
  }

  /** Forget a Leap in flight (load, dispose). The cooldown is kept. */
  reset(): void {
    this.pending = null;
  }

  clearCooldown(): void {
    this.readyAt = 0;
  }

  private commit(p: Pending, now: number): void {
    this.pending = null;
    this.readyAt = now + LEAP.cooldownSeconds;
    this.host.useShard(LEAP.burn, 'leap', p.scarred);
    this.host.onLaunch?.();
  }
}
