import { describe, expect, it } from 'vitest';
import { CLASS_IDS } from '../../actors/classes';
import { LIST_PRICES } from '../../economy/prices';
import { CHEST_GOLD } from '../../economy/goldTable';
import { ENEMY_DEFS } from '../../enemies/defs';
import { getItem } from '../../inventory/items';
import { POI_LOOT } from '../../world/poi/loot';
import { GEAR_ROWS } from '../catalog';
import { SHARD_GEMS } from '../sockets/table';
import { K10_STRINGS_EN } from '../sockets/strings.en';
import { ECONOMY_ACT3_STRINGS_EN } from '../../economy/strings.act3.en';
import { ECONOMY_STRINGS_EN } from '../../economy/strings.en';
import { GEAR_STRINGS_EN } from '../strings.en';
import { ACT3_KEYS, ACT3_TRINKETS, TIER4_GEAR_ITEMS, TIER4_MATERIALS, TIER4_OTHER_ITEMS, TIER4_RECIPES, TIER4_REWARD_ROWS, TIER4_ROWS, tier4MaterialFor } from './catalog';

const tier3 = (id: string) => GEAR_ROWS.find((r) => r.id === id)!;

describe('tier 4 rows', () => {
  it('gives every class a tier 4 weapon and armour, and the knight an offhand too', () => {
    for (const cls of CLASS_IDS) {
      const mine = TIER4_ROWS.filter((r) => r.classes.includes(cls));
      expect(mine.filter((r) => r.slot === 'weapon'), `${cls} weapon`).toHaveLength(1);
      expect(mine.filter((r) => r.slot === 'armour'), `${cls} armour`).toHaveLength(1);
      expect(mine.filter((r) => r.slot === 'offhand'), `${cls} offhand`).toHaveLength(cls === 'knight' ? 1 : 0);
    }
  });

  it('puts every tier 4 piece more than 25% above its tier 3 piece at +5, with one socket', () => {
    expect(Object.keys(TIER4_RECIPES)).toHaveLength(TIER4_ROWS.length);
    for (const [from, to] of Object.entries(TIER4_RECIPES)) {
      const hi = TIER4_ROWS.find((r) => r.id === to)!;
      const lo = tier3(from);
      expect(hi, to).toBeDefined();
      expect(lo.tier).toBe(3);
      expect(hi.slot).toBe(lo.slot);
      expect(hi.classes).toEqual(lo.classes);
      expect(hi.tier).toBe(4);
      expect(hi.stat, `${to} vs ${from}`).toBeGreaterThan(lo.stat * 1.25);
      expect(hi.sockets).toBe(1);
      expect(getItem(to)?.sockets).toBe(1);
      expect(getItem(to)?.gearTier).toBe(4);
    }
  });

  it('registers a list price for every piece and trinket, and none for key items', () => {
    for (const r of [...TIER4_ROWS, ...TIER4_REWARD_ROWS]) expect(LIST_PRICES[r.id], r.id).toBe(r.price);
    for (const id of [TIER4_MATERIALS.scale, TIER4_MATERIALS.hide, TIER4_MATERIALS.rimeIron, ...Object.values(ACT3_TRINKETS)]) expect(LIST_PRICES[id], id).toBeGreaterThan(0);
    for (const id of Object.values(ACT3_KEYS)) expect(LIST_PRICES[id], id).toBeUndefined();
  });

  it('has a hide cost for the Ashblade and Pathfinder pieces and scales for the rest', () => {
    expect(tier4MaterialFor('wyrmhide-jerkin')).toBe('wyrm-hide');
    expect(tier4MaterialFor('wyrm-tempered-arbalest')).toBe('wyrm-hide');
    expect(tier4MaterialFor('wyrmscale-plate')).toBe('shed-wyrm-scale');
    expect(tier4MaterialFor('wyrm-silk-robe')).toBe('shed-wyrm-scale');
  });
});

describe('K10 strings', () => {
  const ids = [
    ...TIER4_GEAR_ITEMS.map((d) => d.id),
    ...TIER4_OTHER_ITEMS.map((d) => d.id),
    ...SHARD_GEMS.map((g) => g.id),
  ];
  it('covers every K10 item, gem and reward with a name and a description', () => {
    expect(ids.length).toBeGreaterThanOrEqual(36);
    for (const id of ids) {
      expect(getItem(id), `${id} registered`).toBeDefined();
      expect(K10_STRINGS_EN[`item.${id}.name`], `${id} name`).toBeTruthy();
      expect(K10_STRINGS_EN[`item.${id}.desc`], `${id} desc`).toBeTruthy();
    }
  });
  it('says shard-gem on every gem and never calls a gem a bare shard', () => {
    for (const g of SHARD_GEMS) {
      expect(K10_STRINGS_EN[`item.${g.id}.name`]).toMatch(/Shard-gem$/);
      expect(K10_STRINGS_EN[`item.${g.id}.desc`]).toMatch(/shard-gem/);
    }
  });
});

describe('string tables do not overlap', () => {
  it('keeps K10 keys disjoint from the Act 3 economy, gear and base economy strings', () => {
    const k10 = Object.keys(K10_STRINGS_EN);
    for (const [name, other] of [['ECONOMY_ACT3_STRINGS_EN', ECONOMY_ACT3_STRINGS_EN], ['GEAR_STRINGS_EN', GEAR_STRINGS_EN], ['ECONOMY_STRINGS_EN', ECONOMY_STRINGS_EN]] as const) {
      expect(k10.filter((k) => k in other), name).toEqual([]);
    }
  });
  it('has no keen-knife item left', () => {
    expect(getItem('frostbrows-hunting-knife-keen')).toBeUndefined();
    expect(K10_STRINGS_EN['item.frostbrows-hunting-knife-keen.name']).toBeUndefined();
  });
});

describe('materials are never dropped', () => {
  const needles = ['shed-wyrm-scale', 'wyrm-hide', 'rime-iron'];
  // Raw source of every enemy file and the loot and chest tables (test files excluded).
  const sources = import.meta.glob<string>(
    ['../../enemies/**/*.ts', '!../../enemies/**/*.test.ts', '../../world/poi/loot.ts', '../../economy/goldTable.ts', '../../interaction/Chest.ts'],
    { eager: true, query: '?raw', import: 'default' },
  );

  it('keeps all three out of every enemy def, POI chest table and chest gold table', () => {
    const blob = JSON.stringify({ ENEMY_DEFS, POI_LOOT, CHEST_GOLD });
    for (const n of needles) expect(blob.includes(n), n).toBe(false);
  });
  it('keeps all three out of every enemy source file and the loot tables', () => {
    const files = Object.entries(sources);
    expect(files.length).toBeGreaterThan(10);
    for (const [f, src] of files) for (const n of needles) expect(src.includes(n), `${f} mentions ${n}`).toBe(false);
  });
});
