// K10: fitting, removing and recutting shard-gems at a smith (plans/act3-K10.md section 3). Pure: everything is checked
// before anything is taken, and a failed write rolls back. Events are the caller's.
import type { ClassId } from '../../actors/classes';
import { getItem } from '../../inventory/items';
import type { SocketedShard } from '../shardGems';
import { gemFor, shardGemDef } from './table';
import { SOCKET_TUNING } from './tuning';

export interface SocketInventory {
  has(id: string): boolean;
  count(id: string): number;
  add(id: string, n: number): number;
  remove(id: string, n: number): boolean;
  readonly gold: number;
  takeGold(n: number, reason?: string): number;
  addGold(n: number): void;
  gear(itemId: string): { temper: number };
  socketsOf(itemId: string): SocketedShard[];
  setSockets(itemId: string, shards: readonly SocketedShard[]): boolean;
  capOf(id: string): number;
}

export type SocketRefusal = 'unknown-item' | 'not-held' | 'no-socket' | 'slot-taken' | 'slot-empty' | 'no-gem' | 'no-gold' | 'full' | 'not-a-gem' | 'same' | 'not-allowed';
export type SocketResult = { ok: true; shardId: string } | { ok: false; reason: SocketRefusal };

/** Base slots of a piece: tier 4 rows have one, two at temper +5. Never fewer than the slots already fitted (a temper that falls never orphans a gem). */
export function socketCount(itemId: string, temper: number, fitted: readonly SocketedShard[] = []): number {
  const base = getItem(itemId)?.sockets ?? 0;
  const open = base === 0 ? 0 : temper >= 5 ? 2 : base;
  const highest = fitted.reduce((m, s) => Math.max(m, s.slot + 1), 0);
  return Math.min(2, Math.max(open, highest));
}

export const socketsOpen = (inv: SocketInventory, itemId: string): number => socketCount(itemId, inv.gear(itemId).temper, inv.socketsOf(itemId));

export function fitGem(inv: SocketInventory, itemId: string, slot: number, gemId: string): SocketResult {
  if (!getItem(itemId)) return { ok: false, reason: 'unknown-item' };
  if (!inv.has(itemId)) return { ok: false, reason: 'not-held' };
  if (!shardGemDef(gemId)) return { ok: false, reason: 'not-a-gem' };
  if (!Number.isInteger(slot) || slot < 0 || slot >= socketsOpen(inv, itemId)) return { ok: false, reason: 'no-socket' };
  const now = inv.socketsOf(itemId);
  if (now.some((s) => s.slot === slot)) return { ok: false, reason: 'slot-taken' };
  if (inv.count(gemId) < 1) return { ok: false, reason: 'no-gem' };
  if (inv.gold < SOCKET_TUNING.fitGold) return { ok: false, reason: 'no-gold' };
  inv.takeGold(SOCKET_TUNING.fitGold, 'script');
  inv.remove(gemId, 1);
  if (!inv.setSockets(itemId, [...now, { slot, shardId: gemId }])) {
    inv.add(gemId, 1);
    inv.addGold(SOCKET_TUNING.fitGold);
    return { ok: false, reason: 'no-socket' };
  }
  return { ok: true, shardId: gemId };
}

/** Takes the gem out for gold. Refused, with the gem left fitted, when the bag has no room for it. */
export function removeGem(inv: SocketInventory, itemId: string, slot: number): SocketResult {
  if (!getItem(itemId)) return { ok: false, reason: 'unknown-item' };
  if (!inv.has(itemId)) return { ok: false, reason: 'not-held' };
  const now = inv.socketsOf(itemId);
  const fitted = now.find((s) => s.slot === slot);
  if (!fitted) return { ok: false, reason: 'slot-empty' };
  if (inv.count(fitted.shardId) + 1 > inv.capOf(fitted.shardId)) return { ok: false, reason: 'full' };
  if (inv.gold < SOCKET_TUNING.removeGold) return { ok: false, reason: 'no-gold' };
  if (!inv.setSockets(itemId, now.filter((s) => s.slot !== slot))) return { ok: false, reason: 'not-held' };
  inv.takeGold(SOCKET_TUNING.removeGold, 'script');
  if (inv.add(fitted.shardId, 1) < 1) {
    // Cannot happen after the room check; put it back rather than lose it.
    inv.setSockets(itemId, now);
    inv.addGold(SOCKET_TUNING.removeGold);
    return { ok: false, reason: 'full' };
  }
  return { ok: true, shardId: fitted.shardId };
}

/** Recuts a loose gem into `toId` (its class twin or another class's gem, for a respec) for gold. */
export function recutGem(inv: SocketInventory, fromId: string, toId: string, classId?: ClassId): SocketResult {
  if (!shardGemDef(fromId) || !shardGemDef(toId)) return { ok: false, reason: 'not-a-gem' };
  if (fromId === toId) return { ok: false, reason: 'same' };
  // Only the twin or the current class's matching gem (plan section 3); without a class, only the twin.
  const twin = gemFor(shardGemDef(fromId)!.classId, shardGemDef(fromId)!.variant === 'a' ? 'b' : 'a').id;
  if (toId !== twin && (!classId || toId !== recutTargetFor(fromId, classId))) return { ok: false, reason: 'not-allowed' };
  if (inv.count(fromId) < 1) return { ok: false, reason: 'no-gem' };
  if (inv.count(toId) + 1 > inv.capOf(toId)) return { ok: false, reason: 'full' };
  if (inv.gold < SOCKET_TUNING.recutGold) return { ok: false, reason: 'no-gold' };
  inv.takeGold(SOCKET_TUNING.recutGold, 'script');
  inv.remove(fromId, 1);
  inv.add(toId, 1);
  return { ok: true, shardId: toId };
}

/** The matching gem of `classId` for a gem of another class (same variant), or the twin when the class already matches. */
export function recutTargetFor(gemId: string, classId: ClassId): string | null {
  const d = shardGemDef(gemId);
  if (!d) return null;
  return d.classId === classId ? gemFor(classId, d.variant === 'a' ? 'b' : 'a').id : gemFor(classId, d.variant).id;
}

/** What a socket screen draws for one piece. `dormant` gems belong to another class. */
export interface SocketView {
  itemId: string;
  open: number;
  slots: { slot: number; shardId: string | null; dormant: boolean }[];
}

export function socketView(inv: SocketInventory, itemId: string, classId: ClassId): SocketView {
  const open = socketsOpen(inv, itemId);
  const fitted = inv.socketsOf(itemId);
  const slots = Array.from({ length: open }, (_, slot) => {
    const f = fitted.find((s) => s.slot === slot);
    const def = f ? shardGemDef(f.shardId) : undefined;
    return { slot, shardId: f?.shardId ?? null, dormant: !!f && def?.classId !== classId };
  });
  return { itemId, open, slots };
}
