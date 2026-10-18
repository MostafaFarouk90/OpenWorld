/**
 * `save.suspend(reason)` holds (game-events-and-flags.md section 7, v0.5). While any hold is active, saving is
 * unsafe: requests defer and the exit snapshot keeps the last safe state. Stealth and the chase hold one; the
 * mount does not.
 */
export class SaveSuspensions {
  private readonly holds: { reason: string }[] = [];

  /** `onReleasedAll` runs when the last hold is released (the plugin runs the deferred save there). */
  constructor(private readonly onReleasedAll: () => void = () => {}) {}

  /** Adds a hold; the returned release is idempotent. */
  suspend(reason: string): () => void {
    if (typeof reason !== 'string' || reason === '') throw new Error('save.suspend: reason must be a non-empty string');
    const hold = { reason };
    this.holds.push(hold);
    return () => {
      const i = this.holds.indexOf(hold);
      if (i < 0) return;
      this.holds.splice(i, 1);
      if (this.holds.length === 0) this.onReleasedAll();
    };
  }

  get active(): boolean {
    return this.holds.length > 0;
  }

  /** The oldest active hold's reason, for the deferral log (`suspended:<reason>`). */
  get reason(): string | null {
    return this.holds[0]?.reason ?? null;
  }

  /** Drops every hold without running the callback (plugin teardown). */
  clear(): void {
    this.holds.length = 0;
  }
}
