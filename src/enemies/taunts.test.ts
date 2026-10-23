import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP } from '../config/constants';
import { ASH_WRAITH } from './defs';
import { EnemyManager } from './EnemyManager';
import { TauntRegistry } from './taunts';
import { FakeHost, loadKnight } from './testing/fakeHost';
import { AI } from './tuning';
import type { SpawnerDef } from './types';

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

describe('TauntRegistry', () => {
  const src = (id: string, x: number, over: Record<string, unknown> = {}) => ({
    id, radius: 10, seconds: 5, position: () => ({ x, y: 0, z: 0 }), alive: () => true, ...over,
  });

  it('is empty by default and picks nothing', () => {
    const r = new TauntRegistry();
    expect(r.size).toBe(0);
    expect(r.pick({ x: 0, z: 0 })).toBeNull();
  });

  it('picks a taunter within its radius and ignores one out of range', () => {
    const r = new TauntRegistry();
    r.register(src('a', 4));
    expect(r.pick({ x: 0, z: 0 })?.id).toBe('a');
    expect(r.pick({ x: 20, z: 0 })).toBeNull();
  });

  it('with two taunters the nearest wins', () => {
    const r = new TauntRegistry();
    r.register(src('far', 8));
    r.register(src('near', 3));
    expect(r.pick({ x: 0, z: 0 })?.id).toBe('near');
    expect(r.pick({ x: 10, z: 0 })?.id).toBe('far');
  });

  it('expires after its duration and on unregister, and drops dead taunters', () => {
    const r = new TauntRegistry();
    const off = r.register(src('a', 1));
    r.update(4.9);
    expect(r.pick({ x: 0, z: 0 })?.id).toBe('a');
    r.update(0.2);
    expect(r.pick({ x: 0, z: 0 })).toBeNull();
    expect(r.size).toBe(0);
    off();
    let alive = true;
    const off2 = r.register(src('b', 1, { alive: () => alive }));
    alive = false;
    expect(r.pick({ x: 0, z: 0 })).toBeNull();
    expect(r.size).toBe(1); // dead entry lingers until the next update
    r.update(DT);
    expect(r.size).toBe(0);
    off2();
    const off3 = r.register(src('c', 1));
    off3();
    expect(r.pick({ x: 0, z: 0 })).toBeNull();
  });

  it('refuses a taunter with no radius or duration', () => {
    const r = new TauntRegistry();
    r.register(src('a', 1, { radius: 0 }));
    r.register(src('b', 1, { seconds: 0 }));
    expect(r.size).toBe(0);
  });
});

const SPAWNERS: SpawnerDef[] = [
  { id: 'one', enemy: 'ash-wraith', count: 1, anchor: 'spawn.one', band: { min: 1, max: 1 }, activation: 'manual', respawn: 'never', leash: false },
];

function setup(defOver: Partial<typeof ASH_WRAITH> = {}) {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: -12 } });
  fake.defineAnchor('spawn.one', 0, 0);
  const manager = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: SPAWNERS, seed: 7 });
  const tick = (seconds = DT) => {
    for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) {
      manager.think(DT);
      manager.animate(DT);
      fake.combatStep(DT);
      manager.react(DT);
    }
  };
  const [id] = manager.service.spawnGroup('one', { aggro: true });
  const enemy = manager.get(id)!;
  if (Object.keys(defOver).length) Object.assign(enemy.def, defOver);
  tick(AI.riseSeconds + 0.5);
  /** A familiar-like ally actor parked at (x, 0, z). */
  const taunter = (x: number, z: number, seconds = 8, radius = 10) => {
    const actor = fake.host.actors.spawn({ kind: 'familiar', team: 'ally', maxHealth: 60, untargetable: true } as never);
    const at = { x, y: 1.2, z };
    const off = manager.service.taunts.register({ id: actor.id, radius, seconds, position: () => at, alive: () => !actor.dead });
    return { actor, at, off };
  };
  return { fake, manager, tick, id, enemy, taunter };
}

describe('enemy target choice', () => {
  it('targets the player when nothing taunts', () => {
    const { enemy, fake, id } = setup();
    expect(enemy.brain.target).toBe('player');
    expect(fake.bus.of('ai.aggro').filter((a) => a.actorId === id).map((a) => a.targetId)).toEqual(['player']);
  });

  it('a taunter in range switches the target, and the enemy walks toward it', () => {
    const { enemy, fake, id, tick, taunter } = setup();
    const t = taunter(6, 0);
    const before = enemy.feet.x;
    tick(0.5);
    expect(enemy.brain.target).toBe(t.actor.id);
    expect(fake.bus.of('ai.aggro').filter((a) => a.actorId === id).map((a) => a.targetId)).toEqual(['player', t.actor.id]);
    expect(enemy.feet.x).toBeGreaterThan(before);
  });

  it('a taunter out of range changes nothing', () => {
    const { enemy, tick, taunter } = setup();
    taunter(40, 0, 8, 10);
    tick(0.5);
    expect(enemy.brain.target).toBe('player');
  });

  it('returns to the player when the taunt expires', () => {
    const { enemy, fake, id, tick, taunter } = setup();
    const t = taunter(6, 0, 1);
    tick(0.5);
    expect(enemy.brain.target).toBe(t.actor.id);
    tick(1);
    expect(enemy.brain.target).toBe('player');
    expect(fake.bus.of('ai.aggro').filter((a) => a.actorId === id).map((a) => a.targetId)).toEqual(['player', t.actor.id, 'player']);
  });

  it("returns to the player at once when the taunter dies", () => {
    const { enemy, fake, tick, taunter } = setup();
    const t = taunter(6, 0, 30);
    tick(0.5);
    expect(enemy.brain.target).toBe(t.actor.id);
    fake.host.damage.kill!(t.actor.id, null);
    tick(DT);
    expect(enemy.brain.target).toBe('player');
    expect(enemy.brain.state).not.toBe('idle');
  });

  it('with two taunters the nearest one wins', () => {
    const { enemy, tick, taunter } = setup();
    const far = taunter(8, 0);
    const near = taunter(0, 3);
    tick(0.3);
    expect(enemy.brain.target).toBe(near.actor.id);
    near.actor.health = 0;
    tick(DT);
    expect(enemy.brain.target).toBe(far.actor.id);
  });

  it('a registered boss ignores the taunt unless its def opts in', () => {
    const a = setup();
    a.fake.bossStates.set('boss', { actorId: a.id, releaseOpen: false, outcome: null });
    const t = a.taunter(6, 0);
    a.tick(0.5);
    expect(a.enemy.brain.target).toBe('player');
    expect(t.actor.id).not.toBe('player');

    const b = setup({ tauntable: true });
    b.fake.bossStates.set('boss', { actorId: b.id, releaseOpen: false, outcome: null });
    const u = b.taunter(6, 0);
    b.tick(0.5);
    expect(b.enemy.brain.target).toBe(u.actor.id);
  });

  it('a plain enemy whose def says tauntable false ignores the taunt', () => {
    const { enemy, tick, taunter } = setup({ tauntable: false });
    taunter(6, 0);
    tick(0.5);
    expect(enemy.brain.target).toBe('player');
  });

  it('a taunter that never reaches anyone leaves the enemy exactly as with no taunters', () => {
    const run = (withTaunter: boolean) => {
      const s = setup();
      if (withTaunter) s.taunter(60, 0, 8, 10);
      const trail: string[] = [];
      for (let i = 0; i < 240; i++) {
        s.tick(DT);
        const f = s.enemy.feet;
        trail.push(`${f.x.toFixed(6)},${f.z.toFixed(6)},${s.enemy.brain.state},${s.enemy.brain.target}`);
      }
      return { trail, events: s.fake.bus.log.map((e) => e.type) };
    };
    const base = run(false);
    const far = run(true);
    expect(far.trail).toEqual(base.trail);
    expect(far.events).toEqual(base.events);
  });
});
