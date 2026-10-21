// A companion's own health pool (plans/act2-A5.md sections 1.4 and 8): only A5's code lowers it (Stonehide), the
// companion actor stays unhittable. At 0 he kneels for `kneelSeconds`, then stands at `standFraction`; never a death.

export const VITALS_TUNING = {
  /** Health on standing up after the kneel, as a fraction of max. */
  standFraction: 0.3,
  /** Out of combat, regained per second as a fraction of max. */
  regenPerSecond: 0.02,
} as const;

export type VitalsEdge = 'downed' | 'stood' | null;

export class CompanionVitals {
  private _health: number;
  private kneel = 0;

  constructor(
    readonly maxHealth: number,
    private readonly kneelSeconds: number,
  ) {
    this._health = maxHealth;
  }

  get health(): number {
    return this._health;
  }

  get downed(): boolean {
    return this.kneel > 0;
  }

  /** Seconds of kneeling left (0 when standing). */
  get kneelLeft(): number {
    return this.kneel;
  }

  /** Lowers health; returns 'downed' when this took him to 0. Ignored while downed or for a bad amount. */
  take(amount: number): VitalsEdge {
    if (this.downed || !(amount > 0) || !Number.isFinite(amount)) return null;
    this._health = Math.max(0, this._health - amount);
    if (this._health > 0) return null;
    this.kneel = this.kneelSeconds;
    return 'downed';
  }

  /** Counts the kneel down and regenerates out of combat; returns 'stood' on the tick he gets up. */
  tick(dt: number, inCombat: boolean): VitalsEdge {
    if (!(dt > 0)) return null;
    if (this.kneel > 0) {
      this.kneel = Math.max(0, this.kneel - dt);
      if (this.kneel > 0) return null;
      this._health = this.maxHealth * VITALS_TUNING.standFraction;
      return 'stood';
    }
    if (!inCombat) this._health = Math.min(this.maxHealth, this._health + this.maxHealth * VITALS_TUNING.regenPerSecond * dt);
    return null;
  }

  /** Full health and standing (a load, a respawn, a waystone rest, a wait); 'stood' when this ended a kneel. */
  restore(): VitalsEdge {
    const was = this.downed;
    this.kneel = 0;
    this._health = this.maxHealth;
    return was ? 'stood' : null;
  }
}
