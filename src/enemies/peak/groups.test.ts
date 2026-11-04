// Group soft-locks (brief): a Dragonspine group with a member calmed or spared mid-fight reads cleared through the shared
// groupStanding helper once the rest are down, while the mercied member is still leaving.
import type * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP } from '../../config/constants';
import { EnemyManager } from '../EnemyManager';
import { GroupStanding } from '../groupStanding';
import { HUNTER_PACK_KINDS, HUNTER_PACK_LEADER_SLOT } from '../hunters/def';
import { mercyInteractableId } from '../mercy';
import { FakeHost, loadKnight } from '../testing/fakeHost';
import type { SpawnerDef } from '../types';
import './overlays';
import { hawkView } from './hawk/overlay';

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

const base = { anchor: 'a', band: { min: 20, max: 20 }, activation: 'manual', respawn: 'never', leash: false } as const;

function rig(def: SpawnerDef, player = { x: 0, z: -12 }, items: Record<string, number> = {}) {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: player.x, y: 0, z: player.z } });
  fake.defineAnchor('a', 0, 0);
  fake.flags.set('enemies.mercy.spare', true);
  fake.flags.set('enemies.mercy.calm', true);
  fake.provideItems(items);
  const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: [def], seed: 5 });
  const gs = new GroupStanding({
    alive: (g) => m.service.alive(g),
    isDead: (a) => fake.actorMap.get(a)?.dead ?? true,
    on: (t, fn) => fake.bus.on(t as never, fn as never),
  });
  const tick = (seconds = DT) => {
    for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) {
      m.think(DT);
      m.animate(DT);
      fake.combatStep(DT);
      m.react(DT);
    }
  };
  const kill = (id: string) => fake.host.damage.kill!(id, 'player');
  const mercy = (id: string) => {
    const i = fake.interactables.get(mercyInteractableId(m.get(id)!.slug))!;
    expect(i.enabled?.() ?? true).toBe(true);
    i.onInteract(fake.player);
  };
  return { fake, m, gs, tick, kill, mercy };
}

describe('Dragonspine groups with a member mercied mid-fight', () => {
  it('a hawk pair: one knocked down and calmed with jerky, the other killed; cleared while the calmed one flies off', () => {
    const t = rig({ ...base, id: 'pair', enemy: 'rime-hawk', count: 2 }, { x: 0, z: -10 }, { 'hawk-jerky': 1 });
    const ids = t.m.service.spawnGroup('pair', { aggro: true });
    t.tick(1);
    const calmed = ids[0]!;
    t.fake.apply({ attackerId: 'player', targetId: calmed, amount: 1, poise: 1000, kind: 'melee' });
    t.tick(0.7);
    expect(hawkView(calmed)!.mode).toBe('grounded');
    t.mercy(calmed);
    t.tick(0.2);
    expect(t.gs.isCleared('pair')).toBe(false);
    t.kill(ids[1]!);
    t.tick(0.2);
    expect(t.m.get(calmed)).toBeDefined();
    expect(t.gs.isCleared('pair')).toBe(true);
  });

  it('a Dragonspine hunter camp: one spared, the rest killed, cleared while the spared one walks off', () => {
    const t = rig({ ...base, id: 'camp', enemy: 'hunter-spearman', memberKinds: HUNTER_PACK_KINDS, leaderSlot: HUNTER_PACK_LEADER_SLOT, count: 4 });
    const ids = t.m.service.spawnGroup('camp', { aggro: true });
    t.tick(0.2);
    const spared = ids[0]!;
    const a = t.fake.actorMap.get(spared)!;
    a.health = a.maxHealth * 0.3;
    t.fake.stagger(spared, 'player');
    expect(t.m.get(spared)!.state).toBe('yield');
    t.mercy(spared);
    t.tick(0.2);
    for (const id of ids.slice(1)) t.kill(id);
    t.tick(0.2);
    expect(t.m.get(spared)).toBeDefined();
    expect(t.gs.isCleared('camp')).toBe(true);
  });

  it('the summit ogre pair: one calmed with bread before it swings, the other killed; cleared while the calmed one sits', () => {
    const t = rig({ ...base, id: 'ogres', enemy: 'crag-ogre', count: 2 }, { x: 0, z: -14 }, { 'hearth-bread': 1 });
    const ids = t.m.service.spawnGroup('ogres');
    t.tick(0.3);
    const calmed = ids.find((id) => t.m.get(id)!.calmOpen)!;
    expect(calmed).toBeDefined();
    t.mercy(calmed);
    t.tick(0.2);
    expect(t.gs.isCleared('ogres')).toBe(false);
    for (const id of ids.filter((x) => x !== calmed)) t.kill(id);
    t.tick(0.2);
    expect(t.m.get(calmed)).toBeDefined();
    expect(t.gs.isCleared('ogres')).toBe(true);
  });
});
