// The R18 parents (plan 2.7, plans/act3-K6b-pr2.md section 4): circle the nest, stoop only on Cael near it, break off after a
// stoop once he backs away, never chase far from the nest, and no class's basic attack string kills one by accident.
import type * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP, COMBAT } from '../../../config/constants';
import { GEAR_TUNING } from '../../../gear/tuning';
import { GEAR_ROWS } from '../../../gear/catalog';
import { TIER4_REWARD_ROWS, TIER4_ROWS } from '../../../gear/tier4/catalog';
import { BOLT, CINDER_RING, FLAME_BALL, SPARK_BURST } from '../../../classes/emberwright/tuning';
import { PF, SHOTS } from '../../../classes/pathfinder/tuning';
import { r18ParentsSpawner, R18_NEST_ANCHOR, R18_PARENT_ANCHORS } from '../../act3Spawners';
import { EnemyManager } from '../../EnemyManager';
import { FakeHost, loadKnight } from '../../testing/fakeHost';
import type { SpawnerDef } from '../../types';
import '../overlays';
import { HAWK_PARENT } from '../tuning';

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

/** The R18 parents at the shelf's block level (the band's floor, the weakest they can be), the nest at the origin. */
function rig(playerZ: number) {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: playerZ } });
  fake.defineAnchor(R18_NEST_ANCHOR, 0, 0);
  fake.defineAnchor(R18_PARENT_ANCHORS[0], -5, 0);
  fake.defineAnchor(R18_PARENT_ANCHORS[1], 5, 0);
  fake.defineAnchor('plain', 0, 0);
  const parents: SpawnerDef = { ...r18ParentsSpawner('r18'), block: undefined, band: { min: 20, max: 20 } };
  const plain: SpawnerDef = { id: 'plain', enemy: 'rime-hawk', count: 1, anchor: 'plain', band: { min: 20, max: 20 }, activation: 'manual', respawn: 'never', leash: false };
  const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: [parents, plain], seed: 9 });
  const tick = (seconds = DT, until?: () => boolean): boolean => {
    for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) {
      m.think(DT);
      m.animate(DT);
      fake.combatStep(DT);
      m.react(DT);
      if (until?.()) return true;
    }
    return false;
  };
  const telegraphs = () => fake.bus.of('telegraph').length;
  return { fake, m, tick, telegraphs };
}

describe('R18 parents: the spawner', () => {
  it('two hawks on K4\'s parent anchors guarding the R18 nest, manual, with 10x health from the group\'s own options', () => {
    const d = r18ParentsSpawner();
    expect(d).toMatchObject({ enemy: 'rime-hawk', count: 2, activation: 'manual', block: 'dragonspine-lower', memberAnchors: [...R18_PARENT_ANCHORS] });
    expect(d.options).toEqual({ healthScale: HAWK_PARENT.healthScale, nest: R18_NEST_ANCHOR, nestGuard: true });
    const t = rig(-40);
    const ids = t.m.service.spawnGroup('r18');
    const plain = t.m.service.spawnGroup('plain')[0]!;
    expect(ids).toHaveLength(2);
    expect(t.fake.actorMap.get(ids[0]!)!.maxHealth).toBe(t.fake.actorMap.get(plain)!.maxHealth * HAWK_PARENT.healthScale);
  });

  it('extra spawner options merge with the parents\' tuning instead of replacing it', () => {
    const d = r18ParentsSpawner('x', { options: { tierOffset: 1 } as SpawnerDef['options'] });
    expect(d.options).toMatchObject({ healthScale: HAWK_PARENT.healthScale, nest: R18_NEST_ANCHOR, nestGuard: true, tierOffset: 1 });
  });

  it('a spawn call\'s own options win over the group\'s', () => {
    const t = rig(-40);
    const [id] = t.m.service.spawnGroup('r18', { healthScale: 1 });
    const [plain] = t.m.service.spawnGroup('plain');
    expect(t.fake.actorMap.get(id!)!.maxHealth).toBe(t.fake.actorMap.get(plain!)!.maxHealth);
  });
});

describe('R18 parents: guarding the nest', () => {
  it('Cael beside the nest is stooped on; backing away past 14 m after the stoop, they break off and stoop no more', () => {
    const t = rig(-4);
    const ids = t.m.service.spawnGroup('r18', { aggro: true });
    expect(t.tick(12, () => t.telegraphs() > 0)).toBe(true);
    // Let that stoop finish, then back away.
    t.tick(1.5);
    t.fake.movePlayer(0, -(HAWK_PARENT.breakOffRadius + 3));
    t.tick(1);
    for (const id of ids) expect(t.m.get(id)!.brain.target).toBeNull();
    const n = t.telegraphs();
    t.tick(10);
    expect(t.telegraphs()).toBe(n);
  });

  it('between the stoop radius and the break-off they circle but never stoop', () => {
    const t = rig(-(HAWK_PARENT.stoopRadius + 2));
    t.m.service.spawnGroup('r18', { aggro: true });
    expect(t.tick(12, () => t.telegraphs() > 0)).toBe(false);
  });

  it('Cael lingering past the leash raises no aggro loop (the combat music and companions key on it)', () => {
    const t = rig(-25);
    t.m.service.spawnGroup('r18', { aggro: true });
    t.tick(1);
    const n = t.fake.bus.of('ai.aggro').length;
    t.tick(10);
    expect(t.fake.bus.of('ai.aggro').length).toBe(n);
  });

  it('after a break-off they take Cael up again once he comes back inside the stoop radius', () => {
    const t = rig(-4);
    // A sturdy Cael: two parents' stoops would otherwise end the test early.
    const p = t.fake.player as unknown as { health: number; maxHealth: number };
    p.maxHealth = p.health = 1e6;
    t.m.service.spawnGroup('r18', { aggro: true });
    t.tick(12, () => t.telegraphs() > 0);
    t.tick(1.5);
    t.fake.movePlayer(0, -(HAWK_PARENT.breakOffRadius + 3));
    t.tick(2);
    const n = t.telegraphs();
    t.fake.movePlayer(0, -3);
    expect(t.tick(15, () => t.telegraphs() > n)).toBe(true);
  });

  it('they never chase past the leash: a target 25 m off is let go', () => {
    const t = rig(-25);
    const ids = t.m.service.spawnGroup('r18', { aggro: true });
    t.tick(2);
    for (const id of ids) expect(t.m.get(id)!.brain.target).toBeNull();
  });
});

describe('R18 parents: no class kills one by accident', () => {
  // The strongest weapon a player can hold in Act 3, fully tempered, with half again for buffs and affixes.
  const bestWeapon = Math.max(...[...GEAR_ROWS, ...TIER4_ROWS, ...TIER4_REWARD_ROWS].filter((r) => r.slot === 'weapon').map((r) => r.stat));
  const weapon = (bestWeapon / GEAR_TUNING.combat.weaponBaseline) * (1 + GEAR_TUNING.combat.temperPerLevel * GEAR_TUNING.maxTemper);
  const allowance = 1.5;
  const head = COMBAT.boneMultipliers['head']!;
  const melee = (hits: number[]) => hits.map((h) => h * head * weapon * allowance);
  /** Each class's basic string: attacks 1 to 4 once each (the Ashblade's twin blades twice). */
  const STRINGS: Record<string, number[]> = {
    // The Stab (attack 4) is the base hit; counted twice over to be safe.
    knight: melee([COMBAT.baseDamage, COMBAT.baseDamage, COMBAT.baseDamage, COMBAT.baseDamage * 2]),
    warden: melee([COMBAT.baseDamage, COMBAT.baseDamage, COMBAT.baseDamage, COMBAT.baseDamage]),
    ashblade: melee(Array(8).fill(COMBAT.baseDamage)),
    emberwright: [BOLT.damage, SPARK_BURST.damage * SPARK_BURST.bolts, FLAME_BALL.damage, CINDER_RING.damage].map((d) => d * allowance * weapon),
    pathfinder: SHOTS.flatMap((s) => s.releases.map(() => PF.baseDamage * s.damage * PF.steadyShotScale * PF.masterBoltScale * head * weapon * allowance)),
  };

  it.each(Object.keys(STRINGS))('%s: one basic string, then a second, leaves a parent alive', (cls) => {
    const t = rig(-40);
    const [id] = t.m.service.spawnGroup('r18');
    for (let k = 0; k < 2; k++) for (const amount of STRINGS[cls]!) t.fake.apply({ attackerId: 'player', targetId: id!, amount, poise: 1, kind: 'melee' });
    expect(t.fake.actorMap.get(id!)!.dead).toBe(false);
  });

  it('a deliberate kill is still possible (K13 fails the step on it)', () => {
    const t = rig(-40);
    const [id] = t.m.service.spawnGroup('r18');
    for (let k = 0; k < 40 && !t.fake.actorMap.get(id!)!.dead; k++) for (const amount of STRINGS['knight']!) t.fake.apply({ attackerId: 'player', targetId: id!, amount, poise: 1, kind: 'melee' });
    expect(t.fake.actorMap.get(id!)!.dead).toBe(true);
  });
});
