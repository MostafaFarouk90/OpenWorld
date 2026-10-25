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
import { isShardGemId, type SocketedShard } from '../gear/shardGems';

export interface InventoryDeps {
  emit: EmitterPort['emit'];
  logger?: Logger;
}

export interface InventorySave {
  items: Record<string, number>;
  equipped: Partial<Record<EquipSlot, string>>;
  /** Item ids this build does not know, written back unchanged. */
  unknown: Record<string, unknown>;
  gold: number;
  /** v2: per-item gear instance data, only for items with a temper or an affix. Absent in v1 saves. */
  gear?: Record<string, GearRecord>;
  /** v3: shard-gems set into gear sockets, per item id; written only when non-empty. Absent in v1 and v2 saves. */
  sockets?: Record<string, SocketedShard[]>;
}

/** Per-item instance data (one record per item id). `temper` is 0..5. */
export interface GearRecord {
  temper: number;
  affix?: string;
}

export const MAX_TEMPER = 5;

/** Act 3 (K10, the R15 "Pack Mule Upgrade"): while held, quest-kind stacks of 10 or more hold this many more. */
export const SADDLEBAGS_ID = 'ashmare-saddlebags';
export const SADDLEBAG_BONUS = 10;

/** The stack cap of `def`, with the saddlebags' bonus when `bags` is true. */
export function stackCap(def: { kind: string; stackMax: number }, bags: boolean): number {
  return bags && def.kind === 'quest' && def.stackMax >= 10 ? def.stackMax + SADDLEBAG_BONUS : def.stackMax;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Sockets sorted by slot, or null when an entry is malformed, a slot is not 0 or 1, a slot repeats, or an id is not a shard-gem. */
function cleanSockets(raw: readonly unknown[]): SocketedShard[] | null {
  const out: SocketedShard[] = [];
  for (const e of raw) {
    if (!isRecord(e) || (e.slot !== 0 && e.slot !== 1) || !isShardGemId(e.shardId)) return null;
    if (out.some((o) => o.slot === e.slot)) return null;
    out.push({ slot: e.slot, shardId: e.shardId });
  }
  return out.sort((a, b) => a.slot - b.slot);
}

function wholeCount(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Owned items and equipment slots. Pure state: no world access. */
export class Inventory implements Omit<InventoryService, 'use'> {
  static readonly key = 'inventory';
  /** v2 adds gear instance data (temper, affix); v3 adds shard-gem sockets. v1 and v2 saves load as before, with no sockets. */
  static readonly version = 3;

  private readonly counts = new Map<string, number>();
  private readonly slots = new Map<EquipSlot, string>();
  private unknown: Record<string, unknown> = {};
  private goldAmount = 0;
  private readonly gearData = new Map<string, GearRecord>();
  private readonly socketData = new Map<string, SocketedShard[]>();
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
    const added = Math.min(want, Math.max(0, this.capOf(id) - have));
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
      this.gearData.delete(id);
      // v0.7: an item no longer owned keeps no sockets (a bought copy starts empty). K10: its shard-gems go back to the
      // bag rather than vanish (callers check room first; `gemRoomFor`).
      const gems = this.socketData.get(id);
      if (gems) {
        this.socketData.delete(id);
        for (const g of gems) {
          if (this.add(g.shardId, 1) >= 1) continue;
          // No room: keep it aside with the unknown ids; the next load adds it back to the stack (what fits; the rest stays aside).
          const prev = this.unknown[g.shardId];
          this.unknown[g.shardId] = (typeof prev === 'number' ? prev : 0) + 1;
          this.logger.warn(`inventory: no room to return ${g.shardId} from ${id}; kept for the next load`);
        }
      }
    }
    this.emit('inventory.changed', { itemId: id, count: left });
    return true;
  }

  /** The stack cap of an item now (the saddlebags raise material caps while held); 0 for an unknown id. */
  capOf(id: string): number {
    const def = getItem(id);
    return def ? stackCap(def, this.has(SADDLEBAGS_ID)) : 0;
  }

  /** Whether every gem socketed in `itemId` would fit back in the bag if the piece left. */
  gemRoomFor(itemId: string): boolean {
    const need = new Map<string, number>();
    for (const g of this.socketData.get(itemId) ?? []) need.set(g.shardId, (need.get(g.shardId) ?? 0) + 1);
    for (const [gem, n] of need) if (this.count(gem) + n > this.capOf(gem)) return false;
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

  /** The gear record of an item; temper 0 when it has none. */
  gear(itemId: string): GearRecord {
    const g = this.gearData.get(itemId);
    return g ? { ...g } : { temper: 0 };
  }

  /**
   * Sets an item's temper (clamped 0..5, whole) and affix. Refused (false) for unknown or unheld items.
   * Silent: the caller (A10) emits `gear.tempered`. An omitted affix leaves the current one; `undefined` cannot clear it.
   */
  setTemper(itemId: string, level: number, affix?: string): boolean {
    if (!getItem(itemId) || !this.has(itemId) || !Number.isFinite(level)) return false;
    const temper = Math.min(MAX_TEMPER, Math.max(0, Math.floor(level)));
    const next: GearRecord = { temper };
    const keep = affix ?? this.gearData.get(itemId)?.affix;
    if (keep) next.affix = keep;
    if (temper === 0 && !next.affix) this.gearData.delete(itemId);
    else this.gearData.set(itemId, next);
    return true;
  }

  items(): readonly { id: string; count: number }[] {
    return [...this.counts].map(([id, count]) => ({ id, count }));
  }

  get gold(): number {
    return this.goldAmount;
  }

  addGold(n: number): void {
    if (Number.isFinite(n) && n > 0) this.goldAmount += Math.floor(n);
  }

  /** Takes up to n gold and returns what was taken. */
  takeGold(n: number): number {
    if (!Number.isFinite(n) || n <= 0) return 0;
    const taken = Math.min(this.goldAmount, Math.floor(n));
    this.goldAmount -= taken;
    return taken;
  }

  /** The shard-gems set into `itemId` (a copy, sorted by slot). */
  socketsOf(itemId: string): SocketedShard[] {
    return (this.socketData.get(itemId) ?? []).map((s) => ({ ...s }));
  }

  /** Replaces the sockets of an owned item; an empty list clears them. Returns false (and changes nothing) for an unowned item or a bad entry. Events are the caller's. */
  setSockets(itemId: string, shards: readonly SocketedShard[]): boolean {
    if (!this.has(itemId)) return false;
    const clean = cleanSockets(shards);
    if (!clean) return false;
    if (clean.length === 0) this.socketData.delete(itemId);
    else this.socketData.set(itemId, clean);
    return true;
  }

  reset(kit: InventoryKit): void {
    this.gearData.clear();
    this.socketData.clear();
    this.apply(kit.items, kit.equipped, {});
  }

  serialize(): InventorySave {
    const equipped: Partial<Record<EquipSlot, string>> = {};
    for (const [slot, id] of this.slots) equipped[slot] = id;
    const gear: Record<string, GearRecord> = {};
    for (const [id, g] of this.gearData) gear[id] = { ...g };
    const save: InventorySave = { items: Object.fromEntries(this.counts), equipped, unknown: { ...this.unknown }, gold: this.goldAmount };
    if (this.gearData.size > 0) save.gear = gear;
    if (this.socketData.size > 0) save.sockets = Object.fromEntries([...this.socketData].map(([id, l]) => [id, l.map((s) => ({ ...s }))]));
    return save;
  }

  load(data: unknown, version: number): void {
    if (version !== 1 && version !== 2 && version !== Inventory.version) {
      this.logger.warn(`inventory: unsupported save version ${version}, using defaults`);
      this.goldAmount = 0;
      return this.reset(NEW_GAME_KIT);
    }
    if (!isRecord(data) || !isRecord(data.items) || (data.equipped !== undefined && !isRecord(data.equipped))) {
      this.logger.warn('inventory: corrupt save, using defaults');
      this.goldAmount = 0;
      return this.reset(NEW_GAME_KIT);
    }
    const items: Record<string, number> = {};
    const unknown: Record<string, unknown> = {};
    // Ids a previous build kept aside may be known now: they rejoin the items, which win on a clash. K10: a shard-gem
    // kept aside (no room when its piece left, `remove`) adds to the stack instead, and what still does not fit stays aside.
    const asideGems: Record<string, number> = {};
    for (const src of [isRecord(data.unknown) ? data.unknown : {}, data.items]) {
      for (const [id, raw] of Object.entries(src)) {
        if (!getItem(id)) unknown[id] = raw;
        else if (typeof raw === 'number') {
          if (src === data.unknown && isShardGemId(id)) asideGems[id] = wholeCount(raw);
          else items[id] = raw + (asideGems[id] ?? 0);
        }
      }
    }
    for (const [id, n] of Object.entries(asideGems)) if (items[id] === undefined) items[id] = n;
    const equipped = (data.equipped ?? {}) as Record<string, unknown>;
    this.goldAmount = typeof data.gold === 'number' && Number.isFinite(data.gold) && data.gold > 0 ? Math.floor(data.gold) : 0;
    this.apply(items, equipped, unknown);
    for (const id of Object.keys(asideGems)) {
      const over = wholeCount(items[id]) - this.count(id);
      if (over > 0) this.unknown[id] = over;
    }
    // v1 has no gear records; a malformed v2 record is dropped, not fatal.
    this.gearData.clear();
    if (version >= 2 && isRecord(data.gear)) {
      for (const [id, raw] of Object.entries(data.gear)) {
        if (!this.has(id) || !isRecord(raw) || typeof raw.temper !== 'number' || !Number.isFinite(raw.temper)) {
          this.logger.warn(`inventory: dropped bad gear record "${id}"`);
          continue;
        }
        const temper = Math.min(MAX_TEMPER, Math.max(0, Math.floor(raw.temper)));
        const rec: GearRecord = { temper };
        if (typeof raw.affix === 'string' && raw.affix) rec.affix = raw.affix;
        if (temper > 0 || rec.affix) this.gearData.set(id, rec);
      }
    }
    // v1 and v2 have no sockets; a malformed v3 entry is dropped, not fatal.
    this.socketData.clear();
    if (version >= 3 && isRecord(data.sockets)) {
      for (const [id, raw] of Object.entries(data.sockets)) {
        const clean = this.has(id) && Array.isArray(raw) ? cleanSockets(raw) : null;
        if (!clean) { this.logger.warn(`inventory: dropped bad socket record "${id}"`); continue; }
        if (clean.length > 0) this.socketData.set(id, clean);
      }
    }
  }

  /** Replaces all state from untrusted input, sanitising it, and emits what changed. */
  private apply(rawItems: Record<string, number>, rawEquipped: Record<string, unknown>, unknown: Record<string, unknown>): void {
    const before = new Map(this.counts);
    const beforeSlots = new Map(this.slots);
    this.counts.clear();
    this.slots.clear();
    this.unknown = unknown;
    // Bag-aware clamp: a save made with the saddlebags keeps every material it held.
    const bags = wholeCount(rawItems[SADDLEBAGS_ID] ?? 0) > 0 && !!getItem(SADDLEBAGS_ID);
    for (const [id, raw] of Object.entries(rawItems)) {
      const def = getItem(id);
      if (!def) {
        this.unknown[id] = raw;
        continue;
      }
      const n = Math.min(wholeCount(raw), stackCap(def, bags));
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
