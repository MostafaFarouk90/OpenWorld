import type { ActorPort, EmitterPort, UseResult } from '../hud/ports';
import type { Inventory } from './Inventory';
import { getItem } from './items';

export interface ConsumableEnv {
  actor: () => ActorPort | null;
  /** Heals the player and returns the health actually added (clamped to max). */
  heal(amount: number): number;
  emit: EmitterPort['emit'];
}

export interface ConsumableDeps {
  inventory: Inventory;
  env: ConsumableEnv;
}

const DEFAULT_DRINK_SECONDS = 1;

/** Timed use of healing consumables: the charge is spent when the drink finishes, not when it starts. */
export class ConsumableUser {
  private current: { itemId: string; remaining: number } | null = null;

  constructor(private readonly deps: ConsumableDeps) {}

  get drinking(): { itemId: string; remaining: number } | null {
    return this.current ? { ...this.current } : null;
  }

  /** Seconds of input lock left from the current drink. */
  get lockSeconds(): number {
    return this.current ? Math.max(0, this.current.remaining) : 0;
  }

  begin(id: string): UseResult {
    const { inventory, env } = this.deps;
    const def = getItem(id);
    if (!def) return { ok: false, reason: 'unknown-item' };
    if (!inventory.has(id)) return { ok: false, reason: 'not-owned' };
    if (!def.use) return { ok: false, reason: 'not-usable' };
    const actor = env.actor();
    if (!actor || actor.dead) return { ok: false, reason: 'dead' };
    if (this.current) return { ok: false, reason: 'busy' };
    if (inventory.count(id) < 1) return { ok: false, reason: 'no-charges' };
    if (actor.health >= actor.maxHealth && !def.use.noHeal) return { ok: false, reason: 'full-health' };
    this.current = { itemId: id, remaining: def.use.drinkSeconds ?? DEFAULT_DRINK_SECONDS };
    return { ok: true, healed: 0 };
  }

  update(dt: number): void {
    const cur = this.current;
    if (!cur) return;
    const { inventory, env } = this.deps;
    const actor = env.actor();
    if (!actor || actor.dead) return this.cancel();
    cur.remaining -= dt;
    if (cur.remaining > 0) return;
    this.current = null;
    const use = getItem(cur.itemId)?.use;
    if (!use || !inventory.remove(cur.itemId, 1)) return;
    const amount = (use.healFlat ?? 0) + (use.healFraction ?? 0) * actor.maxHealth;
    if (amount > 0) env.heal(amount);
    env.emit('item.used', { itemId: cur.itemId });
  }

  /** Keeps the charge. */
  cancel(): void {
    this.current = null;
  }
}
