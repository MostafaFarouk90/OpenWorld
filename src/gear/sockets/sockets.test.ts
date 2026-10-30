import { beforeEach, describe, expect, it } from 'vitest';
import { Inventory } from '../../inventory/Inventory';
import '../catalog';
import '../tier4/catalog';
import { fitGem, recutGem, recutTargetFor, removeGem, socketCount, socketsOpen, socketView, type SocketInventory } from './sockets';
import { SHARD_GEMS, gemFor } from './table';
import { SOCKET_TUNING } from './tuning';

const BLADE = 'wyrm-tempered-oathblade';
const BULWARK = 'shard-gem.bulwark';
const OATHFIRE = 'shard-gem.oathfire';
const ROOTSTONE = 'shard-gem.rootstone';

let raw: Inventory;
let spent: number[];
let inv: SocketInventory;

const make = (items: Record<string, number>, gold: number, wrap?: (i: SocketInventory) => SocketInventory) => {
  raw = new Inventory({ emit: () => {}, logger: { warn: () => {} } });
  raw.reset({ items, equipped: {} });
  raw.addGold(gold);
  spent = [];
  const base: SocketInventory = {
    has: (id) => raw.has(id),
    count: (id) => raw.count(id),
    add: (id, n) => raw.add(id, n),
    remove: (id, n) => raw.remove(id, n),
    get gold() {
      return raw.gold;
    },
    takeGold: (n) => {
      const t = raw.takeGold(n);
      spent.push(t);
      return t;
    },
    addGold: (n) => raw.addGold(n),
    gear: (id) => raw.gear(id),
    socketsOf: (id) => raw.socketsOf(id),
    setSockets: (id, s) => raw.setSockets(id, s),
    capOf: (id) => raw.capOf(id),
  };
  inv = wrap ? wrap(base) : base;
};
const snap = () => JSON.stringify([raw.gold, raw.serialize()]);

describe('socketCount', () => {
  beforeEach(() => make({ [BLADE]: 1 }, 0));
  it('is 0 for a piece without sockets, 1 below +5 and 2 at +5', () => {
    expect(socketCount('ashforged-longsword', 5)).toBe(0);
    expect(socketCount('nope', 0)).toBe(0);
    for (const t of [0, 1, 4]) expect(socketCount(BLADE, t)).toBe(1);
    expect(socketCount(BLADE, 5)).toBe(2);
  });
  it('never drops below the fitted count when temper falls', () => {
    expect(socketCount(BLADE, 0, [{ slot: 1, shardId: OATHFIRE }])).toBe(2);
    raw.setTemper(BLADE, 5);
    raw.setSockets(BLADE, [{ slot: 1, shardId: OATHFIRE }]);
    raw.setTemper(BLADE, 0);
    expect(socketsOpen(inv, BLADE)).toBe(2);
  });
});

describe('fitGem', () => {
  it('fits a gem, taking one gem and 50 gold', () => {
    make({ [BLADE]: 1, [OATHFIRE]: 2 }, 100);
    expect(fitGem(inv, BLADE, 0, OATHFIRE)).toEqual({ ok: true, shardId: OATHFIRE });
    expect(raw.count(OATHFIRE)).toBe(1);
    expect(raw.gold).toBe(50);
    expect(raw.socketsOf(BLADE)).toEqual([{ slot: 0, shardId: OATHFIRE }]);
  });
  it('opens slot 1 only at +5, and accepts a gem of another class (dormant)', () => {
    make({ [BLADE]: 1, [OATHFIRE]: 1, [ROOTSTONE]: 1 }, 200);
    expect(fitGem(inv, BLADE, 1, OATHFIRE)).toEqual({ ok: false, reason: 'no-socket' });
    raw.setTemper(BLADE, 5);
    expect(fitGem(inv, BLADE, 1, ROOTSTONE).ok).toBe(true);
    expect(fitGem(inv, BLADE, 0, OATHFIRE).ok).toBe(true);
    expect(socketView(inv, BLADE, 'knight').slots.map((s) => s.dormant)).toEqual([false, true]);
  });
  describe('refusals take nothing', () => {
    const cases: [string, () => void, string, number, string][] = [
      ['unknown-item', () => make({ [OATHFIRE]: 1 }, 100), 'no-such-piece', 0, 'unknown-item'],
      ['not-held', () => make({ [OATHFIRE]: 1 }, 100), BLADE, 0, 'not-held'],
      ['no-socket (slot 1 below +5)', () => make({ [BLADE]: 1, [OATHFIRE]: 1 }, 100), BLADE, 1, 'no-socket'],
      ['no-socket (negative)', () => make({ [BLADE]: 1, [OATHFIRE]: 1 }, 100), BLADE, -1, 'no-socket'],
      ['no-socket (fractional)', () => make({ [BLADE]: 1, [OATHFIRE]: 1 }, 100), BLADE, 0.5, 'no-socket'],
      ['no-socket (piece has none)', () => make({ 'ashforged-longsword': 1, [OATHFIRE]: 1 }, 100), 'ashforged-longsword', 0, 'no-socket'],
      ['no-gem', () => make({ [BLADE]: 1 }, 100), BLADE, 0, 'no-gem'],
      ['no-gold', () => make({ [BLADE]: 1, [OATHFIRE]: 1 }, 49), BLADE, 0, 'no-gold'],
    ];
    it.each(cases)('%s', (_n, setup, item, slot, reason) => {
      setup();
      const before = snap();
      expect(fitGem(inv, item, slot, OATHFIRE)).toEqual({ ok: false, reason });
      expect(snap()).toBe(before);
    });
    it('slot-taken', () => {
      make({ [BLADE]: 1, [OATHFIRE]: 2 }, 200);
      fitGem(inv, BLADE, 0, OATHFIRE);
      const before = snap();
      expect(fitGem(inv, BLADE, 0, OATHFIRE)).toEqual({ ok: false, reason: 'slot-taken' });
      expect(snap()).toBe(before);
    });
    it('not-a-gem', () => {
      make({ [BLADE]: 1, 'healing-flask': 1 }, 100);
      const before = snap();
      expect(fitGem(inv, BLADE, 0, 'healing-flask')).toEqual({ ok: false, reason: 'not-a-gem' });
      expect(fitGem(inv, BLADE, 0, 'shard-gem.removed')).toEqual({ ok: false, reason: 'not-a-gem' });
      expect(snap()).toBe(before);
    });
  });
  it('rolls back the gem and the gold when the write fails', () => {
    make({ [BLADE]: 1, [OATHFIRE]: 1 }, 100, (i) => ({ ...i, setSockets: () => false, get gold() { return raw.gold; } }));
    const before = snap();
    expect(fitGem(inv, BLADE, 0, OATHFIRE)).toEqual({ ok: false, reason: 'no-socket' });
    expect(snap()).toBe(before);
    expect(raw.count(OATHFIRE)).toBe(1);
    expect(raw.gold).toBe(100);
  });
});

describe('removeGem', () => {
  it('returns the gem for 25 gold', () => {
    make({ [BLADE]: 1, [OATHFIRE]: 1 }, 100);
    fitGem(inv, BLADE, 0, OATHFIRE);
    expect(raw.count(OATHFIRE)).toBe(0);
    expect(removeGem(inv, BLADE, 0)).toEqual({ ok: true, shardId: OATHFIRE });
    expect(raw.count(OATHFIRE)).toBe(1);
    expect(raw.gold).toBe(25);
    expect(raw.socketsOf(BLADE)).toEqual([]);
  });
  it('is refused as full with the gem still fitted and the gold untouched', () => {
    make({ [BLADE]: 1, [OATHFIRE]: 10 }, 100);
    raw.setSockets(BLADE, [{ slot: 0, shardId: OATHFIRE }]);
    const before = snap();
    expect(removeGem(inv, BLADE, 0)).toEqual({ ok: false, reason: 'full' });
    expect(snap()).toBe(before);
    expect(raw.socketsOf(BLADE)).toEqual([{ slot: 0, shardId: OATHFIRE }]);
  });
  it('refuses unknown, unheld, empty slot and no gold, taking nothing', () => {
    make({ [BLADE]: 1, [OATHFIRE]: 1 }, 100);
    expect(removeGem(inv, 'nope', 0)).toEqual({ ok: false, reason: 'unknown-item' });
    expect(removeGem(inv, 'ashforged-longsword', 0)).toEqual({ ok: false, reason: 'not-held' });
    expect(removeGem(inv, BLADE, 0)).toEqual({ ok: false, reason: 'slot-empty' });
    fitGem(inv, BLADE, 0, OATHFIRE);
    raw.takeGold(raw.gold - 24);
    const before = snap();
    expect(removeGem(inv, BLADE, 0)).toEqual({ ok: false, reason: 'no-gold' });
    expect(snap()).toBe(before);
  });
  it('removes a slot 1 gem after the temper fell below +5', () => {
    make({ [BLADE]: 1, [OATHFIRE]: 1 }, 100);
    raw.setTemper(BLADE, 5);
    raw.setSockets(BLADE, [{ slot: 1, shardId: OATHFIRE }]);
    raw.setTemper(BLADE, 2);
    // the gem is orphaned from nothing: still listed and removable
    expect(socketView(inv, BLADE, 'knight').slots[1]).toEqual({ slot: 1, shardId: OATHFIRE, dormant: false });
    expect(removeGem(inv, BLADE, 1)).toEqual({ ok: true, shardId: OATHFIRE });
    expect(raw.socketsOf(BLADE)).toEqual([]);
  });
});

describe('recutGem', () => {
  it('turns a gem into another for 40 gold', () => {
    make({ [BULWARK]: 2 }, 100);
    expect(recutGem(inv, BULWARK, OATHFIRE)).toEqual({ ok: true, shardId: OATHFIRE });
    expect(raw.count(BULWARK)).toBe(1);
    expect(raw.count(OATHFIRE)).toBe(1);
    expect(raw.gold).toBe(60);
    expect(SOCKET_TUNING.recutGold).toBe(40);
  });
  it.each([
    ['no-gold', { [BULWARK]: 1 }, 39, BULWARK, OATHFIRE, 'no-gold'],
    ['no-gem', { [ROOTSTONE]: 1 }, 100, BULWARK, OATHFIRE, 'no-gem'],
    ['same', { [BULWARK]: 1 }, 100, BULWARK, BULWARK, 'same'],
    ['full', { [BULWARK]: 1, [OATHFIRE]: 10 }, 100, BULWARK, OATHFIRE, 'full'],
    ['not-a-gem (from)', { 'healing-flask': 1 }, 100, 'healing-flask', OATHFIRE, 'not-a-gem'],
    ['not-a-gem (to)', { [BULWARK]: 1 }, 100, BULWARK, 'shard-gem.removed', 'not-a-gem'],
  ] as const)('%s takes nothing', (_n, items, gold, from, to, reason) => {
    make({ ...items }, gold);
    const before = snap();
    expect(recutGem(inv, from, to)).toEqual({ ok: false, reason });
    expect(snap()).toBe(before);
  });
});

describe('recutGem class rule', () => {
  it('allows the twin or the current class match, and refuses anything else with nothing taken', () => {
    make({ [BULWARK]: 3 }, 200);
    expect(recutGem(inv, BULWARK, OATHFIRE, 'warden')).toEqual({ ok: true, shardId: OATHFIRE }); // twin
    expect(recutGem(inv, BULWARK, ROOTSTONE, 'warden')).toEqual({ ok: true, shardId: ROOTSTONE }); // warden's A
    const before = snap();
    expect(recutGem(inv, BULWARK, 'shard-gem.ravager', 'warden')).toEqual({ ok: false, reason: 'not-allowed' }); // warden's B
    expect(recutGem(inv, BULWARK, 'shard-gem.fletching', 'knight')).toEqual({ ok: false, reason: 'not-allowed' });
    expect(recutGem(inv, BULWARK, ROOTSTONE)).toEqual({ ok: false, reason: 'not-allowed' }); // no class: twin only
    expect(snap()).toBe(before);
  });
  it('allows the twin with no class', () => {
    make({ [BULWARK]: 1 }, 100);
    expect(recutGem(inv, BULWARK, OATHFIRE).ok).toBe(true);
  });
});

describe('recutTargetFor', () => {
  it('gives the twin for the own class and the matching variant for another', () => {
    expect(recutTargetFor(BULWARK, 'knight')).toBe(OATHFIRE);
    expect(recutTargetFor(OATHFIRE, 'knight')).toBe(BULWARK);
    expect(recutTargetFor(BULWARK, 'warden')).toBe(ROOTSTONE);
    expect(recutTargetFor(OATHFIRE, 'warden')).toBe('shard-gem.ravager');
    expect(recutTargetFor('shard-gem.removed', 'knight')).toBeNull();
  });
  it('always lands on a gem the table knows', () => {
    for (const g of SHARD_GEMS) for (const c of ['knight', 'warden', 'emberwright', 'ashblade', 'pathfinder'] as const) expect(recutTargetFor(g.id, c)).toBe(g.classId === c ? gemFor(c, g.variant === 'a' ? 'b' : 'a').id : gemFor(c, g.variant).id);
  });
});

describe('socketView', () => {
  it('marks a gem of another class dormant and an unknown gem id dormant', () => {
    make({ [BLADE]: 1 }, 0);
    raw.setTemper(BLADE, 5);
    raw.setSockets(BLADE, [{ slot: 0, shardId: OATHFIRE }, { slot: 1, shardId: 'shard-gem.removed' }]);
    expect(socketView(inv, BLADE, 'knight')).toEqual({ itemId: BLADE, open: 2, slots: [{ slot: 0, shardId: OATHFIRE, dormant: false }, { slot: 1, shardId: 'shard-gem.removed', dormant: true }] });
    expect(socketView(inv, BLADE, 'pathfinder').slots[0].dormant).toBe(true);
  });
  it('shows empty slots and none for a piece without sockets', () => {
    make({ [BLADE]: 1, ashplate: 1 }, 0);
    expect(socketView(inv, BLADE, 'knight').slots).toEqual([{ slot: 0, shardId: null, dormant: false }]);
    expect(socketView(inv, 'ashplate', 'knight')).toEqual({ itemId: 'ashplate', open: 0, slots: [] });
  });
});
