// Per-tick target choice for enemies. The default target is the player; an actor that registers here as a taunter (the Iron
// Familiar) draws every enemy in its radius for `seconds`, nearest first, then the enemies go back to the player. With nothing
// registered `pick` returns null and the enemy code takes exactly the path it always did.
import type { ActorId } from '../actors/Actor';

export interface TauntFeet {
  x: number;
  y: number;
  z: number;
}

export interface TauntSource {
  id: ActorId;
  /** Where the taunter stands; null reads as gone. */
  position(): TauntFeet | null;
  alive(): boolean;
  /** Horizontal metres within which an enemy takes the bait. */
  radius: number;
  /** How long the taunt lasts from registration. */
  seconds: number;
}

export interface TauntPick {
  id: ActorId;
  feet: TauntFeet;
}

export interface TauntService {
  /** Registers (or replaces) a taunter; the returned function removes it. */
  register(source: TauntSource): () => void;
}

interface Entry extends TauntSource {
  left: number;
}

export class TauntRegistry implements TauntService {
  private readonly entries = new Map<ActorId, Entry>();

  register(source: TauntSource): () => void {
    if (!(source.radius > 0) || !(source.seconds > 0)) return () => {};
    const entry: Entry = { ...source, left: source.seconds };
    this.entries.set(source.id, entry);
    return () => {
      if (this.entries.get(source.id) === entry) this.entries.delete(source.id);
    };
  }

  get size(): number {
    return this.entries.size;
  }

  /** Counts the taunt durations down; drops expired and dead taunters. */
  update(dt: number): void {
    if (this.entries.size === 0) return;
    for (const [id, e] of this.entries) {
      e.left -= dt;
      if (e.left <= 0 || !e.alive()) this.entries.delete(id);
    }
  }

  /** The nearest live taunter whose radius reaches `from` (horizontal), or null. Allocates only when one is found. */
  pick(from: { x: number; z: number }): TauntPick | null {
    if (this.entries.size === 0) return null;
    let best: TauntPick | null = null;
    let bestD = Infinity;
    for (const e of this.entries.values()) {
      if (e.left <= 0 || !e.alive()) continue;
      const at = e.position();
      if (!at) continue;
      const d = Math.hypot(at.x - from.x, at.z - from.z);
      if (d <= e.radius && d < bestD) {
        bestD = d;
        best = { id: e.id, feet: at };
      }
    }
    return best;
  }
}
