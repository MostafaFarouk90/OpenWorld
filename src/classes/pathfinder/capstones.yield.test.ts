import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP } from '../../config/constants';
import { EnemyManager } from '../../enemies/EnemyManager';
import { FakeHost, loadKnight } from '../../enemies/testing/fakeHost';
import type { SpawnerDef } from '../../enemies/types';
import { YieldFloor } from './capstones';
import { PF } from './tuning';

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

const SPAWNERS: SpawnerDef[] = [
  { id: 'soldier', enemy: 'blighted-soldier', count: 1, anchor: 'spawn.a', band: { min: 1, max: 1 }, activation: 'manual', respawn: 'never', leash: false },
  { id: 'wraith', enemy: 'ash-wraith', count: 1, anchor: 'spawn.a', band: { min: 1, max: 1 }, activation: 'manual', respawn: 'never', leash: false },
];

/** A real EnemyManager (the Brain, Enemy and mercy rules), with the capstones' yield floor on the fake resolver. */
function rig(spare: boolean) {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: -1.5 } });
  fake.defineAnchor('spawn.a', 0, 0);
  const manager = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: SPAWNERS, seed: 7 });
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      manager.think(DT);
      manager.animate(DT);
      fake.combatStep(DT);
      manager.react(DT);
    }
  };
  if (spare) manager.service.setMercyUnlocked('spare', true);
  const floor = new YieldFloor({
    playerId: () => 'player',
    // The same read the plugin makes.
    canYield: (id: string) => manager.service.mercyUnlocked('spare') && manager.service.ground.get(id)?.def.mercy?.when === 'yielding',
  });
  fake.host.damage.addModifier(PF.yieldFloor.modifierId, floor.modify as never, PF.yieldFloor.order);
  const hit = (id: string, attackId: string, amount: number, poise: number) =>
    fake.apply({ attackerId: 'player', targetId: id, amount, poise, kind: 'melee', attackId, swingId: 1, direction: new THREE.Vector3(0, 0, 1) } as never);
  const spawn = (group: string) => {
    const [id] = manager.service.spawnGroup(group, { aggro: true });
    tick(6);
    return id;
  };
  return { fake, manager, tick, hit, spawn };
}

describe('the Pathfinder capstones against a real Enemy and Brain', () => {
  it('a Dragonbane Bolt (even a master bolt, 61.6) on a full-health yielding soldier leaves it alive and it yields, spareable', () => {
    const s = rig(true);
    const id = s.spawn('soldier');
    const actor = s.fake.actorMap.get(id)!;
    // 61.6 is more than the soldier's 60 health: without the floor it would die.
    s.hit(id, PF.dragonbane.attackId, PF.baseDamage * PF.dragonbane.damageScale * PF.masterBoltScale, PF.dragonbane.poise);
    s.tick(2);
    expect(actor.dead).toBe(false);
    expect(actor.health).toBe(1);
    expect(s.manager.get(id)!.state).toBe('yield');
    expect(s.fake.bus.of('enemies.yield')).toHaveLength(1);
    expect(s.manager.get(id)!.mercyState()).toBe('yielding');
  });

  it('a plain Dragonbane Bolt (56) and a Skyhawk dive (35) leave a yielding soldier at 4 and 25 HP and it yields', () => {
    for (const [attackId, amount, poise, left] of [
      [PF.dragonbane.attackId, 56, 60, 4],
      [PF.skyhawk.attackId, 35, 50, 25],
    ] as const) {
      const s = rig(true);
      const id = s.spawn('soldier');
      s.hit(id, attackId, amount, poise);
      s.tick(2);
      expect(s.fake.actorMap.get(id)!.health, attackId).toBe(left);
      expect(s.manager.get(id)!.state, attackId).toBe('yield');
    }
  });

  it('a Hunter\'s Web pop on a yielding soldier already at 10 HP leaves it at 1 HP, alive, never finished', () => {
    const s = rig(true);
    const id = s.spawn('soldier');
    const actor = s.fake.actorMap.get(id)!;
    actor.health = 10;
    s.hit(id, PF.huntersWeb.attackId, PF.baseDamage * PF.huntersWeb.damageScale, PF.huntersWeb.poise);
    s.tick(2);
    expect(actor.dead).toBe(false);
    expect(actor.health).toBe(1);
  });

  it('with Spare locked the soldier cannot yield, so the bolt kills it', () => {
    const s = rig(false);
    const id = s.spawn('soldier');
    s.hit(id, PF.dragonbane.attackId, 70, PF.dragonbane.poise);
    expect(s.fake.actorMap.get(id)!.dead).toBe(true);
    expect(s.fake.bus.of('enemies.yield')).toEqual([]);
  });

  it('a foe that never yields (a wraith) dies of the bolt', () => {
    const s = rig(true);
    const id = s.spawn('wraith');
    s.hit(id, PF.dragonbane.attackId, 400, PF.dragonbane.poise);
    expect(s.fake.actorMap.get(id)!.dead).toBe(true);
    expect(s.fake.bus.of('enemies.yield')).toEqual([]);
  });

  it('a hit that is not a capstone (the plain bolt) is untouched by the floor', () => {
    const s = rig(true);
    const id = s.spawn('soldier');
    s.hit(id, 'pathfinder.bolt.1', 70, 10);
    expect(s.fake.actorMap.get(id)!.dead).toBe(true);
  });
});
