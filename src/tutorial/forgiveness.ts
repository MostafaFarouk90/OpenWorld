// Block and dodge lessons (T09, T10, skirmish) were too strict (QA round 3): a dodge counts only when a swing lands
// inside its 0.25 s of i-frames, a block only inside the front arc. While a lesson counts them, a hit that lands on a
// player who clearly tried (dodge pressed shortly before, guard up or just dropped) is credited as the lesson's verb, from
// any direction, and every few hits taken without credit hand one over so the lesson cannot dead-end.
export const FORGIVENESS = {
  /** A dodge pressed up to this long before a hit counts as dodging it (seconds). */
  dodgeLeadSeconds: 0.7,
  /** The guard counts as up this long after it was dropped (seconds). */
  guardGraceSeconds: 0.35,
  /** Every Nth hit taken in the lesson with no attempt credits the lesson's verb. */
  pityHits: 3,
} as const;

export type LessonVerb = 'blocked' | 'dodged';

export class CombatForgiveness {
  private dodgePressedAt = -Infinity;
  private guardLastUp = -Infinity;
  private pity = 0;

  /** Call every fixed tick with the clock in seconds and the dodge and guard inputs. */
  observe(now: number, dodgePressed: boolean, guardHeld: boolean): void {
    if (dodgePressed) this.dodgePressedAt = now;
    if (guardHeld) this.guardLastUp = now;
  }

  /**
   * A hit landed on the player in a lesson counting `verb`. Returns the credit to send, or null. `parried` hits are
   * counted by the normal path, so this is only for hits that got through.
   */
  onHitTaken(now: number, verb: LessonVerb): LessonVerb | null {
    const tried = verb === 'dodged'
      ? now - this.dodgePressedAt <= FORGIVENESS.dodgeLeadSeconds
      : now - this.guardLastUp <= FORGIVENESS.guardGraceSeconds;
    if (tried) {
      this.pity = 0;
      return verb;
    }
    if (++this.pity >= FORGIVENESS.pityHits) {
      this.pity = 0;
      return verb;
    }
    return null;
  }

  reset(): void {
    this.pity = 0;
  }
}

/** The verb a beat's count step is waiting for, or null. */
export function lessonVerb(beat: string | null, step: number): LessonVerb | null {
  if (beat === 't09' && step === 0) return 'blocked';
  if ((beat === 't10' || beat === 'skirmish') && step === 0) return 'dodged';
  return null;
}
