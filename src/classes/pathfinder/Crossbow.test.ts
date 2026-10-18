import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModifiableRequest } from '../../actors/DamageResolver';
import { ProjectileSystem } from '../../spells/Projectile';
import { FakeActor, FakeActors, FakeDamage } from '../../spells/testHost';
import { Ammo } from './Ammo';
import { Crossbow } from './Crossbow';
import { Marks } from './Marks';
import { PF, SHOTS } from './tuning';

const DT = 1 / 60;

function rig(opts: { bolts?: number; limited?: boolean; learned?: string[]; held?: boolean } = {}) {
  const player = new FakeActor('player', 'player');
  const actors = new FakeActors(player);
  const damage = new FakeDamage(actors);
  const projectiles = new ProjectileSystem({ actors });
  let bolts = opts.bolts ?? 20;
  const limited = opts.limited ?? true;
  const ammo = new Ammo({ itemKnown: () => limited, count: () => bolts, remove: (n) => (bolts >= n ? ((bolts -= n), true) : false) });
  let now = 0;
  const marks = new Marks({ actors, now: () => now, added: () => {}, removed: () => {} });
  const fx = { tracer: vi.fn(), shot: vi.fn(), hit: vi.fn() };
  const toast = vi.fn();
  const learned = new Set(opts.learned ?? []);
  const held = { value: opts.held ?? false };
  const cb = new Crossbow({
    playerId: () => 'player',
    muzzle: (out) => out.set(0, 1.3, 0),
    aim: () => ({ x: 0, y: 0, z: 1 }),
    attackHeld: () => held.value,
    learned: (id) => learned.has(id),
    actors,
    damage,
    projectiles,
    ammo,
    marks,
    fx,
    toast,
    now: () => now,
  });
  /** Plays a swing: clipStart, then progress ticks across the whole clip, stepping the bolts alongside. */
  const swing = (index: number, seconds = 1.1): void => {
    cb.swingStarted(index);
    let prev = 0;
    for (let t = 0; t < seconds; t += DT) {
      const cur = Math.min(1, t / seconds + DT / seconds);
      cb.progress(prev, cur);
      prev = cur;
      now += DT;
      projectiles.update(DT);
    }
    cb.swingEnded();
    for (let t = 0; t < 1; t += DT) projectiles.update(DT);
  };
  const hostile = (id: string, z: number, x = 0) => actors.add(new FakeActor(id, 'hostile', x, z));
  return { cb, actors, damage, projectiles, swing, hostile, fx, toast, marks, learned, held, bolts: () => bolts, setBolts: (n: number) => (bolts = n), advance: (s: number) => (now += s) };
}

const melee = (attackId: string): ModifiableRequest =>
  ({ attackerId: 'player', targetId: 'e', amount: 10, poise: 10, kind: 'melee', attackId, outcome: 'hit' }) as ModifiableRequest;

describe('Crossbow shots', () => {
  let r: ReturnType<typeof rig>;
  beforeEach(() => {
    r = rig();
  });

  it('single shot: one bolt, base damage and attack-1 poise through the normal melee path', () => {
    r.hostile('e', 8);
    r.swing(0);
    expect(r.damage.applied).toHaveLength(1);
    expect(r.damage.applied[0]).toMatchObject({ attackerId: 'player', targetId: 'e', amount: PF.baseDamage, poise: 10, kind: 'melee', attackId: 'pathfinder.bolt.1' });
    expect(r.damage.applied[0].direction).toMatchObject({ x: 0, z: 1 });
    expect(r.bolts()).toBe(19);
  });

  it('aimed shot hits for 1.5x and spends one bolt', () => {
    r.hostile('e', 8);
    r.swing(1);
    expect(r.damage.applied[0].amount).toBeCloseTo(PF.baseDamage * 1.5);
    expect(r.bolts()).toBe(19);
  });

  it('rapid volley: three bolts at 0.6x with 10 poise each (30 in all), fanned 3 degrees', () => {
    r.hostile('mid', 8);
    r.hostile('left', 8, 0.5);
    r.hostile('right', 8, -0.5);
    r.swing(2);
    const hits = r.damage.applied.filter((q) => q.kind === 'melee');
    expect(hits).toHaveLength(3);
    for (const h of hits) expect(h).toMatchObject({ amount: PF.baseDamage * 0.6, poise: 10 });
    expect(hits.reduce((n, h) => n + h.poise, 0)).toBe(30);
    expect(r.bolts()).toBe(17);
  });

  it('rapid volley with two bolts left fires two and then stops without a dry strike', () => {
    r.setBolts(2);
    r.hostile('e', 8);
    r.swing(2);
    expect(r.bolts()).toBe(0);
    expect(r.projectiles.liveCount).toBe(0);
    expect(r.fx.shot).toHaveBeenCalledTimes(2);
    // The swing began armed, so the crossbow's own sweep stays cancelled even after the last bolt.
    const req = melee('2H_Ranged_Shooting');
    r.setBolts(3);
    r.cb.swingStarted(2);
    r.setBolts(0);
    r.cb.cancelMelee(req);
    expect(req.outcome).toBe('immune');
  });

  it('area shot bursts at the impact: others in 3 m take 0.6x, the direct target does not take it twice', () => {
    r.hostile('direct', 8);
    r.hostile('near', 8, 2);
    r.hostile('far', 8, 6);
    r.swing(3);
    const by = (id: string) => r.damage.applied.filter((q) => q.targetId === id);
    expect(by('direct')).toHaveLength(1);
    expect(by('direct')[0]).toMatchObject({ amount: PF.baseDamage * 0.8, poise: 15, kind: 'melee' });
    expect(by('near')).toHaveLength(1);
    expect(by('near')[0]).toMatchObject({ amount: PF.baseDamage * 0.8 * PF.blast.scale, kind: 'spell' });
    expect(by('far')).toHaveLength(0);
  });

  it('area shot bursts where it lands when nobody is hit (range end)', () => {
    r.hostile('e', PF.bolt.range - 1.5);
    r.hostile('out', 60);
    r.swing(3);
    expect(r.damage.applied.map((q) => q.targetId)).toContain('e');
  });

  it('a bolt past its range expires with no damage', () => {
    r.hostile('far', PF.bolt.range + 6);
    r.swing(0, 1.5);
    expect(r.damage.applied).toHaveLength(0);
    expect(r.bolts()).toBe(19);
    expect(r.fx.tracer).toHaveBeenCalled();
  });

  it('never hits allies, the dead or the caster', () => {
    r.actors.add(new FakeActor('ally', 'ally', 0, 4));
    r.actors.add(new FakeActor('dead', 'hostile', 0, 5)).kill();
    r.swing(0);
    expect(r.damage.applied).toHaveLength(0);
  });
});

describe('Steady Shot and Piercing Bolt', () => {
  it('Steady Shot adds 25% only when learned and attack 1 is still held at the release', () => {
    for (const [learned, held, want] of [[true, true, 1.25], [true, false, 1], [false, true, 1]] as const) {
      const r = rig({ learned: learned ? ['pathfinder.steadyShot'] : [], held });
      r.hostile('e', 8);
      r.swing(0);
      expect(r.damage.applied[0].amount).toBeCloseTo(PF.baseDamage * want);
    }
  });

  it('Steady Shot does not touch the aimed shot', () => {
    const r = rig({ learned: ['pathfinder.steadyShot'], held: true });
    r.hostile('e', 8);
    r.swing(1);
    expect(r.damage.applied[0].amount).toBeCloseTo(PF.baseDamage * 1.5);
  });

  it('Piercing Bolt hits two enemies, the second for 70%, and a third not at all', () => {
    const r = rig({ learned: ['pathfinder.piercingBolt'] });
    r.hostile('a', 6);
    r.hostile('b', 9);
    r.hostile('c', 12);
    r.swing(0);
    const dmg = (id: string) => r.damage.applied.find((q) => q.targetId === id)?.amount;
    expect(dmg('a')).toBeCloseTo(PF.baseDamage);
    expect(dmg('b')).toBeCloseTo(PF.baseDamage * PF.pierce.secondScale);
    expect(dmg('c')).toBeUndefined();
  });

  it('without Piercing Bolt the first enemy stops the bolt', () => {
    const r = rig();
    r.hostile('a', 6);
    r.hostile('b', 9);
    r.swing(0);
    expect(r.damage.applied.map((q) => q.targetId)).toEqual(['a']);
  });
});

describe('ammunition', () => {
  it('with no bolts the swing is a stock-butt: no projectile, hint toast once, tracer hits at 40%', () => {
    const r = rig({ bolts: 0 });
    r.hostile('e', 8);
    r.swing(0);
    expect(r.damage.applied).toHaveLength(0);
    expect(r.fx.shot).not.toHaveBeenCalled();
    expect(r.toast).toHaveBeenCalledWith('pathfinder.noBolts');
    r.swing(0);
    expect(r.toast).toHaveBeenCalledTimes(1);
    const req = melee('2H_Ranged_Shoot');
    r.cb.swingStarted(0);
    r.cb.cancelMelee(req);
    expect(req).toMatchObject({ outcome: 'hit', amount: 10 * PF.dryScale, poise: 10 * PF.dryScale });
  });

  it('with bolts the crossbow sweep is voided so the bolt is the only damage', () => {
    const r = rig();
    r.cb.swingStarted(0);
    const req = melee('2H_Ranged_Shoot');
    r.cb.cancelMelee(req);
    expect(req).toMatchObject({ outcome: 'immune', amount: 0, poise: 0 });
  });

  it('leaves other attackers, other attack ids and other kinds alone', () => {
    const r = rig();
    r.cb.swingStarted(0);
    const others: ModifiableRequest[] = [
      { ...melee('2H_Ranged_Shoot'), attackerId: 'someone' },
      melee('1H_Melee_Attack_Chop'),
      { ...melee('2H_Ranged_Shoot'), kind: 'spell' },
      melee('pathfinder.bolt.1'),
    ];
    for (const q of others) {
      r.cb.cancelMelee(q);
      expect(q).toMatchObject({ outcome: 'hit', amount: 10 });
    }
  });

  it('plays unlimited, with no hint, while the item is not defined yet', () => {
    const r = rig({ limited: false, bolts: 0 });
    r.hostile('e', 8);
    r.swing(0);
    expect(r.damage.applied).toHaveLength(1);
    expect(r.toast).not.toHaveBeenCalled();
  });

  it('the hint repeats after its quiet period', () => {
    const r = rig({ bolts: 0 });
    r.swing(0);
    r.advance(10);
    r.swing(0);
    expect(r.toast).toHaveBeenCalledTimes(2);
  });
});

describe('weak points', () => {
  it('the first bolt on a marked enemy adds poise and uses the mark up', () => {
    const r = rig();
    r.hostile('e', 8);
    r.marks.cast({ x: 0, y: 0, z: 0 });
    expect(r.marks.isMarked('e')).toBe(true);
    r.swing(0);
    expect(r.damage.applied[0].poise).toBe(10 + PF.falconEye.weakPoise);
    expect(r.damage.applied[0].amount).toBe(PF.baseDamage);
    expect(r.marks.isMarked('e')).toBe(false);
    r.swing(0);
    expect(r.damage.applied[1].poise).toBe(10);
  });
});

describe('regressions from review', () => {
  it('the area shot with Piercing does not burst on the enemy it already passed through', () => {
    const r = rig({ learned: ['pathfinder.piercingBolt'] });
    r.hostile('first', 6);
    r.hostile('second', 8);
    r.swing(3);
    const by = (id: string) => r.damage.applied.filter((q) => q.targetId === id);
    expect(by('first')).toHaveLength(1);
    expect(by('second')).toHaveLength(1);
  });

  it('a marked bolt never reaches the heavy-blow poise (30)', () => {
    for (const s of SHOTS) expect(s.poise + PF.falconEye.weakPoise).toBeLessThan(30);
  });

  it('a silent clear leaves an area bolt in flight harmless', () => {
    const r = rig();
    r.hostile('e', 30);
    r.cb.swingStarted(3);
    r.cb.progress(0, 0.8);
    r.projectiles.clear(true);
    for (let i = 0; i < 90; i++) r.projectiles.update(DT);
    expect(r.damage.applied).toHaveLength(0);
  });
});

describe('release timing', () => {
  it('every release phase is inside its shot clip and fires exactly once per crossing', () => {
    for (const spec of SHOTS) {
      for (const p of spec.releases) expect(p).toBeGreaterThan(0);
      expect([...spec.releases].sort((a, b) => a - b)).toEqual(spec.releases);
    }
    const r = rig();
    r.hostile('e', 8);
    r.cb.swingStarted(0);
    r.cb.progress(0, 0.64);
    expect(r.fx.shot).not.toHaveBeenCalled();
    r.cb.progress(0.64, 0.66);
    r.cb.progress(0.66, 0.7);
    expect(r.fx.shot).toHaveBeenCalledTimes(1);
  });

  it('a swing that was never started fires nothing, and dispose silences landing bolts', () => {
    const r = rig();
    r.hostile('e', 8);
    r.cb.progress(0, 1);
    expect(r.fx.shot).not.toHaveBeenCalled();
    r.cb.swingStarted(0);
    r.cb.progress(0, 0.7);
    r.cb.dispose();
    for (let i = 0; i < 90; i++) r.projectiles.update(DT);
    expect(r.damage.applied).toHaveLength(0);
  });
});
