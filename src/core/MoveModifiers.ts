import type { MoveModifierState } from '../characters/Player';
import type { Action } from '../input/actions';

export interface MoveModifier {
  /** Multiplies with other modifiers; clamped to [0, 1]. */
  speedScale?: number;
  lockMove?: boolean;
  lockFacing?: boolean;
  /** No gravity and no move at all (kneeling, cutscenes, the fast-travel wait). */
  freeze?: boolean;
  /** These actions report nothing while the modifier is active. */
  lockActions?: readonly Action[];
}

/**
 * Restrictions on the player from many systems at once (carrying, drinking, casting, kneeling,
 * cutscenes): speed scales multiply, any lock wins (contracts/game-events-and-flags.md section 3).
 */
export class MoveModifiers {
  private readonly active = new Map<string, MoveModifier>();
  private seq = 0;

  get size(): number {
    return this.active.size;
  }

  /** `source` names the caller for debugging; several modifiers may share it. Returns remove(). */
  add(source: string, mod: MoveModifier): () => void {
    const key = `${source}#${++this.seq}`;
    this.active.set(key, { ...mod, lockActions: mod.lockActions ? [...mod.lockActions] : undefined });
    return () => {
      this.active.delete(key);
    };
  }

  state(): MoveModifierState {
    let speedScale = 1;
    let lockMove = false;
    let lockFacing = false;
    let freeze = false;
    for (const m of this.active.values()) {
      if (m.speedScale !== undefined) {
        speedScale *= Number.isFinite(m.speedScale) ? Math.min(1, Math.max(0, m.speedScale)) : 1;
      }
      lockMove ||= m.lockMove === true;
      lockFacing ||= m.lockFacing === true;
      freeze ||= m.freeze === true;
    }
    return { speedScale, lockMove, lockFacing, freeze };
  }

  isActionLocked(action: Action): boolean {
    for (const m of this.active.values()) if (m.lockActions?.includes(action)) return true;
    return false;
  }

  /** Who is restricting the player now (debugging). */
  sources(): string[] {
    return [...this.active.keys()].map((k) => k.slice(0, k.lastIndexOf('#')));
  }
}
