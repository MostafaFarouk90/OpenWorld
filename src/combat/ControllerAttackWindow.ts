import type { AttackWindowSource } from './types';

/** The slice of AnimationController that combat reads (see contracts/animation-events.md). */
export interface AttackStateSource {
  activeAttack(): {
    clip: string;
    activeStart: number;
    activeEnd: number;
    normalizedTime: number;
    active: boolean;
    swingId: number;
  } | null;
}

/**
 * Attack window driven by the animation controller, so the tracer and the controller's own
 * `active` flag cannot disagree. start/end are the clip's activeStart/activeEnd, `currentTime()`
 * is the controller's normalizedTime, and the values follow whatever swing is playing.
 *
 * One case needs help: a window shorter than a tick is skipped over, yet the controller reports
 * `active` for that tick; the time is clamped into the window so it still counts.
 */
export class ControllerAttackWindow implements AttackWindowSource {
  constructor(private readonly source: AttackStateSource) {}

  get clipName(): string {
    return this.source.activeAttack()?.clip ?? '';
  }

  get start(): number {
    return this.source.activeAttack()?.activeStart ?? 0;
  }

  get end(): number {
    // No attack: an inverted window, which never fires.
    return this.source.activeAttack()?.activeEnd ?? -1;
  }

  get swingId(): number | undefined {
    return this.source.activeAttack()?.swingId;
  }

  currentTime(): number | null {
    const a = this.source.activeAttack();
    if (!a) return null;
    if (a.active) return Math.min(Math.max(a.normalizedTime, a.activeStart), a.activeEnd);
    return a.normalizedTime;
  }
}
