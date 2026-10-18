import type * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP } from '../config/constants';
import { ENEMY_DEFS } from './defs';
import { EnemyManager } from './EnemyManager';
import { AI } from './tuning';
import { FakeHost, loadKnight } from './testing/fakeHost';

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

function rig(patrol: { x: number; z: number }[] = []) {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: -8 } });
  const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { seed: 3 });
  const tick = (seconds = DT) => {
    for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) {
      m.think(DT);
      m.animate(DT);
      fake.combatStep(DT);
      m.react(DT);
    }
  };
  const spawn = (kind: 'watch-guard' | 'blighted-soldier' = 'watch-guard') =>
    m.spawn({
      spawnerId: 'loose',
      spawnTag: 'loose',
      slot: 0,
      def: ENEMY_DEFS[kind],
      feet: { x: 0, y: 0, z: 0 },
      yaw: 0,
      level: 1,
      patrol: patrol.map((p) => ({ id: 'w', position: { x: p.x, y: 0, z: p.z } })) as never,
      options: { leash: false },
      spentKey: 'loose#0',
    })!;
  const yaw = () => {
    const all = (m as unknown as { enemies: Map<string, { pose(): { yaw: number } }> }).enemies;
    return [...all.values()].at(-1)!.pose().yaw;
  };
  const feet = (id: string) => m.get(id)!.feet;
  return { fake, m, tick, spawn, yaw, feet };
}
const EAST = { x: -8, y: 0, z: 0 }; // yaw +PI/2 from a guard at the origin

describe('perception.face', () => {
  it('turns toward the point at turnRate, no snap, and holds while called', () => {
    const { m, tick, spawn, yaw } = rig();
    const id = spawn();
    tick();
    expect(yaw()).toBe(0);
    expect(m.service.perception.face(id, EAST)).toBe(true);
    tick();
    expect(yaw()).toBeGreaterThan(0);
    expect(yaw()).toBeLessThanOrEqual(AI.turnRate * DT + 1e-9);
    expect(yaw()).toBeLessThan(Math.PI / 2);
    for (let i = 0; i < 120; i++) {
      m.service.perception.face(id, EAST);
      tick();
    }
    expect(yaw()).toBeCloseTo(Math.PI / 2, 5);
  });

  it('holds without further calls, and null releases', () => {
    const { m, tick, spawn, yaw } = rig();
    const id = spawn();
    m.service.perception.face(id, EAST);
    tick(2);
    expect(yaw()).toBeCloseTo(Math.PI / 2, 5);
    expect(m.service.perception.face(id, null)).toBe(true);
    expect(m.service.perception.face(id, null)).toBe(true);
  });

  it('pauses the patrol while held; release resumes it from where it stands', () => {
    const { m, tick, spawn, feet } = rig([{ x: 0, z: 10 }, { x: 0, z: -10 }]);
    const id = spawn();
    tick(1);
    const before = feet(id).clone();
    expect(before.length()).toBeGreaterThan(0.2); // it walks
    m.service.perception.face(id, EAST);
    tick(0.1);
    const held = feet(id).clone();
    tick(2);
    expect(feet(id).distanceTo(held)).toBeLessThan(1e-6);
    m.service.perception.face(id, null);
    tick(1);
    const after = feet(id);
    expect(after.distanceTo(held)).toBeGreaterThan(0.2); // moving again
    expect(after.distanceTo(held)).toBeLessThan(4); // continued from where it stood, not teleported home
    expect(m.get(id)!.state).toBe('patrol');
  });

  it('is idempotent: repeated identical calls give the same result as one', () => {
    const a = rig();
    const b = rig();
    const ia = a.spawn();
    const ib = b.spawn();
    for (let i = 0; i < 30; i++) {
      a.m.service.perception.face(ia, EAST);
      a.m.service.perception.face(ia, EAST);
      a.tick();
      b.m.service.perception.face(ib, EAST);
      b.tick();
    }
    expect(a.yaw()).toBeCloseTo(b.yaw(), 12);
  });

  it('returns false for unknown, non-observer, dead/despawned, dormant actors and bad coordinates', () => {
    const { fake, m, tick, spawn } = rig();
    const f = m.service.perception.face;
    expect(f('nobody', EAST)).toBe(false);
    const soldier = spawn('blighted-soldier');
    expect(f(soldier, EAST)).toBe(false);
    const g = spawn();
    expect(f(g, { x: NaN, y: 0, z: 0 })).toBe(false);
    expect(f(g, { x: 0, y: 0, z: Infinity })).toBe(false);
    expect(f(g, { x: 0, y: NaN, z: 0 })).toBe(false);
    expect(f(g, EAST)).toBe(true);
    (m as unknown as { enemies: Map<string, { sleep(): void; wake(): void }> }).enemies.get(g)!.sleep();
    expect(f(g, EAST)).toBe(false);
    expect(f(g, null)).toBe(false);
    (m as unknown as { enemies: Map<string, { sleep(): void; wake(): void }> }).enemies.get(g)!.wake();
    expect(f(g, EAST)).toBe(true);
    fake.host.actors.despawn(g);
    tick();
    expect(f(g, EAST)).toBe(false);
  });

  it('sleep clears the hold: after waking the guard is no longer held', () => {
    const { m, tick, spawn, yaw } = rig();
    const id = spawn();
    m.service.perception.face(id, EAST);
    tick(2);
    const e = (m as unknown as { enemies: Map<string, { sleep(): void; wake(): void }> }).enemies.get(id)!;
    e.sleep();
    e.wake();
    tick(2);
    expect(yaw()).toBeCloseTo(Math.PI / 2, 5); // it keeps its facing but the hold itself is gone
    m.service.perception.face(id, { x: 8, y: 0, z: 0 });
    tick(2);
    expect(yaw()).toBeCloseTo(-Math.PI / 2, 5);
  });

  it('a despawned guard drops its hold; a replacement at the same spot starts unheld', () => {
    const { fake, m, tick, spawn, yaw } = rig();
    const id = spawn();
    m.service.perception.face(id, EAST);
    tick();
    fake.host.actors.despawn(id);
    tick();
    const id2 = spawn();
    tick(2);
    expect(id2).not.toBe(id);
    expect(yaw()).toBe(0);
  });

  it('awareness and hits behave as before while held', () => {
    const { fake, m, tick, spawn } = rig();
    const id = spawn();
    for (let i = 0; i < 300; i++) {
      m.service.perception.face(id, { x: 0, y: 0, z: -8 }); // toward the player
      tick();
    }
    expect(fake.bus.of('ai.spotted')).toEqual([{ actorId: id, targetId: 'player' }]);
    fake.apply({ attackerId: 'player', targetId: id, amount: 5, poise: 5, kind: 'melee' });
    tick(0.1);
    expect(m.service.perception.state(id)!.awareness).toBeGreaterThan(0.95);
    expect(m.get(id)!.state).not.toBe('chase');
    expect(fake.bus.of('ai.aggro')).toHaveLength(0);
  });
});
