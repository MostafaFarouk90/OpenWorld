import type * as THREE from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { FIXED_TIMESTEP } from '../config/constants';
import { EnemyManager } from './EnemyManager';
import { FakeHost, loadKnight } from './testing/fakeHost';
import type { SpawnerDef } from './types';

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

const one: SpawnerDef = {
  id: 'one', enemy: 'ash-wraith', count: 1, anchor: 'a', band: { min: 1, max: 1 }, activation: 'manual', respawn: 'never', leash: false,
};

function rig() {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: -12 } });
  fake.defineAnchor('a', 0, 0);
  const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: [one], seed: 2 });
  const tick = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      m.think(DT);
      m.animate(DT);
      fake.combatStep(DT);
      m.react(DT);
    }
  };
  return { fake, m, tick };
}

describe('enemies and the nav service', () => {
  it('inside a grid the enemy walks the path round a detour instead of straight at the player', () => {
    const t = rig();
    t.fake.nav = {
      hasGrid: () => true,
      path: (_from, to) => [{ x: 8, y: 0, z: -4 }, { x: to.x, y: 0, z: to.z }],
    };
    const [id] = t.m.service.spawnGroup('one', { aggro: true });
    t.tick(3.5); // rise, then walk
    const e = t.m.get(id!)!;
    expect(e.feet.x).toBeGreaterThan(1.5); // heading for the detour at x=8, not straight down the line x=0
  });

  it('with no grid it steers straight at the player as before', () => {
    const t = rig();
    t.fake.nav = { hasGrid: () => false, path: vi.fn() };
    const [id] = t.m.service.spawnGroup('one', { aggro: true });
    t.tick(3.5);
    expect(Math.abs(t.m.get(id!)!.feet.x)).toBeLessThan(0.5);
    expect(t.m.get(id!)!.feet.z).toBeLessThan(-0.5);
  });

  it('a throwing nav service warns once and the enemy still reaches the player', () => {
    const t = rig();
    t.fake.nav = {
      hasGrid: () => true,
      path: () => {
        throw new Error('no grid');
      },
    };
    const [id] = t.m.service.spawnGroup('one', { aggro: true });
    t.tick(5);
    expect(t.fake.warnings.filter((w) => w.includes('nav service failed'))).toHaveLength(1);
    expect(t.m.get(id!)!.feet.z).toBeLessThan(-1);
  });
});
