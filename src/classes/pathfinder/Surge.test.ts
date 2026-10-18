import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ProjectileSystem } from '../../spells/Projectile';
import type { SurgeFormContext } from '../../spells/SurgeAndRally';
import { FakeActor, FakeActors, FakeDamage, FakeEvents, FakePlayer } from '../../spells/testHost';
import { SURGE } from '../../vfx/tuning';
import { createPathfinderSurge } from './Surge';

const DT = 1 / 60;

function rig(zone: SurgeFormContext['zone'] = 'warm', radius = 6, poise: number = SURGE.poise) {
  const player = new FakeActor('player', 'player');
  const actors = new FakeActors(player);
  const damage = new FakeDamage(actors);
  const projectiles = new ProjectileSystem({ actors });
  let disposed = false;
  const burst = vi.fn();
  const tracer = vi.fn();
  const form = createPathfinderSurge({
    projectiles,
    muzzle: (out: THREE.Vector3) => out.set(0, 1.3, 0),
    aim: () => ({ x: 0, y: 0, z: 1 }),
    tracer,
    burst,
    isDisposed: () => disposed,
  });
  const ctx: SurgeFormContext = {
    casterId: 'player',
    zone,
    feet: { x: 0, y: 0, z: 0 },
    facingYaw: 0,
    radius,
    poise,
    host: { events: new FakeEvents(), player: new FakePlayer(player), actors } as never,
    damage,
  };
  const cast = (s = 2) => {
    form(ctx);
    for (let t = 0; t < s; t += DT) projectiles.update(DT);
  };
  return { actors, damage, cast, burst, tracer, dispose: () => (disposed = true), projectiles };
}
const targets = (r: ReturnType<typeof rig>) => r.damage.applied.map((q) => q.targetId);

describe('Pathfinder Surge', () => {
  it('warm: the quarrel bursts on the first enemy, everything within 6 m takes Surge damage once', () => {
    const r = rig('warm', 6);
    r.actors.add(new FakeActor('first', 'hostile', 0, 10));
    r.actors.add(new FakeActor('beside', 'hostile', 4, 10));
    r.actors.add(new FakeActor('beyond', 'hostile', 0, 17));
    r.actors.add(new FakeActor('ally', 'ally', 1, 10));
    r.cast();
    expect(targets(r).sort()).toEqual(['beside', 'first']);
    for (const q of r.damage.applied) expect(q).toMatchObject({ amount: SURGE.damage, poise: SURGE.poise, kind: 'spell', attackId: SURGE.spellId });
    expect(r.burst).toHaveBeenCalledWith(expect.objectContaining({ z: expect.any(Number) }), 6);
  });

  it('the burst comes where the quarrel lands even with nobody in the way (range end)', () => {
    const r = rig('warm', 6);
    r.actors.add(new FakeActor('far', 'hostile', 0, 33));
    r.cast(2);
    expect(r.burst).toHaveBeenCalledTimes(1);
    expect(r.burst.mock.calls[0][0].z).toBeGreaterThan(25);
    expect(targets(r)).toEqual(['far']);
  });

  it('cinder keeps the 10 m burst and the poise break of the shared numbers', () => {
    const r = rig('cinder', 10, 999);
    r.actors.add(new FakeActor('a', 'hostile', 0, 8));
    r.actors.add(new FakeActor('b', 'hostile', 9, 8));
    r.cast();
    expect(targets(r).sort()).toEqual(['a', 'b']);
    for (const q of r.damage.applied) expect(q.poise).toBe(999);
  });

  it('blaze passes through two enemies, bursts, then chains three arcs at 70% to the nearest unhit', () => {
    const r = rig('blaze', 8);
    r.actors.add(new FakeActor('p1', 'hostile', 0, 6));
    r.actors.add(new FakeActor('p2', 'hostile', 0, 9));
    r.actors.add(new FakeActor('last', 'hostile', 0, 12));
    // Out of the burst (8 m from z=12) but chained one after another within 8 m.
    r.actors.add(new FakeActor('c1', 'hostile', 0, 22));
    r.actors.add(new FakeActor('c2', 'hostile', 0, 29));
    r.actors.add(new FakeActor('c3', 'hostile', 0, 36));
    r.actors.add(new FakeActor('c4', 'hostile', 0, 43));
    r.cast();
    const amount = (id: string) => r.damage.applied.find((q) => q.targetId === id)?.amount;
    for (const id of ['p1', 'p2']) expect(amount(id)).toBe(SURGE.damage);
    expect(amount('last')).toBe(SURGE.damage);
    expect(amount('c1')).toBeCloseTo(SURGE.damage * 0.7);
    expect(amount('c2')).toBeCloseTo(SURGE.damage * 0.7);
    expect(amount('c3')).toBeCloseTo(SURGE.damage * 0.7);
    expect(amount('c4')).toBeUndefined();
    expect(new Set(targets(r)).size).toBe(targets(r).length); // no one is hit twice
  });

  it('warm and cinder do not chain', () => {
    const r = rig('warm', 6);
    r.actors.add(new FakeActor('a', 'hostile', 0, 8));
    r.actors.add(new FakeActor('far', 'hostile', 0, 16));
    r.cast();
    expect(targets(r)).toEqual(['a']);
  });

  it('a quarrel in flight when the plugin is disposed does nothing', () => {
    const r = rig('warm', 6);
    r.actors.add(new FakeActor('a', 'hostile', 0, 20));
    r.dispose();
    r.cast();
    expect(r.damage.applied).toHaveLength(0);
    expect(r.burst).not.toHaveBeenCalled();
  });

  it('spends no bolt: it reads no ammunition at all', () => {
    const r = rig('warm', 6);
    r.cast(0.1);
    expect(r.projectiles.liveCount).toBe(1);
  });
});
