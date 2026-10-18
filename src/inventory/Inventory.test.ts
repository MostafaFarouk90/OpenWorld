import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Inventory } from './Inventory';
import { NEW_GAME_KIT, STARTER_KIT } from './items';

let events: { type: string; payload: unknown }[];
let warn: ReturnType<typeof vi.fn>;
let inv: Inventory;

beforeEach(() => {
  events = [];
  warn = vi.fn();
  inv = new Inventory({ emit: (type, payload) => events.push({ type, payload }), logger: { warn } });
});

const of = (type: string) => events.filter((e) => e.type === type).map((e) => e.payload);

describe('add', () => {
  it('adds, stacks and emits inventory.changed with the new count', () => {
    expect(inv.add('healing-flask', 2)).toBe(2);
    expect(inv.add('healing-flask', 1)).toBe(1);
    expect(inv.count('healing-flask')).toBe(3);
    expect(inv.has('healing-flask')).toBe(true);
    expect(of('inventory.changed')).toEqual([
      { itemId: 'healing-flask', count: 2 },
      { itemId: 'healing-flask', count: 3 },
    ]);
  });

  it('caps at stackMax and returns only what fit', () => {
    inv.add('healing-flask', 4);
    expect(inv.add('healing-flask', 10)).toBe(1);
    expect(inv.count('healing-flask')).toBe(5);
    expect(inv.add('healing-flask', 1)).toBe(0);
    expect(of('inventory.changed')).toHaveLength(2);
  });

  it('caps gear at one copy', () => {
    expect(inv.add('squires-arming-sword', 3)).toBe(1);
    expect(inv.add('squires-arming-sword', 1)).toBe(0);
  });

  it('refuses unknown ids with a warning', () => {
    expect(inv.add('mystery', 1)).toBe(0);
    expect(warn).toHaveBeenCalledOnce();
    expect(events).toEqual([]);
    expect(inv.items()).toEqual([]);
  });

  it.each([0, -1, -Infinity, NaN, Infinity * 0])('adds nothing for %s', (n) => {
    expect(inv.add('healing-flask', n)).toBe(0);
    expect(inv.has('healing-flask')).toBe(false);
    expect(events).toEqual([]);
  });

  it('floors fractions, and a fraction below one adds nothing', () => {
    expect(inv.add('healing-flask', 2.9)).toBe(2);
    expect(inv.add('hearth-bread', 0.5)).toBe(0);
  });

  it('clamps huge numbers to stackMax but treats Infinity as invalid', () => {
    expect(inv.add('healing-flask', Infinity)).toBe(0);
    expect(inv.add('hearth-bread', Number.MAX_SAFE_INTEGER)).toBe(5);
  });
});

describe('remove', () => {
  it('removes some, emits, and keeps the rest', () => {
    inv.add('healing-flask', 3);
    events.length = 0;
    expect(inv.remove('healing-flask', 2)).toBe(true);
    expect(inv.count('healing-flask')).toBe(1);
    expect(of('inventory.changed')).toEqual([{ itemId: 'healing-flask', count: 1 }]);
  });

  it('refuses more than owned and changes nothing', () => {
    inv.add('healing-flask', 2);
    events.length = 0;
    expect(inv.remove('healing-flask', 3)).toBe(false);
    expect(inv.count('healing-flask')).toBe(2);
    expect(events).toEqual([]);
  });

  it('refuses unowned and unknown ids', () => {
    expect(inv.remove('healing-flask', 1)).toBe(false);
    expect(inv.remove('mystery', 1)).toBe(false);
  });

  it.each([0, -1, NaN])('refuses %s', (n) => {
    inv.add('healing-flask', 2);
    expect(inv.remove('healing-flask', n)).toBe(false);
    expect(inv.count('healing-flask')).toBe(2);
  });

  it('removing to zero deletes the stack', () => {
    inv.add('healing-flask', 1);
    expect(inv.remove('healing-flask', 1)).toBe(true);
    expect(inv.items()).toEqual([]);
    expect(inv.has('healing-flask')).toBe(false);
  });

  it('removing the last copy of an equipped item unequips it first', () => {
    inv.add('squires-arming-sword', 1);
    inv.equip('squires-arming-sword');
    events.length = 0;
    expect(inv.remove('squires-arming-sword', 1)).toBe(true);
    expect(inv.equipped('weapon')).toBeNull();
    expect(of('inventory.equipped')).toEqual([{ slot: 'weapon', itemId: null, previous: 'squires-arming-sword' }]);
    expect(of('inventory.changed')).toEqual([{ itemId: 'squires-arming-sword', count: 0 }]);
  });
});

describe('equip', () => {
  it('equips owned gear and emits', () => {
    inv.add('squires-arming-sword', 1);
    expect(inv.equip('squires-arming-sword')).toEqual({ ok: true });
    expect(inv.equipped('weapon')).toBe('squires-arming-sword');
    expect(of('inventory.equipped')).toEqual([{ slot: 'weapon', itemId: 'squires-arming-sword', previous: null }]);
  });

  it('keeps the item owned while equipped', () => {
    inv.add('squires-arming-sword', 1);
    inv.equip('squires-arming-sword');
    expect(inv.count('squires-arming-sword')).toBe(1);
    expect(inv.items()).toEqual([{ id: 'squires-arming-sword', count: 1 }]);
  });

  it('swaps and reports the replaced id', () => {
    inv.add('practice-sword', 1);
    inv.add('squires-arming-sword', 1);
    inv.equip('practice-sword');
    events.length = 0;
    expect(inv.equip('squires-arming-sword')).toEqual({ ok: true, replaced: 'practice-sword' });
    expect(inv.equipped('weapon')).toBe('squires-arming-sword');
    expect(inv.has('practice-sword')).toBe(true);
    expect(of('inventory.equipped')).toEqual([
      { slot: 'weapon', itemId: 'squires-arming-sword', previous: 'practice-sword' },
    ]);
  });

  it('equipping the already equipped id is an ok no-op', () => {
    inv.add('practice-sword', 1);
    inv.equip('practice-sword');
    events.length = 0;
    expect(inv.equip('practice-sword')).toEqual({ ok: true });
    expect(events).toEqual([]);
  });

  it('refuses unowned, unknown, consumables and quest items', () => {
    expect(inv.equip('practice-sword')).toEqual({ ok: false, reason: 'not-owned' });
    expect(inv.equip('mystery')).toEqual({ ok: false, reason: 'unknown-item' });
    inv.add('healing-flask', 1);
    inv.add('brannoc-hearth-stone', 1);
    expect(inv.equip('healing-flask')).toEqual({ ok: false, reason: 'not-equippable' });
    expect(inv.equip('brannoc-hearth-stone')).toEqual({ ok: false, reason: 'not-equippable' });
    expect(events.filter((e) => e.type === 'inventory.equipped')).toEqual([]);
  });

  it('routes each item to its own slot, so an offhand never lands in weapon', () => {
    inv.add('wooden-round-shield', 1);
    inv.add('hearth-stone-charm', 1);
    inv.equip('wooden-round-shield');
    inv.equip('hearth-stone-charm');
    expect(inv.equipped('offhand')).toBe('wooden-round-shield');
    expect(inv.equipped('trinket')).toBe('hearth-stone-charm');
    expect(inv.equipped('weapon')).toBeNull();
  });

  it('is allowed regardless of anything else going on (no drink coupling)', () => {
    inv.add('healing-flask', 1);
    inv.add('squires-arming-sword', 1);
    expect(inv.equip('squires-arming-sword').ok).toBe(true);
  });
});

describe('unequip', () => {
  it('returns false for an empty slot, true and emits otherwise', () => {
    expect(inv.unequip('weapon')).toBe(false);
    inv.add('practice-sword', 1);
    inv.equip('practice-sword');
    events.length = 0;
    expect(inv.unequip('weapon')).toBe(true);
    expect(inv.equipped('weapon')).toBeNull();
    expect(inv.has('practice-sword')).toBe(true);
    expect(of('inventory.equipped')).toEqual([{ slot: 'weapon', itemId: null, previous: 'practice-sword' }]);
  });
});

describe('equippedStat', () => {
  it('is zero with nothing equipped', () => {
    expect(inv.equippedStat('attack')).toBe(0);
    expect(inv.equippedStat('defense')).toBe(0);
  });

  it('sums slots and ignores missing stats', () => {
    inv.reset(STARTER_KIT);
    inv.add('hearth-stone-charm', 1);
    inv.equip('hearth-stone-charm');
    expect(inv.equippedStat('attack')).toBe(12);
    expect(inv.equippedStat('defense')).toBe(2 + 2 + 1);
  });
});

describe('reset', () => {
  it('replaces everything with the kit and emits the differences', () => {
    inv.add('healing-flask', 2);
    inv.add('hearth-bread', 1);
    events.length = 0;
    inv.reset(STARTER_KIT);
    expect(inv.count('healing-flask')).toBe(3);
    expect(inv.has('hearth-bread')).toBe(false);
    expect(inv.equipped('weapon')).toBe('squires-arming-sword');
    expect(inv.equipped('armour')).toBe('gauts-spare-tabard');
    expect(inv.equippedStat('attack')).toBe(12);
    expect(of('inventory.changed')).toContainEqual({ itemId: 'hearth-bread', count: 0 });
    expect(of('inventory.equipped')).toContainEqual({ slot: 'weapon', itemId: 'squires-arming-sword', previous: null });
  });

  it('does not alias the kit object', () => {
    inv.reset(NEW_GAME_KIT);
    inv.add('healing-flask', 1);
    expect(NEW_GAME_KIT.items['healing-flask']).toBeUndefined();
  });

  it('sanitises a bad kit', () => {
    inv.reset({ items: { 'healing-flask': 99, mystery: 2 }, equipped: { weapon: 'practice-sword' } });
    expect(inv.count('healing-flask')).toBe(5);
    expect(inv.equipped('weapon')).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});

describe('persistence', () => {
  it('has a key and version', () => {
    expect(Inventory.key).toBe('inventory');
    expect(Inventory.version).toBe(1);
  });

  it('round trips', () => {
    inv.reset(STARTER_KIT);
    const saved = JSON.parse(JSON.stringify(inv.serialize()));
    const other = new Inventory({ emit: () => {}, logger: { warn } });
    other.load(saved, 1);
    expect(other.serialize()).toEqual(inv.serialize());
    expect(other.equipped('weapon')).toBe('squires-arming-sword');
    expect(other.count('healing-flask')).toBe(3);
  });

  it('keeps unknown items and writes them back unchanged, across reloads', () => {
    inv.load({ items: { 'healing-flask': 1, 'future-gem': 7 }, equipped: {}, unknown: { 'old-thing': 2 } }, 1);
    expect(inv.has('future-gem')).toBe(false);
    expect(inv.serialize().unknown).toEqual({ 'future-gem': 7, 'old-thing': 2 });
    expect(inv.serialize().items).toEqual({ 'healing-flask': 1 });
    const again = new Inventory({ emit: () => {}, logger: { warn } });
    again.load(JSON.parse(JSON.stringify(inv.serialize())), 1);
    expect(again.serialize()).toEqual(inv.serialize());
  });

  it('an id kept aside by an older build rejoins the items once known', () => {
    inv.load({ items: { 'hearth-bread': 1 }, equipped: {}, unknown: { 'healing-flask': 2, 'hearth-bread': 4 } }, 1);
    expect(inv.count('healing-flask')).toBe(2);
    expect(inv.count('hearth-bread')).toBe(1);
    expect(inv.serialize().unknown).toEqual({});
  });

  it('unequips an equipped-but-not-owned item with a warning', () => {
    inv.load({ items: { 'healing-flask': 1 }, equipped: { weapon: 'practice-sword' } }, 1);
    expect(inv.equipped('weapon')).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('drops equipped entries that are unknown, in the wrong slot or not strings', () => {
    inv.load(
      {
        items: { 'practice-sword': 1, 'healing-flask': 1 },
        equipped: { weapon: 'mystery', offhand: 'practice-sword', armour: 5, trinket: 'healing-flask', bogus: 'x' },
      },
      1,
    );
    expect(inv.serialize().equipped).toEqual({});
    expect(warn).toHaveBeenCalledTimes(4);
  });

  it('clamps, floors and drops bad counts', () => {
    inv.load(
      {
        items: {
          'healing-flask': 99,
          'hearth-bread': 2.9,
          'practice-sword': -1,
          'wooden-round-shield': NaN,
          'gauts-spare-blade': '1',
          'hearth-stone-charm': Infinity,
          'gauts-spare-tabard': 7,
          'squires-arming-sword': 0.4,
          'brannoc-hearth-stone': null,
        },
        equipped: {},
      },
      1,
    );
    expect(inv.serialize().items).toEqual({ 'healing-flask': 5, 'hearth-bread': 2, 'gauts-spare-tabard': 1 });
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an array', []],
    ['a string', 'inventory'],
    ['a number', 3],
    ['items as array', { items: [], equipped: {} }],
    ['items missing', { equipped: {} }],
    ['items null', { items: null, equipped: {} }],
    ['equipped as array', { items: {}, equipped: [] }],
    ['equipped as string', { items: {}, equipped: 'x' }],
  ])('falls back to the new-game kit for %s', (_n, data) => {
    inv.add('healing-flask', 4);
    inv.load(data, 1);
    expect(inv.serialize()).toEqual({ items: NEW_GAME_KIT.items, equipped: NEW_GAME_KIT.equipped, unknown: {} });
    expect(warn).toHaveBeenCalled();
  });

  it('falls back to defaults for an unsupported version', () => {
    inv.load({ items: { 'healing-flask': 1 }, equipped: {} }, 2);
    expect(inv.serialize().items).toEqual(NEW_GAME_KIT.items);
    expect(warn).toHaveBeenCalled();
  });

  it('treats a missing equipped and a bad unknown field leniently', () => {
    inv.load({ items: { 'healing-flask': 1 }, unknown: 'oops' }, 1);
    expect(inv.serialize()).toEqual({ items: { 'healing-flask': 1 }, equipped: {}, unknown: {} });
  });

  it('loading twice is idempotent and emits nothing the second time', () => {
    const data = { items: { 'healing-flask': 2, 'future-gem': 1 }, equipped: { weapon: 'practice-sword' } };
    inv.load(data, 1);
    const first = inv.serialize();
    events.length = 0;
    inv.load(data, 1);
    expect(inv.serialize()).toEqual(first);
    expect(events).toEqual([]);
  });

  it('load replaces earlier state', () => {
    inv.add('hearth-bread', 3);
    inv.load({ items: { 'healing-flask': 1 }, equipped: {} }, 1);
    expect(inv.has('hearth-bread')).toBe(false);
    expect(of('inventory.changed')).toContainEqual({ itemId: 'hearth-bread', count: 0 });
  });

  it('serialize returns a copy', () => {
    inv.reset(NEW_GAME_KIT);
    const s = inv.serialize();
    s.items['healing-flask'] = 9;
    expect(inv.count('healing-flask')).toBe(0);
  });
});

describe('defaults', () => {
  it('works without a logger', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const plain = new Inventory({ emit: () => {} });
    expect(plain.add('mystery', 1)).toBe(0);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
