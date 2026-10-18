import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP } from '../config/constants';
import { ASH_WRAITH, BLIGHTED_SOLDIER } from './defs';
import { EnemyManager } from './EnemyManager';
import { mercyInteractableId } from './mercy';
import { FakeHost, loadKnight } from './testing/fakeHost';
import { AI, ASH_GRAB, MERCY } from './tuning';
import type { SpawnerDef } from './types';

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };

beforeAll(async () => {
  gltf = await loadKnight();
});

const SPAWNERS: SpawnerDef[] = [
  { id: 'pack', enemy: 'ash-wraith', count: 3, anchor: 'spawn.pack', band: { min: 1, max: 1 }, activation: 'manual', respawn: 'never', leash: false },
  { id: 'one', enemy: 'ash-wraith', count: 1, anchor: 'spawn.one', band: { min: 1, max: 1 }, activation: 'manual', respawn: 'never', leash: false },
  { id: 'soldier', enemy: 'blighted-soldier', count: 1, anchor: 'spawn.soldier', band: { min: 1, max: 1 }, activation: 'manual', respawn: 'never', leash: false },
  { id: 'm01', tag: 'm01', enemy: 'ash-wraith', count: 2, anchor: 'spawn.m01', band: { min: 1, max: 1 }, activation: { quest: 'm01' }, respawn: 'never', leash: false },
  { id: 'missing', enemy: 'ash-wraith', count: 1, anchor: 'spawn.nowhere', band: { min: 1, max: 1 }, activation: 'manual', respawn: 'never' },
];

function setup(playerAt = { x: 0, z: -20 }) {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: playerAt.x, y: 0, z: playerAt.z } });
  fake.defineAnchor('spawn.pack', 0, 0);
  fake.defineAnchor('spawn.one', 0, 0);
  fake.defineAnchor('spawn.soldier', 0, 0);
  fake.defineAnchor('spawn.m01', 5, 5);
  const manager = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: SPAWNERS, seed: 7 });
  const tick = (seconds = DT) => {
    for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) {
      manager.think(DT);
      manager.animate(DT);
      fake.combatStep(DT);
      manager.react(DT);
    }
  };
  return { fake, manager, tick };
}

/** Spawns one wraith (no rise) right in front of the player and lets it engage. */
function engagedWraith(opts: { moves?: string[] } = {}) {
  const s = setup({ x: 0, z: -1.4 });
  const [id] = s.manager.service.spawnGroup('one', { aggro: true, moves: opts.moves });
  const enemy = s.manager.get(id)!;
  return { ...s, id, enemy };
}

describe('spawning', () => {
  it('spawns a hostile actor with its tag, audio material, hurtboxes, weapon and mercy hold', () => {
    const { fake, manager } = setup();
    const ids = manager.service.spawnGroup('m01');
    expect(ids).toHaveLength(2);
    const actor = fake.actorMap.get(ids[0])!;
    expect(actor.team).toBe('hostile');
    expect(actor.kind).toBe('ash-wraith');
    expect(actor.spawnTag).toBe('m01');
    expect(actor.data['audio']).toEqual({ material: 'ash' });
    expect(fake.targetCount).toBe(1 + 2); // player + two wraiths
    expect(fake.attackerCount).toBe(2);
    expect(fake.interactables.size).toBe(2);
  });

  it('the soldier has two weapon channels and metal material', () => {
    const { fake, manager } = setup();
    const [id] = manager.service.spawnGroup('soldier');
    expect(fake.actorMap.get(id)!.data['audio']).toEqual({ material: 'metal' });
    expect(fake.attackerCount).toBe(2);
  });

  it('starts quest spawners on quest.started', () => {
    const { fake, manager } = setup();
    fake.bus.emit('quest.started', { questId: 'm01' });
    expect(manager.service.alive('m01')).toHaveLength(2);
  });

  it('a spawner with a missing anchor warns and spawns nothing; others still work', () => {
    const { fake, manager } = setup();
    expect(manager.service.spawnGroup('missing')).toEqual([]);
    expect(fake.warnings.some((w) => w.includes('spawn.nowhere'))).toBe(true);
    expect(manager.service.spawnGroup('one')).toHaveLength(1);
  });

  it('a model that cannot be built warns and spawns nothing', () => {
    const fake = new FakeHost(gltf.scene);
    fake.defineAnchor('spawn.one', 0, 0);
    const manager = new EnemyManager(fake.host, () => ({ model: new THREE.Group(), clips: [] }), { spawners: SPAWNERS });
    expect(manager.service.spawnGroup('one')).toEqual([]);
    expect(fake.warnings.some((w) => w.includes('could not spawn'))).toBe(true);
    expect(fake.actorMap.size).toBe(1);
  });

  it('two wraiths get independent materials', () => {
    const { manager } = setup();
    const [a, b] = manager.service.spawnGroup('pack');
    const ea = manager.get(a)!;
    const eb = manager.get(b)!;
    ea.model.setTelegraph(1, 0xffffff);
    ea.model.setOpacity(0.3);
    expect(ea.model.materials[0]).not.toBe(eb.model.materials[0]);
    expect(eb.model.materials[0].opacity).toBe(1);
  });
});

describe('fighting the player', () => {
  it('notices, telegraphs with the clip as attackId, swings and damages the player through the bus', () => {
    const { fake, tick, id } = engagedWraith({ moves: ['wraith.claw'] });
    tick(AI.riseSeconds + 4);
    const tele = fake.bus.of('telegraph').filter((t) => t.actorId === id);
    expect(tele.length).toBeGreaterThan(0);
    expect(tele[0]).toMatchObject({ kind: 'block', attackId: ASH_WRAITH.moves[0].clip, moveId: 'wraith.claw', leadSeconds: 0.5 });
    expect(fake.bus.of('ai.aggro').filter((a) => a.actorId === id)).toHaveLength(1);
    const hits = fake.bus.of('damage.dealt').filter((d) => d.attackerId === id);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].targetId).toBe('player');
    expect(hits[0].poise).toBe(ASH_WRAITH.moves[0].poise);
    expect(hits[0].attackId).toBe(ASH_WRAITH.moves[0].clip);
    expect(hits[0].unblockable).toBeUndefined();
    // the window opened and closed for that swing, and at most one hit per swing
    const opens = fake.windows.filter((w) => w.actorId === id && w.phase === 'open');
    expect(opens.length).toBeGreaterThanOrEqual(1);
    const swings = new Set(hits.map((h) => h.swingId));
    expect(swings.size).toBe(hits.length);
  });

  it('the red sweep is sent as unblockable', () => {
    const { fake, tick, id } = engagedWraith({ moves: ['wraith.sweep'] });
    tick(AI.riseSeconds + 5);
    expect(fake.bus.of('telegraph').find((t) => t.actorId === id)?.kind).toBe('dodge');
    const hit = fake.bus.of('damage.dealt').find((d) => d.attackerId === id);
    expect(hit?.unblockable).toBe(true);
  });

  it('the ash-grab slows the player, and the slow ends after its time', () => {
    const { fake, tick, id } = engagedWraith({ moves: ['wraith.grab'] });
    for (let i = 0; i < 600 && !fake.bus.of('damage.dealt').some((d) => d.attackerId === id); i++) tick();
    expect(fake.bus.of('damage.dealt').some((d) => d.attackerId === id)).toBe(true);
    expect([...fake.moveModifiers.values()][0]).toEqual({ speedScale: ASH_GRAB.speedScale });
    // keep it from hitting again: kill the player, then wait out the slow
    fake.player.health = 0;
    fake.bus.emit('actor.died', { actorId: 'player', killerId: id, kind: 'knight', team: 'player', level: 1 });
    tick(ASH_GRAB.seconds + 0.1);
    expect(fake.moveModifiers.size).toBe(0);
  });

  it('the enemies modifier leaves the player attacks alone', () => {
    const { fake, id } = engagedWraith();
    const r = fake.apply({ attackerId: 'player', targetId: id, amount: 7, poise: 3, kind: 'melee', bone: 'torso' });
    expect(r!.dealt).toBe(7);
    expect(r!.poiseDealt).toBe(3);
  });

  it('a target that dies mid-chase is dropped: calm, and no more telegraphs', () => {
    const { fake, tick, id } = engagedWraith();
    tick(AI.riseSeconds + AI.noticeSeconds);
    fake.player.health = 0;
    fake.bus.emit('actor.died', { actorId: 'player', killerId: null, kind: 'knight', team: 'player', level: 1 });
    expect(fake.bus.of('ai.calm').filter((c) => c.actorId === id)).toHaveLength(1);
    const before = fake.bus.of('telegraph').length;
    tick(3);
    expect(fake.bus.of('telegraph').length).toBe(before);
  });

  it('a stagger during the telegraph sends telegraph.cancelled exactly once', () => {
    const { fake, tick, id, manager } = engagedWraith({ moves: ['wraith.claw'] });
    for (let i = 0; i < 600 && manager.get(id)!.state !== 'telegraph'; i++) tick();
    expect(manager.get(id)!.state).toBe('telegraph');
    fake.stagger(id, 'player');
    tick(0.5);
    expect(fake.bus.of('telegraph.cancelled').filter((c) => c.actorId === id)).toHaveLength(1);
    expect(manager.get(id)!.state).toBe('stagger');
  });
});

describe('death', () => {
  it('stops fighting at once, fades without vfx, despawns, and clears the group', () => {
    const { fake, tick, id, manager } = engagedWraith();
    tick(AI.riseSeconds + AI.noticeSeconds);
    const targets = fake.targetCount;
    fake.apply({ attackerId: 'player', targetId: id, amount: 1000, poise: 0, kind: 'melee' });
    expect(fake.actorMap.get(id)!.hittable).toBe(false);
    expect(fake.targetCount).toBe(targets - 1);
    expect(fake.attackerCount).toBe(0);
    expect(fake.interactables.size).toBe(1);
    expect(fake.bus.of('ai.calm').filter((c) => c.actorId === id)).toHaveLength(1);
    // hits on the corpse are dropped
    expect(fake.apply({ attackerId: 'player', targetId: id, amount: 1, poise: 0, kind: 'melee' })).toBeNull();
    tick(4);
    expect(manager.get(id)).toBeUndefined();
    expect(fake.actorMap.has(id)).toBe(false);
    expect(fake.interactables.size).toBe(0);
    expect(fake.bus.of('enemies.groupCleared')).toEqual([{ spawnerId: 'one' }]);
    expect(fake.bus.of('actor.died').filter((d) => d.actorId === id)).toHaveLength(1);
  });

  it('uses vfx.dissolve when thread 7 provides it', async () => {
    const { fake, tick, id, manager } = engagedWraith();
    const calls: number[] = [];
    fake.vfx = { dissolve: (_r, s) => (calls.push(s), Promise.resolve()) };
    fake.apply({ attackerId: 'player', targetId: id, amount: 1000, poise: 0, kind: 'melee' });
    tick(3);
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual([AI.deathFadeSeconds]);
    expect(manager.get(id)).toBeUndefined();
  });

  it('despawn inside its own window closes once, removes the slow and frees the token', () => {
    const { fake, tick, id, manager } = engagedWraith({ moves: ['wraith.grab'] });
    for (let i = 0; i < 600 && fake.windows.filter((w) => w.actorId === id && w.phase === 'open').length === 0; i++) tick();
    const enemy = manager.get(id)!;
    enemy.applySlow(0.6, 2);
    manager.service.despawnGroup('one');
    const w = fake.windows.filter((x) => x.actorId === id);
    expect(w.filter((x) => x.phase === 'open').length).toBe(w.filter((x) => x.phase === 'close').length);
    expect(fake.moveModifiers.size).toBe(0);
    expect(manager.get(id)).toBeUndefined();
    // despawnGroup is not a clear
    expect(fake.bus.of('enemies.groupCleared')).toEqual([]);
    // a fresh wraith can take a token at once
    const [n] = manager.service.spawnGroup('one', { aggro: true });
    expect(n).toBeDefined();
  });

  it('dispose mid-fade frees everything', () => {
    const { fake, tick, id, manager } = engagedWraith();
    fake.apply({ attackerId: 'player', targetId: id, amount: 1000, poise: 0, kind: 'melee' });
    tick(1.2);
    manager.dispose();
    expect(manager.count).toBe(0);
    expect(fake.actorMap.size).toBe(1);
    expect(fake.modifiers.length).toBe(0);
  });
});

describe('mercy', () => {
  function staggeredPack() {
    const s = setup({ x: 0, z: -30 });
    const ids = s.manager.service.spawnGroup('pack');
    s.tick(AI.riseSeconds + 0.1);
    return { ...s, ids };
  }

  it('locked by default: a staggered wraith is not open to Release', () => {
    const { fake, ids } = staggeredPack();
    fake.stagger(ids[0], 'player');
    const i = [...fake.interactables.values()][0];
    expect(i.action).toBe('mercy');
    expect(i.holdSeconds).toBe(MERCY.holdSeconds);
    expect(i.enabled!()).toBe(false);
  });

  it('release on an enemy that is not staggered does nothing', () => {
    const { fake, manager, ids } = staggeredPack();
    manager.service.setMercyUnlocked('release', true);
    const i = fake.interactables.get(mercyInteractableId(manager.get(ids[0])!.slug))!;
    expect(i.enabled!()).toBe(false);
    i.onInteract(fake.player);
    expect(fake.bus.of('mercy')).toEqual([]);
  });

  it('a Release pulse frees every staggered wraith within 4 m, sharing one pulseId', () => {
    const { fake, manager, ids, tick } = staggeredPack();
    manager.service.setMercyUnlocked('release', true);
    // the pack spawned on a 1.5 m ring: all within 4 m; stagger two of three
    fake.stagger(ids[0], 'player');
    fake.stagger(ids[1], 'player');
    const i = fake.interactables.get(mercyInteractableId(manager.get(ids[0])!.slug))!;
    expect(i.enabled!()).toBe(true);
    i.onInteract(fake.player);
    const mercies = fake.bus.of('mercy');
    expect(mercies.map((m) => m.actorId).sort()).toEqual([ids[0], ids[1]].sort());
    expect(mercies[0]).toMatchObject({ verb: 'release', tier: 'normal', track: 'ashwalkers', creature: 'ash-wraith' });
    expect(mercies[0].pulseId).toBeDefined();
    expect(mercies[1].pulseId).toBe(mercies[0].pulseId);
    // a second hold on a released wraith does nothing
    i.onInteract(fake.player);
    expect(fake.bus.of('mercy')).toHaveLength(2);
    tick(AI.releaseDissolveSeconds + 0.1);
    expect(manager.service.alive('pack')).toEqual([ids[2]]);
    expect(fake.bus.of('actor.died')).toEqual([]);
  });

  it('a staggered wraith beyond 4 m is not in the pulse', () => {
    const { fake, manager, ids } = staggeredPack();
    manager.service.setMercyUnlocked('release', true);
    manager.get(ids[1])!.feet.set(10, 0, 0);
    fake.stagger(ids[0], 'player');
    fake.stagger(ids[1], 'player');
    fake.interactables.get(mercyInteractableId(manager.get(ids[0])!.slug))!.onInteract(fake.player);
    expect(fake.bus.of('mercy').map((m) => m.actorId)).toEqual([ids[0]]);
  });

  it('the lock-on target wins priority', () => {
    const { fake, manager, ids } = staggeredPack();
    const i = fake.interactables.get(mercyInteractableId(manager.get(ids[0])!.slug))!;
    expect(i.priority).toBe(0);
    fake.lockOnTarget = ids[0];
    expect(i.priority).toBe(MERCY.lockOnPriority);
  });

  function yieldingSoldier(spare: boolean) {
    const s = setup({ x: 0, z: -1.5 });
    if (spare) s.manager.service.setMercyUnlocked('spare', true);
    const [id] = s.manager.service.spawnGroup('soldier', { aggro: true });
    s.tick(0.1);
    const a = s.fake.actorMap.get(id)!;
    a.health = a.maxHealth * 0.4;
    s.fake.stagger(id, 'player');
    return { ...s, id };
  }

  it('the soldier only yields while Spare is unlocked', () => {
    const locked = yieldingSoldier(false);
    expect(locked.manager.get(locked.id)!.state).toBe('stagger');
    expect(locked.fake.bus.of('enemies.yield')).toEqual([]);
    const open = yieldingSoldier(true);
    expect(open.manager.get(open.id)!.state).toBe('yield');
    expect(open.fake.bus.of('enemies.yield')).toEqual([{ actorId: open.id, seconds: AI.yieldSeconds }]);
  });

  it('spare emits mercy for Halvard; striking the spared soldier revokes and re-aggroes', () => {
    const { fake, manager, id, tick } = yieldingSoldier(true);
    fake.interactables.get(mercyInteractableId(manager.get(id)!.slug))!.onInteract(fake.player);
    expect(fake.bus.of('mercy')).toEqual([
      { verb: 'spare', tier: 'normal', track: 'halvard', creature: 'blighted-soldier', actorId: id },
    ]);
    expect(manager.get(id)!.state).toBe('spared');
    fake.bus.emit('mercy.revoked', { actorId: id, track: 'halvard', removed: 1 });
    expect(manager.get(id)!.state).toBe('chase');
    tick(0.1);
    expect(fake.bus.of('ai.aggro').filter((a) => a.actorId === id).length).toBe(2);
  });

  it('a spared soldier walks off and despawns as spared (group cleared)', () => {
    const { fake, manager, id, tick } = yieldingSoldier(true);
    fake.interactables.get(mercyInteractableId(manager.get(id)!.slug))!.onInteract(fake.player);
    tick(AI.sparedWalkMetres / BLIGHTED_SOLDIER.walkSpeed + 1);
    expect(manager.get(id)).toBeUndefined();
    expect(fake.bus.of('enemies.groupCleared')).toEqual([{ spawnerId: 'soldier' }]);
  });
});

describe('pack, tokens and dormancy', () => {
  it('a pack shares aggro and at most two attack at once', () => {
    const { fake, tick, manager } = setup({ x: 0, z: -6 });
    const ids = manager.service.spawnGroup('pack');
    tick(AI.riseSeconds + 0.1);
    fake.loud = true;
    let maxAttacking = 0;
    for (let i = 0; i < 400; i++) {
      tick();
      const attacking = ids.filter((id) => ['telegraph', 'attack', 'recover'].includes(manager.get(id)?.state ?? '')).length;
      maxAttacking = Math.max(maxAttacking, attacking);
    }
    expect(new Set(fake.bus.of('ai.aggro').map((a) => a.actorId)).size).toBe(3);
    expect(maxAttacking).toBeLessThanOrEqual(2);
    expect(maxAttacking).toBeGreaterThan(0);
  });

  it('enemies beyond 120 m sleep and wake when the player returns (fast travel)', () => {
    const { fake, tick, manager } = setup();
    const [id] = manager.service.spawnGroup('one');
    fake.movePlayer(500, 0);
    tick();
    expect(manager.get(id)!.sleeping).toBe(true);
    fake.movePlayer(0, -20);
    tick();
    expect(manager.get(id)!.sleeping).toBe(false);
  });
});
