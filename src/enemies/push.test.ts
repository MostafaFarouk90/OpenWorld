import type * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP } from '../config/constants';
import { EnemyManager } from './EnemyManager';
import { FakeHost, loadKnight } from './testing/fakeHost';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { flatGround } from '../physics/flatGround';
import { AI, MERCY } from './tuning';
import type { SpawnerDef } from './types';

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

const scarecrow: SpawnerDef = {
  id: 'sc', enemy: 'ash-scarecrow', count: 1, anchor: 'sc', band: { min: 1, max: 1 }, activation: 'manual', respawn: 'never', leash: false,
};

function rig() {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: -30 } });
  fake.defineAnchor('sc', 20, 20);
  fake.provideInventory(100);
  const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { seed: 3, spawners: [scarecrow] });
  const tick = (seconds = DT) => {
    for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) {
      m.think(DT);
      m.animate(DT);
      fake.combatStep(DT);
      m.react(DT);
    }
  };
  const spawn = (kind: 'ash-wraith' | 'ember-hound' | 'alley-cutpurse' | 'watch-guard') =>
    m.spawnLoose(kind, { x: 0, y: 0, z: 0 }, { leash: false })!;
  return { fake, m, tick, spawn };
}

describe('enemies.push', () => {
  it('moves the enemy the asked distance along dir over a short knockback, with no stagger', () => {
    const { fake, m, tick, spawn } = rig();
    const id = spawn('ash-wraith');
    tick(0.1);
    const from = m.get(id)!.feet.clone();
    expect(m.service.push(id, { dir: { x: 2, z: 0 }, metres: 3 })).toBe(true); // dir need not be unit length
    tick(1);
    const moved = m.get(id)!.feet;
    expect(moved.x - from.x).toBeGreaterThan(2.7);
    expect(moved.x - from.x).toBeLessThan(3.3);
    expect(Math.abs(moved.z - from.z)).toBeLessThan(0.5);
    expect(m.get(id)!.state).not.toBe('stagger');
    expect(fake.bus.of('actor.staggered')).toHaveLength(0);
  });

  it('clamps the distance to the maximum', () => {
    const { m, tick, spawn } = rig();
    const id = spawn('ash-wraith');
    tick(0.1);
    const from = m.get(id)!.feet.clone();
    expect(m.service.push(id, { dir: { x: 0, z: 1 }, metres: 50 })).toBe(true);
    tick(2);
    const d = m.get(id)!.feet.z - from.z;
    expect(AI.pushMaxMetres).toBe(6);
    expect(d).toBeGreaterThan(5.5);
    expect(d).toBeLessThan(6.6);
  });

  it('refuses a non-finite or zero direction and non-finite or non-positive metres', () => {
    const { m, spawn } = rig();
    const id = spawn('ash-wraith');
    const bad: Array<[{ x: number; z: number }, number]> = [
      [{ x: Number.NaN, z: 1 }, 2],
      [{ x: 1, z: Number.POSITIVE_INFINITY }, 2],
      [{ x: 0, z: 0 }, 2],
      [{ x: 1, z: 0 }, 0],
      [{ x: 1, z: 0 }, -1],
      [{ x: 1, z: 0 }, Number.NaN],
      [{ x: 1, z: 0 }, Number.POSITIVE_INFINITY],
    ];
    for (const [dir, metres] of bad) expect(m.service.push(id, { dir, metres }), JSON.stringify([dir, metres])).toBe(false);
    expect(m.service.push(id, undefined as never)).toBe(false);
  });

  it('refuses an unknown, dead or despawned actor', () => {
    const { fake, m, tick, spawn } = rig();
    expect(m.service.push('nobody', { dir: { x: 1, z: 0 }, metres: 2 })).toBe(false);
    const id = spawn('ash-wraith');
    fake.apply({ attackerId: 'player', targetId: id, amount: 9999, poise: 0, kind: 'script' });
    tick(0.1);
    expect(m.service.push(id, { dir: { x: 1, z: 0 }, metres: 2 })).toBe(false);
    tick(5);
    expect(m.service.push(id, { dir: { x: 1, z: 0 }, metres: 2 })).toBe(false);
  });

  it('refuses an observer-only watch guard', () => {
    const { m, spawn } = rig();
    expect(m.service.push(spawn('watch-guard'), { dir: { x: 1, z: 0 }, metres: 2 })).toBe(false);
  });

  it('refuses a non-hostile actor', () => {
    const { fake, m, tick, spawn } = rig();
    const id = spawn('ash-wraith');
    tick(0.1);
    fake.actorMap.get(id)!.team = 'ally';
    expect(m.service.push(id, { dir: { x: 1, z: 0 }, metres: 2 })).toBe(false);
  });

  it('refuses while a mercy window is open (a staggered wraith, which Release can take)', () => {
    const { fake, m, tick, spawn } = rig();
    const id = spawn('ash-wraith');
    tick(2);
    expect(m.service.push(id, { dir: { x: 1, z: 0 }, metres: 2 })).toBe(true);
    tick(1);
    fake.stagger(id, 'player');
    tick(0.05);
    expect(m.get(id)!.mercyOpen).toBe(true);
    expect(m.service.push(id, { dir: { x: 1, z: 0 }, metres: 2 })).toBe(false);
  });

  it('allows a push on a hound that has not attacked while Calm is locked, refuses it once Calm is unlocked', () => {
    const { fake, m, tick, spawn } = rig();
    const id = spawn('ember-hound');
    tick(0.2);
    expect(m.get(id)!.calmOpen).toBe(true);
    expect(m.mercyUnlocked('calm')).toBe(false);
    expect(m.service.push(id, { dir: { x: 1, z: 0 }, metres: 2 })).toBe(true);
    tick(1);
    fake.setFlag(MERCY.flags.calm, true);
    expect(m.mercyUnlocked('calm')).toBe(true);
    expect(m.service.push(id, { dir: { x: 1, z: 0 }, metres: 2 })).toBe(false);
  });

  it('refuses while a knocked-down beast accepts the Warm Hand (real poise-break stagger)', () => {
    const { fake, m, tick, spawn } = rig();
    const id = spawn('ember-hound');
    tick(0.2);
    fake.stagger(id, 'player');
    tick(0.05);
    const e = m.get(id)!;
    expect(e.warmHandOpen).toBe(true);
    expect(m.service.push(id, { dir: { x: 1, z: 0 }, metres: 2 })).toBe(false);
  });

  it('refuses a thief carrying gold, and allows one that holds none', () => {
    const { m, tick, spawn } = rig();
    const id = spawn('alley-cutpurse');
    tick(0.1);
    expect(m.service.push(id, { dir: { x: 1, z: 0 }, metres: 2 })).toBe(true);
    (m.get(id)!.thief as unknown as { held: number }).held = 12;
    expect(m.service.push(id, { dir: { x: 1, z: 0 }, metres: 2 })).toBe(false);
  });

  it('refuses a boss registered with the core registry', () => {
    const { fake, m, tick, spawn } = rig();
    const id = spawn('ash-wraith');
    tick(2);
    fake.bossStates.set('boss.test', { actorId: id, releaseOpen: false, outcome: null });
    expect(m.service.push(id, { dir: { x: 1, z: 0 }, metres: 2 })).toBe(false);
  });

  it('refuses a foe (scarecrow)', () => {
    const { m } = rig();
    const [id] = m.service.spawnGroup('sc');
    expect(id).toBeDefined();
    expect(m.service.push(id!, { dir: { x: 1, z: 0 }, metres: 2 })).toBe(false);
  });
});

describe('enemies.push with real physics', () => {
  it('moves a wraith the asked distance under the kinematic mover (not capped at walk speed)', async () => {
    const physics = new PhysicsWorld();
    await physics.init();
    physics.addHeightfield(flatGround(200));
    physics.step();
    const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: -60 }, physics });
    fake.provideInventory(100);
    const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { seed: 3, spawners: [] });
    const tick = (n: number) => {
      for (let i = 0; i < n; i++) {
        m.think(DT);
        m.animate(DT);
        fake.combatStep(DT);
        m.react(DT);
        physics.step();
      }
    };
    const id = m.spawnLoose('ash-wraith', { x: 0, y: 0, z: 0 }, { leash: false })!;
    tick(120);
    const from = m.get(id)!.feet.clone();
    expect(m.service.push(id, { dir: { x: 1, z: 0 }, metres: 3 })).toBe(true);
    tick(Math.round(0.25 / DT)); // the knockback lasts 0.2 s
    const moved = m.get(id)!.feet.x - from.x;
    expect(moved).toBeGreaterThan(2.5);
    expect(moved).toBeLessThan(3.5);
  });
});
