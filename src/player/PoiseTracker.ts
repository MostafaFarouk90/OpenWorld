import { POISE } from './tuning';
import type { ActorLike, DamageOutcome } from './types';

export interface PoiseDamageInfo {
  outcome: DamageOutcome;
  /** The poise the hit required to stagger through (the request's poise). */
  reqPoise: number;
  /** Poise actually removed from the bar. */
  poiseDealt: number;
  /** The poise bar was emptied by this hit. */
  staggered: boolean;
  /** Health damage dealt, when known. */
  amount?: number;
}

export type PoiseReaction =
  | { kind: 'none' }
  | { kind: 'flinch'; ticks: number }
  | { kind: 'stagger'; ticks: number; knockback: number }
  | { kind: 'break'; ticks: number; knockback: number };

const NONE: PoiseReaction = { kind: 'none' };

/** Turns damage results into hit reactions and refills the poise bar after a quiet spell. */
export class PoiseTracker {
  private sinceHit = 0;
  private pending = false;

  constructor(private readonly actor: Pick<ActorLike, 'dead' | 'restorePoise'>) {}

  onDamage(info: PoiseDamageInfo): PoiseReaction {
    if (this.actor.dead || info.outcome !== 'hit') return NONE;
    this.sinceHit = 0;
    this.pending = true;
    if (info.staggered) return { kind: 'break', ticks: POISE.breakStaggerTicks, knockback: POISE.knockbackMetres };
    if (info.reqPoise >= POISE.heavyPoise) {
      return { kind: 'stagger', ticks: POISE.heavyStaggerTicks, knockback: POISE.knockbackMetres };
    }
    if (info.poiseDealt > 0 || (info.amount ?? 0) > 0) return { kind: 'flinch', ticks: POISE.flinchTicks };
    return NONE;
  }

  /** Advance one fixed tick. */
  tick(): void {
    if (!this.pending || this.actor.dead) return;
    this.sinceHit++;
    if (this.sinceHit >= POISE.regenDelayTicks) {
      this.pending = false;
      this.actor.restorePoise();
    }
  }
}
