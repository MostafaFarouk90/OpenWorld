import '../economy/items';
import { describe, expect, it, vi } from 'vitest';
import { ActorRegistry } from '../actors/ActorRegistry';
import { DamageResolver } from '../actors/DamageResolver';
import { playerInit } from '../actors/teams';
import { GameEvents } from '../core/events';
import { ATTACK_MODIFIER, DEFENCE_MODIFIER, defenceRating, registerGearModifiers, weaponFactor } from './combat';
import { testInventory } from './testkit';

function rig(items: Record<string, number>, equipped: string[], temper: Record<string, [number, string?]> = {}) {
  const events = new GameEvents(() => {});
  const actors = new ActorRegistry(events);
  const dr = new DamageResolver(actors, events, () => {});
  const player = actors.spawn(playerInit());
  const foe = actors.spawn({ kind: 'ash-wraith', team: 'hostile', maxHealth: 1000, maxPoise: 1000 });
  const boar = actors.spawn({ kind: 'boar', team: 'hostile', maxHealth: 1000, maxPoise: 1000 });
  const ally = actors.spawn({ kind: 'hound', team: 'ally', maxHealth: 1000, maxPoise: 1000 });
  player.maxHealth = player.health = 1000;
  const inv = testInventory(items, 0);
  for (const id of equipped) inv.equip(id);
  for (const [id, [l, a]] of Object.entries(temper)) inv.setTemper(id, l, a);
  const ignite = vi.fn();
  const off = registerGearModifiers(dr, { equipped: (s) => inv.equipped(s), gear: (id) => inv.gear(id), ignite });
  const hitFoe = (target = foe, amount = 100, extra = {}) => dr.apply({ attackerId: player.id, targetId: target.id, amount, kind: 'melee', ...extra })!;
  const hitPlayer = (amount = 100, extra = {}) => dr.apply({ attackerId: foe.id, targetId: player.id, amount, kind: 'melee', ...extra })!;
  return { dr, player, foe, boar, ally, inv, ignite, off, hitFoe, hitPlayer, ports: { equipped: (s: never) => inv.equipped(s), gear: (id: string) => inv.gear(id) } };
}

describe('gear.attack', () => {
  it('uses the agreed ids and orders', () => {
    expect(ATTACK_MODIFIER).toEqual({ id: 'gear.attack', order: -120 });
    expect(DEFENCE_MODIFIER).toEqual({ id: 'gear.defence', order: 50 });
  });
  it('leaves Act 1 gear untouched, untempered', () => {
    const t = rig({ 'marshals-longsword': 1, 'marshals-mantle': 1, 'wooden-round-shield': 1 }, ['marshals-longsword', 'marshals-mantle', 'wooden-round-shield']);
    expect(t.hitFoe().dealt).toBe(100);
    expect(t.hitPlayer().dealt).toBe(100);
    expect(weaponFactor(t.ports)).toBe(1);
    expect(defenceRating(t.ports)).toBe(0);
  });
  it('scales a tier 2 or 3 weapon by stat over 18', () => {
    const t = rig({ 'ashforged-longsword': 1 }, ['ashforged-longsword']);
    expect(t.hitFoe().dealt).toBeCloseTo((100 * 34) / 18, 5);
  });
  it('adds 5% a level', () => {
    const t = rig({ 'practice-sword': 1 }, ['practice-sword'], { 'practice-sword': [4] });
    expect(t.hitFoe().dealt).toBeCloseTo(120, 5);
    const u = rig({ 'halvard-steel-blade': 1 }, ['halvard-steel-blade'], { 'halvard-steel-blade': [2] });
    expect(u.hitFoe().dealt).toBeCloseTo(100 * (22 / 18) * 1.1, 5);
  });
  it('ignores ally hits and status ticks', () => {
    const t = rig({ 'ashforged-longsword': 1 }, ['ashforged-longsword']);
    expect(t.dr.apply({ attackerId: t.ally.id, targetId: t.foe.id, amount: 10, kind: 'melee' })!.dealt).toBe(10);
    expect(t.hitFoe(t.foe, 10, { kind: 'status', statusKind: 'ignite' }).dealt).toBe(10);
  });
  it('does nothing without a weapon and stops after the undo', () => {
    const t = rig({}, []);
    expect(t.hitFoe().dealt).toBe(100);
    const u = rig({ 'ashforged-longsword': 1 }, ['ashforged-longsword']);
    u.off();
    expect(u.hitFoe().dealt).toBe(100);
  });
});

describe('gear.defence', () => {
  it('mitigates by 100 / (100 + D) with tier 2+ stats and temper', () => {
    const t = rig({ ashplate: 1, 'spike-shield': 1 }, ['ashplate', 'spike-shield']);
    const d = 2 * (14 + 11);
    expect(defenceRating(t.ports)).toBe(d);
    expect(t.hitPlayer().dealt).toBeCloseTo(100 * (100 / (100 + d)), 5);
    const u = rig({ ashplate: 1 }, ['ashplate'], { ashplate: [5] });
    expect(defenceRating(u.ports)).toBeCloseTo(2 * 14 * 1.25, 5);
  });
  it('counts only the tempering on Act 1 pieces', () => {
    const t = rig({ 'marshals-mantle': 1 }, ['marshals-mantle'], { 'marshals-mantle': [4] });
    expect(defenceRating(t.ports)).toBeCloseTo(2 * 6 * 0.05 * 4, 5);
  });
  it('does not touch falls or hits on others', () => {
    const t = rig({ ashplate: 1 }, ['ashplate']);
    expect(t.hitPlayer(100, { kind: 'fall' }).dealt).toBe(100);
    expect(t.hitFoe().dealt).toBe(100);
  });
});

describe('affixes in combat', () => {
  it('Ember ignites foes the player hits, not through allies or status ticks', () => {
    const t = rig({ 'practice-sword': 1 }, ['practice-sword'], { 'practice-sword': [1, 'ember'] });
    t.hitFoe();
    expect(t.ignite).toHaveBeenCalledWith(t.foe.id, 'player');
    t.ignite.mockClear();
    t.hitFoe(t.foe, 5, { kind: 'status' });
    t.dr.apply({ attackerId: t.ally.id, targetId: t.foe.id, amount: 5, kind: 'melee' });
    expect(t.ignite).not.toHaveBeenCalled();
  });
  it('Sworn adds 25% against wraiths only', () => {
    const t = rig({ 'practice-sword': 1 }, ['practice-sword'], { 'practice-sword': [0, 'sworn'] });
    expect(t.hitFoe(t.foe).dealt).toBeCloseTo(125, 5);
    expect(t.hitFoe(t.boar).dealt).toBe(100);
  });
  it('Cinder cuts ignite ticks on the player by 25%, other hits not', () => {
    const t = rig({ 'wool-robe': 1 }, ['wool-robe'], { 'wool-robe': [0, 'cinder'] });
    expect(t.hitPlayer(100, { kind: 'status', statusKind: 'ignite', attackerId: t.foe.id }).dealt).toBeCloseTo(75, 5);
    expect(t.hitPlayer(100, { kind: 'status', statusKind: 'bleed' }).dealt).toBe(100);
    expect(t.hitPlayer().dealt).toBe(100);
  });
  it('Gleam and Hearth change no damage', () => {
    const t = rig({ 'practice-sword': 1 }, ['practice-sword'], { 'practice-sword': [0, 'gleam'] });
    expect(t.hitFoe().dealt).toBe(100);
    expect(t.ignite).not.toHaveBeenCalled();
  });
});
