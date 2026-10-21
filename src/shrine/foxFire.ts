export const FOX_FIRE = {
  buffId: 'shrine.fox-fire',
  nameKey: 'shrine.foxFire',
  /** Design 7.9: 30 minutes of simulated time. */
  seconds: 30 * 60,
  /** Hidden chests within this many metres show while it burns. */
  radius: 20,
  /** The mirror flag A2's chests read; this class is its only writer. */
  flag: 'buff.foxFire.active',
  saveKey: 'shrine.foxFire',
} as const;

export interface FoxFirePorts {
  setActiveFlag(on: boolean): void;
  emitApplied(seconds: number): void;
  emitRemoved(): void;
}

/** "Fox-Fire": a timed buff that never stacks; a new apply refreshes to the full duration. Survives death and saves. */
export class FoxFire {
  static readonly key = FOX_FIRE.saveKey;
  static readonly version = 1;
  readonly radius = FOX_FIRE.radius;
  private remaining = 0;

  constructor(private readonly ports: FoxFirePorts) {}

  active(): boolean {
    return this.remaining > 0;
  }

  secondsLeft(): number {
    return this.remaining;
  }

  apply(): void {
    this.remaining = Math.max(this.remaining, FOX_FIRE.seconds);
    this.ports.setActiveFlag(true);
    this.ports.emitApplied(this.remaining);
  }

  update(dt: number): void {
    if (this.remaining <= 0 || !(dt > 0)) return;
    this.remaining -= dt;
    if (this.remaining <= 0) this.stop();
  }

  serialize(): { remaining: number } | null {
    return this.remaining > 0 ? { remaining: this.remaining } : null;
  }

  /** A save with no entry (null) clears the buff. */
  load(data: unknown): void {
    const rem = (data as { remaining?: unknown } | null)?.remaining;
    if (typeof rem !== 'number' || !Number.isFinite(rem) || rem <= 0) {
      if (this.remaining > 0) this.stop();
      else this.ports.setActiveFlag(false);
      return;
    }
    this.remaining = Math.min(rem, FOX_FIRE.seconds);
    this.ports.setActiveFlag(true);
  }

  /** Re-announces a running buff (the HUD forgets it across a load). */
  announce(): void {
    if (this.remaining > 0) this.ports.emitApplied(this.remaining);
  }

  private stop(): void {
    this.remaining = 0;
    this.ports.setActiveFlag(false);
    this.ports.emitRemoved();
  }
}
