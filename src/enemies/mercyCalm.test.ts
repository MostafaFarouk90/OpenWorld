import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Enemy } from './Enemy';
import { FIXED_TIMESTEP } from '../config/constants';
import { ENEMY_DEFS } from './defs';
import { EnemyManager } from './EnemyManager';
import { CalmCycle, calmOptionLabel, calmOptions, type CalmOption } from './calm';
import { mercyInteractableId } from './mercy';
import { FakeActor, FakeHost, FakeStatus, loadKnight } from './testing/fakeHost';
import { AI, BOSS_MERCY, WARM_HAND_BURN } from './tuning';
import type { EnemyDef, EnemyKind, SpawnerDef } from './types';

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };

/**
 * Thread 5's hound row is not on main yet: these fixture defs stand in for it. They reuse the wraith's model and
 * moves and carry the mercy fields thread 1 defined (`offerings`, `warmHand`). Registered for this suite only.
 */
const HOUND: EnemyDef = {
  ...ENEMY_DEFS['ash-wraith'],
  kind: 'fixture-hound' as EnemyKind,
  rises: false,
  mercy: {
    verb: 'calm',
    tier: 'normal',
    track: 'dragons',
    when: 'calming',
    offerings: [
      { itemId: 'hearth-bread', count: 1 },
      { itemId: 'ember-coal', count: 1 },
    ],
    warmHand: true,
  },
};
const PLAIN: EnemyDef = { ...HOUND, kind: 'plain-hound' as EnemyKind, mercy: { ...HOUND.mercy!, warmHand: undefined } };
const OGRE: EnemyDef = {
  ...HOUND,
  kind: 'crag-ogre' as EnemyKind,
  mercy: { ...HOUND.mercy!, offerings: [{ itemId: 'barley-cake', count: 2 }], warmHand: undefined },
};

beforeAll(async () => {
  gltf = await loadKnight();
  const defs = ENEMY_DEFS as unknown as Record<string, EnemyDef>;
  for (const d of [HOUND, PLAIN, OGRE]) defs[d.kind] = d;
});

afterAll(() => {
  const defs = ENEMY_DEFS as unknown as Record<string, EnemyDef>;
  for (const d of [HOUND, PLAIN, OGRE]) delete defs[d.kind];
});

const group = (id: string, enemy: string, count: number, extra: Partial<SpawnerDef> = {}): SpawnerDef => ({
  id,
  enemy: enemy as SpawnerDef['enemy'],
  count,
  anchor: 'a',
  band: { min: 1, max: 1 },
  activation: 'manual',
  respawn: 'never',
  leash: false,
  ...extra,
});

interface RigOptions {
  items?: Record<string, number>;
  calmed?: boolean;
  ui?: boolean;
  spawners?: SpawnerDef[];
  playerAt?: { x: number; z: number };
}

function rig(opts: RigOptions = {}) {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: opts.playerAt?.x ?? 0, y: 0, z: opts.playerAt?.z ?? -12 } });
  fake.defineAnchor('a', 0, 0);
  const counts = fake.provideItems(opts.items ?? { 'hearth-bread': 1 });
  fake.status = new FakeStatus();
  const ui = opts.ui ? fake.provideCalmUi() : undefined;
  const burn: Array<[number, string]> = [];
  fake.spells = { useShard: (g, s) => void burn.push([g, s]) };
  const played: string[] = [];
  fake.vfx = { dissolve: () => Promise.resolve(), spawnEffect: (id) => void played.push(id) };
  if (opts.calmed !== false) fake.flags.set('enemies.mercy.calm', true);
  const m = new EnemyManager(fake.host, FakeHost.factory(gltf), {
    spawners: opts.spawners ?? [group('kennel', 'fixture-hound', 1), group('plain', 'plain-hound', 1), group('den', 'crag-ogre', 1)],
    seed: 11,
  });
  const tick = (seconds = DT) => {
    for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) {
      m.think(DT);
      m.animate(DT);
      fake.combatStep(DT);
      m.react(DT);
      m.render(1);
    }
  };
  const hold = (id: string) => fake.interactables.get(mercyInteractableId(m.get(id)!.slug))!;
  const hit = (id: string, over: Partial<Parameters<FakeHost['apply']>[0]> = {}) =>
    fake.apply({ attackerId: 'player', targetId: id, amount: 1, poise: 1, kind: 'melee', ...over });
  return { fake, m, tick, hold, counts, burn, played, ui, hit };
}

/** Spawns the single hound of a group, quietly (no aggro) and lets a tick pass. */
function one(t: ReturnType<typeof rig>, group = 'kennel'): string {
  const [id] = t.m.service.spawnGroup(group);
  t.tick(0.1);
  return id!;
}

describe('Calm offerings', () => {
  it('Hearth Bread: takes one loaf, no loot, the hound leaves, +credit on dragons and a slot spent for good', () => {
    const t = rig();
    const id = one(t);
    expect(t.hold(id).enabled!()).toBe(true);
    t.hold(id).onInteract(t.fake.player);
    expect(t.counts.get('hearth-bread')).toBe(0);
    expect(t.fake.inventory!.removed).toEqual([{ itemId: 'hearth-bread', count: 1 }]);
    expect(t.fake.bus.of('mercy')).toEqual([
      expect.objectContaining({ verb: 'calm', tier: 'normal', track: 'dragons', creature: 'fixture-hound', actorId: id }),
    ]);
    expect(t.fake.bus.of('mercy')[0]!.pulseId).toBeUndefined();
    expect(t.m.get(id)!.state).toBe('calmed');
    expect(t.burn).toEqual([]);
    expect(t.played).toContain('calm-offering');
    expect(t.m.spawners.serialize().spent).toEqual(['kennel#0']);
    t.tick(AI.sparedWalkMetres / HOUND.walkSpeed + 3);
    expect(t.m.get(id)).toBeUndefined();
    expect(t.m.service.mercyTally()['fixture-hound']).toMatchObject({ calm: 1, killed: 0 });
  });

  it('Ember Coal when the pack holds no bread; bread first when both are held', () => {
    const coal = rig({ items: { 'ember-coal': 2 } });
    const a = one(coal);
    coal.hold(a).onInteract(coal.fake.player);
    expect(coal.fake.inventory!.removed).toEqual([{ itemId: 'ember-coal', count: 1 }]);
    const both = rig({ items: { 'hearth-bread': 1, 'ember-coal': 1 } });
    const b = one(both);
    both.hold(b).onInteract(both.fake.player);
    expect(both.fake.inventory!.removed).toEqual([{ itemId: 'hearth-bread', count: 1 }]);
  });

  it('takes a def offering with count 2 (the ogre) and refuses one barley cake', () => {
    const one2 = rig({ items: { 'barley-cake': 1 } });
    const o = one(one2, 'den');
    expect(one2.hold(o).enabled!()).toBe(false);
    const two = rig({ items: { 'barley-cake': 2 } });
    const p = one(two, 'den');
    two.hold(p).onInteract(two.fake.player);
    expect(two.fake.inventory!.removed).toEqual([{ itemId: 'barley-cake', count: 2 }]);
  });

  it('shows the offering through promptParams and the calm key', () => {
    const t = rig();
    const id = one(t);
    const i = t.hold(id);
    expect(i.promptKey).toBe('enemies.mercy.calm');
    expect(i.promptParams!()).toEqual({ offering: 'enemies.calm.offering.hearth-bread' });
  });

  it('no offering held and no Warm Hand: no prompt, and a completed hold does nothing', () => {
    const t = rig({ items: {} });
    const id = one(t, 'plain');
    expect(t.hold(id).enabled!()).toBe(false);
    t.hold(id).onInteract(t.fake.player);
    expect(t.fake.bus.of('mercy')).toEqual([]);
    expect(t.m.get(id)!.state).not.toBe('calmed');
  });

  it('an item the def does not accept shows no prompt', () => {
    const t = rig({ items: { 'barley-cake': 5, 'healing-flask': 3 } });
    const id = one(t, 'plain');
    expect(t.hold(id).enabled!()).toBe(false);
  });

  it('is locked until enemies.mercy.calm is set, and unlocking turns the prompt on', () => {
    const t = rig({ calmed: false });
    const id = one(t);
    expect(t.hold(id).enabled!()).toBe(false);
    t.hold(id).onInteract(t.fake.player);
    expect(t.fake.bus.of('mercy')).toEqual([]);
    expect(t.counts.get('hearth-bread')).toBe(1);
    t.m.service.setMercyUnlocked('calm', true);
    expect(t.hold(id).enabled!()).toBe(true);
  });

  it('a second hold on a calmed hound pays nothing more', () => {
    const t = rig({ items: { 'hearth-bread': 3 } });
    const id = one(t);
    const i = t.hold(id);
    i.onInteract(t.fake.player);
    i.onInteract(t.fake.player);
    expect(t.fake.bus.of('mercy')).toHaveLength(1);
    expect(t.counts.get('hearth-bread')).toBe(2);
  });

  it('the item removal failing changes nothing: no state, no event, no Burn', () => {
    const t = rig();
    const id = one(t);
    t.fake.inventory!.count = () => 1;
    t.fake.inventory!.remove = () => false;
    t.hold(id).onInteract(t.fake.player);
    expect(t.fake.bus.of('mercy')).toEqual([]);
    expect(t.m.get(id)!.state).not.toBe('calmed');
    expect(t.m.spawners.serialize().spent).toEqual([]);
  });

  it('works without an inventory service only through the Warm Hand', () => {
    const t = rig();
    t.fake.inventory = undefined;
    const id = one(t);
    expect(t.hold(id).promptParams!()).toEqual({ offering: 'enemies.calm.warmHand' });
    t.hold(id).onInteract(t.fake.player);
    expect(t.burn).toEqual([[WARM_HAND_BURN, 'warmHand']]);
  });
});

describe('Warm Hand', () => {
  it('on a staggered hound with no item: 10 Burn once, event verb warmHand, tallied as calm', () => {
    const t = rig({ items: {} });
    const id = one(t);
    t.hit(id);
    t.fake.stagger(id, 'player');
    expect(t.hold(id).enabled!()).toBe(true);
    t.hold(id).onInteract(t.fake.player);
    expect(t.burn).toEqual([[WARM_HAND_BURN, 'warmHand']]);
    expect(t.fake.bus.of('mercy')).toEqual([expect.objectContaining({ verb: 'warmHand', track: 'dragons' })]);
    expect(t.fake.inventory!.removed).toEqual([]);
    expect(t.played).toContain('warm-hand');
    expect(t.m.service.mercyTally()['fixture-hound']).toMatchObject({ calm: 1 });
  });

  it('is open in the same windows as an offering: an unstruck hound too', () => {
    const t = rig({ items: {} });
    const id = one(t);
    expect(t.m.get(id)!.mercyOpen).toBe(true);
    t.hold(id).onInteract(t.fake.player);
    expect(t.burn).toHaveLength(1);
  });

  it('is not offered to a beast that does not take it (a plain hound)', () => {
    const t = rig({ items: {} });
    const id = one(t, 'plain');
    expect(t.hold(id).enabled!()).toBe(false);
  });

  it('item first in the list, Warm Hand last: a held loaf is the default and costs no Burn', () => {
    const t = rig({ items: { 'hearth-bread': 1 } });
    const id = one(t);
    t.hold(id).onInteract(t.fake.player);
    expect(t.burn).toEqual([]);
  });
});

describe('Calm eligibility', () => {
  it('a hound the player has struck is refused until it staggers, and again once it recovers', () => {
    const t = rig();
    const id = one(t);
    t.hit(id);
    expect(t.m.get(id)!.mercyOpen).toBe(false);
    expect(t.hold(id).enabled!()).toBe(false);
    t.fake.stagger(id, 'player');
    expect(t.m.get(id)!.state).toBe('stagger');
    expect(t.hold(id).enabled!()).toBe(true);
    t.tick(AI.breakStaggerSeconds + 0.5);
    expect(t.m.get(id)!.state).not.toBe('stagger');
    expect(t.hold(id).enabled!()).toBe(false);
  });

  it('a light flinch is not a stagger: the struck hound stays refused', () => {
    const t = rig();
    const id = one(t);
    t.hit(id, { poise: 0 });
    t.tick(0.2);
    expect(t.m.get(id)!.mercyOpen).toBe(false);
  });

  it('a parry or poise break with no damage does not count as a strike', () => {
    const t = rig();
    const id = one(t);
    t.fake.stagger(id, 'player');
    t.tick(AI.breakStaggerSeconds + 0.5);
    expect(t.m.get(id)!.brain.struck).toBe(false);
    expect(t.hold(id).enabled!()).toBe(true);
  });

  it('only a hit counts: blocked and immune outcomes, a script hit, and a hostile attacker do not', () => {
    const t = rig();
    const id = one(t);
    const other = new FakeActor('wolf', 'wolf', { kind: 'wolf', team: 'hostile', maxHealth: 10 });
    t.fake.actorMap.set(other.id, other);
    t.hit(id, { attackerId: 'wolf' });
    t.hit(id, { kind: 'script' });
    t.fake.actorMap.get(id)!.invulnerable = true;
    t.hit(id);
    t.fake.actorMap.get(id)!.invulnerable = false;
    expect(t.m.get(id)!.brain.struck).toBe(false);
  });

  it("a player-sourced status tick counts as a strike, a script's does not", () => {
    const t = rig();
    const a = one(t);
    t.hit(a, { kind: 'status' });
    expect(t.m.get(a)!.brain.struck).toBe(true);
    const u = rig();
    const b = one(u);
    u.hit(b, { kind: 'script' });
    expect(u.m.get(b)!.brain.struck).toBe(false);
  });

  it('v0.6: an ally strike never counts (Calm stays possible after a companion hit)', () => {
    const t = rig();
    const id = one(t);
    const ally = new FakeActor('ally-1', 'companion', { kind: 'companion', team: 'ally', maxHealth: 50 });
    t.fake.actorMap.set(ally.id, ally);
    t.hit(id, { attackerId: 'ally-1' });
    expect(t.m.get(id)!.brain.struck).toBe(false);
    expect(t.m.get(id)!.calmOpen).toBe(true);
    t.hit(id, { attackerId: 'ally-1', kind: 'status' });
    expect(t.m.get(id)!.brain.struck).toBe(false);
  });

  it('v0.6 mercyState: none while hunting, calming once calmed and walking off', () => {
    const t = rig();
    const id = one(t);
    const actor = t.fake.actorMap.get(id)!;
    expect(actor.mercyState?.()).toBe('none');
    t.m.get(id)!.calm();
    expect(actor.mercyState?.()).toBe('calming');
  });

  it('refuses once a swing has started (telegraph, attack, and until it disengages) but allows a chase', () => {
    const t = rig({ playerAt: { x: 0, z: -3 } });
    const [id] = t.m.service.spawnGroup('kennel', { aggro: true });
    const seen = new Set<string>();
    for (let i = 0; i < 600 && !seen.has('recover'); i++) {
      t.tick();
      const e = t.m.get(id!)!;
      seen.add(e.state);
      if (e.state === 'telegraph' || e.state === 'attack' || e.state === 'recover') {
        expect(e.mercyOpen).toBe(false);
        expect(t.hold(id!).enabled!()).toBe(false);
      }
      if (e.state === 'chase' && !seen.has('telegraph')) expect(e.mercyOpen).toBe(true);
    }
    expect(seen.has('telegraph')).toBe(true);
  });

  it('calming a hound mid-chase ends its aggro and its swing', () => {
    const t = rig({ playerAt: { x: 0, z: -6 } });
    const [id] = t.m.service.spawnGroup('kennel', { aggro: true });
    t.tick(0.5);
    expect(t.m.get(id!)!.state).toBe('chase');
    t.hold(id!).onInteract(t.fake.player);
    expect(t.m.get(id!)!.state).toBe('calmed');
    expect(t.fake.bus.of('ai.calm').map((e) => e.actorId)).toContain(id);
    t.tick(AI.sparedWalkMetres / HOUND.walkSpeed + 3);
    expect(t.m.get(id!)).toBeUndefined();
  });

  it('a dead hound cannot be calmed, and a kill on the tick of the hold wins', () => {
    const t = rig();
    const id = one(t);
    const i = t.hold(id);
    t.hit(id, { amount: 9999 });
    i.onInteract(t.fake.player);
    expect(t.fake.bus.of('mercy')).toEqual([]);
    expect(t.counts.get('hearth-bread')).toBe(1);
  });
});

describe('Calm side effects', () => {
  it('clears the statuses the player put on the hound and keeps the rest', () => {
    const t = rig();
    const id = one(t);
    (t.fake.status as FakeStatus).table.set(id, [
      { id: 'ignite-1', sourceId: 'player' },
      { id: 'bleed-ally', sourceId: 'ally-1' },
      { id: 'ignite-wild', sourceId: 'wolf' },
      { id: 'ambient', sourceId: null },
    ]);
    const ally = new FakeActor('ally-1', 'companion', { kind: 'companion', team: 'ally', maxHealth: 50 });
    t.fake.actorMap.set(ally.id, ally);
    t.hold(id).onInteract(t.fake.player);
    expect((t.fake.status as FakeStatus).table.get(id)!.map((s) => s.id).sort()).toEqual(['ambient', 'ignite-wild']);
  });

  it('works without a status service', () => {
    const t = rig();
    t.fake.status = undefined;
    const id = one(t);
    t.hold(id).onInteract(t.fake.player);
    expect(t.m.get(id)!.state).toBe('calmed');
  });

  it('striking a calmed hound before it leaves revokes: hostile again, slot live, tally back', () => {
    const t = rig();
    const id = one(t);
    t.hold(id).onInteract(t.fake.player);
    expect(t.m.spawners.serialize().spent).toEqual(['kennel#0']);
    t.tick(0.5);
    t.fake.bus.emit('mercy.revoked', { actorId: id, track: 'dragons', removed: 1 });
    expect(t.m.get(id)!.state).toBe('chase');
    expect(t.m.get(id)!.brain.struck).toBe(true);
    expect(t.m.get(id)!.mercyOpen).toBe(false);
    expect(t.m.spawners.serialize().spent).toEqual([]);
    expect(t.m.service.mercyTally()['fixture-hound']?.calm ?? 0).toBe(0);
  });

  it('the group clears once when the last calmed member leaves', () => {
    const t = rig();
    const id = one(t);
    t.hold(id).onInteract(t.fake.player);
    t.tick(AI.sparedWalkMetres / HOUND.walkSpeed + 3);
    expect(t.fake.bus.of('enemies.groupCleared')).toEqual([{ spawnerId: 'kennel' }]);
  });

  it('lowers the head on calm and lifts it on revoke', () => {
    const t = rig();
    const id = one(t);
    const calls: boolean[] = [];
    vi.spyOn(Enemy.prototype, 'lowerHead').mockImplementation((on: boolean) => void calls.push(on));
    t.hold(id).onInteract(t.fake.player);
    t.fake.bus.emit('mercy.revoked', { actorId: id, track: 'dragons', removed: 1 });
    vi.restoreAllMocks();
    expect(calls).toEqual([true, false]);
  });
});

describe('Calm and saving', () => {
  it('a calmed hound still walking off is despawned by a load of a save made before the calm, and the group refills', () => {
    const t = rig();
    const id = one(t);
    const before = t.m.spawners.serialize();
    t.hold(id).onInteract(t.fake.player);
    t.tick(0.3);
    expect(t.m.get(id)!.inMercyExit).toBe(true);
    t.m.spawners.load(before);
    t.fake.bus.emit('save.loaded', { slot: 's' });
    expect(t.m.get(id)).toBeUndefined();
    expect(t.m.service.alive('kennel')).toHaveLength(1);
    expect(t.m.service.alive('kennel')[0]).not.toBe(id);
  });

  it('a save made mid-leave keeps the slot spent: the hound is gone after the load and not refilled', () => {
    const t = rig();
    const id = one(t);
    t.hold(id).onInteract(t.fake.player);
    t.tick(0.3);
    const during = t.m.spawners.serialize();
    expect(during.spent).toEqual(['kennel#0']);
    t.m.spawners.load(during);
    t.fake.bus.emit('save.loaded', { slot: 's' });
    expect(t.m.get(id)).toBeUndefined();
    expect(t.m.service.alive('kennel')).toEqual([]);
  });
});

describe('Pack Calm', () => {
  const packRig = (extra: RigOptions = {}) =>
    rig({
      ...extra,
      spawners: [group('kennel', 'fixture-hound', 3, { leaderSlot: 0 }), group('far', 'fixture-hound', 1)],
    });

  it('calming the leader calms every packmate near it: one event each, one item, all scatter', () => {
    const t = packRig({ items: { 'hearth-bread': 3 } });
    const ids = t.m.service.spawnGroup('kennel');
    t.tick(0.1);
    t.hold(ids[0]!).onInteract(t.fake.player);
    expect(t.fake.bus.of('mercy').map((e) => e.actorId).sort()).toEqual([...ids].sort());
    expect(t.fake.bus.of('mercy').every((e) => e.verb === 'calm' && e.track === 'dragons')).toBe(true);
    expect(t.counts.get('hearth-bread')).toBe(2);
    for (const id of ids) expect(t.m.get(id)!.state).toBe('calmed');
    expect(t.m.spawners.serialize().spent.sort()).toEqual(['kennel#0', 'kennel#1', 'kennel#2']);
    t.tick(AI.sparedWalkMetres / HOUND.walkSpeed + 3);
    expect(t.fake.bus.of('enemies.groupCleared')).toEqual([{ spawnerId: 'kennel' }]);
  });

  it('a packmate that was struck or is mid-swing scatters too', () => {
    const t = packRig({ items: { 'hearth-bread': 1 }, playerAt: { x: 0, z: -3 } });
    const ids = t.m.service.spawnGroup('kennel', { aggro: true });
    t.hit(ids[1]!);
    for (let i = 0; i < 600 && !ids.some((id) => ['telegraph', 'attack'].includes(t.m.get(id)!.state)); i++) t.tick();
    expect(t.m.get(ids[1]!)!.brain.struck).toBe(true);
    expect(ids.some((id) => ['telegraph', 'attack'].includes(t.m.get(id)!.state))).toBe(true);
    t.fake.stagger(ids[0]!, 'player');
    t.hold(ids[0]!).onInteract(t.fake.player);
    for (const id of ids) expect(t.m.get(id)!.state).toBe('calmed');
  });

  it('a packmate beyond the pack radius keeps its post', () => {
    const t = packRig({ items: { 'hearth-bread': 1 } });
    const ids = t.m.service.spawnGroup('kennel');
    t.tick(0.1);
    t.m.get(ids[2]!)!.feet.set(AI.packShareRadius + 5, 0, 0);
    t.hold(ids[0]!).onInteract(t.fake.player);
    expect(t.m.get(ids[1]!)!.state).toBe('calmed');
    expect(t.m.get(ids[2]!)!.state).not.toBe('calmed');
  });

  it('calming a plain packmate leaves the others alone, and only they are eligible themselves', () => {
    const t = packRig({ items: { 'hearth-bread': 2 } });
    const ids = t.m.service.spawnGroup('kennel');
    t.tick(0.1);
    t.hold(ids[1]!).onInteract(t.fake.player);
    expect(t.m.get(ids[1]!)!.state).toBe('calmed');
    expect(t.m.get(ids[0]!)!.state).not.toBe('calmed');
    expect(t.m.get(ids[2]!)!.state).not.toBe('calmed');
    expect(t.hold(ids[0]!).enabled!()).toBe(true);
  });

  it('a leader killed on the tick of the hold is not calmed and its pack is untouched', () => {
    const t = packRig({ items: { 'hearth-bread': 1 } });
    const ids = t.m.service.spawnGroup('kennel');
    t.tick(0.1);
    const i = t.hold(ids[0]!);
    t.hit(ids[0]!, { amount: 9999 });
    i.onInteract(t.fake.player);
    expect(t.fake.bus.of('mercy')).toEqual([]);
    expect(t.m.get(ids[1]!)!.state).not.toBe('calmed');
  });

  it('the view names the leader, and a dead leader is not replaced', () => {
    const t = packRig({ items: { 'hearth-bread': 1 } });
    const ids = t.m.service.spawnGroup('kennel');
    t.tick(0.1);
    expect(ids.map((id) => t.m.service.view(id)!.packLeader)).toEqual([true, false, false]);
    t.hit(ids[0]!, { amount: 9999 });
    t.tick(0.1);
    expect(ids.slice(1).map((id) => t.m.service.view(id)!.packLeader)).toEqual([false, false]);
  });

  it('a group without a leader slot never scatters', () => {
    const t = rig({ items: { 'hearth-bread': 1 }, spawners: [group('kennel', 'fixture-hound', 2)] });
    const ids = t.m.service.spawnGroup('kennel');
    t.tick(0.1);
    t.hold(ids[0]!).onInteract(t.fake.player);
    expect(t.m.get(ids[1]!)!.state).not.toBe('calmed');
  });
});

describe('offering cycle and the wheel claim', () => {
  const NAMES = (o: CalmOption) => (o.kind === 'warmHand' ? 'warm' : o.itemId);

  it('claims the wheel only while the focused prompt has more than one option; wheel steps wrap', () => {
    const t = rig({ ui: true, items: { 'hearth-bread': 1, 'ember-coal': 1 } });
    const id = one(t);
    const holdId = mercyInteractableId(t.m.get(id)!.slug);
    t.ui!.focus = holdId;
    t.tick();
    expect(t.ui!.active).toBe(1);
    expect(t.ui!.owners).toEqual(['enemies.calm']);
    expect(t.hold(id).promptParams!()).toEqual({ offering: 'enemies.calm.offering.hearth-bread' });
    t.ui!.wheel = 1;
    t.tick();
    expect(t.hold(id).promptParams!()).toEqual({ offering: 'enemies.calm.offering.ember-coal' });
    t.ui!.wheel = 1;
    t.tick();
    expect(t.hold(id).promptParams!()).toEqual({ offering: 'enemies.calm.warmHand' });
    t.ui!.wheel = 1;
    t.tick();
    expect(t.hold(id).promptParams!()).toEqual({ offering: 'enemies.calm.offering.hearth-bread' });
    t.ui!.wheel = -1;
    t.tick();
    expect(t.hold(id).promptParams!()).toEqual({ offering: 'enemies.calm.warmHand' });
  });

  it('a single option never claims the wheel', () => {
    const t = rig({ ui: true, items: { 'hearth-bread': 1 }, spawners: [group('plain', 'plain-hound', 1)] });
    const id = one(t, 'plain');
    t.ui!.focus = mercyInteractableId(t.m.get(id)!.slug);
    t.tick();
    expect(t.ui!.claims).toBe(0);
  });

  it('the selection freezes at hold start, and the option paid is the one shown', () => {
    const t = rig({ ui: true, items: { 'hearth-bread': 1, 'ember-coal': 1 } });
    const id = one(t);
    t.ui!.focus = mercyInteractableId(t.m.get(id)!.slug);
    t.tick();
    t.ui!.wheel = 1;
    t.tick();
    t.ui!.holding = true;
    t.tick();
    t.ui!.wheel = 1;
    t.tick();
    expect(t.hold(id).promptParams!()).toEqual({ offering: 'enemies.calm.offering.ember-coal' });
    t.hold(id).onInteract(t.fake.player);
    expect(t.fake.inventory!.removed).toEqual([{ itemId: 'ember-coal', count: 1 }]);
  });

  it('inventory emptied between the hold start and its end: the hold does nothing', () => {
    const t = rig({ ui: true, items: { 'hearth-bread': 1 }, spawners: [group('plain', 'plain-hound', 1)] });
    const id = one(t, 'plain');
    t.ui!.focus = mercyInteractableId(t.m.get(id)!.slug);
    t.ui!.holding = true;
    t.tick();
    t.counts.set('hearth-bread', 0);
    t.hold(id).onInteract(t.fake.player);
    expect(t.fake.bus.of('mercy')).toEqual([]);
    expect(t.m.get(id)!.state).not.toBe('calmed');
  });

  describe('releases the claim', () => {
    const claimed = () => {
      const t = rig({ ui: true, items: { 'hearth-bread': 1, 'ember-coal': 1 } });
      const id = one(t);
      t.ui!.focus = mercyInteractableId(t.m.get(id)!.slug);
      t.tick();
      expect(t.ui!.active).toBe(1);
      return { t, id };
    };

    it('on focus loss', () => {
      const { t } = claimed();
      t.ui!.focus = null;
      t.tick();
      expect(t.ui!.active).toBe(0);
    });

    it('when a modal opens, and takes it again when it closes', () => {
      const { t } = claimed();
      t.ui!.modal = true;
      t.tick();
      expect(t.ui!.active).toBe(0);
      t.ui!.modal = false;
      t.tick();
      expect(t.ui!.active).toBe(1);
    });

    it('on completion', () => {
      const { t, id } = claimed();
      t.hold(id).onInteract(t.fake.player);
      expect(t.ui!.active).toBe(0);
    });

    it('when the options drop to one', () => {
      const { t } = claimed();
      t.fake.inventory!.count = () => 0;
      t.fake.inventory!.remove = () => false;
      t.fake.status = undefined;
      // Only the Warm Hand is left: a single option.
      t.tick();
      expect(t.ui!.active).toBe(0);
    });

    it('when the hound is calmed, killed or despawned under the focus', () => {
      const { t, id } = claimed();
      t.hit(id, { amount: 9999 });
      t.tick();
      expect(t.ui!.active).toBe(0);
    });

    it('on manager teardown', () => {
      const { t } = claimed();
      t.m.dispose();
      expect(t.ui!.active).toBe(0);
    });

    it('never leaves more than one claim alive across repeated focus changes', () => {
      const { t, id } = claimed();
      const holdId = mercyInteractableId(t.m.get(id)!.slug);
      for (let i = 0; i < 5; i++) {
        t.ui!.focus = null;
        t.tick();
        t.ui!.focus = holdId;
        t.tick();
      }
      expect(t.ui!.active).toBe(1);
      expect(t.ui!.claims).toBe(6);
    });
  });

  it('CalmCycle without a ui always selects the cheapest option', () => {
    const cycle = new CalmCycle(undefined);
    const opts: CalmOption[] = [{ kind: 'item', itemId: 'hearth-bread', count: 1 }, { kind: 'warmHand' }];
    cycle.register('x', () => opts);
    cycle.update();
    expect(NAMES(cycle.selected('x')!)).toBe('hearth-bread');
  });

  it('calmOptions orders items first, in the def order, then the Warm Hand', () => {
    const inv = { count: (id: string) => ({ 'hearth-bread': 1, 'ember-coal': 4 })[id] ?? 0, remove: () => true };
    expect(calmOptions(HOUND.mercy!, inv).map(NAMES)).toEqual(['hearth-bread', 'ember-coal', 'warm']);
    expect(calmOptions(PLAIN.mercy!, undefined)).toEqual([]);
    expect(calmOptionLabel({ kind: 'warmHand' }, (k) => k)).toBe('enemies.calm.warmHand');
  });
});

describe('Grimtooth, boss Calm', () => {
  function boss(opts: { items?: Record<string, number>; unlocked?: boolean; ui?: boolean } = {}) {
    const t = rig({ items: opts.items ?? { 'hearth-bread': 1 }, calmed: opts.unlocked !== false, ui: opts.ui, spawners: [group('grimtooth-summons', 'fixture-hound', 3, { ephemeral: true })] });
    const ids = t.m.service.spawnGroup('grimtooth-summons');
    t.tick(0.1);
    const actor = new FakeActor('boss-2', 'gaffer-grimtooth', { kind: 'gaffer-grimtooth', team: 'hostile', maxHealth: 800 });
    t.fake.actorMap.set(actor.id, actor);
    t.fake.bossStates.set('gaffer-grimtooth', { actorId: actor.id, releaseOpen: true, outcome: null });
    const open = (on: boolean) => t.fake.bus.emit('boss.releaseWindow', { bossId: 'gaffer-grimtooth', open: on });
    open(true);
    return { ...t, ids, open, bossHold: () => t.fake.interactables.get('release:boss-gaffer-grimtooth') };
  }

  it('the table row: Calm, dragons, +3, ledger D02, bread or the Warm Hand', () => {
    expect(BOSS_MERCY['gaffer-grimtooth']).toMatchObject({ verb: 'calm', track: 'dragons', amount: 3, ledgerId: 'D02', warmHand: true });
    expect(BOSS_MERCY['ashen-prior']!.ledgerId).toBe('D01');
  });

  it('Hearth Bread: one loaf, event verb calm with ledger D02, no Burn, every hound near him scatters', () => {
    const b = boss();
    const i = b.bossHold()!;
    expect(i.enabled!()).toBe(true);
    expect(i.promptKey).toBe('enemies.mercy.calm');
    expect(i.promptParams!()).toEqual({ offering: 'enemies.calm.offering.hearth-bread' });
    i.onInteract(b.fake.player);
    expect(b.fake.bossReleases).toEqual(['gaffer-grimtooth']);
    expect(b.fake.inventory!.removed).toEqual([{ itemId: 'hearth-bread', count: 1 }]);
    expect(b.burn).toEqual([]);
    const mercies = b.fake.bus.of('mercy');
    expect(mercies[0]).toMatchObject({ verb: 'calm', tier: 'boss', track: 'dragons', creature: 'gaffer-grimtooth', amount: 3, ledgerId: 'D02' });
    expect(mercies[0]!.pulseId).toBeUndefined();
    expect(mercies.slice(1).map((m) => m.actorId).sort()).toEqual([...b.ids].sort());
    // Per-hound events are codex and tally only; the boss row pays the favour.
    expect(mercies.slice(1).every((m) => m.track === null)).toBe(true);
    for (const id of b.ids) expect(b.m.get(id)!.state).toBe('calmed');
    expect(b.bossHold()).toBeUndefined();
    // An ephemeral summon group spends no slot.
    expect(b.m.spawners.serialize().spent).toEqual([]);
  });

  it('a summon far from the arena still scatters, so no straggler stays hostile', () => {
    const b = boss();
    b.m.get(b.ids[2]!)!.feet.set(500, 0, 500);
    b.bossHold()!.onInteract(b.fake.player);
    for (const id of b.ids) expect(b.m.get(id)!.state).toBe('calmed');
  });

  it('a hound outside the summon group (not ephemeral) near him is left alone', () => {
    const t = rig({ spawners: [group('grimtooth-summons', 'fixture-hound', 1, { ephemeral: true }), group('kennels', 'fixture-hound', 1)] });
    const [s] = t.m.service.spawnGroup('grimtooth-summons');
    const [k] = t.m.service.spawnGroup('kennels');
    t.tick(0.1);
    const actor = new FakeActor('boss-2', 'gaffer-grimtooth', { kind: 'gaffer-grimtooth', team: 'hostile', maxHealth: 800 });
    t.fake.actorMap.set(actor.id, actor);
    t.fake.bossStates.set('gaffer-grimtooth', { actorId: actor.id, releaseOpen: true, outcome: null });
    t.fake.bus.emit('boss.releaseWindow', { bossId: 'gaffer-grimtooth', open: true });
    t.fake.interactables.get('release:boss-gaffer-grimtooth')!.onInteract(t.fake.player);
    expect(t.m.get(s!)!.state).toBe('calmed');
    expect(t.m.get(k!)!.state).not.toBe('calmed');
  });

  it('the selection follows the picked option when the list shrinks', () => {
    const t = rig({ ui: true, items: { 'hearth-bread': 1, 'ember-coal': 1 } });
    const id = one(t);
    t.ui!.focus = mercyInteractableId(t.m.get(id)!.slug);
    t.tick();
    t.ui!.wheel = 1;
    t.tick();
    t.counts.set('hearth-bread', 0);
    expect(t.hold(id).promptParams!()).toEqual({ offering: 'enemies.calm.offering.ember-coal' });
  });

  it('the Warm Hand with no bread: 10 Burn once, after the registry says yes, event verb warmHand', () => {
    const b = boss({ items: {} });
    b.bossHold()!.onInteract(b.fake.player);
    expect(b.burn).toEqual([[WARM_HAND_BURN, 'warmHand']]);
    expect(b.fake.bus.of('mercy')[0]).toMatchObject({ verb: 'warmHand', tier: 'boss', ledgerId: 'D02' });
    expect(b.played).toContain('warm-hand');
  });

  it('the registry refusing takes no loaf, no Burn, no event and leaves the pack and the hold', () => {
    const b = boss();
    b.fake.bossReleaseResult = false;
    b.bossHold()!.onInteract(b.fake.player);
    expect(b.fake.inventory!.removed).toEqual([]);
    expect(b.burn).toEqual([]);
    expect(b.fake.bus.of('mercy')).toEqual([]);
    for (const id of b.ids) expect(b.m.get(id)!.state).not.toBe('calmed');
    expect(b.bossHold()).toBeDefined();
  });

  it('the Warm Hand refused by the registry charges nothing either', () => {
    const b = boss({ items: {} });
    b.fake.bossReleaseResult = false;
    b.bossHold()!.onInteract(b.fake.player);
    expect(b.burn).toEqual([]);
  });

  it('is hidden while Calm is locked; Release being unlocked does not open it', () => {
    const b = boss({ unlocked: false });
    b.m.service.setMercyUnlocked('release', true);
    expect(b.bossHold()!.enabled!()).toBe(false);
    b.bossHold()!.onInteract(b.fake.player);
    expect(b.fake.bossReleases).toEqual([]);
  });

  it('cycles bread against the Warm Hand with the wheel, and the claim ends with the hold', () => {
    const b = boss({ ui: true });
    b.ui!.focus = 'release:boss-gaffer-grimtooth';
    b.tick();
    expect(b.ui!.active).toBe(1);
    b.ui!.wheel = 1;
    b.tick();
    expect(b.bossHold()!.promptParams!()).toEqual({ offering: 'enemies.calm.warmHand' });
    b.bossHold()!.onInteract(b.fake.player);
    expect(b.burn).toEqual([[WARM_HAND_BURN, 'warmHand']]);
    expect(b.fake.inventory!.removed).toEqual([]);
    expect(b.ui!.active).toBe(0);
  });

  it('closing the window drops the hold and its wheel claim', () => {
    const b = boss({ ui: true });
    b.ui!.focus = 'release:boss-gaffer-grimtooth';
    b.tick();
    b.open(false);
    expect(b.bossHold()).toBeUndefined();
    b.ui!.focus = null;
    b.tick();
    expect(b.ui!.active).toBe(0);
  });

  it('a save with the window open keeps no hold state: nothing is spent or recorded until the registry says yes', () => {
    const b = boss();
    const before = b.m.spawners.serialize();
    b.fake.bus.emit('save.loaded', { slot: 's' });
    expect(b.m.spawners.serialize()).toEqual(before);
    expect(b.fake.bus.of('mercy')).toEqual([]);
    expect(b.fake.bossStates.get('gaffer-grimtooth')!.outcome).toBeNull();
    expect(b.bossHold()).toBeDefined();
    expect(b.fake.inventory!.removed).toEqual([]);
  });

  it('the Prior still pays its 20 Burn on the Release path and carries ledger D01', () => {
    const t = rig({ spawners: [group('pack', 'ash-wraith', 1)] });
    t.m.service.setMercyUnlocked('release', true);
    const actor = new FakeActor('boss-1', 'ashen-prior', { kind: 'ashen-prior', team: 'hostile', maxHealth: 500 });
    t.fake.actorMap.set(actor.id, actor);
    t.fake.bossStates.set('ashen-prior', { actorId: actor.id, releaseOpen: true, outcome: null });
    t.fake.bus.emit('boss.releaseWindow', { bossId: 'ashen-prior', open: true });
    t.fake.interactables.get('release:boss-ashen-prior')!.onInteract(t.fake.player);
    expect(t.burn).toEqual([[20, 'release']]);
    expect(t.fake.bus.of('mercy')[0]).toMatchObject({ verb: 'release', ledgerId: 'D01' });
  });
});
