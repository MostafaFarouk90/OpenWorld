import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP as DT } from '../config/constants';
import { BRIGHTWATER_SPAWNERS } from './brightwaterSpawners';
import { EnemyManager } from './EnemyManager';
import { SLICE_SPAWNERS } from './spawnerDefs';
import { FakeHost, loadKnight } from './testing/fakeHost';
import type { SpawnerDef } from './types';

let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

const ROAD: SpawnerDef = {
  id: 'road', enemy: 'ash-wraith', count: 2, anchor: 'spawn.road', band: { min: 1, max: 1 },
  activation: { until: 'done' }, respawn: 'never', leash: false,
};
const VAULT: SpawnerDef = {
  id: 'vault', enemy: 'ash-wraith', count: 1, anchor: 'spawn.vault', band: { min: 1, max: 1 },
  activation: { interior: 'chapel-vault' }, respawn: 'never', leash: false,
};
const SUMMON: SpawnerDef = {
  id: 'summon', enemy: 'ash-wraith', count: 1, anchor: 'spawn.summon', band: { min: 1, max: 1 },
  activation: 'manual', respawn: 'never', leash: false, ephemeral: true,
};
const PATROL: SpawnerDef = {
  id: 'patrol', enemy: 'ash-wraith', count: 1, anchor: 'spawn.patrol', band: { min: 1, max: 1 },
  activation: 'auto', respawn: 'never', leash: false,
};

function setup(defs: SpawnerDef[]) {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: -200 } });
  for (const a of ['road', 'vault', 'summon', 'patrol']) fake.defineAnchor(`spawn.${a}`, 0, 0);
  const manager = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: defs, seed: 3 });
  return { fake, manager };
}

/** Kills `id` and runs the death clip and fade out, so the enemy is gone and its group sees it. */
function kill(fake: FakeHost, id: string, manager: EnemyManager): void {
  fake.apply({ attackerId: 'player', targetId: id, amount: 9999, poise: 0, kind: 'script' });
  for (let i = 0; i < 60 * 5; i++) {
    manager.think(DT);
    manager.animate(DT);
    manager.react(DT);
  }
}

describe('gate groups ({ until })', () => {
  it('start while the flag is off and leave when it turns on', () => {
    const { fake, manager } = setup([ROAD]);
    manager.spawners.startAuto();
    expect(manager.service.alive('road')).toHaveLength(2);
    fake.setFlag('done', true);
    expect(manager.service.alive('road')).toHaveLength(0);
    expect(manager.count).toBe(0);
  });

  it('do not start when the flag is already on, and come back if a load turns it off', () => {
    const { fake, manager } = setup([ROAD]);
    fake.flags.set('done', true);
    const m2 = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: [ROAD], seed: 3 });
    m2.spawners.startAuto();
    expect(m2.service.alive('road')).toHaveLength(0);
    fake.loadFlags({});
    expect(m2.service.alive('road')).toHaveLength(2);
    m2.dispose();
    manager.dispose();
  });

  it('wait for startAuto: a flag change before the models load spawns nothing', () => {
    const { fake, manager } = setup([ROAD]);
    fake.setFlag('done', true);
    fake.setFlag('done', false);
    expect(manager.count).toBe(0);
    manager.spawners.startAuto();
    expect(manager.service.alive('road')).toHaveLength(2);
  });

  it('a cleared gate group does not return when the gate reopens', () => {
    const { fake, manager } = setup([ROAD]);
    manager.spawners.startAuto();
    fake.setFlag('done', true);
    manager.service.spawnGroup('road');
    for (const id of manager.service.alive('road')) kill(fake, id, manager);
    fake.setFlag('done', false);
    expect(manager.service.alive('road')).toHaveLength(0);
  });

  it('a group naming neither flag nor until warns and is treated as auto', () => {
    const { fake, manager } = setup([{ ...ROAD, activation: {} }]);
    expect(fake.warnings.some((w) => w.includes('neither flag nor until'))).toBe(true);
    manager.spawners.startAuto();
    expect(manager.service.alive('road')).toHaveLength(2);
  });
});

describe('persistence of cleared groups', () => {
  it('a dead auto group with respawn never stays dead across a reload', () => {
    const a = setup([PATROL]);
    a.manager.spawners.startAuto();
    kill(a.fake, a.manager.service.alive('patrol')[0]!, a.manager);
    expect(a.manager.spawners.isCleared('patrol')).toBe(true);
    const saved = JSON.parse(JSON.stringify(a.manager.spawners.serialize()));
    expect(saved.cleared).toContain('patrol');

    const b = setup([PATROL]);
    b.manager.spawners.load(saved);
    b.manager.spawners.startAuto();
    expect(b.manager.service.alive('patrol')).toHaveLength(0);
  });

  it('the shipped north patrol is saved as cleared and a rest does not bring it back', () => {
    const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: -200 } });
    for (const a of ['spawn.patrol.wraith-1']) fake.defineAnchor(a, 0, 0);
    const manager = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: SLICE_SPAWNERS, seed: 3 });
    manager.spawners.startAuto();
    const ids = manager.service.alive('brightwater.north-patrol');
    expect(ids.length).toBe(3);
    for (const id of ids) kill(fake, id, manager);
    fake.bus.emit('rest', { waystoneId: 'w' });
    expect(manager.service.alive('brightwater.north-patrol')).toHaveLength(0);
    expect(manager.spawners.serialize().cleared).toContain('brightwater.north-patrol');
  });

  it('ephemeral groups save no spent slots and no cleared mark, and refill after reset', () => {
    const { fake, manager } = setup([SUMMON]);
    const [id] = manager.service.spawnGroup('summon');
    kill(fake, id!, manager);
    const saved = manager.spawners.serialize();
    expect(saved.cleared).not.toContain('summon');
    expect(saved.spent).toEqual([]);
    expect(manager.service.spawnGroup('summon')).toHaveLength(1);
  });

  it('a released summon spends nothing', () => {
    const { manager } = setup([SUMMON]);
    const [id] = manager.service.spawnGroup('summon');
    manager.get(id!)!.release();
    manager.get(id!)!.cleanup();
    expect(manager.spawners.serialize().spent).toEqual([]);
  });
});

describe('interior groups', () => {
  it('spawn on interior.entered for their interior only, once', () => {
    const { fake, manager } = setup([VAULT]);
    fake.bus.emit('interior.entered', { interiorId: 'other', doorId: 'd' });
    expect(manager.service.alive('vault')).toHaveLength(0);
    fake.bus.emit('interior.entered', { interiorId: 'chapel-vault', doorId: 'vault.door' });
    expect(manager.service.alive('vault')).toHaveLength(1);
    fake.bus.emit('interior.entered', { interiorId: 'chapel-vault', doorId: 'vault.door' });
    expect(manager.service.alive('vault')).toHaveLength(1);
  });

  it('come back on a load inside the vault, but not once cleared', () => {
    const { fake, manager } = setup([VAULT]);
    fake.interiors = { current: 'chapel-vault' };
    fake.bus.emit('save.loaded', { slot: 's' });
    expect(manager.service.alive('vault')).toHaveLength(1);
    kill(fake, manager.service.alive('vault')[0]!, manager);
    fake.bus.emit('save.loaded', { slot: 's' });
    expect(manager.service.alive('vault')).toHaveLength(0);
  });
});

describe('the shipped Brightwater table', () => {
  it('uses the contract ids, never respawns on rest, and stays inside levels 1 to 9', () => {
    const ids = BRIGHTWATER_SPAWNERS.map((d) => d.id);
    expect(ids).toEqual(expect.arrayContaining([
      'brightwater.ford.pair-1', 'brightwater.ford.pair-2',
      'brightwater.deadroad.patrol-1', 'brightwater.deadroad.patrol-2', 'brightwater.vault',
      'brightwater.prior-summon.1', 'brightwater.prior-summon.4',
    ]));
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of [...SLICE_SPAWNERS, ...BRIGHTWATER_SPAWNERS]) expect(d.respawn, d.id).toBe('never');
    for (const d of BRIGHTWATER_SPAWNERS) {
      expect(typeof d.band).toBe('object');
      const b = d.band as { min: number; max: number };
      expect(b.min).toBeGreaterThanOrEqual(1);
      expect(b.max).toBeLessThanOrEqual(9);
    }
  });

  it('member anchors match counts, and the summons are four one-member ephemeral groups', () => {
    for (const d of BRIGHTWATER_SPAWNERS) if (d.memberAnchors) expect(d.memberAnchors.length, d.id).toBe(d.count);
    const summons = BRIGHTWATER_SPAWNERS.filter((d) => d.id.startsWith('brightwater.prior-summon.'));
    expect(summons).toHaveLength(4);
    summons.forEach((d, i) => {
      expect(d).toMatchObject({ count: 1, ephemeral: true, memberAnchors: [`vault.summon.${i + 1}`] });
    });
  });

  it('gates the Dead Road patrols on the wardstones flag and the ford pairs on M04', () => {
    const by = (id: string) => BRIGHTWATER_SPAWNERS.find((d) => d.id === id)!;
    expect(by('brightwater.deadroad.patrol-1').activation).toEqual({ until: 'world.deadroad.wardstones.done' });
    expect(by('brightwater.ford.pair-2').activation).toEqual({ quest: 'm04' });
    expect(by('brightwater.vault').activation).toEqual({ interior: 'chapel-vault' });
  });
});
