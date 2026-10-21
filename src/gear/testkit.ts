// Test helpers only (imported by *.test.ts).
import { Inventory } from '../inventory/Inventory';
import { AdaptiveBeatClock } from '../shrine/beat';
import './catalog';
import type { GearInventory } from './tempering';

export interface TestInv extends GearInventory {
  raw: Inventory;
  spent: { amount: number; reason?: string }[];
}

export function testInventory(items: Record<string, number> = {}, gold = 0): TestInv {
  const raw = new Inventory({ emit: () => {}, logger: { warn: () => {} } });
  raw.reset({ items, equipped: {} });
  raw.addGold(gold);
  const spent: TestInv['spent'] = [];
  const inv = {
    raw,
    spent,
    count: (id: string) => raw.count(id),
    has: (id: string) => raw.has(id),
    add: (id: string, n: number) => raw.add(id, n),
    remove: (id: string, n: number) => raw.remove(id, n),
    equip: (id: string) => raw.equip(id),
    equipped: (s: Parameters<Inventory['equipped']>[0]) => raw.equipped(s),
    gear: (id: string) => raw.gear(id),
    setTemper: (id: string, l: number, a?: string) => raw.setTemper(id, l, a),
    items: () => raw.items(),
    get gold() {
      return raw.gold;
    },
    takeGold: (n: number, reason?: string) => {
      const taken = raw.takeGold(n);
      if (taken > 0) spent.push({ amount: taken, reason });
      return taken;
    },
  };
  return inv as unknown as TestInv;
}

/** A metronome-only step clock at 94 BPM x 4 starting at t = 0; `STEP` is its step in ms. */
export const STEP = 60000 / 94 / 4;
export function metronome(divisions = 4): AdaptiveBeatClock {
  return new AdaptiveBeatClock({ beat: () => null, toAudioTime: () => undefined, nowMs: () => 0 }, 94, divisions);
}
