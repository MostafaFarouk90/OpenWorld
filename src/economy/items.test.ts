import { describe, expect, it, vi } from 'vitest';
import { Inventory } from '../inventory/Inventory';
import { getItem, registerItems } from '../inventory/items';
import { ECONOMY_ITEMS } from './items';
import { ECONOMY_STRINGS_EN } from './strings.en';
import { listPrice, sellPrice } from './prices';

describe('registered economy items', () => {
  it('are visible to getItem at module scope and carry a list price', () => {
    for (const d of ECONOMY_ITEMS) {
      expect(getItem(d.id)).toBe(d);
      expect(listPrice(d.id)).toBeGreaterThan(0);
      expect(sellPrice(d.id)).toBeGreaterThan(0);
      expect(ECONOMY_STRINGS_EN[d.nameKey]).toBeTruthy();
      expect(ECONOMY_STRINGS_EN[d.descKey]).toBeTruthy();
    }
  });

  it('refuse a duplicate id', () => {
    expect(() => registerItems([ECONOMY_ITEMS[0]])).toThrow(/duplicate/);
    expect(() => registerItems([{ ...getItem('healing-flask')! }])).toThrow(/duplicate/);
  });

  it('survive a save and reload (the inventory does not stash them as unknown)', () => {
    const warn = vi.fn();
    const inv = new Inventory({ emit: () => {}, logger: { warn } });
    inv.reset({ items: {}, equipped: {} });
    inv.add('marshals-longsword', 1);
    inv.equip('marshals-longsword');
    const saved = JSON.parse(JSON.stringify(inv.serialize()));
    const other = new Inventory({ emit: () => {}, logger: { warn } });
    other.load(saved, Inventory.version);
    expect(other.count('marshals-longsword')).toBe(1);
    expect(other.equipped('weapon')).toBe('marshals-longsword');
    expect(warn).not.toHaveBeenCalled();
  });
});
