import type * as THREE from 'three';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP } from '../config/constants';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { TerrainColliders } from '../world/TerrainColliders';
import { EnemyManager } from './EnemyManager';
import { WORLD_AI } from './tuning';
import { FakeHost, loadKnight } from './testing/fakeHost';

/**
 * Polish B1 (R05 playtest finding 3): a dormant hound woken by a player who teleported (death respawn, waystone) to within
 * about 60 m of it used to wake onto a terrain collider patch that was still queued, fall through the world and go dormant
 * again 100 m under the ground, where it never woke. Real Rapier, real TerrainColliders (small patches), a fake core.
 */

const DT = FIXED_TIMESTEP;
const GROUND = 9;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

let physics: PhysicsWorld;
beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
});

/** Patches 50 m square (radius 1, so a 150 m block); the hound at x 70 sits in patch 1,0, the arrival point in 0,0. */
function rig(opts: { resident?: boolean; patchSize?: number } = {}) {
  const heightAt = () => GROUND;
  const colliders = new TerrainColliders(physics, { patchSize: opts.patchSize ?? 50, cells: 8, radius: 1, budgetMs: 0, heightAt });
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: 2000, y: GROUND, z: 0 }, physics, heightAt });
  if (opts.resident !== false) fake.provideGroundResident((x, z) => colliders.isResident(x, z));
  const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { seed: 5, spawners: [] });
  /** `stream`: let TerrainColliders build queued patches this tick (false = starved, as under a slow frame). */
  let stream = true;
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      if (stream) colliders.update(fake.playerFeet.x, fake.playerFeet.z);
      m.think(DT);
      m.animate(DT);
      fake.combatStep(DT);
      m.react(DT);
      physics.step();
    }
  };
  /** Teleport: the patch under the destination is built at once (Game.teleport), the neighbours are only queued. */
  const teleport = (x: number, z: number) => {
    fake.movePlayer(x, z);
    colliders.update(x, z);
  };
  return {
    fake,
    m,
    colliders,
    tick,
    teleport,
    setStreaming: (on: boolean) => {
      stream = on;
    },
  };
}

/** Spawns a hound at (70, 10), far from the player so it goes dormant on the first tick. */
function dormantHound(t: ReturnType<typeof rig>, at = { x: 70, z: 10 }, y = GROUND) {
  const id = t.m.spawnLoose('ember-hound', { x: at.x, y, z: at.z }, { leash: false })!;
  expect(id).toBeTruthy();
  t.tick();
  expect(t.m.get(id)!.sleeping).toBe(true);
  return id;
}

describe('a dormant enemy woken after a teleport (polish B1)', () => {
  it('waits for its terrain patch, then wakes on the ground and moves', () => {
    const t = rig();
    const id = dormantHound(t);
    t.setStreaming(false);
    t.teleport(10, 10); // 60 m from the hound
    expect(t.colliders.isResident(70, 10)).toBe(false);
    t.tick(Math.round(3 / DT));
    const e = t.m.get(id)!;
    // Starved streaming: it stays dormant at its spawn height instead of falling through.
    expect(e.sleeping).toBe(true);
    expect(Math.abs(e.feet.y - GROUND)).toBeLessThan(0.05);

    t.setStreaming(true);
    let woke = -1;
    for (let i = 0; i < 600 && woke < 0; i++) {
      t.tick();
      if (!e.sleeping) woke = i;
    }
    expect(woke).toBeGreaterThanOrEqual(0);
    expect(t.colliders.isResident(e.feet.x, e.feet.z)).toBe(true);
    e.alert(t.fake.player.id);
    const from = e.feet.clone();
    let lowest = Infinity;
    for (let i = 0; i < Math.round(2 / DT); i++) {
      t.tick();
      lowest = Math.min(lowest, e.feet.y);
    }
    expect(lowest).toBeGreaterThan(GROUND - 0.5);
    expect(Math.hypot(e.feet.x - from.x, e.feet.z - from.z)).toBeGreaterThan(3);
  });

  it('without the residency port (old hosts), the fall is caught: back on the terrain, awake, never under the kill plane', () => {
    const t = rig({ resident: false });
    const id = dormantHound(t);
    t.setStreaming(false);
    t.teleport(10, 10);
    const e = t.m.get(id)!;
    let lowest = Infinity;
    for (let i = 0; i < Math.round(3 / DT); i++) {
      t.tick();
      lowest = Math.min(lowest, e.feet.y);
    }
    // Before the fix: about -95 after 4 s, dormant again by 3-D distance and never woken (the playtest's y = -110).
    expect(lowest).toBeGreaterThan(GROUND - WORLD_AI.fallRecoverDepth - 1.5);
    expect(e.sleeping).toBe(false);
    t.setStreaming(true);
    t.tick(Math.round(2 / DT));
    expect(Math.abs(e.feet.y - GROUND)).toBeLessThan(0.5);
    expect(e.sleeping).toBe(false);
  });

  it('an awake enemy whose patch is missing goes dormant on the terrain instead of falling', () => {
    const t = rig();
    // Spawned awake beside the player (no dormancy pass yet), then the player teleports so its patch drops out.
    t.teleport(60, 10);
    const id = t.m.spawnLoose('ember-hound', { x: 70, y: GROUND, z: 10 }, { leash: false })!;
    t.tick(30);
    const e = t.m.get(id)!;
    expect(e.sleeping).toBe(false);
    t.setStreaming(false);
    t.teleport(-25, 10); // 95 m away: patch 1,0 is outside the new 3 x 3 block and is dropped
    expect(t.colliders.isResident(70, 10)).toBe(false);
    t.tick(Math.round(2 / DT));
    expect(e.sleeping).toBe(true);
    expect(e.feet.y).toBeGreaterThan(GROUND - 0.5);
  });

  it('an interior enemy 150 m up wakes without a terrain patch and stays on its floor', () => {
    const t = rig();
    const floorY = GROUND + 150;
    physics.addStaticCollider(physics.rapier.ColliderDesc.cuboid(30, 0.5, 30).setTranslation(70, floorY - 0.5, 10));
    physics.step();
    const id = dormantHound(t, { x: 70, z: 10 }, floorY);
    t.setStreaming(false);
    // The player arrives on the same floor (its own patch is built; the hound's is not).
    t.teleport(45, 10); // patch 0,0; the hound stands in patch 1,0
    t.fake.playerFeet.y = floorY;
    expect(t.colliders.isResident(70, 10)).toBe(false);
    t.tick(Math.round(2 / DT));
    const e = t.m.get(id)!;
    expect(e.sleeping).toBe(false);
    expect(Math.abs(e.feet.y - floorY)).toBeLessThan(0.5);
  });

  it('walking in (patches streaming normally, 200 m patches) wakes the hound on the same tick as without the gate', () => {
    const wakeTick = (resident: boolean) => {
      const t = rig({ resident, patchSize: 200 });
      t.fake.movePlayer(400, 10);
      const id = dormantHound(t, { x: 70, z: 10 });
      const e = t.m.get(id)!;
      for (let i = 0; i < 2000; i++) {
        t.fake.movePlayer(400 - i * 0.2, 10); // 12 m/s
        t.tick();
        if (!e.sleeping) {
          expect(Math.abs(e.feet.y - GROUND)).toBeLessThan(0.1);
          return i;
        }
      }
      return -1;
    };
    const gated = wakeTick(true);
    expect(gated).toBeGreaterThan(0);
    expect(gated).toBe(wakeTick(false));
  });
});
