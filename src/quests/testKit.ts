// Shared fakes for the Act 1 quest tests: a real QuestManager over an in-memory bus and flag store.
import { QuestManager } from './QuestManager';
import type { BusPort, EnemiesPort, InventoryPort, NpcPort, ProgressionPort, StatePort } from './ports';
import type { FavourBand, FavourTrack, FlagValue, QuestDef } from './types';

export class FakeBus implements BusPort {
  handlers = new Map<string, ((p: any) => void)[]>();
  log: { type: string; payload: any }[] = [];
  on(type: string, l: (p: any) => void) {
    const a = this.handlers.get(type) ?? [];
    a.push(l);
    this.handlers.set(type, a);
    return () => { const b = this.handlers.get(type)!; const i = b.indexOf(l); if (i >= 0) b.splice(i, 1); };
  }
  emit(type: string, payload?: unknown) {
    this.log.push({ type, payload });
    for (const l of [...(this.handlers.get(type) ?? [])]) l(payload);
  }
  of(type: string) { return this.log.filter((e) => e.type === type).map((e) => e.payload); }
  listeners(type: string) { return (this.handlers.get(type) ?? []).length; }
}

export function fakeState() {
  const flags = new Map<string, FlagValue>();
  const favour: Record<string, number> = {};
  const state: StatePort = {
    getFlag: (k) => flags.get(k),
    setFlag: (k, v) => { flags.set(k, v); },
    clearFlag: (k) => { flags.delete(k); },
    favourBand: () => 'banked' as FavourBand,
    favour: (t: FavourTrack) => favour[t] ?? 0,
    addFavour: (t, d) => { favour[t] = (favour[t] ?? 0) + d; return favour[t]; },
  };
  return { state, flags, favour };
}

export function makeWorld(defs: QuestDef[] = []) {
  const bus = new FakeBus();
  const { state, flags, favour } = fakeState();
  const warns: string[] = [];
  const gold = { n: 0 };
  const calls: string[] = [];
  const spent: { amount: number; reason?: string }[] = [];
  const inventory: InventoryPort = {
    remove: () => true,
    addGold: (n) => { gold.n += n; },
    get gold() { return gold.n; },
    takeGold: (n, reason) => { const t = Math.min(gold.n, Math.floor(n)); gold.n -= t; spent.push({ amount: t, reason }); return t; },
  };
  const progression: ProgressionPort = {
    grantXp: (n, s) => { calls.push(`xp:${n}:${s}`); },
    grantSkillPoint: (n) => { calls.push(`sp:${n}`); },
    grantAbility: (id, s) => { calls.push(`ability:${id}:${s}`); },
  };
  const npcs: NpcPort & { placed: [string, string][]; missing: Set<string> } = {
    placed: [], missing: new Set(),
    place(id, anchor) { if (this.missing.has(anchor)) return false; this.placed.push([id, anchor]); return true; },
  };
  const enemies: EnemiesPort & { unlocked: string[] } = { unlocked: [], setMercyUnlocked(v) { this.unlocked.push(v); } };
  const inside = new Set<string>();
  const manager = new QuestManager({
    bus, state, playerId: () => 'p', warn: (m) => warns.push(m),
    triggers: { isInside: (t, a) => a === 'p' && inside.has(t) },
    progression: () => progression, inventory: () => inventory, npcs: () => npcs, enemies: () => enemies,
  });
  for (const d of defs) manager.register(d);
  return { bus, state, flags, favour, warns, gold, spent, calls, npcs, enemies, inside, manager };
}
