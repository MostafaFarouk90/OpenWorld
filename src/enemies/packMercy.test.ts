import type * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP } from '../config/constants';
import { EnemyManager } from './EnemyManager';
import { mercyInteractableId } from './mercy';
import { FakeHost, loadKnight } from './testing/fakeHost';
import type { SpawnerDef } from './types';

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

const group = (id: string, enemy: SpawnerDef['enemy'], count: number): SpawnerDef => ({
  id, enemy, count, anchor: 'a', band: { min: 1, max: 1 }, activation: 'manual', respawn: 'never', leash: false,
});

function rig(defs: SpawnerDef[]) {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: -12 } });
  fake.defineAnchor('a', 0, 0);
  fake.flags.set('enemies.mercy.release', true);
  fake.flags.set('enemies.mercy.spare', true);
  const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: defs, seed: 5 });
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

const interact = (t: ReturnType<typeof rig>, id: string) =>
  t.fake.interactables.get(mercyInteractableId(t.m.get(id)!.slug))!.onInteract(t.fake.player);

describe('mercy inside a group', () => {
  it('releasing one staggered wraith of a pack spends only its slot, and the others stay', () => {
    const t = rig([group('pack', 'ash-wraith', 3)]);
    const ids = t.m.service.spawnGroup('pack');
    t.tick(3); // the wraiths rise first
    t.fake.stagger(ids[0]!, 'player');
    interact(t, ids[0]!);
    t.tick(4);
    expect(t.m.get(ids[0]!)).toBeUndefined();
    expect(t.m.get(ids[1]!)).toBeDefined();
    expect(t.m.get(ids[2]!)).toBeDefined();
    const spent = t.m.spawners.serialize().spent;
    expect(spent).toHaveLength(1);
    expect(spent[0]).toBe('pack#0');
    // The group is not cleared and a refill only brings back the slot that was not spent.
    expect(t.m.spawners.isCleared('pack')).toBe(false);
  });

  it('a Release pulse frees every staggered wraith in range, and a wraith out of range is untouched', () => {
    const t = rig([group('pack', 'ash-wraith', 3)]);
    const ids = t.m.service.spawnGroup('pack');
    t.tick(3); // the wraiths rise first
    t.fake.stagger(ids[0]!, 'player');
    t.fake.stagger(ids[1]!, 'player');
    interact(t, ids[0]!);
    t.tick(4);
    expect(t.m.spawners.serialize().spent.sort()).toEqual(['pack#0', 'pack#1']);
    expect(t.m.get(ids[2]!)).toBeDefined();
  });

  it('sparing one footman of a pair leaves the survivor fighting alone and clears the group once', () => {
    const t = rig([group('pair', 'blighted-soldier', 2)]);
    const ids = t.m.service.spawnGroup('pair', { aggro: true, guard: false });
    let cleared = 0;
    t.fake.bus.on('enemies.groupCleared', () => cleared++);
    t.tick(0.1);
    const first = t.fake.actorMap.get(ids[0]!)!;
    first.health = first.maxHealth * 0.4;
    t.fake.stagger(ids[0]!, 'player');
    expect(t.m.get(ids[0]!)!.state).toBe('yield');
    interact(t, ids[0]!);
    t.tick(20);
    expect(t.m.get(ids[0]!)).toBeUndefined();
    expect(cleared).toBe(0);
    expect(t.m.get(ids[1]!)!.active).toBe(true);
    t.fake.apply({ attackerId: 'player', targetId: ids[1]!, amount: 9999, poise: 0, kind: 'script' });
    t.tick(6);
    expect(cleared).toBe(1);
    expect(t.m.spawners.isCleared('pair')).toBe(true);
  });
});
