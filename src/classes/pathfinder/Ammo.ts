export interface AmmoPorts {
  /** The item definition exists (thread 6's `crossbow-bolts`); until then shots are free. */
  itemKnown(): boolean;
  count(): number;
  remove(n: number): boolean;
  /** Master bolts (Act 3): the second ammo item, spent first. Both optional; absent means none. */
  masterCount?(): number;
  masterRemove?(n: number): boolean;
}

/** Bolts in the pouch. Without the item definition the class plays unlimited, so it works before thread 6 merges. */
export class Ammo {
  private master = false;

  constructor(private readonly ports: AmmoPorts) {}

  /** Whether the last successful `take()` spent a master bolt (it hits 10% harder). */
  get lastWasMaster(): boolean {
    return this.master;
  }

  private masters(): number {
    return Math.max(0, this.ports.masterCount?.() ?? 0);
  }

  get limited(): boolean {
    return this.ports.itemKnown();
  }

  /** Bolts that can be fired now (Infinity while unlimited). */
  available(): number {
    return this.limited ? Math.max(0, this.ports.count()) + this.masters() : Infinity;
  }

  /** Spends one bolt; false when there is none. */
  take(): boolean {
    this.master = false;
    if (!this.limited) return true;
    if (this.masters() > 0 && this.ports.masterRemove?.(1)) {
      this.master = true;
      return true;
    }
    return this.ports.count() > 0 && this.ports.remove(1);
  }
}
