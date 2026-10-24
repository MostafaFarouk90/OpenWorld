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
    inv.add('hearth-stone', 1);
    expect(inv.equip('healing-flask')).toEqual({ ok: false, reason: 'not-equippable' });
    expect(inv.equip('hearth-stone')).toEqual({ ok: false, reason: 'not-equippable' });
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
    expect(Inventory.version).toBe(3);
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
          'hearth-stone': null,
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
    expect(inv.serialize()).toEqual({ items: NEW_GAME_KIT.items, equipped: NEW_GAME_KIT.equipped, unknown: {}, gold: 0 });
    expect(warn).toHaveBeenCalled();
  });

  it('falls back to defaults for an unsupported version', () => {
    inv.load({ items: { 'healing-flask': 1 }, equipped: {} }, 4);
    expect(inv.serialize().items).toEqual(NEW_GAME_KIT.items);
    expect(warn).toHaveBeenCalled();
  });

  it('treats a missing equipped and a bad unknown field leniently', () => {
    inv.load({ items: { 'healing-flask': 1 }, unknown: 'oops' }, 1);
    expect(inv.serialize()).toEqual({ items: { 'healing-flask': 1 }, equipped: {}, unknown: {}, gold: 0 });
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

describe('Inventory gold', () => {
  it('adds, takes at most what exists, and ignores bad amounts', () => {
    const i = new Inventory({ emit: () => {} });
    i.addGold(50);
    i.addGold(-5);
    i.addGold(Number.NaN);
    i.addGold(2.9);
    expect(i.gold).toBe(52);
    expect(i.takeGold(100)).toBe(52);
    expect(i.gold).toBe(0);
    expect(i.takeGold(-1)).toBe(0);
    expect(i.takeGold(Number.NaN)).toBe(0);
  });

  it('round-trips through a save and defaults bad gold to 0', () => {
    const i = new Inventory({ emit: () => {} });
    i.addGold(30);
    const saved = i.serialize();
    const j = new Inventory({ emit: () => {} });
    j.load(saved, 1);
    expect(j.gold).toBe(30);
    j.load({ ...saved, gold: -4 }, 1);
    expect(j.gold).toBe(0);
    j.load({ ...saved, gold: 'x' }, 1);
    expect(j.gold).toBe(0);
  });
});

describe('gear (v2)', () => {
  it('defaults to temper 0 and sets a clamped temper on held items without emitting', () => {
    inv.add('practice-sword', 1);
    events.length = 0;
    expect(inv.gear('practice-sword')).toEqual({ temper: 0 });
    expect(inv.setTemper('practice-sword', 3, 'keen')).toBe(true);
    expect(inv.gear('practice-sword')).toEqual({ temper: 3, affix: 'keen' });
    inv.setTemper('practice-sword', 99);
    expect(inv.gear('practice-sword')).toEqual({ temper: 5, affix: 'keen' });
    inv.setTemper('practice-sword', -4);
    expect(inv.gear('practice-sword').temper).toBe(0);
    expect(events).toEqual([]);
  });

  it('refuses unknown, unheld and non-finite', () => {
    expect(inv.setTemper('nope', 1)).toBe(false);
    expect(inv.setTemper('practice-sword', 1)).toBe(false);
    inv.add('practice-sword', 1);
    expect(inv.setTemper('practice-sword', Number.NaN)).toBe(false);
    expect(inv.gear('practice-sword').temper).toBe(0);
  });

  it('drops the record when the item leaves the pack', () => {
    inv.add('practice-sword', 1);
    inv.setTemper('practice-sword', 2);
    inv.remove('practice-sword', 1);
    inv.add('practice-sword', 1);
    expect(inv.gear('practice-sword').temper).toBe(0);
  });

  it('round trips v2 and sanitises bad records', () => {
    inv.add('practice-sword', 1);
    inv.setTemper('practice-sword', 4, 'ember');
    const saved = inv.serialize();
    const b = new Inventory({ emit: () => {}, logger: { warn } });
    b.load(JSON.parse(JSON.stringify(saved)), 2);
    expect(b.gear('practice-sword')).toEqual({ temper: 4, affix: 'ember' });
    b.load({ items: { 'practice-sword': 1 }, gear: { 'practice-sword': { temper: 9 }, nope: { temper: 1 }, 'healing-flask': 'x' } }, 2);
    expect(b.gear('practice-sword').temper).toBe(5);
    expect(b.serialize().gear).toEqual({ 'practice-sword': { temper: 5 } });
    b.load({ items: { 'practice-sword': 1 }, gear: 'bad' }, 2);
    expect(b.gear('practice-sword').temper).toBe(0);
  });

  it('loads v1 data with temper 0 everywhere and ignores a stray gear field', () => {
    inv.load({ items: { 'practice-sword': 1 }, equipped: {}, gold: 7, gear: { 'practice-sword': { temper: 3 } } }, 1);
    expect(inv.gear('practice-sword').temper).toBe(0);
    expect(inv.gold).toBe(7);
    expect(inv.serialize().gear).toBeUndefined();
  });

  it('loads every real v1 save fixture with items and gold intact', () => {
    const fixtures = import.meta.glob('../save/__fixtures__/*.json', { eager: true, import: 'default' }) as Record<string, any>;
    let checked = 0;
    for (const [f, save] of Object.entries(fixtures)) {
      const entry = save?.entries?.inventory;
      if (!entry || entry.version !== 1) continue;
      const fresh = new Inventory({ emit: () => {}, logger: { warn } });
      fresh.load(entry.data, entry.version);
      const known = Object.entries(entry.data.items as Record<string, number>).filter(([id]) => fresh.items().some((i) => i.id === id));
      expect(fresh.items().length, f).toBe(known.length);
      expect(fresh.items().length, f).toBeGreaterThan(0);
      for (const { id, count } of fresh.items()) {
        expect(count, `${f}:${id}`).toBe(entry.data.items[id]);
        expect(fresh.gear(id).temper).toBe(0);
      }
      expect(fresh.gold, f).toBe(entry.data.gold ?? 0);
      checked++;
    }
    expect(checked).toBeGreaterThan(3);
  });
});

describe('v3 sockets (v0.7 item 11)', () => {
  const mk = () => new Inventory({ emit: () => {}, logger: { warn } });
  const gem = (slot: number, name = 'ember') => ({ slot, shardId: `shard-gem.${name}` });

  it('writes sockets only when non-empty and round trips them at version 3', () => {
    inv.add('practice-sword', 1);
    expect(inv.serialize().sockets).toBeUndefined();
    expect(inv.setSockets('practice-sword', [gem(1, 'frost'), gem(0)])).toBe(true);
    const saved = JSON.parse(JSON.stringify(inv.serialize()));
    expect(saved.sockets).toEqual({ 'practice-sword': [gem(0), gem(1, 'frost')] });
    const b = mk();
    b.load(saved, 3);
    expect(b.socketsOf('practice-sword')).toEqual([gem(0), gem(1, 'frost')]);
    expect(b.setSockets('practice-sword', [])).toBe(true);
    expect(b.serialize().sockets).toBeUndefined();
  });

  it('v1 and v2 fixtures load exactly as before, ignoring a stray sockets field', () => {
    const v1 = { items: { 'practice-sword': 1 }, equipped: {}, unknown: {}, gold: 3, sockets: { 'practice-sword': [gem(0)] } };
    const a = mk();
    a.load(v1, 1);
    expect(a.socketsOf('practice-sword')).toEqual([]);
    expect(a.serialize()).toEqual({ items: { 'practice-sword': 1 }, equipped: {}, unknown: {}, gold: 3 });
    const b = mk();
    b.load({ ...v1, gear: { 'practice-sword': { temper: 2 } } }, 2);
    expect(b.gear('practice-sword').temper).toBe(2);
    expect(b.socketsOf('practice-sword')).toEqual([]);
    expect(b.serialize().sockets).toBeUndefined();
  });

  it('drops bad v3 records without failing the load', () => {
    inv.load({
      items: { 'practice-sword': 1, 'healing-flask': 1 }, equipped: {},
      sockets: {
        'practice-sword': [gem(0), { slot: 2, shardId: 'shard-gem.x' }],
        'healing-flask': 'bad', nope: [gem(0)],
      },
    }, 3);
    expect(inv.serialize().sockets).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    inv.load({ items: { 'practice-sword': 1 }, equipped: {}, sockets: { 'practice-sword': [gem(0), gem(0, 'b')] } }, 3);
    expect(inv.socketsOf('practice-sword')).toEqual([]);
    inv.load({ items: { 'practice-sword': 1 }, equipped: {}, sockets: { 'practice-sword': [{ slot: 0, shardId: 'ember-shard' }] } }, 3);
    expect(inv.socketsOf('practice-sword')).toEqual([]);
    inv.load({ items: { 'practice-sword': 1 }, equipped: {}, sockets: 'bad' }, 3);
    expect(inv.serialize().sockets).toBeUndefined();
  });

  it('setSockets refuses an unowned item or a bad entry', () => {
    inv.add('practice-sword', 1);
    expect(inv.setSockets('stonefold-greataxe', [gem(0)])).toBe(false);
    expect(inv.setSockets('practice-sword', [gem(0), gem(0)])).toBe(false);
    expect(inv.setSockets('practice-sword', [{ slot: 0, shardId: 'ember-shard' }])).toBe(false);
    expect(inv.socketsOf('practice-sword')).toEqual([]);
  });

  it('removing the last copy drops its sockets; a copy bought again starts empty (no duplicated shard-gems)', () => {
    inv.add('practice-sword', 1);
    expect(inv.setSockets('practice-sword', [gem(0)])).toBe(true);
    expect(inv.remove('practice-sword', 1)).toBe(true);
    expect(inv.serialize().sockets).toBeUndefined();
    inv.add('practice-sword', 1);
    expect(inv.socketsOf('practice-sword')).toEqual([]);
  });

  it('reset clears sockets', () => {
    inv.add('practice-sword', 1);
    inv.setSockets('practice-sword', [gem(0)]);
    inv.reset(STARTER_KIT);
    expect(inv.socketsOf('practice-sword')).toEqual([]);
  });
});
