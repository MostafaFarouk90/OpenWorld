import type * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP } from '../config/constants';
import { ENEMY_DEFS } from './defs';
import { EnemyManager } from './EnemyManager';
import { REGION_BANDS, WATCH_GUARD_BAND } from './level';
import { SNEAK, type ObserverPose } from './perceptionHook';
import { ENEMY_STRINGS_EN } from './strings.en';
import { FakeHost, loadKnight } from './testing/fakeHost';
import { KILL_XP_BASE } from '../progression/tuning';
import { LOUD_SPEED } from './tuning';

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

function rig(player = { x: 0, z: -8 }) {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: player.x, y: 0, z: player.z } });
  const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { seed: 3 });
  const tick = (seconds = DT) => {
    for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) {
      m.think(DT);
      m.animate(DT);
      fake.combatStep(DT);
      m.react(DT);
    }
  };
  const spawn = (kind: 'watch-guard' | 'blighted-soldier', opts = {}) => m.spawnLoose(kind, { x: 0, y: 0, z: 0 }, { leash: false, ...opts })!;
  return { fake, m, tick, spawn };
}

describe('watch guard kind', () => {
  it('is a humanoid with no moves, observer-only, named, and banded inside the region bands', () => {
    const def = ENEMY_DEFS['watch-guard'];
    expect(def.observerOnly).toBe(true);
    expect(def.moves).toEqual([]);
    expect(ENEMY_STRINGS_EN[def.nameKey]).toBe('Watch Guard');
    for (const band of Object.values(REGION_BANDS)) {
      expect(WATCH_GUARD_BAND.min).toBeGreaterThanOrEqual(band.min);
      expect(WATCH_GUARD_BAND.max).toBeLessThanOrEqual(band.max);
    }
  });

  it('sees the player, raises suspicious then spotted once each, and never aggros or chases', () => {
    const { fake, m, tick, spawn } = rig();
    const id = spawn('watch-guard', { aggro: true });
    const states = new Set<string>();
    for (let i = 0; i < 300; i++) {
      tick();
      states.add(m.get(id)!.state);
    }
    expect(fake.bus.of('ai.suspicious')).toEqual([{ actorId: id, targetId: 'player', awareness: expect.any(Number) }]);
    expect(fake.bus.of('ai.suspicious')[0]!.awareness).toBeGreaterThan(0.3);
    expect(fake.bus.of('ai.spotted')).toEqual([{ actorId: id, targetId: 'player' }]);
    expect(fake.bus.of('ai.aggro')).toHaveLength(0);
    expect(states.has('chase')).toBe(false);
    expect(states.has('notice')).toBe(false);
    expect(fake.bus.of('telegraph')).toHaveLength(0);
    expect(m.get(id)!.feet.distanceTo(fake.playerFeet)).toBeGreaterThan(7.9); // it did not walk up to the player
  });

  it('per-tick state is readable through the service: awareness, sees, distance', () => {
    const { m, tick, spawn } = rig();
    const id = spawn('watch-guard');
    expect(m.service.perception.state('nobody')).toBeNull();
    tick();
    const early = m.service.perception.state(id)!;
    expect(early.sees).toBe(true);
    expect(early.distance).toBeCloseTo(8);
    expect(early.awareness).toBeGreaterThan(0);
    tick(5);
    expect(m.service.perception.state(id)!.awareness).toBe(1);
  });

  it('awareness drains when the player leaves, and spotted fires again on the next fill', () => {
    const { fake, m, tick, spawn } = rig();
    const id = spawn('watch-guard');
    tick(3);
    expect(fake.bus.of('ai.spotted')).toHaveLength(1);
    fake.movePlayer(0, -60);
    tick(5);
    const s = m.service.perception.state(id)!;
    expect(s.sees).toBe(false);
    expect(s.awareness).toBeLessThan(0.1);
    fake.movePlayer(0, -8);
    tick(3);
    expect(fake.bus.of('ai.spotted')).toHaveLength(2);
    expect(fake.bus.of('ai.aggro')).toHaveLength(0);
  });

  it('is neutral and immortal, has no mercy row, and pays no XP row', () => {
    const { fake, spawn } = rig();
    const id = spawn('watch-guard');
    const actor = fake.actorMap.get(id)!;
    expect(actor.team).toBe('neutral');
    expect(actor.immortal).toBe(true);
    expect(ENEMY_DEFS['watch-guard'].mercy).toBeUndefined();
    expect(KILL_XP_BASE['watch-guard'] ?? 0).toBe(0); // no row: kills would pay nothing (and it cannot die)
  });

  it('a hit takes awareness to 1 with one ai.spotted, and no chase, aggro, stagger-yield or death', () => {
    const { fake, m, tick, spawn } = rig({ x: 0, z: -1 });
    const id = spawn('watch-guard');
    const actor = fake.actorMap.get(id)!;
    fake.movePlayer(0, -60); // out of sight, so only the hit can raise awareness
    tick(0.2);
    expect(m.service.perception.state(id)!.awareness).toBe(0);
    fake.apply({ attackerId: 'player', targetId: id, amount: 5, poise: 5, kind: 'melee' });
    tick(0.1);
    expect(m.service.perception.state(id)!.awareness).toBeGreaterThan(0.95); // 1 on the hit, one tick of drain since
    expect(fake.bus.of('ai.spotted')).toEqual([{ actorId: id, targetId: 'player' }]);
    // A flurry in one tick fires one event for the whole flurry (the first hit fills it, the rest find it at 1).
    const before = fake.bus.of('ai.spotted').length;
    for (let i = 0; i < 3; i++) fake.apply({ attackerId: 'player', targetId: id, amount: 5, poise: 5, kind: 'melee' });
    tick(0.1);
    expect(fake.bus.of('ai.spotted')).toHaveLength(before + 1);
    expect(actor.health).toBe(actor.maxHealth);
    expect(m.get(id)!.state).not.toBe('chase');
    expect(fake.bus.of('ai.aggro')).toHaveLength(0);
    fake.apply({ attackerId: 'player', targetId: id, amount: 1, poise: 999, kind: 'melee' });
    tick(0.5);
    expect(m.get(id)!.state).not.toBe('yield');
    fake.apply({ attackerId: 'player', targetId: id, amount: 9999, poise: 0, kind: 'script' });
    tick(2);
    expect(actor.dead).toBe(false);
    expect(m.get(id)).toBeDefined();
    expect(fake.bus.of('ai.aggro')).toHaveLength(0);
    expect(fake.bus.of('telegraph')).toHaveLength(0);
  });

  it('never asks the nav service for a path, even with a grid under it', () => {
    const { fake, m, tick, spawn } = rig({ x: 0, z: -12 });
    let paths = 0;
    const nav = fake.host.services.get('nav') as unknown as { path?: (...a: unknown[]) => unknown } | undefined;
    if (nav) nav.path = (...a: unknown[]) => (paths++, a);
    const id = spawn('watch-guard', { aggro: true });
    tick(3);
    expect(m.get(id)).toBeDefined();
    expect(paths).toBe(0);
  });

  it('a pack alert does not turn it, and the spawn option makes any kind observer-only', () => {
    const { fake, m, tick, spawn } = rig();
    const guard = spawn('watch-guard', { aggro: true });
    m.get(guard)!.alert('player');
    const soldier = spawn('blighted-soldier', { observerOnly: true, aggro: true });
    expect(m.get(soldier)!.observerOnly).toBe(true);
    tick(5);
    expect(fake.bus.of('ai.aggro')).toHaveLength(0);
    expect(fake.bus.of('ai.spotted').map((e) => e.actorId).sort()).toEqual([guard, soldier].sort());
  });

  it('a normal enemy still aggros at once as before and also fills awareness', () => {
    const { fake, m, tick, spawn } = rig();
    const id = spawn('blighted-soldier');
    tick(0.5);
    expect(fake.bus.of('ai.aggro').filter((a) => a.actorId === id)).toHaveLength(1);
    expect(m.service.perception.state(id)!.awareness).toBeGreaterThan(0);
  });
});

describe('perception providers through the manager', () => {
  it('passes the observer pose and the target id, and unregister stops the effect', () => {
    const { fake, m, tick, spawn } = rig({ x: 0, z: -12 });
    const id = spawn('watch-guard');
    const poses: Array<[string, ObserverPose]> = [];
    const off = m.service.perception.register({
      modifiers: (t, o) => {
        poses.push([t, o]);
        return SNEAK; // sight 9 m: a player at 12 m is not seen
      },
    });
    tick(2);
    expect(m.service.perception.state(id)!.sees).toBe(false);
    expect(poses.length).toBeGreaterThan(0);
    const [target, pose] = poses[0]!;
    expect(target).toBe('player');
    expect(pose).toMatchObject({ actorId: id, kind: 'watch-guard', spawnerId: 'loose', observerOnly: true, yaw: 0, feet: { x: 0, y: 0, z: 0 } });
    expect(fake.bus.of('ai.spotted')).toHaveLength(0);
    off();
    tick(2);
    expect(m.service.perception.state(id)!.sees).toBe(true);
  });

  it('hands providers one reused pose object per enemy, refilled each call', () => {
    const { m, tick, spawn } = rig();
    const a = spawn('watch-guard');
    const b = spawn('watch-guard');
    const seen = new Map<string, Set<ObserverPose>>();
    m.service.perception.register({
      modifiers: (_t, o) => {
        (seen.get(o.actorId) ?? seen.set(o.actorId, new Set()).get(o.actorId)!).add(o);
        return null;
      },
    });
    tick(1);
    expect(seen.get(a)!.size).toBe(1);
    expect(seen.get(b)!.size).toBe(1);
    expect([...seen.get(a)!][0]).not.toBe([...seen.get(b)!][0]);
  });

  it('a throwing provider is ignored with exactly one warning over many ticks', () => {
    const { fake, m, tick, spawn } = rig();
    const id = spawn('watch-guard');
    m.service.perception.register({
      modifiers: () => {
        throw new Error('bad provider');
      },
    });
    tick(1);
    expect(m.service.perception.state(id)!.sees).toBe(true);
    expect(fake.warnings.filter((w) => w.includes('bad provider'))).toHaveLength(1);
  });

  it('loudness follows measured speed: sprint pace is heard behind the guard, a held key standing still is not', () => {
    // Behind the guard (outside the cone) at 15 m, so only hearing can notice.
    const hearsAt = (speed: number) => {
      const { fake, m, tick, spawn } = rig({ x: 0, z: 15 });
      const id = spawn('watch-guard');
      fake.speed = speed;
      tick(0.2);
      return m.service.perception.state(id)!.awareness > 0;
    };
    expect(hearsAt(0)).toBe(false);
    expect(hearsAt(LOUD_SPEED - 0.5)).toBe(false);
    expect(hearsAt(LOUD_SPEED + 0.1)).toBe(true);
  });
});
