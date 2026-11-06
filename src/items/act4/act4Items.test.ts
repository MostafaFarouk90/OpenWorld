// Act 4 L7: the item table, Gaut's Oathblade (Q3) and its class swap, and the carried form's poise bonus.
import '../../economy/items';
import '../../gear/sockets/table';
import { describe, expect, it } from 'vitest';
import { ActorRegistry } from '../../actors/ActorRegistry';
import type { ClassId } from '../../actors/classes';
import { DamageResolver } from '../../actors/DamageResolver';
import { playerInit } from '../../actors/teams';
import { GameEvents } from '../../core/events';
import { listPrice } from '../../economy/prices';
import { Shop, type ShopPorts } from '../../economy/Shop';
import { SHOP_LIST_PRICES } from '../../economy/stock';
import { registerGearModifiers } from '../../gear/combat';
import { TIER4_RECIPES } from '../../gear/tier4/catalog';
import { Inventory } from '../../inventory/Inventory';
import { getItem } from '../../inventory/items';
import { ACT4_QUEST_IDS } from '../../quests/lint/act4Ids';
import { ACT4_ITEMS, ACT4_KEEPSAKES, ACT4_REWARDS, ASH_SHROUD_MASK, OATHBLADE, RAIN_FLASK, RIMWARD_BOOTS, WATERSKIN_OF_RAIN, practiceBladeFor } from './catalog';
import { grantOathblade, oathbladeFormFor, oathbladePoise, OATHBLADE_POISE_MODIFIER, reconcileOathblade, type OathbladePorts } from './oathblade';
import { ITEMS_ACT4_STRINGS_EN } from './strings.en';

const REWARD_IDS = [...new Set(Object.values(ACT4_REWARDS).flat())];

function sellShop(inv: Inventory): Shop {
  const ports: ShopPorts = {
    gold: () => inv.gold,
    takeGold: (n) => inv.takeGold(n),
    addGold: (n) => inv.addGold(n),
    count: (id) => inv.count(id),
    remove: (id, n) => inv.remove(id, n),
    isEquipped: (id) => ['weapon', 'offhand', 'armour', 'trinket'].some((s) => inv.equipped(s as never) === id),
    getItem,
    grant: (_s, id, n) => void inv.add(id, n),
    band: () => null,
    isOpen: () => true,
    emit: () => {},
    warn: () => {},
    gearRecord: (id) => inv.gear(id),
  };
  return new Shop(ports);
}

function freshInv(items: Record<string, number> = {}): Inventory {
  const inv = new Inventory({ emit: () => {}, logger: { warn: () => {} } });
  inv.reset({ items, equipped: {} });
  return inv;
}

function portsFor(inv: Inventory, cls: { id: ClassId | null }): OathbladePorts {
  return {
    classId: () => cls.id,
    has: (id) => inv.has(id),
    add: (id, n) => inv.add(id, n),
    remove: (id, n) => inv.remove(id, n),
    setTemper: (id, l, a) => inv.setTemper(id, l, a),
    equipped: (s) => inv.equipped(s),
    equip: (id) => inv.equip(id),
    gemRoomFor: (id) => inv.gemRoomFor(id),
  };
}

describe('Act 4 item table', () => {
  it('has a reward row for every Act 4 quest (M38 is a cutscene and pays none)', () => {
    expect(Object.keys(ACT4_REWARDS).sort()).toEqual([...ACT4_QUEST_IDS].sort());
    for (const [q, ids] of Object.entries(ACT4_REWARDS)) if (q !== 'm38') expect(ids.length, q).toBeGreaterThan(0);
  });
  it('registers every reward at stack 1, with a name and a description', () => {
    for (const id of REWARD_IDS) {
      const def = getItem(id);
      expect(def, id).toBeDefined();
      expect(def!.stackMax, id).toBe(1);
      expect(ITEMS_ACT4_STRINGS_EN[def!.nameKey], id).toBeTruthy();
      expect(ITEMS_ACT4_STRINGS_EN[def!.descKey], id).toBeTruthy();
    }
    for (const d of ACT4_ITEMS) expect(ITEMS_ACT4_STRINGS_EN[d.nameKey], d.id).toBeTruthy();
  });
  it('prices no reward, so none can be sold', () => {
    for (const id of REWARD_IDS) {
      expect(listPrice(id), id).toBeUndefined();
      if (id !== ASH_SHROUD_MASK) expect(SHOP_LIST_PRICES[id], id).toBeUndefined();
    }
    const inv = freshInv(Object.fromEntries(REWARD_IDS.map((id) => [id, 1])));
    const shop = sellShop(inv);
    for (const id of REWARD_IDS) expect(shop.sell('wystan', id).ok, id).toBe(false);
    expect(inv.items().length).toBe(REWARD_IDS.length);
  });
  it('the mask is a key item held, the Rain Flask a stack of 10, the Waterskin heals and cools Burn, the boots a tier 4 trinket', () => {
    expect(getItem(ASH_SHROUD_MASK)).toMatchObject({ kind: 'quest', stackMax: 1 });
    expect(getItem(RAIN_FLASK)).toMatchObject({ kind: 'quest', stackMax: 10 });
    expect(getItem(WATERSKIN_OF_RAIN)?.use).toMatchObject({ healFraction: 0.4, burnRelief: 15 });
    expect(getItem(RIMWARD_BOOTS)).toMatchObject({ kind: 'trinket', slot: 'trinket', stats: { defense: 6 }, gearTier: 4 });
  });
  it('maps R22 to its blade', () => {
    expect(practiceBladeFor('light')).toBe(ACT4_KEEPSAKES.practiceBladeLight);
    expect(practiceBladeFor('heavy')).toBe(ACT4_KEEPSAKES.practiceBladeHeavy);
    expect(practiceBladeFor(undefined)).toBeNull();
    expect(practiceBladeFor('both')).toBeNull();
  });
  it('no recipe consumes either Oathblade form (it cannot be dismantled or forged away)', () => {
    for (const [from, to] of Object.entries(TIER4_RECIPES)) {
      expect([from, to]).not.toContain(OATHBLADE.sword);
      expect([from, to]).not.toContain(OATHBLADE.carried);
    }
  });
});

describe("Gaut's Oathblade (Q3)", () => {
  it('a Knight gets the sword at +5 with Sworn; repeat grants give nothing', () => {
    const inv = freshInv();
    const p = portsFor(inv, { id: 'knight' });
    expect(grantOathblade(p)).toEqual({ ok: true, granted: OATHBLADE.sword });
    expect(inv.gear(OATHBLADE.sword)).toEqual({ temper: 5, affix: 'sworn' });
    expect(grantOathblade(p)).toEqual({ ok: true, granted: null });
    expect(inv.count(OATHBLADE.sword)).toBe(1);
  });
  it.each(['warden', 'emberwright', 'ashblade', 'pathfinder'] as const)('a %s gets the carried trinket', (id) => {
    const inv = freshInv();
    expect(grantOathblade(portsFor(inv, { id }))).toEqual({ ok: true, granted: OATHBLADE.carried });
    expect(inv.has(OATHBLADE.sword)).toBe(false);
    expect(oathbladeFormFor(id)).toBe(OATHBLADE.carried);
  });
  it('selling either form is refused, tempered or not', () => {
    const inv = freshInv();
    grantOathblade(portsFor(inv, { id: 'knight' }));
    inv.add(OATHBLADE.carried, 1);
    const shop = sellShop(inv);
    expect(shop.sell('wystan', OATHBLADE.sword).ok).toBe(false);
    expect(shop.sell('wystan', OATHBLADE.carried).ok).toBe(false);
  });
  it('a class change swaps the form and back keeps +5 and Sworn; equipped follows only into a free slot', () => {
    const inv = freshInv();
    const cls: { id: ClassId | null } = { id: 'knight' };
    const p = portsFor(inv, cls);
    grantOathblade(p);
    inv.equip(OATHBLADE.sword);
    cls.id = 'warden';
    expect(reconcileOathblade(p)).toBe('swapped');
    expect(inv.has(OATHBLADE.sword)).toBe(false);
    expect(inv.equipped('trinket')).toBe(OATHBLADE.carried);
    cls.id = 'knight';
    expect(reconcileOathblade(p)).toBe('swapped');
    expect(inv.gear(OATHBLADE.sword)).toEqual({ temper: 5, affix: 'sworn' });
    expect(inv.has(OATHBLADE.carried)).toBe(false);
    expect(reconcileOathblade(p)).toBe('none');
  });
  it('a plain reconcile (a load) keeps an affix the forge changed; only a grant or a swap back resets it', () => {
    const inv = freshInv();
    const p = portsFor(inv, { id: 'knight' });
    grantOathblade(p);
    inv.setTemper(OATHBLADE.sword, 5, 'ember');
    expect(reconcileOathblade(p)).toBe('none');
    expect(inv.gear(OATHBLADE.sword)).toEqual({ temper: 5, affix: 'ember' });
  });
  it('the swap never displaces another trinket', () => {
    const inv = freshInv({ [RIMWARD_BOOTS]: 1 });
    const cls: { id: ClassId | null } = { id: 'knight' };
    const p = portsFor(inv, cls);
    grantOathblade(p);
    inv.equip(OATHBLADE.sword);
    inv.equip(RIMWARD_BOOTS);
    cls.id = 'emberwright';
    reconcileOathblade(p);
    expect(inv.equipped('trinket')).toBe(RIMWARD_BOOTS);
    expect(inv.has(OATHBLADE.carried)).toBe(true);
  });
  it('fitted shard-gems go back to the bag; with no room the swap waits and retries', () => {
    const gem = 'shard-gem.oathfire';
    const inv = freshInv();
    const cls: { id: ClassId | null } = { id: 'knight' };
    const p = portsFor(inv, cls);
    grantOathblade(p);
    expect(inv.setSockets(OATHBLADE.sword, [{ slot: 0, shardId: gem }])).toBe(true);
    inv.add(gem, getItem(gem)!.stackMax);
    cls.id = 'ashblade';
    expect(reconcileOathblade(p)).toBe('waiting');
    expect(inv.has(OATHBLADE.sword)).toBe(true);
    expect(inv.socketsOf(OATHBLADE.sword)).toHaveLength(1);
    inv.remove(gem, 1);
    expect(reconcileOathblade(p)).toBe('swapped');
    expect(inv.count(gem)).toBe(getItem(gem)!.stackMax);
    expect(inv.has(OATHBLADE.carried)).toBe(true);
  });
  it('holding neither form, reconcile does nothing', () => {
    const inv = freshInv();
    expect(reconcileOathblade(portsFor(inv, { id: 'knight' }))).toBe('none');
    expect(inv.items()).toEqual([]);
  });
  it('the sword survives a save round trip at +5 Sworn with its gem', () => {
    const inv = freshInv();
    grantOathblade(portsFor(inv, { id: 'knight' }));
    inv.setSockets(OATHBLADE.sword, [{ slot: 1, shardId: 'shard-gem.oathfire' }]);
    const copy = new Inventory({ emit: () => {}, logger: { warn: () => {} } });
    copy.load(JSON.parse(JSON.stringify(inv.serialize())), Inventory.version);
    expect(copy.gear(OATHBLADE.sword)).toEqual({ temper: 5, affix: 'sworn' });
    expect(copy.socketsOf(OATHBLADE.sword)).toEqual([{ slot: 1, shardId: 'shard-gem.oathfire' }]);
  });
});

describe('Oathblade combat', () => {
  function rig(items: Record<string, number>, equipped: string[]) {
    const events = new GameEvents(() => {});
    const actors = new ActorRegistry(events);
    const dr = new DamageResolver(actors, events, () => {});
    const player = actors.spawn(playerInit());
    const wraith = actors.spawn({ kind: 'ash-wraith', team: 'hostile', maxHealth: 10000, maxPoise: 10000 });
    const boar = actors.spawn({ kind: 'boar', team: 'hostile', maxHealth: 10000, maxPoise: 10000 });
    const ally = actors.spawn({ kind: 'hound', team: 'ally', maxHealth: 10000, maxPoise: 10000 });
    const inv = freshInv(items);
    if (items[OATHBLADE.sword]) inv.setTemper(OATHBLADE.sword, 5, 'sworn');
    for (const id of equipped) inv.equip(id);
    registerGearModifiers(dr, { equipped: (s) => inv.equipped(s), gear: (id) => inv.gear(id) });
    dr.addModifier(OATHBLADE_POISE_MODIFIER.id, (req) => void (req.poise = oathbladePoise(req, player.id, inv.equipped('trinket'))), OATHBLADE_POISE_MODIFIER.order);
    return { dr, player, wraith, boar, ally, inv };
  }
  it('the sword hits a wraith 25% harder than a boar (Sworn)', () => {
    const t = rig({ [OATHBLADE.sword]: 1 }, [OATHBLADE.sword]);
    const w = t.dr.apply({ attackerId: t.player.id, targetId: t.wraith.id, amount: 100, kind: 'melee' })!;
    const b = t.dr.apply({ attackerId: t.player.id, targetId: t.boar.id, amount: 100, kind: 'melee' })!;
    expect(w.dealt / b.dealt).toBeCloseTo(1.25, 5);
  });
  it('the carried form adds 10% poise on the player hit, only while equipped', () => {
    const t = rig({ [OATHBLADE.carried]: 1 }, [OATHBLADE.carried]);
    expect(t.dr.apply({ attackerId: t.player.id, targetId: t.boar.id, amount: 10, poise: 30, kind: 'melee' })!.poiseDealt).toBeCloseTo(33, 5);
    t.inv.unequip('trinket');
    expect(t.dr.apply({ attackerId: t.player.id, targetId: t.boar.id, amount: 10, poise: 30, kind: 'melee' })!.poiseDealt).toBe(30);
  });
  it('the poise bonus skips status ticks and companions', () => {
    const t = rig({ [OATHBLADE.carried]: 1 }, [OATHBLADE.carried]);
    expect(oathbladePoise({ attackerId: t.player.id, kind: 'status', poise: 30 }, t.player.id, OATHBLADE.carried)).toBe(30);
    expect(t.dr.apply({ attackerId: t.ally.id, targetId: t.boar.id, amount: 10, poise: 30, kind: 'melee' })!.poiseDealt).toBe(30);
  });
});
