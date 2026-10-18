import type * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP } from '../config/constants';
import { EnemyManager } from './EnemyManager';
import { mercyInteractableId } from './mercy';
import { FakeHost, loadKnight } from './testing/fakeHost';
import { AI } from './tuning';
import type { SpawnerDef } from './types';

/** Lifecycle edges found in review: spared kills, dormancy mid-fight, reloads, stuck dissolves and walks, failed spawns. */

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

const manual = (id: string, enemy: SpawnerDef['enemy'], anchor: string, count = 1): SpawnerDef => ({
  id, enemy, count, anchor, band: { min: 1, max: 1 }, activation: 'manual', respawn: 'never', leash: false,
});

function rig(defs: SpawnerDef[], playerFeet = { x: 0, y: 0, z: -1.5 }) {
  const fake = new FakeHost(gltf.scene, { playerFeet });
  fake.defineAnchor('a', 0, 0);
  fake.defineAnchor('b', 500, 0);
  const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: defs, seed: 7 });
  const tick = (seconds = DT) => {
    for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) {
      m.think(DT);
      m.animate(DT);
      fake.combatStep(DT);
      m.react(DT);
    }
  };
  return { fake, m, tick };
}

/** Yields the soldier under half health and spares it. */
function spareSoldier(t: ReturnType<typeof rig>, id: string) {
  t.tick(0.1);
  const a = t.fake.actorMap.get(id)!;
  a.health = a.maxHealth * 0.4;
  t.fake.stagger(id, 'player');
  expect(t.m.get(id)!.state).toBe('yield');
  t.fake.interactables.get(mercyInteractableId(t.m.get(id)!.slug))!.onInteract(t.fake.player);
  expect(t.m.get(id)!.state).toBe('spared');
  return a;
}

describe('enemy lifecycle edges', () => {
  it('a killing blow on a spared soldier walking off kills it for good (no revived corpse)', () => {
    const t = rig([manual('soldier', 'blighted-soldier', 'a')]);
    // The core plugin revokes mercy on a hit from inside damage.dealt, so mercy.revoked lands after actor.died.
    const mercied = new Set<string>();
    t.fake.bus.on('mercy', (e) => {
      if (e.actorId) mercied.add(e.actorId);
    });
    t.fake.bus.on('damage.dealt', (r) => {
      if (r.outcome === 'hit' && mercied.delete(r.targetId)) t.fake.bus.emit('mercy.revoked', { actorId: r.targetId, track: 'halvard', removed: 1 });
    });
    t.m.service.setMercyUnlocked('spare', true);
    const [id] = t.m.service.spawnGroup('soldier', { aggro: true });
    const actor = spareSoldier(t, id);
    t.fake.apply({ attackerId: 'player', targetId: id, amount: 1000, poise: 0, kind: 'melee' });
    expect(actor.dead).toBe(true);
    expect(t.fake.bus.of('mercy.revoked')).toHaveLength(1);
    expect(t.m.get(id)?.state).toBe('dead');
    const health = t.fake.player.health;
    t.tick(10);
    expect(t.fake.player.health).toBe(health);
    expect(t.m.get(id)).toBeUndefined();
    expect(t.fake.bus.of('enemies.groupCleared')).toEqual([{ spawnerId: 'soldier' }]);
  });

  it('a hit (not lethal) on a spared soldier still revokes and brings it back to fight', () => {
    const t = rig([manual('soldier', 'blighted-soldier', 'a')]);
    t.m.service.setMercyUnlocked('spare', true);
    const [id] = t.m.service.spawnGroup('soldier', { aggro: true });
    spareSoldier(t, id);
    t.fake.bus.emit('mercy.revoked', { actorId: id, track: 'halvard', removed: 1 });
    expect(t.m.get(id)!.active).toBe(true);
    expect(t.m.get(id)!.state).not.toBe('spared');
  });

  it('a spared soldier that cannot walk away still leaves after the walk time plus a margin', () => {
    const t = rig([manual('soldier', 'blighted-soldier', 'a')]);
    t.m.service.setMercyUnlocked('spare', true);
    const [id] = t.m.service.spawnGroup('soldier', { aggro: true });
    spareSoldier(t, id);
    const enemy = t.m.get(id)!;
    // The player standing on its feet leaves it no direction to walk.
    const limit = AI.sparedWalkMetres / 1.4 + 3;
    let seconds = 0;
    while (t.m.get(id) && seconds < limit + 2) {
      t.fake.movePlayer(enemy.feet.x, enemy.feet.z);
      t.tick();
      seconds += DT;
    }
    expect(t.m.get(id)).toBeUndefined();
    expect(seconds).toBeGreaterThan(limit - 0.1);
    expect(t.fake.bus.of('enemies.groupCleared')).toEqual([{ spawnerId: 'soldier' }]);
  });

  it('going dormant mid-telegraph settles the fight: cancelled once, calm, token freed for packs elsewhere', () => {
    const t = rig(
      [manual('one', 'ash-wraith', 'a'), manual('two', 'ash-wraith', 'a'), manual('far', 'ash-wraith', 'b', 3)],
      { x: 0, y: 0, z: -1.4 },
    );
    const [a] = t.m.service.spawnGroup('one', { aggro: true, moves: ['wraith.claw'] });
    t.m.service.spawnGroup('two', { aggro: true, moves: ['wraith.claw'] });
    for (let i = 0; i < 600 && t.m.get(a)!.state !== 'telegraph'; i++) t.tick();
    expect(t.m.get(a)!.state).toBe('telegraph');
    t.fake.movePlayer(500, -1.4);
    t.tick();
    expect(t.m.get(a)!.sleeping).toBe(true);
    expect(['return', 'idle', 'patrol']).toContain(t.m.get(a)!.state);
    expect(t.fake.bus.of('telegraph.cancelled').filter((e) => e.actorId === a)).toHaveLength(1);
    expect(t.fake.bus.of('ai.calm').filter((e) => e.actorId === a)).toHaveLength(1);
    const ids = t.m.service.spawnGroup('far', { aggro: true, moves: ['wraith.claw'] });
    let most = 0;
    for (let i = 0; i < 600; i++) {
      t.tick();
      most = Math.max(most, ids.filter((id) => ['telegraph', 'attack', 'recover'].includes(t.m.get(id)?.state ?? '')).length);
    }
    expect(most).toBe(AI.attackersPerTarget);
  });

  it('save.loaded despawns live members of slots the save marks spent', () => {
    const t = rig([{ ...manual('np', 'ash-wraith', 'a', 3), activation: 'auto', respawn: 'onRest', leash: true }], { x: 0, y: 0, z: -50 });
    t.m.spawners.startAuto();
    expect(t.m.service.alive('np')).toHaveLength(3);
    t.m.spawners.load({ spent: ['np#0'], cleared: [], warmthTier: 0, lockedBlockLevels: {} });
    t.fake.bus.emit('save.loaded', { slot: 's' });
    expect(t.m.service.alive('np')).toHaveLength(2);
    t.fake.bus.emit('rest', { waystoneId: 'w' });
    expect(t.m.service.alive('np')).toHaveLength(2);
  });

  it('save.loaded respawns the groups of quests that are active in the save, and nothing without a quests service', () => {
    const quest: SpawnerDef = { ...manual('lanes', 'ash-wraith', 'a', 2), activation: { quest: 'm01' } };
    const t = rig([quest], { x: 0, y: 0, z: -50 });
    t.fake.bus.emit('save.loaded', { slot: 's' });
    expect(t.m.service.alive('lanes')).toEqual([]);
    t.fake.quests = { active: () => ['m01'] };
    t.fake.bus.emit('save.loaded', { slot: 's' });
    expect(t.m.service.alive('lanes')).toHaveLength(2);
    t.fake.bus.emit('save.loaded', { slot: 's' });
    expect(t.m.service.alive('lanes')).toHaveLength(2);
  });

  it('a vfx dissolve that never settles still despawns shortly after its length', () => {
    const t = rig([manual('one', 'ash-wraith', 'a')]);
    t.fake.vfx = { dissolve: () => new Promise<void>(() => {}) };
    const [id] = t.m.service.spawnGroup('one', { aggro: true });
    t.tick(0.1);
    t.fake.apply({ attackerId: 'player', targetId: id, amount: 1000, poise: 0, kind: 'melee' });
    t.tick(5);
    expect(t.m.get(id)).toBeUndefined();
    expect(t.fake.bus.of('enemies.groupCleared')).toEqual([{ spawnerId: 'one' }]);
  });

  it('a vfx dissolve that throws falls back to the fade', () => {
    const t = rig([manual('one', 'ash-wraith', 'a')]);
    t.fake.vfx = {
      dissolve: () => {
        throw new Error('no shader');
      },
    };
    const [id] = t.m.service.spawnGroup('one', { aggro: true });
    t.tick(0.1);
    t.fake.apply({ attackerId: 'player', targetId: id, amount: 1000, poise: 0, kind: 'melee' });
    t.tick(5);
    expect(t.m.get(id)).toBeUndefined();
    expect(t.fake.warnings.some((w) => w.includes('dissolve failed'))).toBe(true);
  });

  it('a spawn that fails after the actor exists rolls back the actor, scene node and combat registrations', () => {
    const t = rig([manual('soldier', 'blighted-soldier', 'a')]);
    const sceneBefore = t.fake.scene.children.length;
    const targetsBefore = t.fake.targetCount;
    t.fake.host.actors.bindOwner = () => {
      throw new Error('owner already bound');
    };
    expect(t.m.service.spawnGroup('soldier')).toEqual([]);
    expect([...t.fake.actorMap.keys()].filter((k) => k !== 'player')).toEqual([]);
    expect(t.fake.scene.children.length).toBe(sceneBefore);
    expect(t.fake.targetCount).toBe(targetsBefore);
    expect(t.fake.attackerCount).toBe(0);
    expect(t.fake.warnings.some((w) => w.includes('owner already bound'))).toBe(true);
  });
});
