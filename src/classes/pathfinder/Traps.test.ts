import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeActor, FakeActors, FakeDamage } from '../../spells/testHost';
import { Traps } from './Traps';
import { PF } from './tuning';

function rig(status = true) {
  const player = new FakeActor('player', 'player');
  const actors = new FakeActors(player);
  const damage = new FakeDamage(actors);
  let now = 0;
  const log: string[] = [];
  const applyStatus = vi.fn(() => true);
  const traps = new Traps({
    actors,
    damage,
    status: () => (status ? ({ apply: applyStatus } as never) : undefined),
    now: () => now,
    playerId: () => 'player',
    added: (id, kind) => log.push(`+${kind}${id}`),
    removed: (id, kind, hit) => log.push(`-${kind}${id}${hit ? '!' : ''}`),
    burst: () => log.push('burst'),
  });
  return { traps, actors, damage, log, applyStatus, at: (s: number) => (now = s), now: () => now };
}
const spot = { x: 0, y: 0, z: 0 };

describe('Tripwire', () => {
  let r: ReturnType<typeof rig>;
  beforeEach(() => {
    r = rig();
  });

  it('a dodge places a wire; the first hostile to cross is staggered by poise alone and the wire is spent', () => {
    expect(r.traps.dodgeStarted(spot)).toBe(true);
    r.actors.add(new FakeActor('e', 'hostile', 0.5, 0));
    r.actors.add(new FakeActor('f', 'hostile', 0.8, 0));
    r.traps.update();
    expect(r.damage.applied).toHaveLength(1);
    expect(r.damage.applied[0]).toMatchObject({ targetId: 'e', amount: 0, poise: PF.tripwire.poise, kind: 'script' });
    expect(r.traps.count()).toBe(0);
    r.traps.update();
    expect(r.damage.applied).toHaveLength(1);
  });

  it('is cooling down for 8 s after a placement and allows two live wires at most', () => {
    expect(r.traps.dodgeStarted(spot)).toBe(true);
    expect(r.traps.dodgeStarted(spot)).toBe(false);
    expect(r.traps.wireCooldown()).toBeCloseTo(PF.tripwire.cooldown);
    r.at(8.1);
    expect(r.traps.dodgeStarted({ x: 5, y: 0, z: 0 })).toBe(true);
    expect(r.traps.count('wire')).toBe(2);
    r.at(9);
    r.traps.update();
    r.at(16.2);
    // Both wires live and the cooldown over: the cap alone refuses.
    expect(r.traps.dodgeStarted({ x: 9, y: 0, z: 0 })).toBe(false);
    r.traps.update(); // the first wire's 12 s ended
    expect(r.traps.dodgeStarted({ x: 9, y: 0, z: 0 })).toBe(true);
  });

  it('the lifetime outlasts the cooldown, so a cap of two is reachable and then lapses', () => {
    expect(PF.tripwire.lifetime).toBeGreaterThan(PF.tripwire.cooldown);
    r.traps.dodgeStarted(spot);
    r.at(8.1);
    r.traps.dodgeStarted({ x: 4, y: 0, z: 0 });
    r.at(12.1);
    r.traps.update();
    expect(r.traps.count('wire')).toBe(1);
    expect(r.log).toContain('-wire1');
  });

  it('ignores allies, neutrals, the dead and anyone outside the radius', () => {
    r.traps.dodgeStarted(spot);
    r.actors.add(new FakeActor('ally', 'ally', 0.2, 0));
    r.actors.add(new FakeActor('npc', 'neutral', 0.2, 0));
    r.actors.add(new FakeActor('dead', 'hostile', 0.2, 0)).kill();
    r.actors.add(new FakeActor('far', 'hostile', PF.tripwire.radius + 0.5, 0));
    r.traps.update();
    expect(r.damage.applied).toHaveLength(0);
    expect(r.traps.count()).toBe(1);
  });

  it('clear drops every trap and the cooldown (respec, load)', () => {
    r.traps.dodgeStarted(spot);
    r.traps.placeCinder(spot);
    r.traps.clear();
    expect(r.traps.count()).toBe(0);
    expect(r.traps.dodgeStarted(spot)).toBe(true);
  });
});

describe('Cinder Trap', () => {
  it('bursts under the first hostile: 20 damage and 30 poise to everything in 3 m, ignite from the status service', () => {
    const r = rig();
    r.traps.placeCinder(spot);
    r.actors.add(new FakeActor('a', 'hostile', 0.6, 0));
    r.actors.add(new FakeActor('b', 'hostile', 0, 2.5));
    r.actors.add(new FakeActor('c', 'hostile', 0, 4));
    r.traps.update();
    expect(r.log).toContain('burst');
    expect(r.damage.applied.map((q) => q.targetId).sort()).toEqual(['a', 'b']);
    for (const q of r.damage.applied) expect(q).toMatchObject({ amount: PF.cinderTrap.damage, poise: PF.cinderTrap.poise, kind: 'spell' });
    expect(r.applyStatus).toHaveBeenCalledTimes(2);
    expect(r.applyStatus).toHaveBeenCalledWith('a', { id: 'pathfinder.cinderTrap', kind: 'ignite', dps: PF.cinderTrap.igniteDps, seconds: PF.cinderTrap.igniteSeconds, sourceId: 'player' });
  });

  it('still bursts when the status service is absent', () => {
    const r = rig(false);
    r.traps.placeCinder(spot);
    r.actors.add(new FakeActor('a', 'hostile', 0.3, 0));
    expect(() => r.traps.update()).not.toThrow();
    expect(r.damage.applied).toHaveLength(1);
  });

  it('refuses a fourth live trap and expires an untouched one after 20 s', () => {
    const r = rig();
    for (let i = 0; i < PF.cinderTrap.cap; i++) expect(r.traps.placeCinder({ x: i * 10, y: 0, z: 0 })).toBe(true);
    expect(r.traps.placeCinder(spot)).toBe(false);
    r.at(PF.cinderTrap.lifetime + 0.1);
    r.traps.update();
    expect(r.traps.count('cinder')).toBe(0);
    expect(r.damage.applied).toHaveLength(0);
  });
});
