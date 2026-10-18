import { STAMINA } from './tuning';
import type { ActorLike } from './types';

type StaminaActor = Pick<ActorLike, 'stamina' | 'maxStamina' | 'spendStamina' | 'restoreStamina'>;

const TICKS_PER_SECOND = 60;
const EPSILON = 1e-9;

/** Stamina rules over an actor: spend, regeneration delay, exhaustion and sprint drain. */
export class Stamina {
  private delay = 0;
  private empty = false;

  constructor(
    private readonly actor: StaminaActor,
    private readonly isInfinite: () => boolean,
  ) {}

  get exhausted(): boolean {
    return this.empty;
  }

  get current(): number {
    return this.actor.stamina;
  }

  canAfford(n: number): boolean {
    if (!(n > 0) || this.isInfinite()) return true;
    return !this.empty && this.actor.stamina >= n;
  }

  /** Spends `n` if the Knight can afford it; a non-positive or NaN cost is a free success. */
  spend(n: number): boolean {
    if (!(n > 0) || this.isInfinite()) return true;
    if (this.empty || !this.actor.spendStamina(n)) return false;
    this.delay = STAMINA.regenDelayTicks;
    this.markEmpty();
    return true;
  }

  /** Takes up to `n` stamina without refusing (guard break); clamps at 0. */
  forceDrain(n: number): void {
    if (!(n > 0) || this.isInfinite()) return;
    this.actor.stamina = Math.max(0, this.actor.stamina - n);
    this.delay = STAMINA.regenDelayTicks;
    this.markEmpty();
  }

  /** Advance one fixed tick. */
  tick(opts: { blocking: boolean; sprinting: boolean }): void {
    if (opts.sprinting && !this.empty && !this.isInfinite() && this.actor.stamina > 0) {
      const left = this.actor.stamina - STAMINA.sprintPerSecond / TICKS_PER_SECOND;
      this.actor.stamina = left < EPSILON ? 0 : left;
      this.delay = STAMINA.regenDelayTicks;
      this.markEmpty();
    }
    if (this.delay > 0) {
      this.delay--;
    } else {
      const rate = (STAMINA.regenPerSecond / TICKS_PER_SECOND) * (opts.blocking ? STAMINA.blockRegenScale : 1);
      const gain = Math.min(rate, this.actor.maxStamina - this.actor.stamina);
      if (gain > 0) this.actor.restoreStamina(gain);
    }
    if (this.empty && this.actor.stamina >= STAMINA.exhaustRecover) this.empty = false;
  }

  private markEmpty(): void {
    if (this.actor.stamina <= 0) this.empty = true;
  }
}
