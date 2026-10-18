// The gold pouch: after the tutorial, a death leaves a share of carried gold at the death spot to be recovered.
import type { Vec3Like } from './types';
import { RESPAWN } from './tuning';

export interface PouchState {
  position: Vec3Like;
  gold: number;
}

const finiteNonNeg = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

export class GoldPouch {
  private state: PouchState | null = null;

  /** Takes floor(share) of carried gold into a pouch at `position`, replacing (and losing) any older pouch. */
  drop(
    position: Vec3Like,
    inventory: { gold: number; takeGold(n: number): number } | undefined,
    tutorialComplete: boolean,
  ): { gold: number } | null {
    if (!tutorialComplete || !inventory) return null;
    const want = Math.floor(Math.max(0, inventory.gold) * RESPAWN.pouchGoldShare);
    if (want <= 0) return null;
    const taken = Math.floor(inventory.takeGold(want));
    if (!(taken > 0)) return null;
    this.state = { position: { x: position.x, y: position.y, z: position.z }, gold: taken };
    return { gold: taken };
  }

  get pouch(): PouchState | null {
    return this.state ? { position: { ...this.state.position }, gold: this.state.gold } : null;
  }

  /** Returns the gold to the inventory and clears the pouch. Without an inventory the pouch stays. */
  recover(inventory: { addGold(n: number): void } | undefined): number {
    if (!this.state || !inventory) return 0;
    const gold = this.state.gold;
    this.state = null;
    inventory.addGold(gold);
    return gold;
  }

  serialize(): unknown {
    return this.state ? { position: { ...this.state.position }, gold: this.state.gold } : null;
  }

  /** Restores from saved data; corrupt data is ignored (the current pouch is left untouched). */
  load(data: unknown): void {
    if (data === null) {
      this.state = null;
      return;
    }
    if (typeof data !== 'object' || data === undefined) return;
    const d = data as { position?: Partial<Vec3Like> | null; gold?: unknown };
    const p = d.position;
    if (!p || typeof p !== 'object') return;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return;
    if (!finiteNonNeg(d.gold)) return;
    const gold = Math.floor(d.gold);
    if (gold <= 0) return;
    this.state = { position: { x: p.x as number, y: p.y as number, z: p.z as number }, gold };
  }
}
