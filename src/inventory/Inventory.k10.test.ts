import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../gear/catalog';
import '../gear/sockets/table';
import '../gear/tier4/catalog';
import { Inventory, SADDLEBAGS_ID, SADDLEBAG_BONUS, stackCap } from './Inventory';

const BLADE = 'wyrm-tempered-oathblade';
let events: { type: string; payload: unknown }[];
let warn: ReturnType<typeof vi.fn>;
let inv: Inventory;
const fresh = () => new Inventory({ emit: (type, payload) => events.push({ type, payload }), logger: { warn } });

beforeEach(() => {
  events = [];
  warn = vi.fn();
  inv = fresh();
});

describe('v3 sockets', () => {
  it('is version 3', () => {
    expect(Inventory.version).toBe(3);
  });
  it('loads a v2 save with no sockets, even if the data carries a sockets key', () => {
    const save = { items: { [BLADE]: 1, 'ashplate': 1 }, equipped: {}, gold: 5, gear: { ashplate: { temper: 2 } }, sockets: { [BLADE]: [{ slot: 0, shardId: 'shard-gem.oathfire' }] } };
    inv.load(save, 2);
    expect(inv.socketsOf(BLADE)).toEqual([]);
    expect(inv.gear('ashplate').temper).toBe(2);
    expect(inv.serialize().sockets).toBeUndefined();
  });
  it('loads a v1 save with no sockets', () => {
    inv.load({ items: { [BLADE]: 1 }, equipped: {}, gold: 0 }, 1);
    expect(inv.has(BLADE)).toBe(true);
    expect(inv.socketsOf(BLADE)).toEqual([]);
  });
  it('round-trips sockets through save, load and re-save', () => {
    inv.reset({ items: { [BLADE]: 1, 'wyrmscale-plate': 1 }, equipped: {} });
    inv.setTemper(BLADE, 5);
    expect(inv.setSockets(BLADE, [{ slot: 1, shardId: 'shard-gem.bulwark' }, { slot: 0, shardId: 'shard-gem.oathfire' }])).toBe(true);
    const first = JSON.parse(JSON.stringify(inv.serialize()));
    expect(first.sockets[BLADE]).toEqual([{ slot: 0, shardId: 'shard-gem.oathfire' }, { slot: 1, shardId: 'shard-gem.bulwark' }]);
    const other = fresh();
    other.load(first, Inventory.version);
    expect(other.socketsOf(BLADE)).toEqual(first.sockets[BLADE]);
    expect(JSON.parse(JSON.stringify(other.serialize()))).toEqual(first);
  });
  it('keeps an unknown or removed shard-gem id through load and re-save', () => {
    const save = { items: { [BLADE]: 1 }, equipped: {}, gold: 0, sockets: { [BLADE]: [{ slot: 0, shardId: 'shard-gem.removed' }] } };
    inv.load(save, 3);
    expect(inv.socketsOf(BLADE)).toEqual([{ slot: 0, shardId: 'shard-gem.removed' }]);
    const again = fresh();
    again.load(JSON.parse(JSON.stringify(inv.serialize())), 3);
    expect(again.serialize().sockets).toEqual({ [BLADE]: [{ slot: 0, shardId: 'shard-gem.removed' }] });
    expect(warn).not.toHaveBeenCalled();
  });
  it('drops malformed or unowned socket records without failing the load', () => {
    const save = {
      items: { [BLADE]: 1 },
      equipped: {},
      gold: 0,
      sockets: { [BLADE]: [{ slot: 2, shardId: 'shard-gem.oathfire' }], 'wyrmscale-plate': [{ slot: 0, shardId: 'shard-gem.oathfire' }], x: 'no' },
    };
    inv.load(save, 3);
    expect(inv.serialize().sockets).toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
  it('refuses setSockets for an unheld piece, a repeated slot, a bad slot or a non-gem id', () => {
    inv.reset({ items: { [BLADE]: 1 }, equipped: {} });
    expect(inv.setSockets('wyrmscale-plate', [])).toBe(false);
    expect(inv.setSockets(BLADE, [{ slot: 0, shardId: 'shard-gem.oathfire' }, { slot: 0, shardId: 'shard-gem.bulwark' }])).toBe(false);
    expect(inv.setSockets(BLADE, [{ slot: 2, shardId: 'shard-gem.oathfire' }])).toBe(false);
    expect(inv.setSockets(BLADE, [{ slot: 0, shardId: 'healing-flask' }])).toBe(false);
    expect(inv.socketsOf(BLADE)).toEqual([]);
  });
});

describe('saddlebags', () => {
  it('raises quest-kind caps of 10 or more by 10 and nothing else', () => {
    expect(SADDLEBAG_BONUS).toBe(10);
    expect(stackCap({ kind: 'quest', stackMax: 40 }, true)).toBe(50);
    expect(stackCap({ kind: 'quest', stackMax: 10 }, true)).toBe(20);
    expect(stackCap({ kind: 'quest', stackMax: 9 }, true)).toBe(9);
    expect(stackCap({ kind: 'quest', stackMax: 1 }, true)).toBe(1);
    expect(stackCap({ kind: 'consumable', stackMax: 10 }, true)).toBe(10);
    expect(stackCap({ kind: 'material', stackMax: 40 }, true)).toBe(40);
    expect(stackCap({ kind: 'quest', stackMax: 40 }, false)).toBe(40);
  });
  it('lets a held bag raise the cap of ore and scales, while consumables stay put', () => {
    inv.reset({ items: {}, equipped: {} });
    expect(inv.add('iron-ore', 99)).toBe(40);
    inv.add(SADDLEBAGS_ID, 1);
    expect(inv.capOf('iron-ore')).toBe(50);
    expect(inv.add('iron-ore', 99)).toBe(10);
    expect(inv.add('shed-wyrm-scale', 99)).toBe(50);
    expect(inv.add('healing-flask', 99)).toBe(5);
    expect(inv.capOf('healing-flask')).toBe(5);
    expect(inv.capOf('nope')).toBe(0);
  });
  it('loads 50 iron-ore from a save that also holds the bags, not 40', () => {
    inv.load({ items: { 'iron-ore': 50, [SADDLEBAGS_ID]: 1 }, equipped: {}, gold: 0 }, 3);
    expect(inv.count('iron-ore')).toBe(50);
    expect(inv.has(SADDLEBAGS_ID)).toBe(true);
  });
  it('still clamps to the base cap when the save has no bags', () => {
    inv.load({ items: { 'iron-ore': 50 }, equipped: {}, gold: 0 }, 3);
    expect(inv.count('iron-ore')).toBe(40);
  });
  it('loads the same from a bag-bearing v2 save and applies the bonus to a gem stack', () => {
    inv.load({ items: { 'shard-gem.oathfire': 15, [SADDLEBAGS_ID]: 1 }, equipped: {}, gold: 0 }, 2);
    expect(inv.count('shard-gem.oathfire')).toBe(15);
  });
  it('keeps 50 when the bags are dropped but adds nothing more', () => {
    inv.load({ items: { 'iron-ore': 50, [SADDLEBAGS_ID]: 1 }, equipped: {}, gold: 0 }, 3);
    expect(inv.remove(SADDLEBAGS_ID, 1)).toBe(true);
    expect(inv.count('iron-ore')).toBe(50);
    expect(inv.add('iron-ore', 1)).toBe(0);
    expect(inv.capOf('iron-ore')).toBe(40);
    expect(inv.serialize().items['iron-ore']).toBe(50);
  });
});

describe('remove() of a socketed piece', () => {
  beforeEach(() => {
    inv.reset({ items: { [BLADE]: 1 }, equipped: {} });
    inv.equip(BLADE);
    inv.setTemper(BLADE, 5);
    inv.setSockets(BLADE, [{ slot: 0, shardId: 'shard-gem.oathfire' }, { slot: 1, shardId: 'shard-gem.oathfire' }]);
  });
  it('returns its gems to the bag, clears the record and unequips', () => {
    expect(inv.gemRoomFor(BLADE)).toBe(true);
    expect(inv.remove(BLADE, 1)).toBe(true);
    expect(inv.count('shard-gem.oathfire')).toBe(2);
    expect(inv.socketsOf(BLADE)).toEqual([]);
    expect(inv.serialize().sockets).toBeUndefined();
    expect(inv.equipped('weapon')).toBeNull();
  });
  it('leaves no stale sockets or temper on a sell then buy-back', () => {
    inv.remove(BLADE, 1);
    inv.add(BLADE, 1);
    expect(inv.socketsOf(BLADE)).toEqual([]);
    expect(inv.gear(BLADE)).toEqual({ temper: 0 });
    expect(inv.count('shard-gem.oathfire')).toBe(2);
  });
  it('reports no room when a gem stack would overflow', () => {
    inv.add('shard-gem.oathfire', 9);
    expect(inv.gemRoomFor(BLADE)).toBe(false);
    inv.remove('shard-gem.oathfire', 1);
    expect(inv.gemRoomFor(BLADE)).toBe(true);
  });
  it('has room for a piece with no gems', () => {
    inv.reset({ items: { ashplate: 1 }, equipped: {} });
    expect(inv.gemRoomFor('ashplate')).toBe(true);
    expect(inv.gemRoomFor('nope')).toBe(true);
  });
  it('keeps a gem with no room in unknown, and it survives serialize then load', () => {
    inv.add('shard-gem.oathfire', 9); // one room left for two gems
    expect(inv.gemRoomFor(BLADE)).toBe(false);
    expect(inv.remove(BLADE, 1)).toBe(true);
    expect(inv.count('shard-gem.oathfire')).toBe(10);
    expect(inv.socketsOf(BLADE)).toEqual([]);
    expect(warn).toHaveBeenCalled();
    const saved = JSON.parse(JSON.stringify(inv.serialize()));
    expect(saved.unknown['shard-gem.oathfire']).toBe(1);
    // room frees, then the next load re-merges it with the stack
    const later = fresh();
    saved.items['shard-gem.oathfire'] = 8;
    later.load(saved, Inventory.version);
    // the aside gem adds to the stack on load
    expect(later.count('shard-gem.oathfire')).toBe(9);
    expect(later.serialize().unknown['shard-gem.oathfire']).toBeUndefined();
  });
  it('an aside gem that still does not fit stays aside, and nothing is lost', () => {
    const later = fresh();
    later.load({ items: { 'shard-gem.oathfire': 10 }, equipped: {}, unknown: { 'shard-gem.oathfire': 2 }, gold: 0 }, Inventory.version);
    expect(later.count('shard-gem.oathfire')).toBe(10);
    expect(later.serialize().unknown['shard-gem.oathfire']).toBe(2);
    const only = fresh();
    only.load({ items: {}, equipped: {}, unknown: { 'shard-gem.oathfire': 2 }, gold: 0 }, Inventory.version);
    expect(only.count('shard-gem.oathfire')).toBe(2);
  });
});
