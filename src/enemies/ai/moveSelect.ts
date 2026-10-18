import type { MoveDef } from '../types';

/** Small seeded PRNG, 0 <= x < 1. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Per-enemy move choice with cooldowns tracked by move id. */
export class MoveSelector {
  private readonly cooldowns = new Map<string, number>();

  tick(dt: number): void {
    if (!(dt > 0)) return;
    for (const [id, left] of this.cooldowns) {
      const n = left - dt;
      if (n <= 0) this.cooldowns.delete(id);
      else this.cooldowns.set(id, n);
    }
  }

  /** Start the move's cooldown (its own `cooldown` seconds). */
  markUsed(id: string, moves?: readonly MoveDef[], cooldown?: number): void {
    const cd = cooldown ?? moves?.find((m) => m.id === id)?.cooldown ?? 0;
    if (cd > 0) this.cooldowns.set(id, cd);
  }

  onCooldown(id: string): boolean {
    return (this.cooldowns.get(id) ?? 0) > 0;
  }

  /**
   * Weighted pick among moves in range and off cooldown. With a non-empty `filter` only those ids are
   * eligible and weight 0 counts as 1; without one weight 0 is never picked. An empty filter means none.
   */
  pick(
    moves: readonly MoveDef[],
    distance: number,
    rng: () => number,
    filter?: readonly string[],
  ): MoveDef | null {
    if (!Number.isFinite(distance)) return null;
    const useFilter = filter !== undefined && filter.length > 0;
    const pool: { move: MoveDef; w: number }[] = [];
    for (const m of moves) {
      if (useFilter && !filter.includes(m.id)) continue;
      if (distance < m.range[0] || distance > m.range[1]) continue;
      if (this.onCooldown(m.id)) continue;
      const w = useFilter ? Math.max(1, m.weight) : m.weight;
      if (!(w > 0)) continue;
      pool.push({ move: m, w });
    }
    if (pool.length === 0) return null;
    const total = pool.reduce((s, p) => s + p.w, 0);
    let r = Math.min(0.999999999, Math.max(0, rng())) * total;
    for (const p of pool) {
      r -= p.w;
      if (r < 0) return p.move;
    }
    return pool[pool.length - 1]!.move;
  }
}
