import { describe, expect, it } from 'vitest';
import { ActorRegistry } from '../../actors/ActorRegistry';
import type { Actor } from '../../actors/Actor';
import type { ClassId } from '../../actors/classes';
import { DamageResolver } from '../../actors/DamageResolver';
import { PLAYER_ID, playerInit } from '../../actors/teams';
import { GameEvents } from '../../core/events';
import type { EquipSlot } from '../../hud/ports';
import '../tier4/catalog';
import { ACT3_IN_MODIFIER, ACT3_OUT_MODIFIER, incomingReduction, isDragonkin, outgoingBonus, registerAct3Bonuses, type BonusPorts } from './bonuses';
import { SOCKET_TUNING } from './tuning';

const g = (n: string) => `shard-gem.${n}`;

interface Setup {
  cls?: ClassId;
  equipped?: Partial<Record<EquipSlot, string>>;
  sockets?: Record<string, readonly string[]>;
  flags?: Record<string, unknown>;
  tags?: Record<string, readonly string[]>;
  distance?: number | null;
  held?: readonly string[];
}
function ports(s: Setup = {}): BonusPorts {
  return {
    equipped: (slot) => s.equipped?.[slot] ?? null,
    has: (id) => (s.held ?? Object.values(s.equipped ?? {})).includes(id),
    socketsOf: (id) => (s.sockets?.[id] ?? []).map((shardId, slot) => ({ slot, shardId })),
    classId: () => s.cls ?? 'knight',
    flag: (k) => s.flags?.[k],
    targetTags: (t) => s.tags?.[t.kind] ?? [],
    distance: () => (s.distance === undefined ? 10 : s.distance),
  };
}

function rig() {
  const events = new GameEvents(() => {});
  const actors = new ActorRegistry(events);
  const dr = new DamageResolver(actors, events, () => {});
  const player = actors.spawn(playerInit());
  const foe = actors.spawn({ kind: 'ash-wraith', team: 'hostile', maxHealth: 1000, maxPoise: 1000 });
  const drake = actors.spawn({ kind: 'drake-test', team: 'hostile', maxHealth: 1000, maxPoise: 1000 });
  const ally = actors.spawn({ kind: 'hound', team: 'ally', maxHealth: 1000, maxPoise: 1000 });
  player.maxHealth = player.health = 1000;
  return { dr, player, foe, drake, ally, actors };
}
const hitFoe = (r: ReturnType<typeof rig>, target: Actor, extra = {}) => r.dr.apply({ attackerId: r.player.id, targetId: target.id, amount: 100, kind: 'melee', ...extra })!.dealt;

describe('modifier ids', () => {
  it('uses the agreed ids', () => {
    expect(ACT3_OUT_MODIFIER.id).toBe('gear.act3.out');
    expect(ACT3_IN_MODIFIER.id).toBe('gear.act3.in');
  });
});

describe('outgoing: gems', () => {
  const r = rig();
  it('adds a matching-class gem and goes dormant on another class', () => {
    const s = { equipped: { weapon: 'w' }, sockets: { w: [g('oathfire')] } } as const;
    expect(outgoingBonus(ports({ ...s, cls: 'knight' }), { kind: 'melee' }, r.foe, r.player)).toBeCloseTo(0.06);
    for (const c of ['warden', 'emberwright', 'ashblade', 'pathfinder'] as const) expect(outgoingBonus(ports({ ...s, cls: c }), { kind: 'melee' }, r.foe, r.player), c).toBe(0);
  });
  it('adds gems on different pieces and ignores unequipped pieces and unknown gem ids', () => {
    const p = ports({ equipped: { weapon: 'w', armour: 'a' }, sockets: { w: [g('oathfire'), g('removed')], a: [g('oathfire')], other: [g('oathfire')] } });
    expect(outgoingBonus(p, { kind: 'melee' }, r.foe, r.player)).toBeCloseTo(0.12);
  });
  it('spell gem only counts spell hits', () => {
    const p = ports({ cls: 'emberwright', equipped: { weapon: 'w' }, sockets: { w: [g('kindling')] } });
    expect(outgoingBonus(p, { kind: 'spell' }, r.foe, r.player)).toBeCloseTo(0.08);
    expect(outgoingBonus(p, { kind: 'melee' }, r.foe, r.player)).toBe(0);
  });
  it('lowTarget gem needs a target under half health', () => {
    const p = ports({ cls: 'ashblade', equipped: { weapon: 'w' }, sockets: { w: [g('nightedge')] } });
    const t = rig().foe;
    expect(outgoingBonus(p, { kind: 'melee' }, t, r.player)).toBe(0);
    t.health = t.maxHealth / 2;
    expect(outgoingBonus(p, { kind: 'melee' }, t, r.player)).toBe(0); // exactly half is not below
    t.health = t.maxHealth / 2 - 1;
    expect(outgoingBonus(p, { kind: 'melee' }, t, r.player)).toBeCloseTo(0.1);
  });
  it('far gem needs more than 15 m and a known distance', () => {
    const base = { cls: 'pathfinder', equipped: { weapon: 'w' }, sockets: { w: [g('steadyhand')] } } as const;
    expect(outgoingBonus(ports({ ...base, distance: 15 }), { kind: 'melee' }, r.foe, r.player)).toBe(0);
    expect(outgoingBonus(ports({ ...base, distance: 15.5 }), { kind: 'melee' }, r.foe, r.player)).toBeCloseTo(0.1);
    expect(outgoingBonus(ports({ ...base, distance: null }), { kind: 'melee' }, r.foe, r.player)).toBe(0);
    expect(outgoingBonus(ports({ ...base, distance: 50 }), { kind: 'melee' }, r.foe, null)).toBe(0);
  });
});

describe('outgoing: knives', () => {
  const r = rig();
  it.each([
    ['frostbrows-hunting-knife', 0.08],
    ['hunting-knife', 0.04],
    ['rime-cloak', 0],
  ])('%s adds %d', (id, want) => {
    expect(outgoingBonus(ports({ equipped: { trinket: id } }), { kind: 'melee' }, r.foe, r.player)).toBeCloseTo(want);
  });
});

describe('outgoing: the keen knife', () => {
  const r = rig();
  const worn = { equipped: { trinket: 'frostbrows-hunting-knife' } } as const;
  it('adds 15% when worn with the hut choice, else 8%', () => {
    expect(outgoingBonus(ports({ ...worn, flags: { 'story.r15.choice': 'hut' } }), { kind: 'melee' }, r.foe, r.player)).toBeCloseTo(0.15);
    expect(outgoingBonus(ports({ ...worn, flags: { 'story.r15.choice': 'lodge' } }), { kind: 'melee' }, r.foe, r.player)).toBeCloseTo(0.08);
    expect(outgoingBonus(ports({ ...worn }), { kind: 'melee' }, r.foe, r.player)).toBeCloseTo(0.08);
  });
  it('adds nothing when the keen knife is only carried', () => {
    expect(outgoingBonus(ports({ equipped: {}, held: ['frostbrows-hunting-knife'], flags: { 'story.r15.choice': 'hut' } }), { kind: 'melee' }, r.foe, r.player)).toBe(0);
  });
  it('lets R16 keep still add over a worn keen knife (0.15 + 0.15 is under the cap)', () => {
    const p = ports({ ...worn, flags: { 'story.r15.choice': 'hut', 'story.r16.choice': 'keep' } });
    const b = outgoingBonus(p, { kind: 'melee', tags: ['dragonkin'] }, r.drake, r.player);
    expect(b).toBeCloseTo(0.3);
    expect(b).toBeLessThan(SOCKET_TUNING.outCap);
    expect(b).toBeGreaterThan(outgoingBonus(p, { kind: 'melee' }, r.drake, r.player));
  });
});

describe('outgoing: dragonkin', () => {
  const r = rig();
  const keep = { 'story.r16.choice': 'keep' };
  const hit = (flags: Record<string, unknown>, req: { tags?: readonly 'dragonkin'[] }, tags: Record<string, readonly string[]> = {}) =>
    outgoingBonus(ports({ flags, tags }), { kind: 'melee', ...req }, r.drake, r.player);
  it('adds 15% with keep on a request-tagged target', () => {
    expect(hit(keep, { tags: ['dragonkin'] })).toBeCloseTo(0.15);
  });
  it('adds 15% with keep on a def-tagged target', () => {
    expect(hit(keep, {}, { 'drake-test': ['dragonkin'] })).toBeCloseTo(0.15);
    expect(isDragonkin(ports({ tags: { 'drake-test': ['dragonkin'] } }), {}, r.drake)).toBe(true);
  });
  it('adds nothing on an untagged target (Ysmeryth, Hathren)', () => {
    expect(hit(keep, {})).toBe(0);
    expect(hit(keep, {}, { 'drake-test': [] })).toBe(0);
    expect(hit(keep, {}, { 'drake-test': ['beast'] })).toBe(0);
  });
  it('adds nothing for give, an unset choice or any other value', () => {
    for (const v of ['give', undefined, 'Keep', true]) expect(hit({ 'story.r16.choice': v }, { tags: ['dragonkin'] }), String(v)).toBe(0);
  });
  it('adds gems and dragonkin first and multiplies once', () => {
    const p = ports({ flags: keep, equipped: { weapon: 'w' }, sockets: { w: [g('oathfire')] } });
    expect(outgoingBonus(p, { kind: 'melee', tags: ['dragonkin'] }, r.drake, r.player)).toBeCloseTo(0.21);
    const t = rig();
    registerAct3Bonuses(t.dr, p);
    expect(hitFoe(t, t.drake, { tags: ['dragonkin'] })).toBeCloseTo(121, 5); // not 100 * 1.06 * 1.15 = 121.9
    expect(hitFoe(t, t.foe)).toBeCloseTo(106, 5);
  });
});

describe('caps', () => {
  it('never lets the outgoing total pass the 0.4 cap with six gems, a keen knife and dragonkin', () => {
    const six = { w: [g('oathfire'), g('oathfire')], o: [g('oathfire'), g('oathfire')], a: [g('oathfire'), g('oathfire')] };
    const p = ports({ flags: { 'story.r16.choice': 'keep', 'story.r15.choice': 'hut' }, equipped: { weapon: 'w', offhand: 'o', armour: 'a', trinket: 'frostbrows-hunting-knife' }, sockets: six });
    const r = rig();
    expect(SOCKET_TUNING.outCap).toBe(0.4);
    expect(outgoingBonus(p, { kind: 'melee', tags: ['dragonkin'] }, r.drake, r.player)).toBe(SOCKET_TUNING.outCap);
    registerAct3Bonuses(r.dr, p);
    expect(hitFoe(r, r.drake, { tags: ['dragonkin'] })).toBeCloseTo(140, 5);
  });
  it('holds the realistic maximum (two gems on a tier 4 piece, keen knife, dragonkin) at or under the cap', () => {
    const p = ports({ flags: { 'story.r16.choice': 'keep', 'story.r15.choice': 'hut' }, equipped: { weapon: 'w', trinket: 'frostbrows-hunting-knife' }, sockets: { w: [g('oathfire'), g('oathfire')] } });
    expect(outgoingBonus(p, { kind: 'melee', tags: ['dragonkin'] }, rig().drake, null)).toBeLessThanOrEqual(0.4);
  });
  it('caps the incoming reduction at 25%', () => {
    const many = { w: [g('rootstone'), g('rootstone')], o: [g('rootstone'), g('rootstone')], a: [g('rootstone'), g('rootstone')] };
    const p = ports({ cls: 'warden', equipped: { weapon: 'w', offhand: 'o', armour: 'a' }, sockets: many });
    expect(incomingReduction(p, { outcome: 'hit' }, rig().player)).toBe(SOCKET_TUNING.inCap);
  });
});

describe('incoming', () => {
  it('Ember-Mother\'s Scale worn takes 5% off, adds to gems and stays within the cap', () => {
    const self = rig().player;
    expect(incomingReduction(ports({ equipped: { trinket: 'ember-mothers-scale' } }), { outcome: 'hit' }, self)).toBeCloseTo(0.05);
    expect(incomingReduction(ports({ cls: 'ashblade', equipped: { trinket: 'ember-mothers-scale', armour: 'a' }, sockets: { a: [g('quickstep')] } }), { outcome: 'hit' }, self)).toBeCloseTo(0.11);
    const many = { w: [g('rootstone'), g('rootstone')], o: [g('rootstone'), g('rootstone')], a: [g('rootstone'), g('rootstone')] };
    expect(incomingReduction(ports({ cls: 'warden', equipped: { weapon: 'w', offhand: 'o', armour: 'a', trinket: 'ember-mothers-scale' }, sockets: many }), { outcome: 'hit' }, self)).toBe(SOCKET_TUNING.inCap);
    expect(incomingReduction(ports({ equipped: { trinket: 'hunting-knife' } }), { outcome: 'hit' }, self)).toBe(0);
  });
  it('bulwark reduces blocked hits only', () => {
    const p = ports({ cls: 'knight', equipped: { offhand: 'o' }, sockets: { o: [g('bulwark')] } });
    const self = rig().player;
    expect(incomingReduction(p, { outcome: 'blocked' }, self)).toBeCloseTo(0.15);
    for (const o of ['hit', 'parried', 'immune'] as const) expect(incomingReduction(p, { outcome: o }, self), o).toBe(0);
  });
  it('hearthglass applies only below half health', () => {
    const p = ports({ cls: 'emberwright', equipped: { armour: 'a' }, sockets: { a: [g('hearthglass')] } });
    const self = rig().player;
    expect(incomingReduction(p, { outcome: 'hit' }, self)).toBe(0);
    self.health = self.maxHealth / 2 - 1;
    expect(incomingReduction(p, { outcome: 'hit' }, self)).toBeCloseTo(0.06);
  });
  it('plain reduction gems always apply for the matching class only', () => {
    const s = { equipped: { armour: 'a' }, sockets: { a: [g('quickstep')] } } as const;
    const self = rig().player;
    expect(incomingReduction(ports({ ...s, cls: 'ashblade' }), { outcome: 'hit' }, self)).toBeCloseTo(0.06);
    expect(incomingReduction(ports({ ...s, cls: 'knight' }), { outcome: 'hit' }, self)).toBe(0);
  });
});

describe('registerAct3Bonuses', () => {
  const full = () =>
    ports({ cls: 'warden', equipped: { weapon: 'w', armour: 'a', trinket: 'frostbrows-hunting-knife' }, sockets: { w: [g('ravager')], a: [g('rootstone')] } });

  it('applies both modifiers to the player and undoes them', () => {
    const r = rig();
    const off = registerAct3Bonuses(r.dr, full());
    expect(hitFoe(r, r.foe)).toBeCloseTo(100 * 1.14, 5);
    expect(r.dr.apply({ attackerId: r.foe.id, targetId: r.player.id, amount: 100, kind: 'melee' })!.dealt).toBeCloseTo(94, 5);
    off();
    expect(hitFoe(r, r.foe)).toBe(100);
    expect(r.dr.apply({ attackerId: r.foe.id, targetId: r.player.id, amount: 100, kind: 'melee' })!.dealt).toBe(100);
  });
  it('ignores status ticks, falls, script hits on the player and companion hits', () => {
    const r = rig();
    registerAct3Bonuses(r.dr, full());
    expect(r.dr.apply({ attackerId: r.player.id, targetId: r.foe.id, amount: 10, kind: 'status', statusKind: 'ignite', statusId: 'x' })!.dealt).toBe(10);
    expect(r.dr.apply({ attackerId: r.player.id, targetId: r.foe.id, amount: 10, kind: 'fall' })!.dealt).toBe(10);
    expect(r.dr.apply({ attackerId: r.ally.id, targetId: r.foe.id, amount: 10, kind: 'melee' })!.dealt).toBe(10);
    // incoming: status ticks and falls on the player are not reduced
    expect(r.dr.apply({ attackerId: r.foe.id, targetId: r.player.id, amount: 10, kind: 'status', statusKind: 'ignite', statusId: 'x' })!.dealt).toBe(10);
    expect(r.dr.apply({ attackerId: null, targetId: r.player.id, amount: 10, kind: 'fall' })!.dealt).toBe(10);
  });
  it('does not boost hits on companions or hits between foes', () => {
    const r = rig();
    registerAct3Bonuses(r.dr, full());
    expect(r.dr.apply({ attackerId: r.foe.id, targetId: r.ally.id, amount: 10, kind: 'melee' })!.dealt).toBe(10);
  });
  it('honours a custom player id', () => {
    const r = rig();
    registerAct3Bonuses(r.dr, full(), 'someone-else');
    expect(PLAYER_ID).toBe('player');
    expect(hitFoe(r, r.foe)).toBe(100);
  });
});
