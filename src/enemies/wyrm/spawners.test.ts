import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { EnemyManager } from '../EnemyManager';
import { FakeHost, loadKnight } from '../testing/fakeHost';
import { emberWyrmSpawner, WYRM_NEST_IDS, WYRM_SPAWNERS, wyrmlingSpawner } from './spawners';
import type { WyrmBody } from './WyrmBody';

let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

function rig(anchors: string[]) {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: 40 } });
  anchors.forEach((id, i) => fake.defineAnchor(id, i * 50, 0));
  const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: WYRM_SPAWNERS, seed: 2 });
  const live = (id: string) => m.service.alive(id);
  return { fake, m, live };
}

describe('wyrm spawners', () => {
  it('ids are unique; every group is an Ember Wyrm or wyrmling group in the Cinderreach band', () => {
    const ids = WYRM_SPAWNERS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of WYRM_SPAWNERS) {
      expect(['ember-wyrm', 'wyrmling']).toContain(s.enemy);
      expect(s.band).toBe('cinderreach');
    }
    expect(WYRM_SPAWNERS.filter((s) => s.tag === 'wyrm.nest').map((s) => s.anchor)).toEqual(WYRM_NEST_IDS.map((n) => `poi.a2.${n}.spawn.1`));
  });

  it('the nests appear only once story.gate.a2 is on', () => {
    const t = rig(WYRM_NEST_IDS.map((n) => `poi.a2.${n}.spawn.1`));
    t.m.spawners.startAuto();
    expect(t.live('wyrm.nest.wyrm-nest-1')).toEqual([]);
    t.fake.setFlag('story.gate.a2', true);
    expect(t.live('wyrm.nest.wyrm-nest-1')).toHaveLength(1);
    expect(t.live('wyrm.nest.wyrm-nest-2')).toHaveLength(1);
  });

  it('a missing nest anchor warns and spawns nothing', () => {
    const t = rig([]);
    t.m.spawners.startAuto();
    t.fake.setFlag('story.gate.a2', true);
    expect(t.live('wyrm.nest.wyrm-nest-1')).toEqual([]);
    expect(t.fake.warnings.some((w) => w.includes('poi.a2.wyrm-nest-1.spawn.1'))).toBe(true);
  });

  it('the resting den wyrm: present under world.cinderreach.den.spared, peaceful and curled in Rest', () => {
    const t = rig(['cinderreach.den.wyrm.rest']);
    t.m.spawners.startAuto();
    expect(t.live('wyrm.den.resting')).toEqual([]);
    t.fake.setFlag('world.cinderreach.den.spared', true);
    const [id] = t.live('wyrm.den.resting');
    expect(id).toBeDefined();
    for (let i = 0; i < 60; i++) {
      t.m.think(1 / 60);
      t.m.animate(1 / 60);
    }
    const e = t.m.get(id!)!;
    expect(e.state).toBe('idle');
    expect((e.body as unknown as WyrmBody).currentClip).toBe('Rest');
  });

  it('the helpers default to manual, never-respawning groups; extra fields override', () => {
    expect(emberWyrmSpawner('x', 'a')).toMatchObject({ enemy: 'ember-wyrm', count: 1, activation: 'manual', respawn: 'never' });
    expect(wyrmlingSpawner('y', 'b', 6, { memberAnchors: ['p1'] })).toMatchObject({ enemy: 'wyrmling', count: 6, leaderSlot: 0, memberAnchors: ['p1'] });
  });
});
