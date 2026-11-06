import type { PerkContext, PerkDef, PerksService } from './types';

const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export class Perks implements PerksService {
  private readonly defs = new Map<string, PerkDef>();

  constructor(private readonly warn: (m: string) => void = (m) => console.warn(m)) {}

  register(def: PerkDef): () => void {
    if (this.defs.has(def.id)) throw new Error(`perks: duplicate perk "${def.id}"`);
    this.defs.set(def.id, def);
    return () => {
      if (this.defs.get(def.id) === def) this.defs.delete(def.id);
    };
  }

  private live(): PerkDef[] {
    const out: PerkDef[] = [];
    for (const d of this.defs.values()) {
      try {
        if (d.active()) out.push(d);
      } catch (err) {
        this.warn(`perks: "${d.id}" active() threw (${String(err)}); read as inactive`);
      }
    }
    return out;
  }

  active(): string[] {
    return this.live().map((d) => d.id);
  }

  burnDecayScale(): number {
    let k = 1;
    for (const d of this.live()) {
      const s = d.burnDecayScale?.();
      if (s !== undefined) k *= ok(s) && s >= 0 ? s : 1;
    }
    return k;
  }

  releaseBurnCost(base: number, ctx: PerkContext = {}): number {
    let cost = ok(base) ? base : 0;
    for (const d of this.live()) {
      const c = d.releaseBurnCost?.(base, ctx);
      if (ok(c)) cost = Math.min(cost, c);
    }
    return Math.max(0, cost);
  }
}
