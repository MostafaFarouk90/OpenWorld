import type * as THREE from 'three';
import { vi } from 'vitest';
import { FIXED_TIMESTEP } from '../../config/constants';
import { EnemyManager } from '../EnemyManager';
import { BRIGHTWATER_SPAWNERS } from '../brightwaterSpawners';
import { FakeHost } from '../testing/fakeHost';
import type { SpawnerDef } from '../types';

export const DT = FIXED_TIMESTEP;

export interface KitOptions {
  player?: { x: number; z: number };
  spawners?: readonly SpawnerDef[];
  seed?: number;
}

/** A fake core plus an EnemyManager with the Brightwater foe spawners and the usual anchors. */
export function foeKit(gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }, opts: KitOptions = {}) {
  const p = opts.player ?? { x: 0, z: -30 };
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: p.x, y: 0, z: p.z } });
  fake.player.invulnerable = true;
  for (let i = 1; i <= 6; i++) fake.defineAnchor(`r01.scarecrow.${i}`, (i - 3.5) * 3, 0);
  fake.defineAnchor('vault.bloom', 0, 0);
  fake.defineAnchor('vault.pile.1', 3, 0);
  fake.defineAnchor('vault.pile.2', 0, 4);
  fake.defineAnchor('vault.pile.3', -5, 0);
  fake.defineAnchor('spawn.ford.toll-post', 0, 0);
  const factory = vi.fn(FakeHost.factory(gltf));
  const manager = new EnemyManager(fake.host, factory, { spawners: opts.spawners ?? BRIGHTWATER_SPAWNERS, seed: opts.seed ?? 11 });
  const tick = (seconds = DT) => {
    for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) {
      manager.think(DT);
      manager.animate(DT);
      fake.combatStep(DT);
      manager.react(DT);
    }
  };
  return { fake, manager, tick, factory };
}

export type Kit = ReturnType<typeof foeKit>;

/** A player melee hit as the bridge would send it. */
export function swordHit(fake: FakeHost, targetId: string, amount = 20, poise = 10, attackId = 'sword') {
  return fake.apply({ attackerId: 'player', targetId, amount, poise, kind: 'melee', attackId });
}
