import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { makeFlightOverlay } from './wyrm/flightOverlay';
import type { MoveDef } from './types';
import { FIXED_TIMESTEP } from '../config/constants';
import { ASH_WRAITH } from './defs';
import { EnemyManager } from './EnemyManager';
import { TauntRegistry } from './taunts';
import { FakeHost, loadKnight } from './testing/fakeHost';
import { AI } from './tuning';
import type { SpawnerDef } from './types';

const DT = FIXED_TIMESTEP;
// `setup({ tauntable })` patches the shared def; put it back so tests stay independent.
afterEach(() => {
  delete (ASH_WRAITH as { tauntable?: boolean }).tauntable;
});
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

const RANGED = { id: 'test.spit', ranged: { speed: 10 } } as unknown as MoveDef;
const LEAP = { id: 'test.pounce', clip: 'x', activeStart: 0, activeEnd: 1, leap: { maxMetres: 6 } } as unknown as MoveDef;

describe('a taunted enemy aims at its target, not the player', () => {
  it('fires projectiles at the taunter', () => {
    const { enemy, manager, tick, taunter } = setup();
    const t = taunter(6, 0);
    tick(0.5);
    const spy = vi.fn();
    (manager as unknown as { attacks: { windowOpened: unknown } }).attacks.windowOpened = spy;
    vi.spyOn(enemy.brain, 'currentMove', 'get').mockReturnValue(RANGED);
    (enemy as unknown as { windowEffects(): void }).windowEffects();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![2]).toEqual(t.at);
  });

  it('fires at the player when nothing taunts', () => {
    const { enemy, manager, tick } = setup();
    tick(0.3);
    const spy = vi.fn();
    (manager as unknown as { attacks: { windowOpened: unknown } }).attacks.windowOpened = spy;
    vi.spyOn(enemy.brain, 'currentMove', 'get').mockReturnValue(RANGED);
    (enemy as unknown as { windowEffects(): void }).windowEffects();
    expect(spy.mock.calls[0]![2]).toBeUndefined();
  });

  it('leaps toward the taunter', () => {
    const { enemy, tick, taunter } = setup();
    taunter(3, 0); // the player is at z = -12; the taunter is along +x
    tick(0.5);
    vi.spyOn(enemy.brain, 'currentMove', 'get').mockReturnValue(LEAP);
    (enemy as unknown as { yaw: number }).yaw = -Math.PI / 2; // facing +x
    (enemy as unknown as { startLeap(): void }).startLeap();
    const v = (enemy as unknown as { pushVelocity: { x: number; z: number } }).pushVelocity;
    // a 6 m taunter at ~stop-short distance gives a short leap; the player 12 m away would give the full 6 m
    const speed = Math.hypot(v.x, v.z);
    expect(speed).toBeGreaterThan(0);
    expect(speed * (1 / 60) * 1).toBeLessThan(6);
    const ticks = (enemy as unknown as { pushTicks: number }).pushTicks;
    expect(speed * ticks * DT).toBeLessThan(3.1); // toward the taunter 3 m away, not the full 6 m at the player 12 m away
  });

  it('locks the wyrm dive on the taunter', () => {
    const player = { x: 0, y: 0, z: -12 };
    const bait = { x: 5, y: 0, z: 3 };
    let hubAt: { x: number; z: number } | null = null;
    const ctx = {
      def: {},
      actorId: 'w',
      options: { aggro: true },
      host: { player: { feet: player }, heightAt: () => 0 },
      body: { clipDuration: () => 1 },
      brain: {},
      indoors: () => false,
      feet: () => ({ x: 0, y: 0, z: 0 }),
      yaw: () => 0,
      rng: () => 0.5,
      aim: () => bait,
    };
    const overlay = makeFlightOverlay(ctx as never, { diveLocked: (_id: string, at: { x: number; z: number }) => void (hubAt = at) } as never);
    overlay.telegraphed?.({ id: 'wyrm.dive', windup: 1, activeStart: 0, activeEnd: 1, clip: 'd' } as never, 1);
    expect(hubAt).toMatchObject({ x: 5, z: 3 });
  });
});

describe('when a taunt ends', () => {
  it('an enemy that had not noticed the player goes back to what it was doing instead of aggroing the player', () => {
    const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: -60 } });
    fake.defineAnchor('spawn.one', 0, 0);
    const manager = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: SPAWNERS, seed: 7 });
    const tick = (seconds: number) => {
      for (let i = 0; i < Math.round(seconds / DT); i++) {
        manager.think(DT);
        manager.animate(DT);
        fake.combatStep(DT);
        manager.react(DT);
      }
    };
    const [id] = manager.service.spawnGroup('one', { aggro: true });
    const enemy = manager.get(id)!;
    tick(AI.riseSeconds + 0.5);
    enemy.brain.standDown(); // never noticed the player
    tick(0.5);
    expect(enemy.brain.target).toBeNull();
    const before = fake.bus.of('ai.aggro').length;
    const actor = fake.host.actors.spawn({ kind: 'familiar', team: 'ally', maxHealth: 60, untargetable: true } as never);
    manager.service.taunts.register({ id: actor.id, radius: 10, seconds: 4, position: () => ({ x: 4, y: 0, z: 0 }), alive: () => true });
    tick(2);
    expect(enemy.brain.target).toBe(actor.id);
    tick(3);
    expect(enemy.brain.target).not.toBe('player');
    expect(fake.bus.of('ai.aggro').slice(before).filter((a) => a.actorId === id).map((a) => a.targetId)).not.toContain('player');
  });

  it('an enemy at the radius edge keeps its taunter inside the release margin instead of flipping every tick', () => {
    const { enemy, fake, id, tick, manager } = setup();
    // The taunter keeps a set distance from the enemy, wherever the enemy walks.
    let dist = 9.8;
    const actor = fake.host.actors.spawn({ kind: 'familiar', team: 'ally', maxHealth: 60, untargetable: true } as never);
    const pos = { x: 0, y: 0, z: 0 };
    manager.service.taunts.register({
      id: actor.id, radius: 10, seconds: 30, alive: () => true,
      position: () => Object.assign(pos, { x: enemy.feet.x + dist, y: enemy.feet.y, z: enemy.feet.z }),
    });
    tick(0.5);
    expect(enemy.brain.target).toBe(actor.id);
    for (let i = 0; i < 8; i++) {
      dist = i % 2 ? 9.8 : 11.5; // across the radius, inside the 2 m release margin
      tick(DT);
    }
    expect(enemy.brain.target).toBe(actor.id);
    const t = { actor };
    expect(fake.bus.of('ai.aggro').filter((a) => a.actorId === id).map((a) => a.targetId)).toEqual(['player', t.actor.id]);
  });
});

describe('a pack-alerted enemy', () => {
  it('goes back to the player, not home, when the taunt ends', () => {
    const { enemy, tick, taunter } = setup();
    enemy.brain.standDown();
    tick(0.3);
    expect(enemy.brain.target).toBeNull();
    enemy.alert('player');
    expect(enemy.brain.holdsTarget('player')).toBe(true);
    taunter(5, 0, 1);
    tick(0.3);
    tick(1.5);
    expect(enemy.brain.target).toBe('player');
  });
});

describe('TauntRegistry hysteresis', () => {
  it('keeps the held taunter until radius plus the margin, but only for that holder', () => {
    const r = new TauntRegistry();
    r.register({ id: 'a', radius: 10, seconds: 5, position: () => ({ x: 11, y: 0, z: 0 }), alive: () => true });
    expect(r.pick({ x: 0, z: 0 })).toBeNull();
    expect(r.pick({ x: 0, z: 0 }, 'a')?.id).toBe('a');
    expect(r.pick({ x: 0, z: 0 }, 'b')).toBeNull();
    r.register({ id: 'a', radius: 10, seconds: 5, position: () => ({ x: 12.5, y: 0, z: 0 }), alive: () => true });
    expect(r.pick({ x: 0, z: 0 }, 'a')).toBeNull();
  });
});

describe('an untauntable spawner', () => {
  it('its members ignore taunts', () => {
    const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: -12 } });
    fake.defineAnchor('spawn.one', 0, 0);
    const manager = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: [{ ...SPAWNERS[0]!, untauntable: true }], seed: 7 });
    const [id] = manager.service.spawnGroup('one', { aggro: true });
    const enemy = manager.get(id)!;
    const step = () => {
      manager.think(DT);
      manager.animate(DT);
      fake.combatStep(DT);
      manager.react(DT);
    };
    for (let i = 0; i < Math.round((AI.riseSeconds + 0.5) / DT); i++) step();
    expect(enemy.brain.target).toBe('player');
    const actor = fake.host.actors.spawn({ kind: 'familiar', team: 'ally', maxHealth: 60, untargetable: true } as never);
    manager.service.taunts.register({ id: actor.id, radius: 10, seconds: 8, position: () => ({ x: 6, y: 0, z: 0 }), alive: () => true });
    for (let i = 0; i < 30; i++) step();
    expect(enemy.brain.target).toBe('player');
  });
});
