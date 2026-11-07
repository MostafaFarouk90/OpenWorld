// Act 4 L14 (census B4, open-followups "R05 fog hounds"): a headless fight of R05's three fog hounds (band 9-11, the real
// hound AI, moves and hit tracing on the enemies' fake host) against a level 9 Knight standing his ground. Report only: it
// runs with SIM_R05=1 and prints a table; the numbers are in plans/act4-L14.md. It plays the shipped group, so its options
// (R05_FOG_OPTIONS) apply. Assumptions: the squire's sword (10 a hit,
// one swing every 0.75 s at a hound in 2.6 m, walking at the nearest one otherwise), a dodge or block taken on a telegraph with the profile's chance gives a
// 0.45 s window of no damage, no potions, no skills, no Second Wind.
import type * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP as DT } from '../config/constants';
import { EnemyManager } from '../enemies/EnemyManager';
import { FakeHost, loadKnight } from '../enemies/testing/fakeHost';
import { ACT2_SPAWNERS_A12, R05_FOG_BAND } from '../quests/content/act2/spawners';
import { baseMaxHealthForLevel } from '../progression/tuning';
import type { SpawnerDef } from '../enemies/types';

// no Node types in the app tsconfig: read the env the way fixtures.gen.test.ts does
/** SIM_R05_DAMAGE=<x> and SIM_R05_HEALTH=<x> try scales over the shipped ones (tuning only). */
const SCALE = (): { damageScale?: number; healthScale?: number } => {
  const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
  return { ...(env.SIM_R05_DAMAGE ? { damageScale: Number(env.SIM_R05_DAMAGE) } : {}), ...(env.SIM_R05_HEALTH ? { healthScale: Number(env.SIM_R05_HEALTH) } : {}) };
};
const RUN = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.SIM_R05 === '1';

let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  if (RUN) gltf = await loadKnight();
});

interface Profile { name: string; defend: number }
const PROFILES: Profile[] = [
  { name: 'never defends', defend: 0 },
  { name: 'defends 1 in 3', defend: 1 / 3 },
  { name: 'defends 2 in 3', defend: 2 / 3 },
];
const SWING_S = 0.75;
const SWORD = 10;
const REACH = 2.6;
const LIMIT_S = 240;
const WALK = 4.5;

function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function fight(seed: number, p: Profile): { died: boolean; seconds: number; healthLeft: number; atFlee: number; hits: number } {
  // the shipped R05 group (count, band and its own options), placed at a test anchor
  const real = ACT2_SPAWNERS_A12.find((d) => d.id === 'q12.r05.fog')!;
  const def: SpawnerDef = { ...real, id: 'r05', anchor: 'a', memberAnchors: undefined, activation: 'manual', leash: false, options: { ...real.options, ...SCALE() } };
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: -12 } });
  fake.defineAnchor('a', 0, 0);
  const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: [def], seed });
  const hp = baseMaxHealthForLevel(9, 'knight');
  fake.player.maxHealth = fake.player.health = hp;
  const r = rand(seed * 7919 + 1);
  const ids = m.service.spawnGroup('r05', { aggro: true } as never);
  let t = 0;
  let nextSwing = 0;
  let hits = 0;
  const safe: Array<[number, number]> = [];
  fake.bus.on('telegraph', (e) => {
    if (r() < p.defend) safe.push([t + e.leadSeconds, t + e.leadSeconds + 0.45]); // the pounce lands about 0.3 s after its telegraph lead
  });
  while (t < LIMIT_S) {
    t += DT;
    fake.player.invulnerable = safe.some(([a, b]) => t >= a && t <= b);
    m.think(DT);
    m.animate(DT);
    fake.combatStep(DT);
    m.react(DT);
    if (fake.player.health <= 0) break;
    const alive = ids.filter((id) => !fake.actorMap.get(id)?.dead && (fake.actorMap.get(id)?.health ?? 0) > 0);
    if (alive.length === 0) break;
    if (t >= nextSwing) {
      const near = alive
        .map((id) => ({ id, e: m.get(id)! }))
        .map((x) => ({ ...x, d: Math.hypot(x.e.feet.x - fake.playerFeet.x, x.e.feet.z - fake.playerFeet.z) }))
        .sort((a, b) => a.d - b.d)[0];
      if (near && near.d <= REACH) {
        const res = fake.apply({ attackerId: 'player', targetId: near.id, amount: SWORD, poise: 10, kind: 'melee' });
        if (res && res.dealt > 0) hits++;
        nextSwing = t + SWING_S;
      } else if (near) {
        // close in at walking pace
        const k = Math.min(1, (WALK * DT) / near.d);
        fake.movePlayer(fake.playerFeet.x + (near.e.feet.x - fake.playerFeet.x) * k, fake.playerFeet.z + (near.e.feet.z - fake.playerFeet.z) * k);
      }
    }
  }
  const fled = ids.filter((id) => { const a = fake.actorMap.get(id); return !!a && a.health > 0 && a.health <= a.maxHealth * 0.2; }).length;
  return { died: fake.player.health <= 0, seconds: Math.round(t), healthLeft: Math.round((fake.player.health / hp) * 100), atFlee: fled, hits };
}

describe.skipIf(!RUN)('R05 fog hounds against a level 9 Knight (sim, L14)', () => {
  it('prints deaths and time per profile over 12 seeds', { timeout: 600_000 }, () => {
    const rows: string[] = [];
    for (const p of PROFILES) {
      const runs = Array.from({ length: 12 }, (_, i) => fight(i + 1, p));
      const deaths = runs.filter((x) => x.died).length;
      const wins = runs.filter((x) => !x.died);
      const avg = (f: (x: (typeof runs)[number]) => number, xs = runs) => (xs.length ? Math.round(xs.reduce((s, x) => s + f(x), 0) / xs.length) : 0);
      rows.push(`${p.name}: deaths ${deaths}/12, mean fight ${avg((x) => x.seconds)} s, health left on wins ${avg((x) => x.healthLeft, wins)}%, hounds at flee health ${avg((x) => x.atFlee, wins)} of 3 on wins, sword hits ${avg((x) => x.hits)}`);
    }
    console.log(`\nR05 sim, level 9 Knight ${baseMaxHealthForLevel(9, 'knight')} hp, band ${R05_FOG_BAND.min}-${R05_FOG_BAND.max}\n${rows.join('\n')}`);
    expect(rows).toHaveLength(PROFILES.length);
  });
});
