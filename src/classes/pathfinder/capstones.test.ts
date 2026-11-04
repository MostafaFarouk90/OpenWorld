import { describe, expect, it } from 'vitest';
import type { DamageRequest } from '../../actors/DamageResolver';
import type { StatusSpec } from '../../actors/status';
import { PLAYER } from '../../config/constants';
import { ACT3_HOLES } from '../../region/act3Containment';
import { SUMMIT_BOX } from '../../region/areas';
import { Containment } from '../../region/containment';
import { engineBox } from '../../region/regions';
import { ProjectileSystem } from '../../spells/Projectile';
import { FakeActor, FakeActors, FakeDamage } from '../../spells/testHost';
import { Ammo } from './Ammo';
import { CAPSTONE_ATTACK_IDS, DragonbaneBolt, HuntersWeb, SkyhawkStrike, YieldFloor, type LeapLike } from './capstones';
import { Marks } from './Marks';
import type { BoltLaunchSpec, BoltTools } from './pathfinder.plugin';
import type { FoeView } from './skills.act3';
import { PF } from './tuning';

const DT = 1 / 60;
type V3 = { x: number; y: number; z: number };

/** The shared gate switches of a rig. */
const gates = () => ({ pathfinder: true, learned: true, blocked: null as string | null });

// ---- Dragonbane Bolt ------------------------------------------------------------------------------------------------------

function boltRig(opts: { bolts?: number; master?: number; walls?: Array<{ z: number }> } = {}) {
  const g = gates();
  const player = new FakeActor('player', 'player');
  const actors = new FakeActors(player);
  const damage = new FakeDamage(actors);
  const wallZ = opts.walls?.[0]?.z;
  const projectiles = new ProjectileSystem({
    actors,
    ...(wallZ !== undefined
      ? { rayCast: (o: V3, d: V3, max: number) => (d.z > 0 && wallZ > o.z && (wallZ - o.z) / d.z <= max ? { point: { x: o.x + d.x * ((wallZ - o.z) / d.z), y: o.y + d.y * ((wallZ - o.z) / d.z), z: wallZ } } : null) }
      : {}),
  });
  let bolts = opts.bolts ?? 5;
  let master = opts.master ?? 0;
  const ammo = new Ammo({
    itemKnown: () => true,
    count: () => bolts,
    remove: (n) => (bolts >= n ? ((bolts -= n), true) : false),
    masterCount: () => master,
    masterRemove: (n) => (master >= n ? ((master -= n), true) : false),
  });
  let now = 0;
  const marks = new Marks({ actors, now: () => now, added: () => {}, removed: () => {} });
  const effects: Array<{ id: string; at: V3; yaw: number; params: Record<string, number> }> = [];
  const shakes: Array<[number, number]> = [];
  const hitStops: number[] = [];
  const triggers: string[] = [];
  let aim: V3 = { x: 0, y: 0, z: 1 };
  let launcher = true;
  const launches: BoltLaunchSpec[] = [];
  // The same launch the Pathfinder plugin's `launchBolt` makes.
  const launch = (spec: BoltLaunchSpec) => {
    if (!launcher) return null;
    launches.push(spec);
    let m = false;
    if (spec.ammo) {
      if (!ammo.take()) return { ok: false as const, reason: 'no-ammo' as const };
      m = ammo.lastWasMaster;
    }
    const tools: BoltTools = { master: m, markPoise: (id) => marks.consume(id) };
    const ok = projectiles.launch({
      casterId: 'player',
      origin: spec.origin,
      direction: spec.direction,
      speed: spec.speed,
      lifetime: spec.lifetime,
      radius: spec.radius,
      pierce: spec.pierce,
      hostileOnly: true,
      onPass: spec.onPass ? (h) => spec.onPass?.(h, tools) : undefined,
      onHit: (r) => spec.onHit(r, tools),
    });
    return ok ? { ok: true as const, master: m } : { ok: false as const, reason: 'refused' as const };
  };
  const bolt = new DragonbaneBolt({
    playerId: () => 'player',
    isPathfinder: () => g.pathfinder,
    learned: () => g.learned,
    blockedReason: () => g.blocked,
    now: () => now,
    feet: () => ({ x: 0, y: 0, z: 0 }),
    facingYaw: () => 0,
    effect: (id, at, yaw, params) => {
      effects.push({ id, at, yaw, params });
      return null;
    },
    reportTrigger: (id) => void triggers.push(id),
    muzzle: () => ({ x: 0, y: 1.3, z: 0 }),
    aim: () => aim,
    launch,
    mercy: (id) => (actors.get(id) as unknown as { mercy?: string } | undefined)?.mercy,
    apply: (req) => damage.apply(req as never) as never,
    shake: (a, s) => void shakes.push([a, s]),
    hitStop: (s) => void hitStops.push(s),
  });
  const foe = (id: string, z: number, x = 0, mercy?: string) => {
    const a = actors.add(new FakeActor(id, 'hostile', x, z));
    (a as unknown as { mercy?: string }).mercy = mercy;
    return a;
  };
  const fly = (seconds = 1) => {
    for (let t = 0; t < seconds; t += DT) projectiles.update(DT);
  };
  return {
    g, bolt, damage, projectiles, actors, marks, foe, fly, effects, shakes, hitStops, triggers, launches,
    bolts: () => bolts, masters: () => master, setAim: (a: V3) => (aim = a), noLauncher: () => (launcher = false),
  };
}

describe('Dragonbane Bolt', () => {
  it('pierces every foe in its line for 4x the bolt base, poise 60, unblockable, and takes one bolt of ammo', () => {
    const r = boltRig();
    for (const [i, z] of [6, 14, 30, 58].entries()) r.foe(`f${i}`, z);
    r.foe('aside', 20, 5);
    expect(r.bolt.cast()).toEqual({ ok: true });
    r.fly();
    expect(r.bolts()).toBe(4);
    const hits = r.damage.applied;
    expect(hits.map((h) => h.targetId)).toEqual(['f0', 'f1', 'f2', 'f3']);
    for (const h of hits) {
      expect(h).toMatchObject({ attackerId: 'player', amount: 56, poise: 60, kind: 'melee', attackId: PF.dragonbane.attackId, unblockable: true });
      expect(h.amount).toBe(PF.baseDamage * 4);
    }
    expect(r.triggers).toEqual([PF.skillIds.dragonbaneBolt]);
  });

  it('reaches 60 m and no farther', () => {
    const r = boltRig();
    r.foe('in', 59);
    r.foe('out', 62);
    r.bolt.cast();
    r.fly(1.5);
    expect(r.damage.applied.map((h) => h.targetId)).toEqual(['in']);
  });

  it('each foe is hit once, not once per tick of the pass', () => {
    const r = boltRig();
    r.foe('a', 10);
    r.bolt.cast();
    r.fly(1.5);
    expect(r.damage.applied).toHaveLength(1);
  });

  it('stops at a wall: foes behind it are not hit, those before it are', () => {
    const r = boltRig({ walls: [{ z: 20 }] });
    r.foe('before', 12);
    r.foe('behind', 30);
    r.bolt.cast();
    r.fly(1.5);
    expect(r.damage.applied.map((h) => h.targetId)).toEqual(['before']);
  });

  it('passes through a foe in a mercy state untouched and hits the one behind it', () => {
    const r = boltRig();
    r.foe('kneeling', 8, 0, 'yielding');
    r.foe('staggered', 12, 0, 'staggered');
    r.foe('clean', 16);
    r.bolt.cast();
    r.fly();
    expect(r.damage.applied.map((h) => h.targetId)).toEqual(['clean']);
  });

  it('a boss takes it like any foe (its shield phase is the boss registry\'s business)', () => {
    const r = boltRig();
    r.foe('boss', 10);
    r.bolt.cast();
    r.fly();
    expect(r.damage.applied).toHaveLength(1);
  });

  it('spends a Falcon Eye mark on the first foe it hits only (+10 poise there), not on a mercy foe passed through', () => {
    const r = boltRig();
    r.foe('mercy', 6, 0, 'yielding');
    const a = r.foe('a', 10);
    const b = r.foe('b', 16);
    r.marks.cast({ x: 0, y: 0, z: 0 });
    expect(r.marks.isMarked(a.id) && r.marks.isMarked(b.id) && r.marks.isMarked('mercy')).toBe(true);
    r.bolt.cast();
    r.fly();
    const [first, second] = r.damage.applied;
    expect(first).toMatchObject({ targetId: 'a', poise: 70 });
    expect(second).toMatchObject({ targetId: 'b', poise: 60 });
    expect(r.marks.isMarked('a')).toBe(false);
    expect(r.marks.isMarked('b')).toBe(true);
    expect(r.marks.isMarked('mercy')).toBe(true);
  });

  it('an unmarked first foe spends no mark on a marked second one', () => {
    const r = boltRig();
    const a = r.foe('a', 10);
    r.foe('b', 16);
    r.marks.cast({ x: 0, y: 0, z: 0 });
    r.marks.consume(a.id);
    r.bolt.cast();
    r.fly();
    expect(r.damage.applied.map((h) => h.poise)).toEqual([60, 60]);
    expect(r.marks.isMarked('b')).toBe(true);
  });

  it('a master bolt is spent first and makes it 10% stronger', () => {
    const r = boltRig({ master: 2 });
    r.foe('a', 10);
    r.bolt.cast();
    r.fly();
    expect(r.masters()).toBe(1);
    expect(r.bolts()).toBe(5);
    expect(r.damage.applied[0].amount).toBeCloseTo(56 * PF.masterBoltScale, 6);
  });

  it('refuses with no ammo and spends nothing: no bolt flies, no effect, no trigger', () => {
    const r = boltRig({ bolts: 0 });
    r.foe('a', 10);
    expect(r.bolt.cast()).toEqual({ ok: false, reason: 'no-ammo' });
    r.fly();
    expect(r.damage.applied).toEqual([]);
    expect(r.effects).toEqual([]);
    expect(r.triggers).toEqual([]);
  });

  it('refuses the wrong class, not learned, dead, staggered, busy and a missing launcher', () => {
    for (const [mutate, reason] of [
      [(g: ReturnType<typeof gates>) => (g.pathfinder = false), 'class'],
      [(g: ReturnType<typeof gates>) => (g.learned = false), 'not-learned'],
      [(g: ReturnType<typeof gates>) => (g.blocked = 'dead'), 'dead'],
      [(g: ReturnType<typeof gates>) => (g.blocked = 'staggered'), 'staggered'],
      [(g: ReturnType<typeof gates>) => (g.blocked = 'busy'), 'busy'],
    ] as const) {
      const r = boltRig();
      mutate(r.g);
      expect(r.bolt.cast()).toEqual({ ok: false, reason });
      expect(r.bolts()).toBe(5);
    }
    const r = boltRig();
    r.noLauncher();
    expect(r.bolt.cast()).toEqual({ ok: false, reason: 'no-launcher' });
    expect(r.bolts()).toBe(5);
  });

  it('aims along the given direction, pitch included', () => {
    const r = boltRig();
    r.setAim({ x: 3, y: 0, z: 4 });
    r.foe('on', 8, 6);
    r.foe('off', 10, 0);
    r.bolt.cast();
    r.fly();
    expect(r.damage.applied.map((h) => h.targetId)).toEqual(['on']);
    // The direction passed on is the unit vector.
    expect(Math.hypot(r.launches[0].direction.x, r.launches[0].direction.y, r.launches[0].direction.z)).toBeCloseTo(1, 9);
  });

  it('effects: a flare at release, the ribbon to where the bolt ended, a shockwave there, a 0.2 s shake and a 100 ms hit-stop', () => {
    const r = boltRig({ walls: [{ z: 30 }] });
    r.foe('a', 10);
    r.bolt.cast();
    expect(r.effects.map((e) => e.id)).toEqual([PF.dragonbane.effectId]);
    expect(r.effects[0].params.flare).toBe(1);
    r.fly(1);
    const ids = r.effects.map((e) => e.id);
    expect(ids).toEqual([PF.dragonbane.effectId, PF.dragonbane.effectId, PF.dragonbane.impactEffectId]);
    expect(r.effects[1].params.length).toBeCloseTo(30 - 0, 0);
    expect(r.effects[2].at.z).toBeCloseTo(30, 3);
    expect(r.shakes).toEqual([[PF.dragonbane.shakeAmplitude, 0.2]]);
    expect(r.hitStops).toEqual([0.1]);
  });

  it('a bolt that expires in the air draws its ribbon but no shockwave, shake or hit-stop', () => {
    const r = boltRig();
    r.bolt.cast();
    r.fly(1.5);
    expect(r.effects.map((e) => e.id)).toEqual([PF.dragonbane.effectId, PF.dragonbane.effectId]);
    expect(r.shakes).toEqual([]);
    expect(r.hitStops).toEqual([]);
  });

  it('reset (class change, load, death, dispose) makes a bolt in flight land as nothing', () => {
    const r = boltRig();
    r.foe('a', 10);
    r.bolt.cast();
    r.fly(0.05);
    r.bolt.reset();
    r.fly(1);
    expect(r.damage.applied).toEqual([]);
    expect(r.effects).toHaveLength(1);
  });
});

// ---- Yield floor ----------------------------------------------------------------------------------------------------------

const mod = (f: YieldFloor) => f.modify as unknown as (r: never, t: never) => void;

describe('Yield floor', () => {
  const target = (health: number) => ({ id: 'foe', health }) as never;
  const req = (over: Partial<DamageRequest> = {}): DamageRequest & { outcome: string } =>
    ({ attackerId: 'player', targetId: 'foe', amount: 56, poise: 60, kind: 'melee', attackId: PF.dragonbane.attackId, outcome: 'hit', ...over }) as never;

  it('cuts a lethal capstone hit on a foe that can yield to leave 1 HP, and leaves a non-lethal one alone', () => {
    const f = new YieldFloor({ playerId: () => 'player', canYield: () => true });
    const lethal = req();
    mod(f)(lethal as never, target(40));
    expect(lethal.amount).toBe(39);
    const exact = req({ amount: 40 });
    mod(f)(exact as never, target(40));
    expect(exact.amount).toBe(39);
    const light = req({ amount: 10 });
    mod(f)(light as never, target(40));
    expect(light.amount).toBe(10);
    const atOne = req();
    mod(f)(atOne as never, target(1));
    expect(atOne.amount).toBe(0);
  });

  it('touches nothing for a foe that cannot yield, another attacker, another attack, or a hit that did not land', () => {
    const none = new YieldFloor({ playerId: () => 'player', canYield: () => false });
    const a = req();
    mod(none)(a as never, target(40));
    expect(a.amount).toBe(56);
    const f = new YieldFloor({ playerId: () => 'player', canYield: () => true });
    for (const over of [{ attackerId: 'foe-2' }, { attackId: 'pathfinder.bolt.1' }, { attackId: undefined }, { outcome: 'blocked' }] as Array<Partial<DamageRequest>>) {
      const q = req(over);
      mod(f)(q as never, target(40));
      expect(q.amount, JSON.stringify(over)).toBe(56);
    }
    expect([...CAPSTONE_ATTACK_IDS].sort()).toEqual([PF.dragonbane.attackId, PF.huntersWeb.attackId, PF.skyhawk.attackId].sort());
  });
});

// ---- Hunter's Web ---------------------------------------------------------------------------------------------------------

function webRig(foes: FoeView[] = [], hooks: { blocked?: (from: V3, to: V3) => boolean; mercy?: (id: string) => string | undefined } = {}) {
  const g = gates();
  let now = 0;
  const feet = { x: 0, y: 0, z: 0 };
  const applied: DamageRequest[] = [];
  const statuses: Array<{ id: string; spec: StatusSpec }> = [];
  const effects: Array<{ id: string; at: V3; params: Record<string, number> }> = [];
  const stops = { n: 0 };
  const shakes: Array<[number, number]> = [];
  const triggers: string[] = [];
  const list = foes;
  const web = new HuntersWeb({
    playerId: () => 'player',
    isPathfinder: () => g.pathfinder,
    learned: () => g.learned,
    blockedReason: () => g.blocked,
    now: () => now,
    feet: () => ({ ...feet }),
    facingYaw: () => 0,
    effect: (id, at, _yaw, params) => {
      effects.push({ id, at, params });
      return () => void stops.n++;
    },
    reportTrigger: (id) => void triggers.push(id),
    foes: () => list,
    status: (id, spec) => (statuses.push({ id, spec }), true),
    apply: (req) => (applied.push(req), null),
    shake: (a, s) => void shakes.push([a, s]),
    blocked: hooks.blocked,
    mercy: hooks.mercy,
  });
  const advance = (seconds: number) => {
    for (let t = 0; t < seconds - 1e-9; t += DT) {
      now += DT;
      web.update();
    }
  };
  return { g, web, applied, statuses, effects, stops, shakes, triggers, list, feet, advance, now: () => now };
}
const foeAt = (id: string, x: number, z: number, over: Partial<FoeView> = {}): FoeView => ({ id, x, y: 0, z, live: true, mercy: 'none', boss: false, ...over });

describe("Hunter's Web: line of sight and mercy re-check", () => {
  it('skips a foe behind a wall (chest to chest from the ring centre); with only such foes the press is refused no-target', () => {
    const seen: Array<[V3, V3]> = [];
    const r = webRig([foeAt('open', 4, 0), foeAt('walled', -4, 0)], { blocked: (a, b) => (seen.push([a, b]), b.x < 0) });
    expect(r.web.cast()).toEqual({ ok: true });
    r.advance(1);
    expect(r.applied.map((q) => q.targetId)).toEqual(['open']);
    expect(r.statuses.map((s) => s.spec.kind)).toEqual(['root']);
    expect(seen.some(([a, b]) => a.y === PF.skyhawk.chestHeight && b.y === PF.skyhawk.chestHeight)).toBe(true);
    const all = webRig([foeAt('walled', -4, 0)], { blocked: () => true });
    expect(all.web.cast()).toEqual({ ok: false, reason: 'no-target' });
  });

  it('a foe the hit put into a mercy state is damaged but neither rooted nor slowed (a boss slow too)', () => {
    const now: Record<string, string | undefined> = {};
    const r = webRig([foeAt('knee', 3, 0), foeAt('boss', 0, -5, { boss: true }), foeAt('ok', -3, 0)], { mercy: (id) => now[id] });
    r.web.cast();
    now.knee = 'yielding';
    now.boss = 'yielding';
    r.advance(1);
    expect(r.applied).toHaveLength(3);
    expect(r.statuses.map((s) => [s.id, s.spec.id])).toEqual([['ok', 'pathfinder.huntersWeb.root']]);
  });
});

describe("Hunter's Web", () => {
  it('arms for 1 s and then pops at once: every foe inside takes 0.8x base, poise 30, and a 4 s root', () => {
    const r = webRig([foeAt('a', 3, 0), foeAt('b', 0, -9), foeAt('c', -11, 0)]);
    expect(r.web.cast()).toEqual({ ok: true });
    expect(r.web.armed).toBe(true);
    expect(r.effects[0]).toMatchObject({ id: PF.huntersWeb.effectId, params: { seconds: 1, radius: 12 } });
    r.advance(0.9);
    expect(r.applied).toEqual([]);
    expect(r.statuses).toEqual([]);
    r.advance(0.1);
    expect(r.applied.map((q) => q.targetId)).toEqual(['a', 'b', 'c']);
    for (const q of r.applied) expect(q).toMatchObject({ attackerId: 'player', amount: PF.baseDamage * 0.8, poise: 30, kind: 'spell', attackId: PF.huntersWeb.attackId });
    expect(r.applied[0].amount).toBeCloseTo(11.2, 9);
    expect(r.statuses).toHaveLength(3);
    for (const s of r.statuses) expect(s.spec).toMatchObject({ id: 'pathfinder.huntersWeb.root', kind: 'root', seconds: 4, sourceId: 'player' });
    expect(r.web.armed).toBe(false);
    expect(r.effects.map((e) => e.id)).toEqual([PF.huntersWeb.effectId, PF.huntersWeb.popEffectId]);
    expect(r.effects[1].params.hits).toBe(3);
    expect(r.shakes).toHaveLength(1);
    expect(r.triggers).toEqual([PF.skillIds.huntersWeb]);
  });

  it('the ring is 12 m from where she stood at the cast (inclusive at the edge), fixed while armed, and 6 m deep', () => {
    const r = webRig([foeAt('edge', 12, 0), foeAt('past', 12.01, 0), foeAt('high', 0, 5, { y: 6.5 })]);
    r.web.cast();
    // She walks away: the ring stays where it was laid.
    r.feet.x = 20;
    r.advance(1);
    expect(r.applied.map((q) => q.targetId)).toEqual(['edge']);
    expect(r.web.centre).toBeNull();
  });

  it('the pop reads the foes where they stand then: one that walked in is caught, one that walked out is not', () => {
    const walker = foeAt('walker', 30, 0);
    const leaver = foeAt('leaver', 5, 0);
    const r = webRig([foeAt('anchor', 2, 0), walker, leaver]);
    r.web.cast();
    r.advance(0.5);
    walker.x = 8;
    leaver.x = 40;
    r.advance(0.5);
    expect(r.applied.map((q) => q.targetId)).toEqual(['anchor', 'walker']);
  });

  it('skips foes in a mercy state or not live, and a boss takes the damage and a 0.5 slow for 4 s instead of the root', () => {
    const r = webRig([foeAt('clean', 3, 0), foeAt('kneel', 4, 0, { mercy: 'yielding' }), foeAt('calm', 4, 1, { mercy: 'calming' }), foeAt('dead', 5, 0, { live: false }), foeAt('boss', 6, 0, { boss: true })]);
    r.web.cast();
    r.advance(1);
    expect(r.applied.map((q) => q.targetId)).toEqual(['clean', 'boss']);
    const boss = r.statuses.find((s) => s.id === 'boss')!;
    expect(boss.spec).toMatchObject({ id: 'pathfinder.huntersWeb.slow', kind: 'slow', slow: 0.5, seconds: 4 });
    expect(r.statuses.some((s) => s.spec.kind === 'root' && s.id === 'boss')).toBe(false);
    expect(r.statuses.find((s) => s.id === 'clean')!.spec.kind).toBe('root');
  });

  it('refuses no-target (nothing spent) with no live non-mercy hostile within 12 m', () => {
    const r = webRig([foeAt('far', 12.5, 0), foeAt('kneel', 3, 0, { mercy: 'yielding' }), foeAt('dead', 2, 0, { live: false })]);
    expect(r.web.cast()).toEqual({ ok: false, reason: 'no-target' });
    expect(r.web.armed).toBe(false);
    expect(r.effects).toEqual([]);
    expect(r.triggers).toEqual([]);
  });

  it('refuses the wrong class, not learned, dead, staggered and busy, and a second web while one is armed', () => {
    for (const [mutate, reason] of [
      [(g: ReturnType<typeof gates>) => (g.pathfinder = false), 'class'],
      [(g: ReturnType<typeof gates>) => (g.learned = false), 'not-learned'],
      [(g: ReturnType<typeof gates>) => (g.blocked = 'dead'), 'dead'],
      [(g: ReturnType<typeof gates>) => (g.blocked = 'staggered'), 'staggered'],
      [(g: ReturnType<typeof gates>) => (g.blocked = 'busy'), 'busy'],
    ] as const) {
      const r = webRig([foeAt('a', 3, 0)]);
      mutate(r.g);
      expect(r.web.cast()).toEqual({ ok: false, reason });
    }
    const r = webRig([foeAt('a', 3, 0)]);
    r.web.cast();
    expect(r.web.cast()).toEqual({ ok: false, reason: 'active' });
  });

  it('the armed ring ends unpopped on death, unlearning, a class change, a load (end) and dispose', () => {
    const ends: Array<(r: ReturnType<typeof webRig>) => void> = [
      (r) => (r.g.blocked = 'dead'),
      (r) => (r.g.learned = false),
      (r) => (r.g.pathfinder = false),
      (r) => r.web.end(),
    ];
    for (const end of ends) {
      const r = webRig([foeAt('a', 3, 0)]);
      r.web.cast();
      r.advance(0.5);
      end(r);
      r.advance(1);
      expect(r.applied).toEqual([]);
      expect(r.statuses).toEqual([]);
      expect(r.web.armed).toBe(false);
      expect(r.stops.n).toBe(1);
    }
  });

  it('a staggered or busy Pathfinder still sees the ring pop (only death and unlearning end it)', () => {
    const r = webRig([foeAt('a', 3, 0)]);
    r.web.cast();
    r.g.blocked = 'staggered';
    r.advance(1);
    expect(r.applied).toHaveLength(1);
  });

  it('is not a trap: it holds nothing between casts and can be cast again after the pop', () => {
    const r = webRig([foeAt('a', 3, 0)]);
    r.web.cast();
    r.advance(1);
    expect(r.web.cast()).toEqual({ ok: true });
  });
});

// ---- Skyhawk Strike -------------------------------------------------------------------------------------------------------

interface SkyOpts {
  foes?: FoeView[];
  /** Ground height at (x, z); null = no ground. Default flat at 0. */
  ground?: (x: number, z: number) => number | null;
  isOpen?: (x: number, z: number) => boolean;
  interiorAt?: (p: V3) => string | null;
  feet?: V3;
  yaw?: number;
  clamp?: (at: { x: number; z: number }) => { x: number; z: number };
}

function skyRig(o: SkyOpts = {}) {
  const g = gates();
  let now = 0;
  const w = { mode: 'walk', mounted: false, lock: null as string | null, blockedLos: false, leapRefuse: false, noInvuln: false, blockedZ: null as number | null, mercyNow: {} as Record<string, string | undefined> };
  const feet = o.feet ?? { x: 0, y: 0, z: 0 };
  const list = o.foes ?? [];
  const applied: DamageRequest[] = [];
  const statuses: Array<{ id: string; spec: StatusSpec }> = [];
  const effects: Array<{ id: string; at: V3 }> = [];
  const leaps: Array<{ yaw: number; distance: number; apex: number; maxSeconds: number }> = [];
  const handles: Array<LeapLike & { active: boolean; cancels: number }> = [];
  const invuln = { granted: 0, released: 0 };
  const dives: Array<{ from: V3; to: V3; seconds: number }> = [];
  const carry = { started: 0, stopped: 0 };
  const warns: string[] = [];
  const samples: Array<[number, number]> = [];
  const triggers: string[] = [];
  const sky = new SkyhawkStrike({
    playerId: () => 'player',
    isPathfinder: () => g.pathfinder,
    learned: () => g.learned,
    blockedReason: () => g.blocked,
    now: () => now,
    feet: () => ({ ...feet }),
    facingYaw: () => o.yaw ?? 0,
    effect: (id, at) => (effects.push({ id, at }), null),
    reportTrigger: (id) => void triggers.push(id),
    foes: () => list,
    lockTarget: () => w.lock,
    blocked: (_f, to) => w.blockedLos && (w.blockedZ === null || Math.abs(to.z - w.blockedZ) < 1e-6),
    mode: () => w.mode,
    mounted: () => w.mounted,
    isOpen: (x, z) => (samples.push([x, z]), (o.isOpen ?? (() => true))(x, z)),
    clamp: o.clamp ?? ((at) => at),
    interiorAt: o.interiorAt ?? (() => null),
    raycast: (origin, _dir, max) => {
      const y = (o.ground ?? (() => 0))(origin.x, origin.z);
      if (y === null) return null;
      const distance = origin.y - y;
      return distance >= 0 && distance <= max ? { distance, point: { x: origin.x, y, z: origin.z } } : null;
    },
    // The arc meets the terrain when a point of the segment is under the ground profile (a face is a step in it).
    arcBlocked: (from, to) => {
      const len = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
      const n = Math.max(1, Math.ceil(len / 0.1));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const gy = (o.ground ?? (() => 0))(from.x + (to.x - from.x) * t, from.z + (to.z - from.z) * t);
        if (gy !== null && from.y + (to.y - from.y) * t < gy - 1e-6) return true;
      }
      return false;
    },
    mercy: (id) => w.mercyNow[id],
    leap: (opts) => {
      if (w.leapRefuse) return null;
      leaps.push(opts);
      const h = { active: true, landed: false, cancels: 0, cancel() { h.active = false; h.cancels++; } };
      handles.push(h);
      return h;
    },
    invulnerable: () => {
      if (w.noInvuln) return null;
      invuln.granted++;
      let released = false;
      return () => {
        if (!released) {
          released = true;
          invuln.released++;
        }
      };
    },
    apply: (req) => (applied.push(req), null),
    status: (id, spec) => (statuses.push({ id, spec }), true),
    isBoss: (id) => list.find((f) => f.id === id)?.boss === true,
    dive: (from, to, seconds) => void dives.push({ from, to, seconds }),
    clearDive: () => {},
    carryEffect: () => (carry.started++, () => void carry.stopped++),
    warn: (m) => void warns.push(m),
  });
  const advance = (seconds: number) => {
    for (let t = 0; t < seconds - 1e-9; t += DT) {
      now += DT;
      sky.update();
    }
  };
  return { g, w, sky, feet, list, applied, statuses, effects, leaps, handles, invuln, dives, carry, warns, samples, triggers, advance };
}

describe('Skyhawk Strike: the strike', () => {
  it('stoops on the nearest foe in the front cone, lands 0.3 s later for 2.5x base, poise 50 and a 1 s stun', () => {
    const r = skyRig({ foes: [foeAt('near', 0, -10), foeAt('far', 0, -20), foeAt('behind', 0, 5)] });
    expect(r.sky.cast()).toEqual({ ok: true });
    expect(r.dives).toHaveLength(1);
    expect(r.dives[0].seconds).toBe(0.3);
    expect(r.dives[0].to.z).toBe(-10);
    expect(r.applied).toEqual([]);
    r.advance(0.25);
    expect(r.applied).toEqual([]);
    r.advance(0.06);
    expect(r.applied).toHaveLength(1);
    expect(r.applied[0]).toMatchObject({ attackerId: 'player', targetId: 'near', amount: 35, poise: 50, kind: 'melee', attackId: PF.skyhawk.attackId });
    expect(r.applied[0].amount).toBe(PF.baseDamage * 2.5);
    expect(r.statuses).toEqual([{ id: 'near', spec: { id: PF.skyhawk.stunStatusId, kind: 'stun', seconds: 1, sourceId: 'player' } }]);
    expect(r.effects.map((e) => e.id)).toContain(PF.skyhawk.impactEffectId);
    expect(r.triggers).toEqual([PF.skillIds.skyhawkStrike]);
    expect(r.sky.striking).toBe(false);
  });

  it('a boss takes the damage and the poise but never the stun', () => {
    const r = skyRig({ foes: [foeAt('boss', 0, -10, { boss: true })] });
    r.sky.cast();
    r.advance(0.4);
    expect(r.applied).toHaveLength(1);
    expect(r.applied[0].poise).toBe(50);
    expect(r.statuses).toEqual([]);
  });

  it('the lock-on target is chosen over a nearer foe, even outside the cone, within 25 m and in sight', () => {
    const r = skyRig({ foes: [foeAt('near', 0, -4), foeAt('locked', 0, 18)] });
    r.w.lock = 'locked';
    r.sky.cast();
    r.advance(0.4);
    expect(r.applied.map((q) => q.targetId)).toEqual(['locked']);
    // Behind her: the landing is on her side of it, back along the line to the foe.
    expect(Math.abs(r.leaps[0].yaw)).toBeCloseTo(Math.PI, 6);
  });

  it('a lock-on target out of range, dead, in a mercy state or out of sight falls back to the nearest cone foe', () => {
    for (const make of [
      () => foeAt('locked', 0, -26),
      () => foeAt('locked', 0, -8, { live: false }),
      () => foeAt('locked', 0, -8, { mercy: 'yielding' }),
    ]) {
      const r = skyRig({ foes: [make(), foeAt('other', 5, -9)] });
      r.w.lock = 'locked';
      r.sky.cast();
      r.advance(0.4);
      expect(r.applied.map((q) => q.targetId)).toEqual(['other']);
    }
    const r = skyRig({ foes: [foeAt('locked', 0, -8)] });
    r.w.lock = 'locked';
    r.w.blockedLos = true;
    r.w.blockedZ = -8;
    // Out of sight: no foe at all, so the gap crossing.
    r.sky.cast();
    r.advance(0.4);
    expect(r.applied).toEqual([]);
    expect(r.leaps).toHaveLength(1);
  });

  it('range 25 m inclusive, cone 45 degrees either side inclusive, nothing beyond', () => {
    const edge = skyRig({ foes: [foeAt('at25', 0, -25)] });
    edge.sky.cast();
    edge.advance(0.4);
    expect(edge.applied).toHaveLength(1);
    const past = skyRig({ foes: [foeAt('at26', 0, -25.5)] });
    past.sky.cast();
    past.advance(0.4);
    expect(past.applied).toEqual([]);
    const cone = skyRig({ foes: [foeAt('diag', 10, -10)] });
    cone.sky.cast();
    cone.advance(0.4);
    expect(cone.applied).toHaveLength(1);
    const wide = skyRig({ foes: [foeAt('wide', 10.2, -10)] });
    wide.sky.cast();
    wide.advance(0.4);
    expect(wide.applied).toEqual([]);
  });

  it('skips foes in a mercy state, dead foes and foes behind terrain', () => {
    const r = skyRig({ foes: [foeAt('kneel', 0, -5, { mercy: 'yielding' }), foeAt('staggered', 0, -6, { mercy: 'staggered' }), foeAt('dead', 0, -7, { live: false }), foeAt('good', 0, -12)] });
    r.sky.cast();
    r.advance(0.4);
    expect(r.applied.map((q) => q.targetId)).toEqual(['good']);
    const blocked = skyRig({ foes: [foeAt('a', 0, -5)] });
    blocked.w.blockedLos = true;
    blocked.sky.cast();
    blocked.advance(0.4);
    expect(blocked.applied).toEqual([]);
  });

  it('a foe that died or went to mercy in the 0.3 s of the dive is left alone', () => {
    const a = foeAt('a', 0, -10);
    const r = skyRig({ foes: [a] });
    r.sky.cast();
    r.advance(0.1);
    a.mercy = 'yielding';
    r.advance(0.3);
    expect(r.applied).toEqual([]);
    expect(r.statuses).toEqual([]);
    const b = foeAt('b', 0, -10);
    const s = skyRig({ foes: [b] });
    s.sky.cast();
    b.live = false;
    s.advance(0.4);
    expect(s.applied).toEqual([]);
  });

  it('is refused in every non-walk movement mode and in the saddle, spending nothing', () => {
    for (const mode of ['glide', 'dive', 'ferry', 'haul']) {
      const r = skyRig({ foes: [foeAt('a', 0, -10)] });
      r.w.mode = mode;
      expect(r.sky.cast(), mode).toEqual({ ok: false, reason: 'movement' });
      expect(r.leaps).toEqual([]);
      expect(r.dives).toEqual([]);
      expect(r.triggers).toEqual([]);
    }
    const m = skyRig({ foes: [foeAt('a', 0, -10)] });
    m.w.mounted = true;
    expect(m.sky.cast()).toEqual({ ok: false, reason: 'mounted' });
  });

  it('is refused for the wrong class, not learned, dead, staggered and busy, and while a strike or carry is running', () => {
    for (const [mutate, reason] of [
      [(g: ReturnType<typeof gates>) => (g.pathfinder = false), 'class'],
      [(g: ReturnType<typeof gates>) => (g.learned = false), 'not-learned'],
      [(g: ReturnType<typeof gates>) => (g.blocked = 'dead'), 'dead'],
      [(g: ReturnType<typeof gates>) => (g.blocked = 'staggered'), 'staggered'],
      [(g: ReturnType<typeof gates>) => (g.blocked = 'busy'), 'busy'],
    ] as const) {
      const r = skyRig({ foes: [foeAt('a', 0, -10)] });
      mutate(r.g);
      expect(r.sky.cast()).toEqual({ ok: false, reason });
    }
    const r = skyRig({ foes: [foeAt('a', 0, -10)] });
    r.sky.cast();
    expect(r.sky.cast()).toEqual({ ok: false, reason: 'active' });
  });
});

describe('Skyhawk Strike: the carry', () => {
  it('lifts her along a leap to 2 m short of the target on her side, invulnerable until she lands', () => {
    const r = skyRig({ foes: [foeAt('a', 0, -10)] });
    r.sky.cast();
    expect(r.leaps).toHaveLength(1);
    expect(r.leaps[0].yaw).toBeCloseTo(0, 9);
    expect(landing(r.leaps[0])).toBeCloseTo(8, 6);
    expect(r.invuln).toEqual({ granted: 1, released: 0 });
    expect(r.carry.started).toBe(1);
    expect(r.sky.carrying).toBe(true);
    r.advance(0.5);
    expect(r.invuln.released).toBe(0);
    // She lands.
    r.handles[0].active = false;
    r.advance(DT);
    expect(r.invuln.released).toBe(1);
    expect(r.carry.stopped).toBe(1);
    expect(r.sky.carrying).toBe(false);
    expect(r.handles[0].cancels).toBe(0);
  });

  it('keeps her side: a foe off to the +x side lands her 2 m short along the line to it', () => {
    const r = skyRig({ foes: [foeAt('a', -10, -10)] });
    r.sky.cast();
    expect(r.leaps[0].yaw).toBeCloseTo(Math.atan2(10, 10), 6);
    expect(landing(r.leaps[0])).toBeCloseTo(Math.hypot(10, 10) - 2, 6);
  });

  it('no carry when she is already within 3 m of the foe: the strike still happens', () => {
    const r = skyRig({ foes: [foeAt('a', 0, -2.9)] });
    r.sky.cast();
    r.advance(0.4);
    expect(r.leaps).toEqual([]);
    expect(r.invuln.granted).toBe(0);
    expect(r.applied).toHaveLength(1);
  });

  it('the leap is refused by the core (airborne): the strike still happens, no invulnerability is left', () => {
    const r = skyRig({ foes: [foeAt('a', 0, -10)] });
    r.w.leapRefuse = true;
    expect(r.sky.cast()).toEqual({ ok: true });
    r.advance(0.4);
    expect(r.applied).toHaveLength(1);
    expect(r.invuln.granted).toBe(0);
    expect(r.sky.carrying).toBe(false);
  });

  it('a landing 5 m higher rises with a taller arc and still lands at the planned metre; 12 m is allowed, 12.01 is not', () => {
    const r = skyRig({ foes: [foeAt('a', 0, -10)], ground: (_x, z) => (z <= -7 ? 5 : 0) });
    r.sky.cast();
    expect(r.leaps).toHaveLength(1);
    expect(r.leaps[0].apex).toBeGreaterThan(5);
    expect(landing(r.leaps[0], 5)).toBeCloseTo(8, 6);
    const ok = skyRig({ foes: [foeAt('a', 0, -10)], ground: (_x, z) => (z <= -7 ? 12 : 0) });
    ok.sky.cast();
    expect(ok.leaps).toHaveLength(1);
    const high = skyRig({ foes: [foeAt('a', 0, -10)], ground: (_x, z) => (z <= -7 ? 12.01 : 0) });
    high.sky.cast();
    expect(high.leaps).toEqual([]);
  });

  it('a landing 6 m lower is allowed, 6.01 m is a fall and is skipped', () => {
    const ok = skyRig({ foes: [foeAt('a', 0, -10)], ground: (_x, z) => (z <= -2 ? -6 : 0) });
    ok.sky.cast();
    expect(ok.leaps).toHaveLength(1);
    expect(landing(ok.leaps[0], -6)).toBeCloseTo(8, 6);
    const fall = skyRig({ foes: [foeAt('a', 0, -10)], ground: (_x, z) => (z <= -7 ? -6.01 : 0) });
    fall.sky.cast();
    fall.advance(0.4);
    expect(fall.leaps).toEqual([]);
    expect(fall.applied).toHaveLength(1);
  });

  it('a ledge with no ground under the landing skips the carry; the strike happens', () => {
    const r = skyRig({ foes: [foeAt('a', 0, -10)], ground: (_x, z) => (z <= -7 ? null : 0) });
    r.sky.cast();
    r.advance(0.4);
    expect(r.leaps).toEqual([]);
    expect(r.invuln.granted).toBe(0);
    expect(r.applied).toHaveLength(1);
  });

  it('a path through a closed area skips the carry, even when the landing is open: every 0.5 m sample is checked', () => {
    // A 0.7 m wide closed strip at z -4.1 .. -3.4 between the start and the landing.
    const r = skyRig({ foes: [foeAt('a', 0, -10)], isOpen: (_x, z) => !(z < -3.4 && z > -4.1) });
    r.sky.cast();
    r.advance(0.4);
    expect(r.leaps).toEqual([]);
    expect(r.applied).toHaveLength(1);
    // The samples were 0.5 m apart along the whole 8 m.
    const zs = [...new Set(r.samples.map(([, z]) => Math.round(z * 100) / 100))].sort((a, b) => b - a);
    expect(zs.slice(0, 4)).toEqual([-0.5, -1, -1.5, -2]);
  });

  it('a landing in a closed area (outside the open area) skips the carry', () => {
    const r = skyRig({ foes: [foeAt('a', 0, -10)], isOpen: (_x, z) => z > -7.5 });
    r.sky.cast();
    expect(r.leaps).toEqual([]);
  });

  it('the summit edge: a landing at z 16900 or beyond skips the carry, 16899.9 is fine', () => {
    expect(PF.skyhawk.maxZ).toBe(SUMMIT_BOX.z1);
    const mk = (foeZ: number) => skyRig({ feet: { x: 0, y: 0, z: 16890 }, yaw: Math.PI, foes: [foeAt('a', 0, foeZ)] });
    const past = mk(16902);
    past.sky.cast();
    // Landing at 16900: refused (the box is exclusive at its max edge; the rule is z < 16900).
    expect(past.leaps).toEqual([]);
    const inside = mk(16901.9);
    inside.sky.cast();
    expect(inside.leaps).toHaveLength(1);
    const beyond = mk(16915);
    beyond.sky.cast();
    expect(beyond.leaps).toEqual([]);
    // The strike happens regardless.
    beyond.advance(0.4);
    expect(beyond.applied).toHaveLength(1);
  });

  it('never into or out of an interior', () => {
    const into = skyRig({ foes: [foeAt('a', 0, -10)], interiorAt: (p) => (p.z < -5 ? 'cave' : null) });
    into.sky.cast();
    into.advance(0.4);
    expect(into.leaps).toEqual([]);
    expect(into.applied).toHaveLength(1);
    const out = skyRig({ feet: { x: 0, y: 0, z: 0 }, foes: [foeAt('a', 0, -10)], interiorAt: (p) => (p.z > -5 ? 'cave' : null) });
    out.sky.cast();
    expect(out.leaps).toEqual([]);
    const within = skyRig({ foes: [foeAt('a', 0, -10)], interiorAt: () => 'cave' });
    within.sky.cast();
    expect(within.leaps).toHaveLength(1);
  });

  it('a landing the containment clamp would move skips the carry', () => {
    const r = skyRig({ foes: [foeAt('a', 0, -10)], clamp: (at) => ({ x: at.x + 0.5, z: at.z }) });
    r.sky.cast();
    expect(r.leaps).toEqual([]);
  });

  it('the real containment: a closed summit hole is cut out of the open area, and an open one is not', () => {
    const flags: Record<string, unknown> = { 'story.gate.a2': true, 'story.d03.complete': true, 'story.gate.a3': true, 'story.phase.dragonspineOpen': true };
    const c = new Containment({ getFlag: (k) => flags[k] }, [], ACT3_HOLES);
    const spine = engineBox('dragonspine');
    expect(spine.z1).toBeGreaterThan(SUMMIT_BOX.z1);
    const x = (SUMMIT_BOX.x0 + SUMMIT_BOX.x1) / 2;
    // From the south side of the hole, a foe inside it.
    const mk = () => skyRig({ feet: { x, y: 0, z: SUMMIT_BOX.z0 - 10 }, yaw: Math.PI, foes: [foeAt('a', x, SUMMIT_BOX.z0 + 12)], isOpen: (px, pz) => c.isOpen(px, pz), clamp: (at) => c.clamp(at) });
    expect(c.closedHoles()).toEqual(['hole.dragonspine.summit']);
    const closed = mk();
    closed.sky.cast();
    expect(closed.leaps).toEqual([]);
    closed.advance(0.4);
    expect(closed.applied).toHaveLength(1);
    for (const k of ['story.m23.complete', 'story.m24.complete', 'story.m25.complete', 'story.m26.complete', 'story.m27.complete', 'story.m28.complete', 'story.m29.complete', 'story.m30.complete', 'story.d05.complete', 'story.r16.complete']) flags[k] = true;
    expect(c.closedHoles()).toEqual([]);
    const open = mk();
    open.sky.cast();
    expect(open.leaps).toHaveLength(1);
  });

  it('death mid-carry cancels the leap, releases the invulnerability and drops the strike', () => {
    const r = skyRig({ foes: [foeAt('a', 0, -10)] });
    r.sky.cast();
    r.advance(0.1);
    r.g.blocked = 'dead';
    r.advance(0.5);
    expect(r.handles[0].cancels).toBe(1);
    expect(r.invuln.released).toBe(1);
    expect(r.carry.stopped).toBe(1);
    expect(r.applied).toEqual([]);
    expect(r.sky.striking).toBe(false);
  });

  it('a class change, unlearning, a load and dispose (reset) do the same', () => {
    const resets: Array<(r: ReturnType<typeof skyRig>) => void> = [
      (r) => (r.g.pathfinder = false),
      (r) => (r.g.learned = false),
      (r) => r.sky.reset(),
    ];
    for (const end of resets) {
      const r = skyRig({ foes: [foeAt('a', 0, -10)] });
      r.sky.cast();
      r.advance(0.1);
      end(r);
      r.advance(0.5);
      expect(r.handles[0].cancels).toBe(1);
      expect(r.invuln.released).toBe(1);
      expect(r.applied).toEqual([]);
    }
  });

  it('a carry that never lands is cut off at its limit and releases the invulnerability', () => {
    const r = skyRig({ foes: [foeAt('a', 0, -10)] });
    r.sky.cast();
    r.advance(r.leaps[0].maxSeconds + 0.1);
    expect(r.invuln.released).toBe(1);
    expect(r.handles[0].cancels).toBe(1);
  });

  it('warns once when the invulnerability hook is absent and still carries', () => {
    const r = skyRig({ foes: [foeAt('a', 0, -10)] });
    r.w.noInvuln = true;
    r.sky.cast();
    expect(r.leaps).toHaveLength(1);
    expect(r.warns).toHaveLength(1);
    r.handles[0].active = false;
    r.advance(DT);
    r.sky.cast();
    expect(r.warns).toHaveLength(1);
  });
});

describe('Skyhawk Strike: the arc is checked, not only the landing', () => {
  it('a face 2 m before a higher landing raises the apex until the arc clears the lip, and the carry still lands at the planned metre', () => {
    // A 6 m shelf from 6 m out; the landing is 8 m out (foe at 10 m), so the face stands 2 m before it.
    const ground = (_x: number, z: number) => (z <= -6 ? 6 : 0);
    const r = skyRig({ foes: [foeAt('a', 0, -10)], ground });
    expect(r.sky.cast()).toEqual({ ok: true });
    expect(r.leaps).toHaveLength(1);
    // The arc at the face is above the lip: the low default apex (rise + 1.5) is not what flies.
    expect(r.leaps[0].apex).toBeGreaterThan(6 + 1.5 - 1e-9);
    expect(landing(r.leaps[0], 6)).toBeCloseTo(8, 6);
    // Fly the planned arc and check it never goes under the ground profile.
    const g = PLAYER.gravity;
    const v = Math.sqrt(2 * g * r.leaps[0].apex);
    const t = (v + Math.sqrt(v * v - 12 * g)) / g;
    for (let i = 0; i <= 200; i++) {
      const tt = (t * i) / 200;
      const out = (8 / t) * tt;
      expect(v * tt - 0.5 * g * tt * tt).toBeGreaterThanOrEqual(ground(0, -out) - 1e-6);
    }
  });

  it('is skipped when no apex clears the face (a wall at head height across the whole path): the strike still happens', () => {
    const r = skyRig({ foes: [foeAt('a', 0, -10)], ground: (_x, z) => (z <= -4 && z >= -4.5 ? 40 : 0) });
    expect(r.sky.cast()).toEqual({ ok: true });
    r.advance(0.4);
    expect(r.leaps).toEqual([]);
    expect(r.invuln.granted).toBe(0);
    expect(r.applied).toHaveLength(1);
  });

  it('the gap case: a face over the ravine that no arc clears refuses the press (no-path) and the next landing short of it is used', () => {
    // A wall 40 m high at 12 m: landings past it are all blocked, the farthest valid one is on this side.
    const r = skyRig({ ground: (_x, z) => (z <= -12 && z >= -12.5 ? 40 : 0) });
    expect(r.sky.cast()).toEqual({ ok: true });
    expect(landing(r.leaps[0])).toBeLessThan(12);
    expect(landing(r.leaps[0])).toBeCloseTo(11.5, 6);
    const none = skyRig({ ground: (_x, z) => (z <= -4 && z >= -4.5 ? 40 : 0) });
    expect(none.sky.cast()).toEqual({ ok: false, reason: 'no-path' });
    expect(none.leaps).toEqual([]);
  });

  it('the gap case needs a clear line from her chest to the landing: a wall refuses it', () => {
    const r = skyRig({});
    r.w.blockedLos = true;
    expect(r.sky.cast()).toEqual({ ok: false, reason: 'no-path' });
    expect(r.leaps).toEqual([]);
  });

  it('a clear arc still carries, at the plain apex', () => {
    const r = skyRig({ foes: [foeAt('a', 0, -10)] });
    expect(r.sky.cast()).toEqual({ ok: true });
    expect(r.leaps).toHaveLength(1);
    expect(r.leaps[0].apex).toBeCloseTo(PF.skyhawk.apexMin, 6);
  });

  it('a foe that went to a mercy state from the hit is not stunned (the hit itself broke its poise)', () => {
    const a = foeAt('a', 0, -10);
    const r = skyRig({ foes: [a] });
    r.sky.cast();
    r.w.mercyNow.a = 'yielding';
    r.advance(0.4);
    expect(r.applied).toHaveLength(1);
    expect(r.statuses).toEqual([]);
    const b = foeAt('b', 0, -10);
    const s = skyRig({ foes: [b] });
    s.w.mercyNow.b = 'none';
    s.sky.cast();
    s.advance(0.4);
    expect(s.statuses).toHaveLength(1);
  });
});

describe('Skyhawk Strike: the gap crossing (no foe)', () => {
  it('carries her 20 m ahead with no foe in range: not refused, no damage', () => {
    const r = skyRig({});
    expect(r.sky.cast()).toEqual({ ok: true });
    expect(r.leaps).toHaveLength(1);
    expect(landing(r.leaps[0])).toBeCloseTo(20, 6);
    expect(r.dives).toEqual([]);
    r.advance(0.5);
    expect(r.applied).toEqual([]);
    expect(r.invuln.granted).toBe(1);
  });

  it('a foe behind her, in a mercy state or out of the cone does not count as a target', () => {
    const r = skyRig({ foes: [foeAt('behind', 0, 8), foeAt('kneel', 0, -8, { mercy: 'yielding' }), foeAt('side', 12, 0)] });
    expect(r.sky.cast()).toEqual({ ok: true });
    r.advance(0.4);
    expect(r.applied).toEqual([]);
    expect(landing(r.leaps[0])).toBeCloseTo(20, 6);
  });

  it('crosses a chasm: no ground from 4 m to 15 m, ground beyond, so she lands at 20 m', () => {
    const r = skyRig({ ground: (_x, z) => (z < -4 && z > -15 ? null : 0) });
    r.sky.cast();
    expect(landing(r.leaps[0])).toBeCloseTo(20, 6);
  });

  it('lands at the farthest valid spot: closed ground beyond 13 m shortens the crossing to 13 m', () => {
    const r = skyRig({ isOpen: (_x, z) => z > -13.2 });
    r.sky.cast();
    expect(landing(r.leaps[0])).toBeCloseTo(13, 6);
  });

  it('is refused no-path, spending nothing, when no landing from 6 m to 20 m is valid', () => {
    for (const o of [{ isOpen: (_x: number, z: number) => z > -5 }, { ground: () => null }, { interiorAt: (p: V3) => (p.z < -2 ? 'cave' : null) }]) {
      const r = skyRig(o);
      expect(r.sky.cast()).toEqual({ ok: false, reason: 'no-path' });
      expect(r.leaps).toEqual([]);
      expect(r.invuln.granted).toBe(0);
      expect(r.triggers).toEqual([]);
    }
  });

  it('is refused no-path when the core refuses the leap', () => {
    const r = skyRig({});
    r.w.leapRefuse = true;
    expect(r.sky.cast()).toEqual({ ok: false, reason: 'no-path' });
    expect(r.invuln.granted).toBe(0);
    expect(r.triggers).toEqual([]);
  });

  it('is refused in the non-walk modes like the strike', () => {
    const r = skyRig({});
    r.w.mode = 'glide';
    expect(r.sky.cast()).toEqual({ ok: false, reason: 'movement' });
  });
});

// A leap's landing metre for the gap tests (no rise).
function landing(l: { distance: number; apex: number }, rise = 0): number {
  const g = PLAYER.gravity;
  const v = Math.sqrt(2 * g * l.apex);
  const air = (2 * v) / g;
  const t = (v + Math.sqrt(v * v - 2 * g * rise)) / g;
  return (l.distance / air) * t;
}

describe('Capstone tuning', () => {
  it('the numbers are the brief\'s', () => {
    expect(PF.dragonbane).toMatchObject({ cooldown: 40, ember: 40, range: 60, damageScale: 4, poise: 60 });
    expect(PF.huntersWeb).toMatchObject({ cooldown: 45, ember: 35, radius: 12, armSeconds: 1, damageScale: 0.8, poise: 30, rootSeconds: 4 });
    expect(PF.skyhawk).toMatchObject({ cooldown: 40, ember: 30, range: 25, damageScale: 2.5, poise: 50, stunSeconds: 1, standOff: 2, gapDistance: 20, maxRise: 12 });
    expect(PF.dragonbane.speed * (PF.dragonbane.range / PF.dragonbane.speed)).toBeCloseTo(60, 9);
  });
});
