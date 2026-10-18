import { SHRINE_TUNING } from './tuning';

const T = SHRINE_TUNING.cooled;

export interface CooledPorts {
  addMaxHealthModifier(id: string, fn: () => number): () => void;
  refreshMaxHealth(): void;
  emitApplied(seconds: number): void;
  emitRemoved(): void;
}

export interface CooledSave {
  remaining: number;
  /** Health at save time, so a load that clamps health before the buff returns can restore it. */
  health?: number;
}

/**
 * "Cooled" (design 7.1): +10% max health for 20 minutes of simulated time, applied on each rest.
 * A new rest refreshes the timer and never stacks. It survives death and a save. Progression stays
 * the only writer of max health; this only registers a multiplying modifier.
 */
export class Cooled {
  static readonly key = 'shrine.cooled';
  static readonly version = 1;
  private remaining = 0;
  private dispose: (() => void) | null = null;

  constructor(private readonly ports: CooledPorts) {}

  get active(): boolean {
    return this.remaining > 0;
  }

  secondsLeft(): number {
    return this.remaining;
  }

  apply(): void {
    this.start(T.seconds);
  }

  update(dt: number): void {
    if (this.remaining <= 0 || !(dt > 0)) return;
    this.remaining -= dt;
    if (this.remaining <= 0) this.stop();
  }

  serialize(health?: number): CooledSave | null {
    if (this.remaining <= 0) return null;
    return health !== undefined && Number.isFinite(health) ? { remaining: this.remaining, health } : { remaining: this.remaining };
  }

  /** Returns the saved health, if any, for the caller to restore once every persistable has loaded. */
  load(data: unknown): number | null {
    const d = data as Partial<CooledSave> | null;
    const rem = d?.remaining;
    if (typeof rem !== 'number' || !Number.isFinite(rem) || rem <= 0) {
      if (this.remaining > 0) this.stop();
      return null;
    }
    this.start(Math.min(rem, T.seconds));
    return typeof d?.health === 'number' && Number.isFinite(d.health) ? d.health : null;
  }

  /** Re-announces the running buff (the HUD forgets it across a load). */
  announce(): void {
    if (this.remaining > 0) this.ports.emitApplied(this.remaining);
  }

  private start(seconds: number): void {
    this.remaining = seconds;
    if (!this.dispose) {
      this.dispose = this.ports.addMaxHealthModifier(T.buffId, () => (this.remaining > 0 ? T.multiplier : 1));
    }
    this.ports.refreshMaxHealth();
    this.ports.emitApplied(seconds);
  }

  private stop(): void {
    this.remaining = 0;
    this.dispose?.();
    this.dispose = null;
    this.ports.refreshMaxHealth();
    this.ports.emitRemoved();
  }

  teardown(): void {
    this.dispose?.();
    this.dispose = null;
  }
}
