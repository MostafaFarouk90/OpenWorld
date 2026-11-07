// Act 5 N7: Sunforged tier 5, forge-heart fragments and Alric's rim anvil (plans/act5-N7.md sections 3 and 4).
import '../../economy/items';
import '../../items/act4/catalog';
import '../../items/act5/catalog';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getItem } from '../../inventory/items';
import { listPrice } from '../../economy/prices';
import { TIER4_ROWS } from '../tier4/catalog';
import { forgeCost, forgeItem } from '../forge';
import { createTemperingSession, type GearState, type SessionPorts } from '../session';
import { temperCostFor, tierOf } from '../tempering';
import { metronome, testInventory } from '../testkit';
import { TIER5_EMISSIVE, setWeaponTint } from '../weaponTint';
import { socketCount } from '../sockets/sockets';
import { GEAR_TUNING } from '../tuning';
import { FRAGMENT_SOURCES, FRAGMENT_TOTAL, FORGE_HEART_FRAGMENT, FOUNDRY_CHEST } from './fragments';
import { SUNFORGED_IDS, TIER5_RECIPES, TIER5_ROWS } from './catalog';

describe('fragments', () => {
  it('sum to 5: M48 1, M50 1, D09 2, the Foundry chest 1', () => {
    expect(FRAGMENT_SOURCES).toEqual({ m48: 1, m50: 1, d09: 2, foundryChest: 1 });
    expect(FRAGMENT_TOTAL).toBe(5);
    expect(FOUNDRY_CHEST).toMatchObject({ id: 'chest:foundry-cache', loot: [{ itemId: FORGE_HEART_FRAGMENT, count: 1 }] });
  });
  it('is a quest item that can never be sold', () => {
    expect(getItem(FORGE_HEART_FRAGMENT)).toMatchObject({ kind: 'quest', stackMax: 9 });
    expect(listPrice(FORGE_HEART_FRAGMENT)).toBeUndefined();
  });
  it('lets a weapon be forged at M50 (2 held) and the armour only after D09 (4 held), with one spare', () => {
    const m50 = FRAGMENT_SOURCES.m48 + FRAGMENT_SOURCES.m50;
    expect(m50).toBe(forgeCost('wyrm-tempered-oathblade')!.materials![0].count);
    const afterD09 = m50 + FRAGMENT_SOURCES.d09;
    expect(afterD09 - 2 * 2).toBe(0);
    expect(FRAGMENT_TOTAL - 2 - 2).toBe(FORGE_HEART_FRAGMENT === 'forge-heart-fragment' ? forgeCost('badge-shield-of-the-keeper')!.materials![0].count : 0);
  });
});

describe('the Sunforged rows', () => {
  it('has the eleven pieces of design 9.6: three Knight, two for every other class', () => {
    expect(TIER5_ROWS).toHaveLength(11);
    const by = (c: string) => TIER5_ROWS.filter((r) => r.classes[0] === c).length;
    expect([by('knight'), by('warden'), by('emberwright'), by('ashblade'), by('pathfinder')]).toEqual([3, 2, 2, 2, 2]);
    expect(new Set(SUNFORGED_IDS).size).toBe(11);
  });
  it('registers each at tier 5 with two sockets and a stat above its tier 4 piece at +5', () => {
    for (const [from, to] of Object.entries(TIER5_RECIPES)) {
      const d = getItem(to)!;
      expect(tierOf(d)).toBe(5);
      expect(d.sockets).toBe(2);
      const f = getItem(from)!;
      const k = 1 + GEAR_TUNING.combat.temperPerLevel * 5;
      const [stat, base] = d.slot === 'weapon' ? [d.stats!.attack!, f.stats!.attack!] : [d.stats!.defense!, f.stats!.defense!];
      expect(stat, from).toBeGreaterThan(base * k);
    }
    expect(socketCount('sunplate', 0)).toBe(2);
  });
  it('maps each of the eleven tier 4 rows plus the M39 Oathblade, never to another class', () => {
    expect(Object.keys(TIER5_RECIPES)).toHaveLength(12);
    for (const r of TIER4_ROWS) {
      const to = TIER5_RECIPES[r.id];
      expect(to, r.id).toBeDefined();
      expect(TIER5_ROWS.find((x) => x.id === to)!.classes).toEqual(r.classes);
      expect(TIER5_ROWS.find((x) => x.id === to)!.slot).toBe(r.slot);
    }
    expect(TIER5_RECIPES['gauts-oathblade']).toBe('sunforged-dawnbrand');
  });
});

describe('forging at the rim anvil', () => {
  it('costs exactly 2 fragments for each of the ten weapon and armour pieces, 1 for Aegis', () => {
    for (const [from, to] of Object.entries(TIER5_RECIPES)) {
      const c = forgeCost(from)!;
      const slot = TIER5_ROWS.find((r) => r.id === to)!.slot;
      expect(c.materials).toEqual([{ itemId: FORGE_HEART_FRAGMENT, count: slot === 'offhand' ? 1 : 2 }]);
      expect(c.ingots).toBe(0);
      expect(c.gold).toBe(slot === 'weapon' ? 300 : slot === 'armour' ? 250 : 300);
    }
  });
  it('turns the tier 4 piece into the Sunforged one, taking fragments and gold, keeping it equipped', () => {
    const inv = testInventory({ 'wyrm-tempered-oathblade': 1, [FORGE_HEART_FRAGMENT]: 3 }, 600);
    inv.equip('wyrm-tempered-oathblade');
    inv.setTemper('wyrm-tempered-oathblade', 4, 'sworn');
    expect(forgeItem(inv, 'wyrm-tempered-oathblade')).toEqual({ ok: true, from: 'wyrm-tempered-oathblade', to: 'sunforged-dawnbrand' });
    expect(inv.has('wyrm-tempered-oathblade')).toBe(false);
    expect(inv.equipped('weapon')).toBe('sunforged-dawnbrand');
    expect(inv.gear('sunforged-dawnbrand')).toEqual({ temper: 0 });
    expect(inv.count(FORGE_HEART_FRAGMENT)).toBe(1);
    expect(inv.gold).toBe(300);
  });
  it('lets a Knight forge Dawnbrand from the M39 Oathblade', () => {
    const inv = testInventory({ 'gauts-oathblade': 1, [FORGE_HEART_FRAGMENT]: 2 }, 500);
    expect(forgeItem(inv, 'gauts-oathblade').ok).toBe(true);
    expect(inv.has('sunforged-dawnbrand')).toBe(true);
  });
  it.each([
    ['1 fragment held', { 'wyrm-tempered-oathblade': 1, [FORGE_HEART_FRAGMENT]: 1 }, 999, 'no-materials'],
    ['no fragments', { 'wyrm-tempered-oathblade': 1 }, 999, 'no-materials'],
    ['no gold', { 'wyrm-tempered-oathblade': 1, [FORGE_HEART_FRAGMENT]: 2 }, 299, 'no-gold'],
    ['piece not held', { [FORGE_HEART_FRAGMENT]: 2 }, 999, 'not-held'],
    ['already owned', { 'wyrm-tempered-oathblade': 1, 'sunforged-dawnbrand': 1, [FORGE_HEART_FRAGMENT]: 2 }, 999, 'owned'],
  ] as const)('refuses %s and takes nothing', (_n, items, gold, reason) => {
    const inv = testInventory({ ...items }, gold);
    const before = JSON.stringify([inv.gold, inv.raw.serialize()]);
    expect(forgeItem(inv, 'wyrm-tempered-oathblade')).toEqual({ ok: false, reason });
    expect(JSON.stringify([inv.gold, inv.raw.serialize()])).toBe(before);
  });
  it('refuses when its shard-gems would not fit back', () => {
    const base = testInventory({ 'wyrm-tempered-oathblade': 1, [FORGE_HEART_FRAGMENT]: 2 }, 600);
    const inv = Object.create(base, { gemRoomFor: { value: () => false } });
    expect(forgeItem(inv, 'wyrm-tempered-oathblade')).toEqual({ ok: false, reason: 'gems' });
  });
  it('tempers tier 5 for 220 gold a level plus rime-iron and scale or hide', () => {
    expect(temperCostFor('sunforged-dawnbrand', 3)).toEqual({ gold: 660, materials: [{ itemId: 'rime-iron', count: 1 }, { itemId: 'shed-wyrm-scale', count: 1 }] });
    expect(temperCostFor('sunforged-sparks', 1)!.materials.map((m) => m.itemId)).toEqual(['rime-iron', 'wyrm-hide']);
    expect(temperCostFor('wyrm-tempered-oathblade', 1)!.gold).toBe(160);
  });
});

describe('the session modes', () => {
  function make(items: Record<string, number>, gold: number, rim: boolean) {
    const inv = testInventory(items, gold);
    const state: GearState = { anvilTiers: [2, 3, 4], lessonRuns: 0 };
    const ports: SessionPorts = { inventory: inv, state, now: () => 0, makeClock: () => metronome(), anvilUsable: () => true, smithUsable: () => true, rimUsable: () => rim, lessonActive: () => false, emitTempered: () => {} };
    return { inv, state, s: createTemperingSession(ports) };
  }
  const HELD = { 'wyrm-tempered-oathblade': 1, [FORGE_HEART_FRAGMENT]: 2, 'rime-iron': 2, 'shed-wyrm-scale': 2 };
  const row = (s: ReturnType<typeof make>['s'], id: string) => s.view().items.find((r) => r.id === id)!;

  it('is cold (refuses to open) until M50 lights it', () => {
    const t = make(HELD, 600, false);
    expect(t.s.open('rim')).toBe(false);
    expect(t.s.state).toBe('idle');
  });
  it('forges tier 5 at the rim and shows the cost', () => {
    const t = make(HELD, 600, true);
    expect(t.s.open('rim')).toBe(true);
    expect(row(t.s, 'wyrm-tempered-oathblade').forge).toMatchObject({ to: 'sunforged-dawnbrand', gold: 300, canAfford: true, materials: [{ itemId: FORGE_HEART_FRAGMENT, count: 2 }] });
    t.s.forge('wyrm-tempered-oathblade');
    expect(t.s.view().lastResult).toEqual({ ok: true, perfect: false, forged: 'sunforged-dawnbrand' });
  });
  it('never forges tier 5 at the smith or the Hushed Anvil, and shows no row there', () => {
    for (const mode of ['smith', 'anvil'] as const) {
      const t = make(HELD, 600, true);
      t.s.open(mode);
      expect(row(t.s, 'wyrm-tempered-oathblade').forge).toBeNull();
      t.s.forge('wyrm-tempered-oathblade');
      expect(t.inv.has('wyrm-tempered-oathblade')).toBe(true);
      expect(t.s.view().lastResult).toBeNull();
    }
  });
  it('counts as the Anvil for tier 5: a landed tier 5 temper there marks the tier, so the smith then tempers it', () => {
    const t = make({ 'sunforged-dawnbrand': 1, 'rime-iron': 3, 'shed-wyrm-scale': 3 }, 900, true);
    t.s.open('smith');
    expect(row(t.s, 'sunforged-dawnbrand').blockedBy).toBe('anvil-first');
    t.s.close();
    t.s.open('rim');
    expect(row(t.s, 'sunforged-dawnbrand').blockedBy).toBeNull();
    t.s.select('sunforged-dawnbrand');
    t.s.start();
    for (let i = 0; i < 400 && t.s.state === 'rhythm'; i++) t.s.update(i * 1000);
    if (t.s.state === 'rhythm') t.s.strike(0);
    expect(t.state.anvilTiers).toContain(5);
    t.s.close();
    t.s.open('smith');
    expect(row(t.s, 'sunforged-dawnbrand').blockedBy).toBeNull();
  });
  it('tempers only tier 4 and 5 at the rim, and tier 4 keeps the Hushed Anvil rule', () => {
    const t = make({ 'halvard-steel-blade': 1, 'wyrm-tempered-oathblade': 1, 'sunforged-dawnbrand': 1 }, 900, true);
    t.state.anvilTiers = [];
    t.s.open('rim');
    expect(row(t.s, 'halvard-steel-blade').blockedBy).toBe('locked');
    expect(row(t.s, 'wyrm-tempered-oathblade').blockedBy).toBe('anvil-first');
    t.state.anvilTiers = [4];
    expect(row(t.s, 'wyrm-tempered-oathblade').blockedBy).not.toBe('anvil-first');
  });
  it('spends no lesson run at the rim', () => {
    const t = make(HELD, 600, true);
    t.s.open('rim');
    expect(t.state.lessonRuns).toBe(0);
  });
});

describe('weapon tint', () => {
  it('uses the gold-white palette at tier 5', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    const root = new THREE.Group();
    root.add(mesh);
    setWeaponTint(root, true, 5);
    expect((mesh.material as THREE.MeshStandardMaterial).emissive.getHex()).toBe(TIER5_EMISSIVE);
  });
});
