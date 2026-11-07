// Measurement, skipped by default (plans/act5-N5.md section 8): enemies.think for 12 Warhosts against 12 Footmen in the same
// fake host. Run by hand: MEASURE=1 npx vitest run src/enemies/act5/warhostThink.measure.test.ts
import * as THREE from 'three';
import { beforeAll, describe, it } from 'vitest';
import { FIXED_TIMESTEP } from '../../config/constants';
import { EnemyManager } from '../EnemyManager';
import { FakeHost, loadKnight } from '../testing/fakeHost';
import type { SpawnerDef } from '../types';
import './overlays';

let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

function run(enemy: 'warhost-soldier' | 'blighted-soldier'): number {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: -30 } });
  fake.defineAnchor('a', 0, 0);
  const def: SpawnerDef = { id: 'g', tag: 'g', enemy, ...(enemy === 'warhost-soldier' ? { role: 'shield' as const } : {}), count: 12, anchor: 'a', band: { min: 1, max: 1 }, activation: 'manual', respawn: 'never', leash: false };
  const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: [def], seed: 3 });
  m.service.spawnGroup('g', { aggro: true });
  const t0 = performance.now();
  for (let i = 0; i < 600; i++) {
    m.think(FIXED_TIMESTEP);
    m.animate(FIXED_TIMESTEP);
  }
  return (performance.now() - t0) / 600;
}

describe.skipIf(!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env['MEASURE'])('Warhost think cost', () => {
  it('reports ms per tick for 12 warhosts and 12 Footmen', () => {
    run('blighted-soldier');
    const foot = run('blighted-soldier');
    const war = run('warhost-soldier');
    console.log(`think+animate ms/tick, 12 foes: footman ${foot.toFixed(3)}, warhost ${war.toFixed(3)}, ratio ${(war / foot).toFixed(2)}`);
  });
});
