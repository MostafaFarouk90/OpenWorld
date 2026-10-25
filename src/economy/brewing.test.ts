import { describe, expect, it } from 'vitest';
import { brewFenSalve, type BrewPorts } from './brewing';

function make(held: Record<string, number>, gold = 100, stackMax = 5) {
  const items = new Map(Object.entries(held));
  const w = { gold };
  const ports: BrewPorts = {
    count: (id) => items.get(id) ?? 0,
    stackMax: () => stackMax,
    gold: () => w.gold,
    takeGold: (n) => ((w.gold -= n), n),
    remove: (id, n) => {
      if ((items.get(id) ?? 0) < n) return false;
      items.set(id, (items.get(id) ?? 0) - n);
      return true;
    },
    grant: (id, n) => void items.set(id, (items.get(id) ?? 0) + n),
  };
  return { ports, items, w };
}
const FULL = { 'fen-salve-recipe': 1, 'bog-myrtle': 1, sundew: 1, 'mire-lily': 1 };

describe('brewFenSalve', () => {
  it('spends one of each herb and 15 gold and makes one salve', () => {
    const t = make({ ...FULL, 'bog-myrtle': 3 });
    expect(brewFenSalve(t.ports)).toEqual({ ok: true });
    expect([t.items.get('bog-myrtle'), t.items.get('sundew'), t.items.get('mire-lily'), t.items.get('fen-salve')]).toEqual([2, 0, 0, 1]);
    expect(t.items.get('fen-salve-recipe')).toBe(1);
    expect(t.w.gold).toBe(85);
  });
  it('refuses without the recipe, taking nothing', () => {
    const t = make({ ...FULL, 'fen-salve-recipe': 0 });
    expect(brewFenSalve(t.ports)).toEqual({ ok: false, reason: 'no-recipe' });
    expect(t.w.gold).toBe(100);
    expect(t.items.get('sundew')).toBe(1);
  });
  it.each(['bog-myrtle', 'sundew', 'mire-lily'])('refuses without %s, taking nothing', (herb) => {
    const t = make({ ...FULL, [herb]: 0 });
    expect(brewFenSalve(t.ports)).toEqual({ ok: false, reason: 'no-herbs' });
    expect(t.w.gold).toBe(100);
    expect(t.items.get('fen-salve') ?? 0).toBe(0);
    expect([t.items.get('bog-myrtle'), t.items.get('sundew'), t.items.get('mire-lily')].reduce((a, b) => a! + b!, 0)).toBe(2);
  });
  it('refuses at 14 gold and brews at 15', () => {
    const t = make(FULL, 14);
    expect(brewFenSalve(t.ports)).toEqual({ ok: false, reason: 'no-gold' });
    expect(t.items.get('sundew')).toBe(1);
    const u = make(FULL, 15);
    expect(brewFenSalve(u.ports)).toEqual({ ok: true });
    expect(u.w.gold).toBe(0);
  });
  it('refuses a full salve stack, taking nothing', () => {
    const t = make({ ...FULL, 'fen-salve': 5 });
    expect(brewFenSalve(t.ports)).toEqual({ ok: false, reason: 'no-room' });
    expect(t.w.gold).toBe(100);
    expect(t.items.get('mire-lily')).toBe(1);
    expect(t.items.get('fen-salve')).toBe(5);
  });
});
