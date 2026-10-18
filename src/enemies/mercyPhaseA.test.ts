import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP } from '../config/constants';
import { EnemyManager } from './EnemyManager';
import { mercyInteractableId } from './mercy';
import { MercyTally } from './mercyTally';
import { FakeActor, FakeHost, loadKnight } from './testing/fakeHost';
import { AI, MERCY } from './tuning';
import type { SpawnerDef } from './types';

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };

beforeAll(async () => {
  gltf = await loadKnight();
});

const SPAWNERS: SpawnerDef[] = [
  { id: 'pack', enemy: 'ash-wraith', count: 3, anchor: 'spawn.pack', band: { min: 1, max: 1 }, activation: 'manual', respawn: 'never', leash: false },
  { id: 'pair', enemy: 'blighted-soldier', count: 2, anchor: 'spawn.pair', band: { min: 1, max: 1 }, activation: 'manual', respawn: 'never', leash: false },
];

function setup(playerAt = { x: 0, z: -30 }) {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: playerAt.x, y: 0, z: playerAt.z } });
  fake.defineAnchor('spawn.pack', 0, 0);
  fake.defineAnchor('spawn.pair', 0, 0);
  const manager = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: SPAWNERS, seed: 7 });
  const tick = (seconds = DT) => {
    for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) {
      manager.think(DT);
      manager.animate(DT);
      fake.combatStep(DT);
      manager.react(DT);
    }
  };
  const hold = (id: string) => fake.interactables.get(mercyInteractableId(manager.get(id)!.slug))!;
  return { fake, manager, tick, hold };
}

function shards(fake: FakeHost) {
  const calls: Array<[number, string]> = [];
  fake.spells = { useShard: (g, s) => void calls.push([g, s]) };
  return calls;
}

function pack() {
  const s = setup();
  const ids = s.manager.service.spawnGroup('pack');
  s.tick(AI.riseSeconds + 0.1);
  s.manager.service.setMercyUnlocked('release', true);
  return { ...s, ids };
}

function pair(opts: { spare?: boolean } = {}) {
  const s = setup({ x: 0, z: -1.5 });
  if (opts.spare !== false) s.manager.service.setMercyUnlocked('spare', true);
  const ids = s.manager.service.spawnGroup('pair', { aggro: true });
  s.tick(0.1);
  return { ...s, ids };
}

function breakSoldier(s: ReturnType<typeof pair>, id: string, healthFraction: number) {
  const a = s.fake.actorMap.get(id)!;
  a.health = a.maxHealth * healthFraction;
  s.fake.stagger(id, 'player');
}

describe('Release Burn', () => {
  it('charges 10 once for a pulse over several wraiths', () => {
    const { fake, ids, hold } = pack();
    const calls = shards(fake);
    fake.stagger(ids[0], 'player');
    fake.stagger(ids[1], 'player');
    fake.stagger(ids[2], 'player');
    hold(ids[0]).onInteract(fake.player);
    expect(fake.bus.of('mercy')).toHaveLength(3);
    expect(calls).toEqual([[MERCY.releaseBurn, 'release']]);
  });

  it('charges nothing for a Spare', () => {
    const s = pair();
    const calls = shards(s.fake);
    breakSoldier(s, s.ids[0], 0.4);
    s.hold(s.ids[0]).onInteract(s.fake.player);
    expect(s.fake.bus.of('mercy')).toHaveLength(1);
    expect(calls).toEqual([]);
  });

  it('falls back to the bare Burn charge while useShard is absent, and tolerates no spells service', () => {
    const a = pack();
    const adds: Array<[number, string]> = [];
    a.fake.spells = { addBurn: (n, s) => void adds.push([n, s]) };
    a.fake.stagger(a.ids[0], 'player');
    a.hold(a.ids[0]).onInteract(a.fake.player);
    expect(adds).toEqual([[10, 'release']]);
    const b = pack();
    b.fake.stagger(b.ids[0], 'player');
    expect(() => b.hold(b.ids[0]).onInteract(b.fake.player)).not.toThrow();
    expect(b.fake.bus.of('mercy')).toHaveLength(1);
  });

  it('is never refused by the Burn level: the hold stays enabled whatever Burn reads', () => {
    const { fake, ids, hold } = pack();
    const calls: Array<[number, string]> = [];
    // A spells service whose Burn reads 100: the Burn and Scar arithmetic is thread 2's, this side only charges.
    fake.spells = { useShard: (g, s) => void calls.push([g, s]) };
    (fake.spells as { burn?: number }).burn = 100;
    fake.stagger(ids[0], 'player');
    expect(hold(ids[0]).enabled!()).toBe(true);
    hold(ids[0]).onInteract(fake.player);
    expect(calls).toEqual([[10, 'release']]);
  });

  it('a locked verb does nothing: no prompt, no Burn, no event', () => {
    const { fake, manager, ids, hold } = pack();
    manager.service.setMercyUnlocked('release', false);
    const calls = shards(fake);
    fake.stagger(ids[0], 'player');
    expect(hold(ids[0]).enabled!()).toBe(false);
    hold(ids[0]).onInteract(fake.player);
    expect(calls).toEqual([]);
    expect(fake.bus.of('mercy')).toEqual([]);
  });

  it('a hold on an already released wraith (mid-dissolve) charges nothing more', () => {
    const { fake, ids, hold, tick } = pack();
    const calls = shards(fake);
    fake.stagger(ids[0], 'player');
    const i = hold(ids[0]);
    i.onInteract(fake.player);
    tick(AI.releaseDissolveSeconds / 2);
    i.onInteract(fake.player);
    expect(calls).toHaveLength(1);
    expect(fake.bus.of('mercy')).toHaveLength(1);
  });
});

describe('boss Release hold', () => {
  function boss(unlocked = true) {
    const s = pack();
    s.manager.service.setMercyUnlocked('release', unlocked);
    const actor = new FakeActor('boss-1', 'ashen-prior', { kind: 'ashen-prior', team: 'hostile', maxHealth: 500 });
    s.fake.actorMap.set(actor.id, actor);
    s.fake.bossStates.set('ashen-prior', { actorId: actor.id, releaseOpen: true, outcome: null });
    const calls = shards(s.fake);
    const open = (on: boolean) => s.fake.bus.emit('boss.releaseWindow', { bossId: 'ashen-prior', open: on });
    return { ...s, calls, open, bossHold: () => s.fake.interactables.get('release:boss-ashen-prior') };
  }

  it('registers on the window, charges 20 once and pays the ledger row, covering staggered summons in one pulse', () => {
    const b = boss();
    b.open(true);
    const i = b.bossHold()!;
    expect(i.enabled!()).toBe(true);
    b.fake.stagger(b.ids[0], 'player');
    b.fake.stagger(b.ids[1], 'player');
    i.onInteract(b.fake.player);
    expect(b.fake.bossReleases).toEqual(['ashen-prior']);
    expect(b.calls).toEqual([[MERCY.bossReleaseBurn, 'release']]);
    const mercies = b.fake.bus.of('mercy');
    expect(mercies[0]).toMatchObject({ verb: 'release', tier: 'boss', track: 'ashwalkers', creature: 'ashen-prior', amount: 4 });
    expect(mercies.slice(1).map((m) => m.actorId).sort()).toEqual([b.ids[0], b.ids[1]].sort());
    expect(new Set(mercies.map((m) => m.pulseId)).size).toBe(1);
    expect(b.bossHold()).toBeUndefined();
  });

  it('charges and pays nothing when the registry refuses the release', () => {
    const b = boss();
    b.open(true);
    b.fake.bossReleaseResult = false;
    b.bossHold()!.onInteract(b.fake.player);
    expect(b.calls).toEqual([]);
    expect(b.fake.bus.of('mercy')).toEqual([]);
  });

  it('a refused release leaves a staggered summon staggered and the hold registered', () => {
    const b = boss();
    b.open(true);
    b.fake.stagger(b.ids[0], 'player');
    b.fake.bossReleaseResult = false;
    b.bossHold()!.onInteract(b.fake.player);
    expect(b.fake.bus.of('mercy')).toEqual([]);
    expect(b.manager.get(b.ids[0])!.state).toBe('stagger');
    expect(b.bossHold()).toBeDefined();
  });

  it('a hold completing on the tick the window shut does nothing', () => {
    const b = boss();
    b.open(true);
    const i = b.bossHold()!;
    b.fake.bossStates.get('ashen-prior')!.releaseOpen = false;
    i.onInteract(b.fake.player);
    expect(b.fake.bossReleases).toEqual([]);
    expect(b.calls).toEqual([]);
  });

  it('summons still count when a boss.released listener despawns them, and the boss prompt names 20 Burn', () => {
    const b = boss();
    b.open(true);
    b.fake.stagger(b.ids[0], 'player');
    b.fake.bus.on('boss.released', () => b.manager.service.despawnGroup('pack'));
    const i = b.bossHold()!;
    expect(i.promptKey).toBe('enemies.mercy.release.boss');
    i.onInteract(b.fake.player);
    const mercies = b.fake.bus.of('mercy');
    expect(mercies.map((m) => m.tier)).toContain('boss');
    expect(b.calls).toEqual([[20, 'release']]);
  });

  it('does nothing when the boss actor is already gone', () => {
    const b = boss();
    b.open(true);
    const i = b.bossHold()!;
    b.fake.actorMap.delete('boss-1');
    i.onInteract(b.fake.player);
    expect(b.fake.bossReleases).toEqual([]);
    expect(b.calls).toEqual([]);
  });

  it('is hidden while Release is locked, and when the registry says the window shut', () => {
    const locked = boss(false);
    locked.open(true);
    expect(locked.bossHold()!.enabled!()).toBe(false);
    locked.bossHold()!.onInteract(locked.fake.player);
    expect(locked.fake.bossReleases).toEqual([]);
    const shut = boss();
    shut.open(true);
    shut.fake.bossStates.get('ashen-prior')!.releaseOpen = false;
    expect(shut.bossHold()!.enabled!()).toBe(false);
  });

  it('is removed when the window closes, the boss ends or is released elsewhere, and never doubled', () => {
    const b = boss();
    b.open(true);
    b.open(true);
    expect(b.bossHold()).toBeDefined();
    b.open(false);
    expect(b.bossHold()).toBeUndefined();
    b.open(true);
    b.fake.bus.emit('boss.ended', { bossId: 'ashen-prior', actorId: 'boss-1', reason: 'despawned' });
    expect(b.bossHold()).toBeUndefined();
    b.open(true);
    b.fake.bus.emit('boss.released', { bossId: 'ashen-prior', actorId: 'boss-1' });
    expect(b.bossHold()).toBeUndefined();
  });

  it('ignores a boss with no mercy row', () => {
    const b = boss();
    b.fake.bossStates.set('other', { actorId: 'boss-1', releaseOpen: true, outcome: null });
    b.fake.bus.emit('boss.releaseWindow', { bossId: 'other', open: true });
    expect(b.fake.interactables.has('release:boss-other')).toBe(false);
  });
});

describe('pack Spare', () => {
  it('a partner at a poise break kneels when its pair is spared, whatever its health', () => {
    const s = pair();
    const [a, b] = s.ids;
    breakSoldier(s, a, 0.4);
    s.fake.stagger(b, 'player');
    expect(s.manager.get(b)!.state).toBe('stagger');
    s.hold(a).onInteract(s.fake.player);
    expect(s.manager.get(a)!.state).toBe('spared');
    expect(s.manager.get(b)!.state).toBe('yield');
    expect(s.fake.bus.of('enemies.yield').some((e) => e.actorId === b)).toBe(true);
  });

  it('a partner that is not staggered is left alone', () => {
    const s = pair();
    const [a, b] = s.ids;
    breakSoldier(s, a, 0.4);
    const before = s.manager.get(b)!.state;
    s.hold(a).onInteract(s.fake.player);
    expect(s.manager.get(b)!.state).toBe(before);
    expect(s.manager.get(b)!.state).not.toBe('yield');
  });

  it('a partner already kneeling has its window refreshed', () => {
    const s = pair();
    const [a, b] = s.ids;
    breakSoldier(s, b, 0.4);
    breakSoldier(s, a, 0.4);
    s.tick(1.5);
    expect(s.manager.get(b)!.state).toBe('yield');
    s.hold(a).onInteract(s.fake.player);
    s.tick(1);
    expect(s.manager.get(b)!.state).toBe('yield');
  });

  it('a partner struck after the offer stops kneeling and is hostile', () => {
    const s = pair();
    const [a, b] = s.ids;
    breakSoldier(s, a, 0.4);
    s.fake.stagger(b, 'player');
    s.hold(a).onInteract(s.fake.player);
    s.manager.get(b)!.damaged('player', 'hit', 1, false, false);
    expect(s.manager.get(b)!.state).not.toBe('yield');
  });

  it('a refreshed window announces itself again', () => {
    const s = pair();
    const [a, b] = s.ids;
    breakSoldier(s, b, 0.4);
    breakSoldier(s, a, 0.4);
    s.hold(a).onInteract(s.fake.player);
    expect(s.fake.bus.of('enemies.yield').filter((e) => e.actorId === b)).toHaveLength(2);
  });

  it('a partner beyond the pack radius is not offered', () => {
    const s = pair();
    const [a, b] = s.ids;
    breakSoldier(s, a, 0.4);
    s.fake.stagger(b, 'player');
    s.manager.get(b)!.feet.set(AI.packShareRadius + 5, 0, 0);
    s.hold(a).onInteract(s.fake.player);
    expect(s.manager.get(b)!.state).toBe('stagger');
  });

  it('a partner in a different group is not offered', () => {
    const s = pair();
    const wraith = s.manager.spawnLoose('blighted-soldier', { x: 0.5, y: 0, z: 0 })!;
    s.tick(0.1);
    s.fake.stagger(wraith, 'player');
    breakSoldier(s, s.ids[0], 0.4);
    s.hold(s.ids[0]).onInteract(s.fake.player);
    expect(s.manager.get(wraith)!.state).not.toBe('yield');
  });
});

describe('slots and saves', () => {
  it('Release spends the slot at once, before the dissolve ends', () => {
    const { fake, manager, ids, hold } = pack();
    fake.stagger(ids[0], 'player');
    hold(ids[0]).onInteract(fake.player);
    expect(manager.spawners.serialize().spent).toContain('pack#0');
  });

  it('Spare spends the slot at once; a strike before it leaves gives it back', () => {
    const s = pair();
    const [a] = s.ids;
    breakSoldier(s, a, 0.4);
    s.hold(a).onInteract(s.fake.player);
    expect(s.manager.spawners.serialize().spent).toHaveLength(1);
    s.fake.bus.emit('mercy.revoked', { actorId: a, track: 'halvard', removed: 1 });
    expect(s.manager.spawners.serialize().spent).toEqual([]);
  });

  it('a yield nobody accepted spends nothing, and a save then load drops the spared walker', () => {
    const s = pair();
    const [a, b] = s.ids;
    breakSoldier(s, a, 0.4);
    expect(s.manager.spawners.serialize().spent).toEqual([]);
    s.hold(a).onInteract(s.fake.player);
    s.tick(0.2);
    const saved = s.manager.spawners.serialize();
    s.manager.spawners.load(saved);
    s.fake.bus.emit('save.loaded', { slot: 'x' });
    expect(s.manager.get(a)).toBeUndefined();
    expect(s.manager.get(b)).toBeDefined();
  });
});

describe('loading a save that predates the mercy', () => {
  it('mid walk-off: the leaving soldier is despawned without a spend, and the group refills', () => {
    const s = pair();
    const [a] = s.ids;
    const older = s.manager.spawners.serialize();
    breakSoldier(s, a, 0.4);
    s.hold(a).onInteract(s.fake.player);
    s.tick(0.2);
    s.manager.spawners.load(older);
    s.fake.bus.emit('save.loaded', { slot: 'x' });
    s.tick(0.1);
    expect(s.manager.get(a)).toBeUndefined();
    expect(s.manager.spawners.serialize().spent).toEqual([]);
    expect(s.manager.service.alive('pair')).toHaveLength(2);
  });

  it('mid dissolve: the released wraith is replaced by a fresh one', () => {
    const { fake, manager, ids, hold, tick } = pack();
    const older = manager.spawners.serialize();
    fake.stagger(ids[0], 'player');
    hold(ids[0]).onInteract(fake.player);
    tick(AI.releaseDissolveSeconds / 3);
    manager.spawners.load(older);
    fake.bus.emit('save.loaded', { slot: 'x' });
    tick(0.1);
    expect(manager.service.alive('pack')).toHaveLength(3);
    expect(manager.spawners.serialize().spent).toEqual([]);
  });

  it('a save taken while a soldier merely kneels reloads without the credit', () => {
    const s = pair();
    breakSoldier(s, s.ids[0], 0.4);
    expect(s.manager.get(s.ids[0])!.state).toBe('yield');
    const saved = s.manager.spawners.serialize();
    expect(saved.spent).toEqual([]);
    s.manager.spawners.load(saved);
    s.fake.bus.emit('save.loaded', { slot: 'x' });
    expect(s.manager.get(s.ids[0])!.state).toBe('yield');
    expect(s.fake.bus.of('mercy')).toEqual([]);
  });
});

describe('effects', () => {
  it('plays release-pulse on a Release and yield-glyph when a soldier kneels, and survives no vfx', () => {
    const played: string[] = [];
    const a = pack();
    const pulses: number[] = [];
    a.fake.vfx = { dissolve: async () => {}, spawnEffect: (id) => void played.push(id), pulseScreen: (n: number) => void pulses.push(n) } as typeof a.fake.vfx;
    a.fake.stagger(a.ids[0], 'player');
    a.hold(a.ids[0]).onInteract(a.fake.player);
    expect(played).toContain('release-pulse');
    expect(pulses).toHaveLength(1);
    const b = pair();
    b.fake.vfx = { dissolve: async () => {}, spawnEffect: (id) => void played.push(id) };
    breakSoldier(b, b.ids[0], 0.4);
    expect(played).toContain('yield-glyph');
    const stopped: string[] = [];
    const d = pair();
    d.fake.vfx = { dissolve: async () => {}, spawnEffect: (id) => ({ stop: () => void stopped.push(id) }) };
    breakSoldier(d, d.ids[0], 0.4);
    d.hold(d.ids[0]).onInteract(d.fake.player);
    expect(stopped).toEqual(['yield-glyph']);
    const c = pack();
    c.fake.stagger(c.ids[0], 'player');
    expect(() => c.hold(c.ids[0]).onInteract(c.fake.player)).not.toThrow();
  });
});

describe('mercy tally', () => {
  const ev = (over: Partial<Parameters<MercyTally['mercy']>[0]> = {}) => ({
    verb: 'release' as const,
    tier: 'normal' as const,
    track: 'ashwalkers' as const,
    creature: 'ash-wraith',
    actorId: 'a1',
    ...over,
  });

  it('counts per creature and verb, and the Warm Hand counts as a Calm', () => {
    const t = new MercyTally();
    t.mercy(ev());
    t.mercy(ev({ actorId: 'a2', verb: 'spare', creature: 'blighted-soldier' }));
    t.mercy(ev({ actorId: 'a3', verb: 'warmHand', creature: 'ember-hound' }));
    t.killed('ash-wraith');
    expect(t.snapshot()).toEqual({
      'ash-wraith': { release: 1, spare: 0, calm: 0, killed: 1 },
      'blighted-soldier': { release: 0, spare: 1, calm: 0, killed: 0 },
      'ember-hound': { release: 0, spare: 0, calm: 1, killed: 0 },
    });
  });

  it('a second mercy on the same actor adds nothing; a revoke subtracts once and never below zero', () => {
    const t = new MercyTally();
    t.mercy(ev());
    t.mercy(ev({ verb: 'spare' }));
    expect(t.snapshot()['ash-wraith'].release).toBe(1);
    expect(t.snapshot()['ash-wraith'].spare).toBe(0);
    t.revoked('a1');
    t.revoked('a1');
    t.revoked('nobody');
    expect(t.snapshot()['ash-wraith'].release).toBe(0);
  });

  it('round-trips and survives garbage', () => {
    const t = new MercyTally();
    t.mercy(ev());
    t.killed('ash-wraith');
    const u = new MercyTally();
    u.load(JSON.parse(JSON.stringify(t.serialize())));
    expect(u.snapshot()).toEqual(t.snapshot());
    for (const bad of [null, undefined, 3, 'x', { rows: 5 }, { rows: { a: null, b: { release: -2, spare: 'x', calm: NaN, killed: 2.9 } } }]) {
      const v = new MercyTally();
      expect(() => v.load(bad)).not.toThrow();
    }
    const w = new MercyTally();
    w.load({ rows: { b: { release: -2, spare: 'x', calm: NaN, killed: 2.9 } } });
    expect(w.snapshot()).toEqual({ b: { release: 0, spare: 0, calm: 0, killed: 2 } });
  });

  it('the manager tallies a release, a revoked spare and a kill from real events', () => {
    const s = pair();
    const [a, b] = s.ids;
    breakSoldier(s, a, 0.4);
    s.hold(a).onInteract(s.fake.player);
    expect(s.manager.service.mercyTally()['blighted-soldier'].spare).toBe(1);
    s.fake.bus.emit('mercy.revoked', { actorId: a, track: 'halvard', removed: 1 });
    expect(s.manager.service.mercyTally()['blighted-soldier'].spare).toBe(0);
    const actor = s.fake.actorMap.get(b)!;
    actor.health = 0;
    s.fake.bus.emit('actor.died', { actorId: b, killerId: 'player', kind: 'blighted-soldier', team: 'hostile', level: 1 });
    expect(s.manager.service.mercyTally()['blighted-soldier'].killed).toBe(1);
  });
});

describe('the calm unlock', () => {
  it('is its own flag, off by default and independent of Release and Spare', () => {
    const { manager, fake } = setup();
    expect(manager.service.mercyUnlocked('calm')).toBe(false);
    manager.service.setMercyUnlocked('release', true);
    manager.service.setMercyUnlocked('spare', true);
    expect(manager.service.mercyUnlocked('calm')).toBe(false);
    manager.service.setMercyUnlocked('calm', true);
    expect(manager.service.mercyUnlocked('calm')).toBe(true);
    expect(fake.flags.get('enemies.mercy.calm')).toBe(true);
    manager.service.setMercyUnlocked('calm', false);
    expect(manager.service.mercyUnlocked('calm')).toBe(false);
    expect(manager.service.mercyUnlocked('release')).toBe(true);
  });
});
