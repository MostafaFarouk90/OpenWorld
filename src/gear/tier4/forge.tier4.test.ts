import '../../economy/items';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ActorRegistry } from '../../actors/ActorRegistry';
import { DamageResolver } from '../../actors/DamageResolver';
import { playerInit } from '../../actors/teams';
import { GameEvents } from '../../core/events';
import { defenceRating, registerGearModifiers } from '../combat';
import { FORGE_RECIPES, forgeCost, forgeItem } from '../forge';
import { createTemperingSession, type GearState, type SessionPorts } from '../session';
import { checkTemper, temperCost, temperCostFor, temperItem } from '../tempering';
import { metronome, testInventory } from '../testkit';
import { TIER4_EMISSIVE, TIER3_EMISSIVE, setWeaponTint } from '../weaponTint';
import { TIER4_RECIPES } from './catalog';

const KNIGHT = { 'ashforged-longsword': 1, 'rime-iron': 2, 'shed-wyrm-scale': 3 };
const snap = (inv: ReturnType<typeof testInventory>) => JSON.stringify([inv.gold, inv.raw.serialize()]);

describe('forging tier 4', () => {
  it('turns a tier 3 piece into its tier 4 piece, taking gold and materials and carrying the equip', () => {
    const inv = testInventory(KNIGHT, 500);
    inv.equip('ashforged-longsword');
    expect(forgeItem(inv, 'ashforged-longsword')).toEqual({ ok: true, from: 'ashforged-longsword', to: 'wyrm-tempered-oathblade' });
    expect(inv.has('ashforged-longsword')).toBe(false);
    expect(inv.has('wyrm-tempered-oathblade')).toBe(true);
    expect(inv.equipped('weapon')).toBe('wyrm-tempered-oathblade');
    expect(inv.count('rime-iron')).toBe(0);
    expect(inv.count('shed-wyrm-scale')).toBe(0);
    expect(inv.gold).toBe(200);
  });
  it('charges 300 for a weapon and 240 for armour or a shield', () => {
    expect(forgeCost('ashforged-longsword')?.gold).toBe(300);
    expect(forgeCost('ashplate')?.gold).toBe(240);
    expect(forgeCost('spike-shield')?.gold).toBe(240);
  });
  it('does not carry temper over and leaves an unequipped piece unequipped', () => {
    const inv = testInventory(KNIGHT, 500);
    inv.setTemper('ashforged-longsword', 3, 'ember');
    expect(forgeItem(inv, 'ashforged-longsword').ok).toBe(true);
    expect(inv.gear('wyrm-tempered-oathblade')).toEqual({ temper: 0 });
    expect(inv.equipped('weapon')).toBeNull();
  });
  it('takes hide, not scales, for the Ashblade and Pathfinder', () => {
    const inv = testInventory({ 'ashforged-fangs': 1, 'rime-iron': 2, 'wyrm-hide': 3, 'shed-wyrm-scale': 3 }, 300);
    expect(forgeItem(inv, 'ashforged-fangs').ok).toBe(true);
    expect(inv.count('wyrm-hide')).toBe(0);
    expect(inv.count('shed-wyrm-scale')).toBe(3);
    const noHide = testInventory({ 'ashforged-arbalest': 1, 'rime-iron': 2, 'shed-wyrm-scale': 3 }, 300);
    expect(forgeItem(noHide, 'ashforged-arbalest')).toEqual({ ok: false, reason: 'no-materials' });
  });
  it('forges every recipe given its cost', () => {
    for (const [from, to] of Object.entries(TIER4_RECIPES)) {
      const c = forgeCost(from)!;
      const inv = testInventory({ [from]: 1, ...Object.fromEntries(c.materials!.map((m) => [m.itemId, m.count])) }, c.gold);
      expect(forgeItem(inv, from), from).toEqual({ ok: true, from, to });
    }
  });

  describe('refusals take nothing', () => {
    const cases: [string, Record<string, number>, number, string][] = [
      ['not-held', { 'rime-iron': 2, 'shed-wyrm-scale': 3 }, 500, 'not-held'],
      ['owned', { ...KNIGHT, 'wyrm-tempered-oathblade': 1 }, 500, 'owned'],
      ['no-materials (iron)', { ...KNIGHT, 'rime-iron': 1 }, 500, 'no-materials'],
      ['no-materials (scales)', { ...KNIGHT, 'shed-wyrm-scale': 2 }, 500, 'no-materials'],
      ['no-gold', KNIGHT, 299, 'no-gold'],
    ];
    it.each(cases)('%s', (_n, items, gold, reason) => {
      const inv = testInventory(items, gold);
      const before = snap(inv);
      expect(forgeItem(inv, 'ashforged-longsword')).toEqual({ ok: false, reason });
      expect(snap(inv)).toBe(before);
      expect(inv.spent).toEqual([]);
    });
    it('no-recipe for a tier 4 piece', () => {
      const inv = testInventory({ 'wyrm-tempered-oathblade': 1 }, 999);
      expect(forgeItem(inv, 'wyrm-tempered-oathblade')).toEqual({ ok: false, reason: 'no-recipe' });
    });
    it('gems when its shard-gems would not fit back', () => {
      const base = testInventory({ ...KNIGHT }, 500);
      const inv = Object.create(base, { gemRoomFor: { value: () => false } });
      expect(forgeItem(inv, 'ashforged-longsword')).toEqual({ ok: false, reason: 'gems' });
      expect(base.count('rime-iron')).toBe(2);
      expect(base.gold).toBe(500);
    });
  });

  it('keeps the tier 2 to 3 recipes on ingots', () => {
    expect(forgeCost('halvard-steel-blade')).toEqual({ ingots: 1, gold: 150 });
    const inv = testInventory({ 'halvard-steel-blade': 1, 'cinder-steel-ingot': 1 }, 150);
    expect(forgeItem(inv, 'halvard-steel-blade').ok).toBe(true);
    expect(Object.keys(FORGE_RECIPES)).toHaveLength(11);
  });
});

describe('tempering tier 4', () => {
  it('costs 160 gold a level, rime-iron and a scale', () => {
    for (let l = 1; l <= 5; l++) {
      expect(temperCostFor('wyrm-tempered-oathblade', l)).toEqual({ gold: 160 * l, materials: [{ itemId: 'rime-iron', count: 1 }, { itemId: 'shed-wyrm-scale', count: 1 }] });
    }
    expect(temperCostFor('wyrm-tempered-oathblade', 6)).toBeNull();
  });
  it('pays hide for the Pathfinder and Ashblade pieces', () => {
    expect(temperCostFor('wyrm-tempered-arbalest', 2)).toEqual({ gold: 320, materials: [{ itemId: 'rime-iron', count: 1 }, { itemId: 'wyrm-hide', count: 1 }] });
    expect(temperCostFor('wyrmhide-jerkin', 1)?.materials.map((m) => m.itemId)).toEqual(['rime-iron', 'wyrm-hide']);
  });
  it('leaves tiers 1 to 3 unchanged', () => {
    expect(temperCostFor('practice-sword', 2)).toEqual({ gold: 30, materials: [] });
    expect(temperCostFor('halvard-steel-blade', 3)).toEqual({ gold: 120, materials: [{ itemId: 'iron-ore', count: 1 }, { itemId: 'coal', count: 1 }] });
    expect(temperCostFor('ashplate', 5)).toEqual({ gold: 450, materials: [{ itemId: 'cinder-steel-ingot', count: 1 }] });
    expect(temperCost(3, 1)).toEqual({ gold: 90, materials: [{ itemId: 'cinder-steel-ingot', count: 1 }] });
  });
  it('tempers a tier 4 piece, taking gold and both materials', () => {
    const inv = testInventory({ 'wyrm-tempered-arbalest': 1, 'rime-iron': 2, 'wyrm-hide': 2, 'shed-wyrm-scale': 2 }, 400);
    expect(temperItem(inv, 'wyrm-tempered-arbalest')).toEqual({ ok: true, level: 1 });
    expect(inv.gold).toBe(240);
    expect(inv.count('rime-iron')).toBe(1);
    expect(inv.count('wyrm-hide')).toBe(1);
    expect(inv.count('shed-wyrm-scale')).toBe(2);
  });
  it('refuses with no gold or no materials and takes nothing', () => {
    const poor = testInventory({ 'wyrm-tempered-oathblade': 1, 'rime-iron': 1, 'shed-wyrm-scale': 1 }, 159);
    const before = snap(poor);
    expect(temperItem(poor, 'wyrm-tempered-oathblade')).toEqual({ ok: false, reason: 'no-gold' });
    expect(snap(poor)).toBe(before);
    const bare = testInventory({ 'wyrm-tempered-oathblade': 1, 'rime-iron': 1 }, 999);
    expect(checkTemper(bare, 'wyrm-tempered-oathblade')).toBe('no-materials');
  });
});

describe('session at the smith', () => {
  function make(items: Record<string, number>, gold: number) {
    const inv = testInventory(items, gold);
    const state: GearState = { anvilTiers: [2, 3, 4], lessonRuns: 0 };
    const ports: SessionPorts = { inventory: inv, state, now: () => 0, makeClock: () => metronome(), anvilUsable: () => true, smithUsable: () => true, lessonActive: () => false, emitTempered: () => {} };
    return { inv, s: createTemperingSession(ports) };
  }
  const row = (s: ReturnType<typeof make>['s'], id: string) => s.view().items.find((r) => r.id === id)!;

  it('shows a forge row for a tier 3 piece and forges it', () => {
    const t = make({ ...KNIGHT }, 500);
    t.inv.equip('ashforged-longsword');
    t.s.open('smith');
    expect(row(t.s, 'ashforged-longsword').forge).toMatchObject({ to: 'wyrm-tempered-oathblade', gold: 300, ingots: 0, canAfford: true });
    expect(row(t.s, 'ashforged-longsword').forge?.materials).toEqual([{ itemId: 'rime-iron', count: 2 }, { itemId: 'shed-wyrm-scale', count: 3 }]);
    t.s.forge('ashforged-longsword');
    expect(t.s.view().lastResult).toEqual({ ok: true, perfect: false, forged: 'wyrm-tempered-oathblade' });
    expect(t.inv.equipped('weapon')).toBe('wyrm-tempered-oathblade');
  });
  it('shows canAfford false when materials are short and a refusal at forge', () => {
    const t = make({ 'ashforged-longsword': 1, 'rime-iron': 1 }, 500);
    t.s.open('smith');
    expect(row(t.s, 'ashforged-longsword').forge?.canAfford).toBe(false);
    t.s.forge('ashforged-longsword');
    expect(t.s.view().lastResult).toEqual({ ok: false, perfect: false, reason: 'no-materials' });
    expect(t.inv.has('ashforged-longsword')).toBe(true);
  });
  it('keeps tier 2 to 3 forging at the anvil only', () => {
    const t = make({ 'halvard-steel-blade': 1, 'cinder-steel-ingot': 1 }, 500);
    t.s.open('smith');
    expect(row(t.s, 'halvard-steel-blade').forge).toBeNull();
    t.s.forge('halvard-steel-blade');
    expect(t.inv.has('halvard-steel-blade')).toBe(true);
    expect(t.s.view().lastResult).toBeNull();
    t.s.close();
    t.s.open('anvil');
    expect(row(t.s, 'halvard-steel-blade').forge).toMatchObject({ to: 'ashforged-longsword', ingots: 1 });
    t.s.forge('halvard-steel-blade');
    expect(t.inv.has('ashforged-longsword')).toBe(true);
  });
  it('also lists the tier 4 forge row at the anvil', () => {
    const t = make({ ...KNIGHT }, 500);
    t.s.open('anvil');
    expect(row(t.s, 'ashforged-longsword').forge?.to).toBe('wyrm-tempered-oathblade');
  });
});

describe('defence with the trinket slot', () => {
  const rig = (items: string[]) => {
    const inv = testInventory(Object.fromEntries(items.map((i) => [i, 1])), 0);
    items.forEach((i) => inv.equip(i));
    return { equipped: (s: never) => inv.equipped(s), gear: (id: string) => inv.gear(id) };
  };
  it('counts the Rime Cloak and Cliff Crampons', () => {
    expect(defenceRating(rig(['rime-cloak']))).toBe(8);
    expect(defenceRating(rig(['cliff-crampons']))).toBe(6);
    expect(defenceRating(rig(['ashplate', 'rime-cloak']))).toBe(2 * (14 + 4));
  });
  it('counts nothing for a trinket without a stat, and mitigates through the modifier', () => {
    expect(defenceRating(rig(['hearth-stone-charm']))).toBe(0);
    expect(defenceRating(rig(['frostbrows-hunting-knife']))).toBe(0);
    const events = new GameEvents(() => {});
    const actors = new ActorRegistry(events);
    const dr = new DamageResolver(actors, events, () => {});
    const player = actors.spawn(playerInit());
    const foe = actors.spawn({ kind: 'ash-wraith', team: 'hostile', maxHealth: 1000, maxPoise: 1000 });
    player.maxHealth = player.health = 1000;
    const ports = rig(['rime-cloak']);
    registerGearModifiers(dr, ports);
    expect(dr.apply({ attackerId: foe.id, targetId: player.id, amount: 100, kind: 'melee' })!.dealt).toBeCloseTo(100 * (100 / 108), 5);
  });
});

describe('weapon tint tier argument', () => {
  const weapon = () => {
    const shared = new THREE.MeshStandardMaterial({ color: 0x888888 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), shared);
    const root = new THREE.Group();
    root.add(mesh);
    return { root, mesh, shared };
  };
  const hex = (m: THREE.Mesh) => (m.material as THREE.MeshStandardMaterial).emissive.getHex();
  it('uses the cold palette at tier 4 and the ember palette by default', () => {
    const a = weapon();
    setWeaponTint(a.root, true, 4);
    expect(hex(a.mesh)).toBe(TIER4_EMISSIVE);
    const b = weapon();
    setWeaponTint(b.root, true);
    expect(hex(b.mesh)).toBe(TIER3_EMISSIVE);
    expect(TIER4_EMISSIVE).not.toBe(TIER3_EMISSIVE);
  });
  it('re-tints from the originals when the tier changes and restores them', () => {
    const w = weapon();
    setWeaponTint(w.root, true, 3);
    setWeaponTint(w.root, true, 4);
    expect(hex(w.mesh)).toBe(TIER4_EMISSIVE);
    expect(w.shared.emissive.getHex()).toBe(0);
    setWeaponTint(w.root, true, 3);
    expect(hex(w.mesh)).toBe(TIER3_EMISSIVE);
    setWeaponTint(w.root, false, 4);
    expect(w.mesh.material).toBe(w.shared);
  });
});
