import type * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP } from '../config/constants';
import { HEAVY_CHOP_CLIP } from '../combat/heavyBlow';
import { EnemyManager } from './EnemyManager';
import { mercyInteractableId } from './mercy';
import { FakeHost, loadKnight } from './testing/fakeHost';
import { GUARD } from './tuning';
import type { SpawnerDef } from './types';

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

const world = (id: string, count: number, over: Partial<SpawnerDef> = {}): SpawnerDef => ({
  id, enemy: 'ash-wraith', count, anchor: 'a', band: { min: 1, max: 1 }, activation: 'auto', respawn: 'never', leash: false, ...over,
});

function rig(defs: SpawnerDef[], player = { x: 0, z: -300 }) {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: player.x, y: 0, z: player.z } });
  fake.defineAnchor('a', 0, 0);
  const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: defs, seed: 9 });
  const tick = (seconds = DT) => {
    for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) {
      m.think(DT);
      m.animate(DT);
      fake.combatStep(DT);
      m.react(DT);
    }
  };
  const kill = (id: string) => {
    fake.apply({ attackerId: 'player', targetId: id, amount: 9999, poise: 0, kind: 'script' });
    tick(5);
  };
  return { fake, m, tick, kill };
}

/** Saves, then loads into a fresh world: what a reload does. */
function reload(from: ReturnType<typeof rig>, defs: SpawnerDef[]) {
  const saved = JSON.parse(JSON.stringify(from.m.spawners.serialize()));
  const to = rig(defs);
  to.m.spawners.load(saved);
  to.m.spawners.startAuto();
  return { ...to, saved };
}

describe('a group cleared across a save (review B2)', () => {
  it('a member killed before the save stays dead, and the rest can still clear the group', () => {
    const defs = [world('patrol', 3)];
    const a = rig(defs);
    a.m.spawners.startAuto();
    const ids = a.m.service.alive('patrol');
    a.kill(ids[0]!);
    const b = reload(a, defs);
    expect(b.saved.dead).toEqual(['patrol#0']);
    expect(b.m.service.alive('patrol')).toHaveLength(2);
    let cleared = 0;
    b.fake.bus.on('enemies.groupCleared', () => cleared++);
    for (const id of b.m.service.alive('patrol')) b.kill(id);
    expect(cleared).toBe(1);
    expect(b.m.spawners.isCleared('patrol')).toBe(true);
    expect(reload(b, defs).m.service.alive('patrol')).toHaveLength(0);
  });

  it('a Released member plus killed members still count as the whole group', () => {
    const defs = [world('patrol', 3)];
    const a = rig(defs, { x: 0, z: -40 }); // awake, but out of sight
    a.m.spawners.startAuto();
    const ids = a.m.service.alive('patrol');
    a.fake.flags.set('enemies.mercy.release', true);
    a.tick(3);
    a.fake.stagger(ids[0]!, 'player');
    a.fake.interactables.get(mercyInteractableId(a.m.get(ids[0]!)!.slug))!.onInteract(a.fake.player);
    a.tick(4);
    const b = reload(a, defs);
    expect(b.saved.spent).toEqual(['patrol#0']);
    for (const id of b.m.service.alive('patrol')) b.kill(id);
    expect(b.m.spawners.isCleared('patrol')).toBe(true);
  });

  it('manual lesson groups still refill after a kill (they replay)', () => {
    const defs = [world('lesson', 2, { activation: 'manual' })];
    const a = rig(defs);
    const ids = a.m.service.spawnGroup('lesson');
    a.kill(ids[0]!);
    expect(a.m.spawners.serialize().dead).toBeUndefined();
    expect(a.m.service.spawnGroup('lesson')).toHaveLength(1);
  });

  it('an old save without a dead list loads cleanly, a bad one warns and drops the entry', () => {
    const a = rig([world('patrol', 2)]);
    a.m.spawners.load({ spent: [], cleared: [], warmthTier: 0, lockedBlockLevels: {} });
    a.m.spawners.load({ dead: ['patrol#0', 5, 'junk'] });
    expect(a.fake.warnings.filter((w) => w.includes('bad dead entry'))).toHaveLength(2);
    a.m.spawners.startAuto();
    expect(a.m.service.alive('patrol')).toHaveLength(1);
  });
});

describe('gate groups on load (review S4)', () => {
  it('a load re-derives the gate: an open gate refills the group, a closed one removes it', () => {
    const gate = world('road', 2, { activation: { until: 'done' } });
    const a = rig([gate]);
    a.m.spawners.startAuto();
    expect(a.m.service.alive('road')).toHaveLength(2);
    a.fake.loadFlags({ done: true });
    expect(a.m.service.alive('road')).toHaveLength(0);
    a.fake.loadFlags({});
    expect(a.m.service.alive('road')).toHaveLength(2);
  });
});

describe('ephemeral summons (review S2, S3)', () => {
  const summon = world('summon', 1, { activation: 'manual', ephemeral: true });
  it('a real Release of a summon spends nothing, even through the mercy path', () => {
    const a = rig([summon], { x: 0, z: -3 });
    a.fake.flags.set('enemies.mercy.release', true);
    const [id] = a.m.service.spawnGroup('summon');
    a.tick(3);
    a.fake.stagger(id!, 'player');
    a.fake.interactables.get(mercyInteractableId(a.m.get(id!)!.slug))!.onInteract(a.fake.player);
    expect(a.m.spawners.isSpent('summon#0')).toBe(false);
    a.tick(4);
    expect(a.m.spawners.serialize().spent).toEqual([]);
    expect(a.m.service.spawnGroup('summon')).toHaveLength(1);
  });

  it('a load drops live summons and refills nothing', () => {
    const a = rig([summon], { x: 0, z: -3 });
    a.m.service.spawnGroup('summon');
    a.fake.bus.emit('save.loaded', { slot: 's' });
    a.tick(0.1);
    expect(a.m.service.alive('summon')).toHaveLength(0);
    expect(a.m.count).toBe(0);
  });
});

describe('the heavy chop as the real core sends it (review B3)', () => {
  it('breaks a raised footman guard by attack id although its poise is only 20', () => {
    const t = rig([world('pair', 1, { enemy: 'blighted-soldier', activation: 'manual' })], { x: 0, z: -6 });
    const [id] = t.m.service.spawnGroup('pair', { aggro: true });
    for (let i = 0; i < 60 * 30 && !t.m.get(id!)!.guarding; i++) t.tick();
    expect(t.m.get(id!)!.guarding).toBe(true);
    const light = t.fake.apply({ attackerId: 'player', targetId: id!, amount: 20, poise: 20, kind: 'melee', attackId: '1H_Melee_Attack_Slice_Diagonal' })!;
    expect(light.outcome).toBe('blocked');
    expect(light.dealt).toBeCloseTo(20 * GUARD.damageScale);
    // The guard roll may have gone down meanwhile; raise it again for the heavy hit.
    for (let i = 0; i < 60 * 30 && !t.m.get(id!)!.guarding; i++) t.tick();
    const heavy = t.fake.apply({ attackerId: 'player', targetId: id!, amount: 20, poise: 20, kind: 'melee', attackId: HEAVY_CHOP_CLIP })!;
    expect(heavy.outcome).toBe('hit');
    expect(heavy.dealt).toBe(20);
    expect(t.m.get(id!)!.guarding).toBe(false);
  });
});

describe('footman pair flanking from a standing start (review B1)', () => {
  it('two footmen on the same line still split onto opposite sides', () => {
    const t = rig([world('pair', 2, { enemy: 'blighted-soldier', activation: 'manual' })], { x: 0, z: -30 });
    const [a, b] = t.m.service.spawnGroup('pair', { aggro: true });
    t.m.get(a!)!.feet.set(0, 0, 0);
    t.m.get(b!)!.feet.set(0, 0, 1);
    t.tick(2);
    const xa = t.m.get(a!)!.feet.x;
    const xb = t.m.get(b!)!.feet.x;
    expect(Math.abs(xa - xb)).toBeGreaterThan(0.3);
    expect(Math.sign(xa)).not.toBe(Math.sign(xb));
  });
});
