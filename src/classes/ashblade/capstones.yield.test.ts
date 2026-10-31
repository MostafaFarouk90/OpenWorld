import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP } from '../../config/constants';
import { EnemyManager } from '../../enemies/EnemyManager';
import { FakeHost, loadKnight } from '../../enemies/testing/fakeHost';
import type { SpawnerDef } from '../../enemies/types';
import { GhostOfTheHearth } from './capstones';
import { GHOST_OF_THE_HEARTH } from './tuning';

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

const SPAWNERS: SpawnerDef[] = [
  { id: 'soldier', enemy: 'blighted-soldier', count: 1, anchor: 'spawn.a', band: { min: 1, max: 1 }, activation: 'manual', respawn: 'never', leash: false },
  { id: 'wraith', enemy: 'ash-wraith', count: 1, anchor: 'spawn.a', band: { min: 1, max: 1 }, activation: 'manual', respawn: 'never', leash: false },
];

/** A real EnemyManager (the Brain, Enemy and mercy rules), with the Ghost armed and its modifier on the fake resolver. */
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
  const ghost = new GhostOfTheHearth({
    playerId: () => 'player',
    isAshblade: () => true,
    learned: () => true,
    blockedReason: () => null,
    now: () => 0,
    feet: () => ({ x: 0, y: 0, z: -1.5 }),
    facingYaw: () => 0,
    stealth: () => ({ addNoiseScale: () => () => undefined }),
    perception: () => undefined,
    swinging: () => false,
    isBoss: () => false,
    // The same read the plugin makes.
    canYield: (id: string) => manager.service.mercyUnlocked('spare') && manager.service.ground.get(id)?.def.mercy?.when === 'yielding',
    warn: () => undefined,
  } as never);
  ghost.cast();
  fake.host.damage.addModifier(GHOST_OF_THE_HEARTH.modifierId, ghost.modifier as never, GHOST_OF_THE_HEARTH.order);
  const strike = (id: string) =>
    fake.apply({ attackerId: 'player', targetId: id, amount: 10, poise: 10, kind: 'melee', attackId: 'x', swingId: 1, direction: new THREE.Vector3(0, 0, 1) } as never);
  return { fake, manager, tick, strike };
}

describe('Ghost of the Hearth against a real Enemy and Brain', () => {
  it('a foe that can yield is left at 1 HP with its poise broken and yields (alive, spareable)', () => {
    const s = rig(true);
    const [id] = s.manager.service.spawnGroup('soldier', { aggro: true });
    s.tick(6);
    const actor = s.fake.actorMap.get(id)!;
    s.strike(id);
    s.tick(2);
    expect(actor.dead).toBe(false);
    expect(actor.health).toBe(1);
    expect(s.manager.get(id)!.state).toBe('yield');
    expect(s.fake.bus.of('enemies.yield')).toHaveLength(1);
    expect(s.manager.get(id)!.mercyState()).toBe('yielding');
  });

  it('with Spare locked the soldier cannot yield, so the strike kills it', () => {
    const s = rig(false);
    const [id] = s.manager.service.spawnGroup('soldier', { aggro: true });
    s.tick(6);
    s.strike(id);
    expect(s.fake.actorMap.get(id)!.dead).toBe(true);
    expect(s.fake.bus.of('enemies.yield')).toEqual([]);
  });

  it('a foe that never yields (a wraith) dies of the strike', () => {
    const s = rig(true);
    const [id] = s.manager.service.spawnGroup('wraith', { aggro: true });
    s.tick(6);
    s.strike(id);
    expect(s.fake.actorMap.get(id)!.dead).toBe(true);
    expect(s.fake.bus.of('enemies.yield')).toEqual([]);
  });
});
