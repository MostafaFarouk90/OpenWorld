import { GUARD } from '../tuning';

export type GuardHit =
  /** The shield takes it: damage and poise are scaled down. */
  | 'blocked'
  /** A heavy chop: it lands in full and the guard breaks. */
  | 'broken'
  /** From behind: the guard is ignored and the hit is stronger. */
  | 'back'
  /** Guard down, or the hit came from outside the shield arc. */
  | 'open';

/**
 * The Charred Footman's guard (design 10 row 2: blocks 50% of the time, a heavy chop breaks the guard,
 * weak to back attacks). Pure: Enemy feeds it the brain state and the rng; the manager's defender
 * modifier asks it what a hit does.
 */
export class Guard {
  private upFlag = false;
  private brokenLeft = 0;
  private rollIn: number;

  constructor(private readonly chance: number = GUARD.chance) {
    this.rollIn = 0;
  }

  get up(): boolean {
    return this.upFlag;
  }

  get broken(): boolean {
    return this.brokenLeft > 0;
  }

  /** `canGuard`: the footman is advancing or recovering, not swinging, staggered or kneeling. */
  step(dt: number, canGuard: boolean, rng: () => number): void {
    if (this.brokenLeft > 0) this.brokenLeft = Math.max(0, this.brokenLeft - dt);
    if (!canGuard || this.brokenLeft > 0) {
      this.upFlag = false;
      this.rollIn = 0;
      return;
    }
    this.rollIn -= dt;
    if (this.rollIn <= 0) {
      this.upFlag = rng() < this.chance;
      this.rollIn = GUARD.rollSeconds;
    }
  }

  /** Puts the shield down at once and keeps it down (a swing starts, or the guard was broken). */
  drop(): void {
    this.upFlag = false;
  }

  break(): void {
    this.upFlag = false;
    this.brokenLeft = GUARD.brokenSeconds;
  }

  /**
   * What a hit does. `heavy` is `isHeavyBlow` of the request, judged before any scaling; `fromDeg` is the angle between
   * the footman's facing and the direction to the attacker (0 in front, 180 behind).
   */
  classify(heavy: boolean, fromDeg: number): GuardHit {
    if (fromDeg >= 180 - GUARD.backDegrees) return 'back';
    if (!this.upFlag || fromDeg > GUARD.arcDegrees) return 'open';
    return heavy ? 'broken' : 'blocked';
  }
}
