export interface AmmoPorts {
  /** The item definition exists (thread 6's `crossbow-bolts`); until then shots are free. */
  itemKnown(): boolean;
  count(): number;
  remove(n: number): boolean;
}

/** Bolts in the pouch. Without the item definition the class plays unlimited, so it works before thread 6 merges. */
export class Ammo {
  constructor(private readonly ports: AmmoPorts) {}

  get limited(): boolean {
    return this.ports.itemKnown();
  }

  /** Bolts that can be fired now (Infinity while unlimited). */
  available(): number {
    return this.limited ? Math.max(0, this.ports.count()) : Infinity;
  }

  /** Spends one bolt; false when there is none. */
  take(): boolean {
    if (!this.limited) return true;
    return this.ports.count() > 0 && this.ports.remove(1);
  }
}
