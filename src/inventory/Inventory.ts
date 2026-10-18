import {
  EQUIP_SLOTS,
  consoleLogger,
  type EmitterPort,
  type EquipResult,
  type EquipSlot,
  type InventoryKit,
  type InventoryService,
  type Logger,
} from '../hud/ports';
import { NEW_GAME_KIT, getItem } from './items';

export interface InventoryDeps {
  emit: EmitterPort['emit'];
  logger?: Logger;
}

export interface InventorySave {
  items: Record<string, number>;
  equipped: Partial<Record<EquipSlot, string>>;
  /** Item ids this build does not know, written back unchanged. */
  unknown: Record<string, unknown>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function wholeCount(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Owned items and equipment slots. Pure state: no world access. */
export class Inventory implements Omit<InventoryService, 'use'> {
  static readonly key = 'inventory';
  static readonly version = 1;

  private readonly counts = new Map<string, number>();
  private readonly slots = new Map<EquipSlot, string>();
  private unknown: Record<string, unknown> = {};
  private readonly emit: EmitterPort['emit'];
  private readonly logger: Logger;

  constructor(deps: InventoryDeps) {
    this.emit = deps.emit;
    this.logger = deps.logger ?? consoleLogger;
  }

  count(id: string): number {
    return this.counts.get(id) ?? 0;
  }

  has(id: string): boolean {
    return this.count(id) > 0;
  }

  /** Returns the amount actually added. */
  add(id: string, n: number): number {
    const def = getItem(id);
    if (!def) {
      this.logger.warn(`inventory: unknown item "${id}"`);
      return 0;
    }
    const want = wholeCount(n);
    const have = this.count(id);
    const added = Math.min(want, Math.max(0, def.stackMax - have));
    if (added <= 0) return 0;
    this.counts.set(id, have + added);
    this.emit('inventory.changed', { itemId: id, count: have + added });
    return added;
  }

  remove(id: string, n: number): boolean {
    const want = wholeCount(n);
    const have = this.count(id);
    if (want <= 0 || have < want) return false;
    const left = have - want;
    if (left > 0) this.counts.set(id, left);
    else {
      this.counts.delete(id);
      for (const slot of EQUIP_SLOTS) if (this.slots.get(slot) === id) this.setSlot(slot, null);
    }
    this.emit('inventory.changed', { itemId: id, count: left });
    return true;
  }

  equip(id: string): EquipResult {
    const def = getItem(id);
    if (!def) return { ok: false, reason: 'unknown-item' };
    if (!def.slot) return { ok: false, reason: 'not-equippable' };
    if (!this.has(id)) return { ok: false, reason: 'not-owned' };
    const previous = this.slots.get(def.slot);
    if (previous === id) return { ok: true };
    this.setSlot(def.slot, id);
    return previous ? { ok: true, replaced: previous } : { ok: true };
  }

  unequip(slot: EquipSlot): boolean {
    if (!this.slots.has(slot)) return false;
    this.setSlot(slot, null);
    return true;
  }

  equipped(slot: EquipSlot): string | null {
    return this.slots.get(slot) ?? null;
  }

  equippedStat(stat: 'attack' | 'defense'): number {
    let sum = 0;
    for (const id of this.slots.values()) sum += getItem(id)?.stats?.[stat] ?? 0;
    return sum;
  }

  items(): readonly { id: string; count: number }[] {
    return [...this.counts].map(([id, count]) => ({ id, count }));
  }

  reset(kit: InventoryKit): void {
    this.apply(kit.items, kit.equipped, {});
  }

  serialize(): InventorySave {
    const equipped: Partial<Record<EquipSlot, string>> = {};
    for (const [slot, id] of this.slots) equipped[slot] = id;
    return { items: Object.fromEntries(this.counts), equipped, unknown: { ...this.unknown } };
  }

  load(data: unknown, version: number): void {
    if (version !== Inventory.version) {
      this.logger.warn(`inventory: unsupported save version ${version}, using defaults`);
      return this.reset(NEW_GAME_KIT);
    }
    if (!isRecord(data) || !isRecord(data.items) || (data.equipped !== undefined && !isRecord(data.equipped))) {
      this.logger.warn('inventory: corrupt save, using defaults');
      return this.reset(NEW_GAME_KIT);
    }
    const items: Record<string, number> = {};
    const unknown: Record<string, unknown> = {};
    // Ids a previous build kept aside may be known now: they rejoin the items, which win on a clash.
    for (const src of [isRecord(data.unknown) ? data.unknown : {}, data.items]) {
      for (const [id, raw] of Object.entries(src)) {
        if (!getItem(id)) unknown[id] = raw;
        else if (typeof raw === 'number') items[id] = raw;
      }
    }
    const equipped = (data.equipped ?? {}) as Record<string, unknown>;
    this.apply(items, equipped, unknown);
  }

  /** Replaces all state from untrusted input, sanitising it, and emits what changed. */
  private apply(rawItems: Record<string, number>, rawEquipped: Record<string, unknown>, unknown: Record<string, unknown>): void {
    const before = new Map(this.counts);
    const beforeSlots = new Map(this.slots);
    this.counts.clear();
    this.slots.clear();
    this.unknown = unknown;
    for (const [id, raw] of Object.entries(rawItems)) {
      const def = getItem(id);
      if (!def) {
        this.unknown[id] = raw;
        continue;
      }
      const n = Math.min(wholeCount(raw), def.stackMax);
      if (n > 0) this.counts.set(id, n);
    }
    for (const slot of EQUIP_SLOTS) {
      const id = rawEquipped[slot];
      if (id === undefined || id === null) continue;
      const def = typeof id === 'string' ? getItem(id) : undefined;
      if (!def || def.slot !== slot) this.logger.warn(`inventory: cannot equip ${String(id)} in ${slot}, skipped`);
      else if (!this.has(def.id)) this.logger.warn(`inventory: equipped ${def.id} is not owned, unequipped`);
      else this.slots.set(slot, def.id);
    }
    for (const id of new Set([...before.keys(), ...this.counts.keys()])) {
      if (before.get(id) !== this.counts.get(id)) this.emit('inventory.changed', { itemId: id, count: this.count(id) });
    }
    for (const slot of EQUIP_SLOTS) {
      const prev = beforeSlots.get(slot) ?? null;
      const now = this.slots.get(slot) ?? null;
      if (prev !== now) this.emit('inventory.equipped', { slot, itemId: now, previous: prev });
    }
  }

  private setSlot(slot: EquipSlot, itemId: string | null): void {
    const previous = this.slots.get(slot) ?? null;
    if (itemId === null) this.slots.delete(slot);
    else this.slots.set(slot, itemId);
    this.emit('inventory.equipped', { slot, itemId, previous });
  }
}
