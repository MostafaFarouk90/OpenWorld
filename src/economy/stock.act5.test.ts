// Act 5 N7: Alric's rim forge, Maud's rim kitchen, the Rim Camp posts, Merrin's discount, the shop save and the item readers.
import { describe, expect, it } from 'vitest';
import '../gear/tier4/catalog';
import '../items/act4/catalog';
import '../items/act5/catalog';
import '../quests/content/act2/items';
import { flagConditionHolds } from '../core/flagCondition';
import { DEFAULT_KITS, TRAINER_POSTS, trainerPlacement } from '../classes/kits';
import { getItem } from '../inventory/items';
import { ACT5_ITEMS, ACT5_REWARDS, ACT5_SELL_FLAT, ACT5_TRINKETS, HEARTY_FOODS, OSWIN_BOUNTY, endingKeepsakeFor } from '../items/act5/catalog';
import { CROWN_WARMTH, crownTintFor, crownWarmth } from '../items/act5/crown';
import { NO_WARD, heatWard } from '../items/act5/heatWard';
import { gauntletPoise } from '../items/act5/items.act5.plugin';
import { ACT5_RITE_FLAG, act5RiteAvailable, act5RiteUnused } from '../items/act5/rite';
import { siegeSupply } from '../items/act5/supply';
import { ACT5_QUEST_IDS } from '../quests/lint/act5Ids';
import type { FavourBand } from '../state/favour';
import './items';
import './items.act3';
import { createRite } from '../companions/rite';
import { GameEvents } from '../core/events';
import { sellPrice } from './prices';
import {
  ACT5_TRAINER_POSTS,
  ACT5_VENDOR_OPEN_WHEN,
  ACT5_VENDOR_POSTS,
  F4_CLEANSED_FLAG,
  RIM_ANVIL_ALRIC,
  RIM_CAMP_ANCHORS,
  RIM_FORGE_DUNSTAN,
  RIM_MOVING_VENDORS,
  rimShop,
  rimTrainer,
} from './rimCamp.act5';
import { ACT5_UNPERSISTED, Shop, type ShopPorts } from './Shop';
import { SELL_FLAT, VENDORS, VENDOR_OPEN_WHEN, VENDOR_POSTS, vendorAnchor, vendorOpenByTable, type VendorId } from './stock';
import { refugeShop, refugeTrainer } from './refugePosts.act4';

const flags = (f: Record<string, unknown>) => ({ getFlag: (k: string) => f[k] });
const AT_REFUGE = flags({ 'story.gate.a4': true, 'story.m41.complete': true, 'story.gate.a5': true, 'story.m47.complete': true, 'story.m48.complete': true });
const AT_RIM = flags({ ...{ 'story.gate.a4': true, 'story.m41.complete': true, 'story.gate.a5': true, 'story.m47.complete': true }, 'story.m49.complete': true });

function make(o: { band?: FavourBand; flags?: Record<string, unknown> } = {}) {
  const w = { gold: 50000, items: new Map<string, number>(), warnings: [] as string[] };
  const ports: ShopPorts = {
    gold: () => w.gold,
    takeGold: (n) => ((w.gold -= n), n),
    addGold: (n) => void (w.gold += n),
    count: (id) => w.items.get(id) ?? 0,
    remove: (id, n) => {
      const h = w.items.get(id) ?? 0;
      if (h < n) return false;
      w.items.set(id, h - n);
      return true;
    },
    isEquipped: () => false,
    getItem,
    grant: (_s, id, n) => void w.items.set(id, (w.items.get(id) ?? 0) + n),
    band: () => o.band ?? null,
    isOpen: () => true,
    emit: () => {},
    warn: (m) => void w.warnings.push(m),
    flag: (k) => o.flags?.[k],
    gearRecord: () => ({ temper: 0 }),
  };
  return { shop: new Shop(ports), w };
}
const ids = (shop: Shop, v: VendorId) => shop.offers(v).map((x) => x.itemId);

describe('vendors at Ashgate before M49 and at the Rim Camp after, re-derived from flags', () => {
  it('every moving vendor stands at the refuge until story.m49.complete, then at the Rim Camp', () => {
    for (const v of RIM_MOVING_VENDORS) {
      if (v === 'wulfhild') continue; // her pre-M49 post is the Walker Camp (Act 4), checked below
      expect(vendorAnchor(v, AT_REFUGE), v).toBe(refugeShop(v));
      expect(vendorAnchor(v, AT_RIM), v).toBe(rimShop(v));
    }
    expect(vendorAnchor('wulfhild', flags({ 'story.m43.complete': true }))).toBe('waste.walker-camp.shop.wulfhild');
    expect(vendorAnchor('wulfhild', AT_RIM)).toBe(rimShop('wulfhild'));
  });
  it('is a pure read of the flags, so a load re-derives it (flag off puts the shop back)', () => {
    expect(vendorAnchor('merrin', AT_RIM)).toBe(rimShop('merrin'));
    expect(vendorAnchor('merrin', AT_REFUGE)).toBe(refugeShop('merrin'));
  });
  it('Hild stays at Ashgate', () => {
    expect(vendorAnchor('hild', AT_RIM)).toBe('ashgate.shop.hild');
    expect(ACT5_VENDOR_POSTS.some((r) => r.vendorId === 'hild')).toBe(false);
  });
  it('has one row per moving vendor, each guarded by a real flag, and the tables carry them', () => {
    for (const r of ACT5_VENDOR_POSTS) expect(r.when.all?.length ?? 0).toBeGreaterThan(0);
    expect(VENDOR_POSTS.filter((r) => r.vendorId === 'dunstan').map((r) => r.anchorId)).toEqual([refugeShop('dunstan'), rimShop('dunstan')]);
    expect(VENDOR_OPEN_WHEN).toMatchObject(ACT5_VENDOR_OPEN_WHEN);
  });
  it('trainer desks move too, and Rook holds the Knight desk at the Rim Camp', () => {
    for (const kit of Object.values(DEFAULT_KITS)) {
      const p = trainerPlacement(kit, AT_RIM);
      expect(p.moved, kit.classId).toBe(true);
      expect(p.deskAnchor, kit.classId).toBe(rimTrainer(p.npcId));
      expect(trainerPlacement(kit, AT_REFUGE).deskAnchor, kit.classId).toBe(refugeTrainer(trainerPlacement(kit, AT_REFUGE).npcId));
    }
    expect(trainerPlacement(DEFAULT_KITS.knight, AT_RIM).npcId).toBe('rook');
    expect(TRAINER_POSTS.slice(-ACT5_TRAINER_POSTS.length)).toEqual(ACT5_TRAINER_POSTS);
  });
  it('exports every anchor id N1 must define, once each, all in the caldera.camp namespace', () => {
    expect(new Set(RIM_CAMP_ANCHORS).size).toBe(RIM_CAMP_ANCHORS.length);
    expect(RIM_CAMP_ANCHORS.every((a) => a.startsWith('caldera.camp.'))).toBe(true);
    for (const a of [RIM_FORGE_DUNSTAN, RIM_ANVIL_ALRIC, rimShop('alric'), rimShop('maud'), rimTrainer('rook')]) expect(RIM_CAMP_ANCHORS).toContain(a);
  });
});

describe('Alric and Maud', () => {
  const open = (v: VendorId, f: Record<string, unknown>) => vendorOpenByTable(v, flags(f));
  it('Alric opens when M47 is done and not before', () => {
    expect(open('alric', {})).toBe(false);
    expect(open('alric', { 'story.m47.complete': true })).toBe(true);
  });
  it('Maud exists only with F4 Cleanse (and once the allies are at the camp)', () => {
    expect(open('maud-rim', { 'story.m49.complete': true })).toBe(false); // Seal, or unset
    expect(open('maud-rim', { [F4_CLEANSED_FLAG]: true })).toBe(false); // Cleanse but not yet at the camp
    expect(open('maud-rim', { 'story.m49.complete': true, [F4_CLEANSED_FLAG]: true })).toBe(true);
  });
  it('Alric stocks the temper materials and no gear; nothing from the Act 5 rewards is sold', () => {
    const got = ids(make().shop, 'alric');
    expect(got).toEqual(expect.arrayContaining(['rime-iron', 'shed-wyrm-scale', 'wyrm-hide', 'healing-flask']));
    expect(got.some((i) => getItem(i)?.slot === 'weapon' || getItem(i)?.slot === 'armour')).toBe(false);
    expect(got).not.toContain('forge-heart-fragment');
    expect(make().w.warnings).toEqual([]);
  });
  it("Maud's kitchen sells her food, with the two new dishes priced and Hearty-lighting", () => {
    const m = make();
    expect(ids(m.shop, 'maud-rim')).toEqual(['maud-stew', 'maud-poultice', 'hearth-bread', 'barley-cake', 'rim-hotpot', 'ember-broth']);
    expect(m.shop.quote('maud-rim', 'rim-hotpot')).toBe(30);
    expect(HEARTY_FOODS).toEqual(['maud-stew', 'rim-hotpot', 'ember-broth']);
    expect(getItem('ember-broth')?.use).toMatchObject({ noHeal: true, burnRelief: 25 });
  });
  it('neither vendor buys', () => {
    expect(VENDORS.alric.buys).toBe(false);
    expect(VENDORS['maud-rim'].buys).toBe(false);
  });
});

describe("Merrin's R20 discount carried to the Rim Camp", () => {
  it('quotes the same 15%, 10%, 0% with her post moved (the rows key on the vendor id)', () => {
    const q = (choice: string) => make({ band: 'banked', flags: { 'story.m08.favourTab': true, 'story.r20.choice': choice } }).shop.quote('merrin', 'healing-flask')!;
    expect(q('bribe')).toBeLessThan(q('stealth'));
    expect(q('stealth')).toBeLessThan(q('force'));
    expect(vendorAnchor('merrin', AT_RIM)).toBe(rimShop('merrin'));
  });
});

describe('the shop save', () => {
  it('leaves the unlimited-only Act 5 vendors out, so no older save changes', () => {
    const { shop } = make();
    const save = shop.serialize();
    expect(Object.keys(save.stock)).not.toContain('alric');
    expect(Object.keys(save.stock)).not.toContain('maud-rim');
    expect(Object.keys(save.buyBack)).not.toContain('alric');
    expect([...ACT5_UNPERSISTED].sort()).toEqual(['alric', 'maud-rim']);
  });
  it('no committed fixture mentions an Act 5 vendor', () => {
    const files = import.meta.glob('../save/__fixtures__/*.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    expect(Object.keys(files).length).toBeGreaterThan(5);
    for (const [f, text] of Object.entries(files)) expect(text.includes('"alric"') || text.includes('"maud-rim"'), f).toBe(false);
  });
  it('a limited line would persist normally (the rule is only for unlimited Act 5 stock)', () => {
    const lines = VENDORS.alric.lines;
    const orig = [...lines];
    (lines as unknown as unknown[]).push({ itemId: 'healing-flask', count: 2 });
    try {
      expect(Object.keys(make().shop.serialize().stock)).toContain('alric');
    } finally {
      (lines as unknown as unknown[]).length = 0;
      (lines as unknown as unknown[]).push(...orig);
    }
  });
  it('loads an older save that has no Act 5 vendors and fills the defaults', () => {
    const { shop, w } = make();
    shop.load({ stock: { wystan: {} }, buyBack: {} }, Shop.version);
    expect(ids(shop, 'alric').length).toBeGreaterThan(0);
    expect(w.warnings).toEqual([]);
  });
});

describe('the Act 5 item table', () => {
  it('gives every Act 5 quest a reward row, and every reward id is registered with strings', () => {
    for (const q of ACT5_QUEST_IDS) expect(ACT5_REWARDS[q], q).toBeDefined();
    for (const [q, list] of Object.entries(ACT5_REWARDS)) for (const id of list) expect(getItem(id), `${q}:${id}`).toBeDefined();
  });
  it('pays fragments only where the plan says: M48 1, M50 1, D09 2', () => {
    const n = (q: string) => ACT5_REWARDS[q].filter((i) => i === 'forge-heart-fragment').length;
    expect([n('m48'), n('m50'), n('d09')]).toEqual([1, 1, 2]);
    expect(Object.keys(ACT5_REWARDS).filter((q) => n(q) > 0).sort()).toEqual(['d09', 'm48', 'm50']);
  });
  it('keepsakes have no price and cannot be sold; the Oswin Bounty sells flat for 450', () => {
    for (const d of ACT5_ITEMS.filter((i) => i.kind === 'quest' && i.id !== OSWIN_BOUNTY)) {
      expect(sellPrice(d.id), d.id).toBeUndefined();
      expect(SELL_FLAT[d.id], d.id).toBeUndefined();
    }
    expect(SELL_FLAT[OSWIN_BOUNTY]).toBe(450);
    expect(ACT5_SELL_FLAT).toEqual({ [OSWIN_BOUNTY]: 450 });
  });
  it('wearables are tier 5 trinkets whose defence counts', () => {
    for (const id of Object.values(ACT5_TRINKETS)) expect(getItem(id)).toMatchObject({ kind: 'trinket', slot: 'trinket', gearTier: 5 });
    expect(getItem('regents-gauntlet')!.stats!.defense!).toBeGreaterThan(getItem('rimward-boots')!.stats!.defense!);
  });
  it('the M56 reward set follows the choice', () => {
    expect(endingKeepsakeFor('rekindle')).toBe('key.ending-lastember');
    expect(endingKeepsakeFor('let-it-die')).toBe('key.ending-longdawn');
    expect(endingKeepsakeFor(undefined)).toBeNull();
    expect(ACT5_REWARDS.m56).toHaveLength(2);
  });
});

describe('heat ward', () => {
  it('reads the worn trinket only', () => {
    expect(heatWard(null)).toEqual(NO_WARD);
    expect(heatWard('hearth-stone-charm')).toEqual(NO_WARD);
    expect(heatWard(ACT5_TRINKETS.cinderproofMantle)).toEqual({ lava: 0.7, exposure: 1, forgeFire: 1 });
    expect(heatWard(ACT5_TRINKETS.coolingBead)).toEqual({ lava: 1, exposure: 0.75, forgeFire: 1 });
    expect(heatWard(ACT5_TRINKETS.hammerRune)).toEqual({ lava: 1, exposure: 1, forgeFire: 0.75 });
  });
});

describe('the Regent\'s Gauntlet and the Ember Crown', () => {
  it('the Gauntlet adds 10% poise to the player\'s own hits only', () => {
    const g = ACT5_TRINKETS.regentsGauntlet;
    expect(gauntletPoise({ attackerId: 'player', kind: 'melee', poise: 100 }, 'player', g)).toBeCloseTo(110);
    expect(gauntletPoise({ attackerId: 'player', kind: 'status', poise: 100 }, 'player', g)).toBe(100);
    expect(gauntletPoise({ attackerId: 'foe', kind: 'melee', poise: 100 }, 'player', g)).toBe(100);
    expect(gauntletPoise({ attackerId: 'player', kind: 'melee', poise: 100 }, 'player', ACT5_TRINKETS.emberCrown)).toBe(100);
  });
  it('the Crown adds +8% max health only when worn after the ending', () => {
    const c = ACT5_TRINKETS.emberCrown;
    expect(crownWarmth(c, true)).toBe(CROWN_WARMTH.factor);
    expect(CROWN_WARMTH.factor).toBe(1.08);
    expect(crownWarmth(c, false)).toBe(1);
    expect(crownWarmth(null, true)).toBe(1);
    expect(crownWarmth(ACT5_TRINKETS.regentsGauntlet, true)).toBe(1);
  });
  it('the Crown glows by the ending', () => {
    expect(crownTintFor('rekindle')).not.toBe(crownTintFor('let-it-die'));
    expect(crownTintFor(undefined)).toBeNull();
  });
});

describe("Oswin's supply for M52", () => {
  const bands: FavourBand[] = ['cold', 'banked', 'stoked', 'hearthbound'];
  it('grid: fast delivers all, long two thirds rounded down, Hearthbound adds a resupply', () => {
    expect(bands.map((b) => siegeSupply(b, 'fast'))).toEqual([
      { perBreak: 0, resupplies: 0 },
      { perBreak: 3, resupplies: 0 },
      { perBreak: 6, resupplies: 0 },
      { perBreak: 6, resupplies: 1 },
    ]);
    expect(bands.map((b) => siegeSupply(b, 'long').perBreak)).toEqual([0, 2, 4, 4]);
  });
  it('treats an unset R26 as the long road (the lesser supply)', () => {
    expect(siegeSupply('stoked', undefined).perBreak).toBe(4);
    expect(getItem('oswin-flask')).toMatchObject({ kind: 'consumable', stackMax: 10 });
  });
});

describe("Aelfreda's Act 5 Hearth Rite", () => {
  function riteRig(scars = 3) {
    const f = new Map<string, unknown>([['story.gate.a2', true], ['story.gate.a3', true], ['story.gate.a4', true], ['story.gate.a5', true]]);
    const spells = { scars, removeScars: (n: number) => { const r = Math.min(n, spells.scars); spells.scars -= r; return r; } };
    const rite = createRite({ events: new GameEvents(() => {}), getFlag: (k) => f.get(k), setFlag: (k, v) => void f.set(k, v), joined: () => true, spells: () => spells });
    return { rite, f, spells };
  }
  it('is the fifth act\'s rite, once', () => {
    const t = riteRig();
    expect(t.rite.act()).toBe(5);
    expect(act5RiteUnused((k) => t.f.get(k))).toBe(true);
    expect(act5RiteAvailable(t.rite)).toBe(true);
    expect(t.rite.perform()).toBe(true);
    expect(t.f.get(ACT5_RITE_FLAG)).toBe(true);
    expect(act5RiteUnused((k) => t.f.get(k))).toBe(false);
    expect(act5RiteAvailable(t.rite)).toBe(false);
    expect(t.rite.perform()).toBe(false);
  });
  it('spending the Act 4 rite leaves the Act 5 one; no Scars spends nothing; the ending gate does not move the act', () => {
    const t = riteRig();
    t.f.set('aelfreda.rite.a4', true);
    expect(t.rite.available()).toBe(true);
    t.f.set('story.gate.end', true);
    expect(t.rite.act()).toBe(5);
    const none = riteRig(0);
    expect(none.rite.perform()).toBe(false);
    expect(none.f.get(ACT5_RITE_FLAG)).toBeUndefined();
  });
  it('story.gate.a6 is not an Act 5 flag (it would reset the rite)', () => {
    const t = riteRig();
    expect(t.f.has('story.gate.a6')).toBe(false);
    expect(flagConditionHolds({ none: ['story.gate.a6'] }, flags({ ...Object.fromEntries(t.f) }))).toBe(true);
  });
});
