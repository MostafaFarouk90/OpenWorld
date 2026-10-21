import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP } from '../../config/constants';
import { EnemyManager } from '../EnemyManager';
import { FakeActor, FakeHost, loadKnight } from '../testing/fakeHost';
import { AI } from '../tuning';
import type { SpawnerDef, SpawnOptions } from '../types';
import { WYRM_HUB } from './overlays';
import { EMBER_WYRM } from './tuning';
import { WyrmBody } from './WyrmBody';

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});
afterEach(() => {
  for (const k of Object.keys(WYRM_HUB)) delete (WYRM_HUB as Record<string, unknown>)[k];
});

const NEST: SpawnerDef = { id: 'nest', enemy: 'ember-wyrm', count: 1, anchor: 'a', band: { min: 10, max: 10 }, activation: 'manual', respawn: 'never', leash: false };

function rig(opts: { playerZ?: number; seed?: number; indoors?: boolean } = {}) {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: opts.playerZ ?? -10 } });
  fake.defineAnchor('a', 0, 0);
  if (opts.indoors) fake.interiors = { current: 'test-hall' };
  const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: [NEST], seed: opts.seed ?? 3 });
  const tick = (seconds = DT, each?: () => boolean | void) => {
    for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) {
      m.think(DT);
      m.animate(DT);
      fake.combatStep(DT);
      m.react(DT);
      if (each?.()) return true;
    }
    return false;
  };
  const spawn = (o: SpawnOptions = { aggro: true }) => {
    const [id] = m.service.spawnGroup('nest', o);
    const enemy = m.get(id!)!;
    return { id: id!, enemy, body: enemy.body as WyrmBody };
  };
  const hitWing = (id: string, attackerId = 'player', bone = 'wingL') =>
    fake.apply({ attackerId, targetId: id, amount: 4, poise: 2, kind: 'melee', bone });
  return { fake, m, tick, spawn, hitWing };
}

const airborne = (b: WyrmBody) => b.altitude > 0.3;

describe('Ember Wyrm in the enemy stack', () => {
  it('spawns on the wyrm body with the wyrm-flight overlay; an aggro spawn takes off and circles 5 m up', () => {
    const t = rig();
    const { enemy, body } = t.spawn();
    expect(body).toBeInstanceOf(WyrmBody);
    expect(enemy.actor.maxPoise).toBe(60);
    t.tick(2);
    expect(body.altitude).toBeGreaterThan(4);
    // The actor's position (lock-on, aims) is the body in the air, not the feet.
    const p = enemy.actor.worldPosition(new THREE.Vector3());
    expect(p.y - enemy.feet.y).toBeCloseTo(body.altitude, 5);
    // Calm and the Warm Hand are closed in the air, and so is a pull.
    expect(enemy.mercyOpen).toBe(false);
    expect(enemy.calmOpen).toBe(false);
    expect(enemy.warmHandOpen).toBe(false);
    expect(enemy.pulledToward({ x: 0, z: -10 }, 4)).toBe(false);
  });

  it('a peaceful (resting) wyrm stays on the ground and never notices; a hit wakes it', () => {
    const t = rig({ playerZ: -3 });
    const { enemy, id, body } = t.spawn({ peaceful: true });
    t.tick(3);
    expect(enemy.state).toBe('idle');
    expect(body.altitude).toBe(0);
    expect(body.currentClip).toBe('Rest');
    t.fake.apply({ attackerId: 'player', targetId: id, amount: 2, poise: 1, kind: 'melee', bone: 'torso' });
    t.tick(0.5);
    expect(['notice', 'chase', 'telegraph', 'attack']).toContain(enemy.state);
  });

  it('a wing hit in the air: a 0.5 s fall with Calm closed, then a 3 s stagger on the ground with Calm and the Warm Hand open', () => {
    const t = rig();
    const grounded: string[] = [];
    WYRM_HUB.grounded = (actorId) => grounded.push(actorId);
    const { id, enemy, body } = t.spawn();
    t.tick(2);
    expect(airborne(body)).toBe(true);
    const r = t.hitWing(id);
    expect(r?.staggered).toBe(true);
    // Falling: no mercy, no Calm, no Warm Hand, and the ally rules see no stagger window.
    t.tick(0.25);
    expect(enemy.state).toBe('stagger');
    expect(enemy.mercyOpen).toBe(false);
    expect(enemy.warmHandOpen).toBe(false);
    expect(enemy.mercyState()).toBe('none');
    t.tick(0.35);
    expect(body.altitude).toBe(0);
    expect(grounded).toEqual([id]);
    expect(enemy.state).toBe('stagger');
    expect(enemy.mercyOpen).toBe(true);
    expect(enemy.warmHandOpen).toBe(true);
    expect(enemy.mercyState()).toBe('staggered');
    // Held for 3 s, not the Act 1 1.2 s.
    t.tick(AI.breakStaggerSeconds + 0.3);
    expect(enemy.state).toBe('stagger');
    t.tick(3 - AI.breakStaggerSeconds);
    expect(enemy.state).not.toBe('stagger');
    // Grounded for good: no takeoff however long the fight runs.
    t.tick(15, () => {
      expect(body.altitude).toBe(0);
    });
  });

  it('an ally\'s wing hit grounds it too and does not close Calm', () => {
    const t = rig();
    const ally = new FakeActor('ally-1', 'companion', { kind: 'companion', team: 'ally', maxHealth: 50 });
    t.fake.actorMap.set(ally.id, ally);
    const { id, enemy, body } = t.spawn();
    t.tick(2);
    t.hitWing(id, ally.id, 'wingR');
    t.tick(0.6);
    expect(body.altitude).toBe(0);
    expect(enemy.mercyOpen).toBe(true);
  });

  it('a hostile\'s or a status tick\'s "wing hit" breaks nothing; a body hit in the air is not a wing hit', () => {
    const t = rig();
    const { id, body } = t.spawn();
    t.tick(2);
    t.fake.apply({ attackerId: 'player', targetId: id, amount: 2, poise: 2, kind: 'status', bone: 'wingL' });
    t.fake.apply({ attackerId: 'player', targetId: id, amount: 2, poise: 2, kind: 'melee', bone: 'torso' });
    t.tick(0.6);
    expect(airborne(body)).toBe(true);
  });

  it('on the ground before any wing hit, a poise break staggers 3 s but offers no Calm (never brought down)', () => {
    const t = rig({ indoors: true, playerZ: -3 });
    const { id, enemy, body } = t.spawn();
    t.tick(1);
    expect(body.altitude).toBe(0);
    t.fake.apply({ attackerId: 'player', targetId: id, amount: 4, poise: 60, kind: 'melee', bone: 'torso' });
    expect(enemy.state).toBe('stagger');
    expect(enemy.mercyOpen).toBe(false);
    expect(enemy.warmHandOpen).toBe(false);
    t.tick(2);
    expect(enemy.state).toBe('stagger');
  });

  it('indoors it never takes off', () => {
    const t = rig({ indoors: true });
    const { body } = t.spawn();
    t.tick(15, () => {
      expect(body.altitude).toBe(0);
    });
  });

  it('the dive: its landing point is locked at the telegraph and it lands exactly there', () => {
    let found = false;
    for (let seed = 1; seed < 40 && !found; seed++) {
      const t = rig({ seed, playerZ: -10 });
      let locked: { x: number; z: number } | null = null;
      let ended = false;
      WYRM_HUB.diveLocked = (_id, at) => (locked = { x: at.x, z: at.z });
      WYRM_HUB.diveEnded = () => (ended = true);
      const { enemy, body } = t.spawn();
      // The player steps aside after the telegraph: the dive still goes to the locked point.
      if (!t.tick(20, () => locked !== null)) continue;
      found = true;
      const point = locked!;
      t.fake.movePlayer(point.x + 4, point.z + 4);
      t.tick(3, () => ended);
      expect(ended).toBe(true);
      expect(body.altitude).toBe(0);
      expect(Math.hypot(enemy.feet.x - point.x, enemy.feet.z - point.z)).toBeLessThan(0.6);
    }
    expect(found).toBe(true);
  });

  it('dormancy in the air puts it on the ground first', () => {
    const t = rig();
    const { enemy, body } = t.spawn();
    t.tick(2);
    expect(airborne(body)).toBe(true);
    enemy.sleep();
    expect(body.altitude).toBe(0);
    enemy.wake();
    t.tick(0.1);
    expect(enemy.feet.y).toBeCloseTo(0, 3);
  });

  it('tuning: the spit jet matches the spit range', () => {
    expect(EMBER_WYRM.spitJet).toBe(7);
  });
});
