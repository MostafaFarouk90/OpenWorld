import type * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP } from '../../config/constants';
import { CircleRush } from './circleRush';
import { slopePitch } from './slope';
import { BURNING_BITE, HOUND } from './tuning';
import { ENEMY_DEFS, TELEGRAPH_STYLE } from '../defs';
import type { Enemy } from '../Enemy';
import { EnemyManager } from '../EnemyManager';
import { BRIGHTWATER_SPAWNERS } from '../brightwaterSpawners';
import { SLICE_SPAWNERS } from '../spawnerDefs';
import { ENEMY_STRINGS_EN } from '../strings.en';
import { readStatusData } from '../statusData';
import { FakeHost, FakeStatus, loadKnight } from '../testing/fakeHost';
import { AI } from '../tuning';
import type { SpawnerDef } from '../types';

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

const pack = (enemy: SpawnerDef['enemy'], count: number, id = 'pack'): SpawnerDef => ({
  id, enemy, count, anchor: 'a', band: { min: 1, max: 1 }, activation: 'manual', respawn: 'never', leash: false,
});

interface RigOptions {
  /** Player z (hounds start at the origin facing -Z). */
  playerZ?: number;
  heightAt?: (x: number, z: number) => number;
  seed?: number;
}

function rig(defs: SpawnerDef[], opts: RigOptions = {}) {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: opts.playerZ ?? -12 }, heightAt: opts.heightAt });
  fake.defineAnchor('a', 0, 0);
  const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: defs, seed: opts.seed ?? 7 });
  let time = 0;
  const telegraphs: Array<{ t: number; actorId: string; moveId: string; kind: string; lead: number }> = [];
  fake.bus.on('telegraph', (p) => telegraphs.push({ t: time, actorId: p.actorId, moveId: p.moveId, kind: p.kind, lead: p.leadSeconds }));
  const tick = (seconds = DT, each?: () => void) => {
    for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) {
      time += DT;
      m.think(DT);
      m.animate(DT);
      fake.combatStep(DT);
      m.react(DT);
      each?.();
    }
  };
  return { fake, m, tick, telegraphs, now: () => time };
}
type Rig = ReturnType<typeof rig>;

const hounds = (t: Rig, ids: string[]): Enemy[] => ids.map((id) => t.m.get(id)!);
const distToPlayer = (t: Rig, e: Enemy) => Math.hypot(e.feet.x - t.fake.playerFeet.x, e.feet.z - t.fake.playerFeet.z);
const kill = (t: Rig, id: string) => t.fake.host.damage.kill!(id, 'player');
const hit = (t: Rig, id: string, poise: number, amount = 1, kind: 'melee' | 'status' = 'melee') =>
  t.fake.apply({ attackerId: 'player', targetId: id, amount, poise, kind })!;

/** The first time each hound crossed onto the ring (within `ringJoinDistance`), and its first pounce telegraph. */
function trackCircle(t: Rig, ids: string[], maxSeconds: number) {
  const ring = new Map<string, number>();
  const minDistBeforePounce = new Map<string, number>();
  const pounceAt = new Map<string, number>();
  t.tick(maxSeconds, () => {
    for (const e of hounds(t, ids)) {
      const d = distToPlayer(t, e);
      if (d <= HOUND.ringJoinDistance && !ring.has(e.id)) ring.set(e.id, t.now());
    }
    for (const p of t.telegraphs) if (p.moveId === 'hound.pounce' && !pounceAt.has(p.actorId)) pounceAt.set(p.actorId, p.t);
    for (const e of hounds(t, ids)) {
      if (!pounceAt.has(e.id) && ring.has(e.id) && e.brain.circlePhase === 'circle') {
        minDistBeforePounce.set(e.id, Math.min(minDistBeforePounce.get(e.id) ?? Infinity, distToPlayer(t, e)));
      }
    }
  });
  return { ring, pounceAt, minDistBeforePounce };
}

describe('Ember Hound def', () => {
  const def = ENEMY_DEFS['ember-hound'];

  it('matches the spec', () => {
    expect(def.kind).toBe('ember-hound');
    expect(def.body).toBe('quadruped');
    expect(def.behaviour).toBe('circle-rush');
    expect(def.maxHealth).toBe(40);
    expect(def.maxPoise).toBe(15);
    expect(def.fleeAtHealth).toBe(0.15);
    expect(def.walkSpeed).toBe(2.0);
    expect(def.chaseSpeed).toBe(5.5);
    expect(def.attackersPerTarget).toBe(3);
    const pounce = def.moves.find((m) => m.id === 'hound.pounce')!;
    expect(pounce).toMatchObject({ windup: 0.4, telegraph: 'dodge', damage: 14, poise: 15, leap: { maxMetres: 3.5 } });
    const bite = def.moves.find((m) => m.id === 'hound.bite')!;
    expect(bite).toMatchObject({ windup: 0.3, damage: 8, onHit: 'ignite' });
    expect(TELEGRAPH_STYLE['ember-hound']).toBeDefined();
  });

  it('carries mercy data rows only: calm, normal, dragons, two offerings, warm hand', () => {
    expect(def.mercy).toEqual({
      verb: 'calm', tier: 'normal', track: 'dragons', when: 'calming', offerings: [{ itemId: 'hearth-bread', count: 1 }, { itemId: 'ember-coal', count: 1 }], warmHand: true,
    });
    expect(ENEMY_STRINGS_EN['enemies.mercy.calm']).toBe('Hold {key}: Calm');
    expect(ENEMY_STRINGS_EN['enemies.name.ember-hound']).toBe('Ember Hound');
  });

  it('is not in any spawner def (no layout anchors exist yet) and builds no hold-T interactable', () => {
    for (const d of [...SLICE_SPAWNERS, ...BRIGHTWATER_SPAWNERS]) expect(d.enemy).not.toBe('ember-hound');
    const t = rig([pack('ember-hound', 2)]);
    t.m.service.spawnGroup('pack');
    expect(t.m.count).toBe(2);
    expect([...t.fake.interactables.keys()].filter((k) => k.includes('hound'))).toEqual([]);
  });
});

describe('circle then rush', () => {
  it('alone: circles for 1 s on the ring, then pounces', () => {
    const t = rig([pack('ember-hound', 1)]);
    const [id] = t.m.service.spawnGroup('pack', { aggro: true, leash: false });
    const r = trackCircle(t, [id!], 6);
    const ring = r.ring.get(id!)!;
    const pounce = r.pounceAt.get(id!)!;
    expect(ring).toBeDefined();
    expect(pounce).toBeDefined();
    // The circle clock runs from reaching the ring; the pounce starts right after it ends (rush from 4 to 5 m takes < 0.5 s).
    expect(pounce - ring).toBeGreaterThanOrEqual(HOUND.aloneCircleSeconds - 0.05);
    expect(pounce - ring).toBeLessThan(HOUND.aloneCircleSeconds + 1);
    // It kept its distance while circling: never inside the 4 m band before the pounce started (a small allowance for the turn-in).
    expect(r.minDistBeforePounce.get(id!)!).toBeGreaterThan(HOUND.circleMin - 0.4);
    const first = t.telegraphs.find((p) => p.actorId === id)!;
    expect(first).toMatchObject({ moveId: 'hound.pounce', kind: 'dodge' });
    expect(first.lead).toBeCloseTo(0.4);
  });

  it('with a packmate: circles 1.5 to 3 s, and the two pounces start at least 0.5 s apart', () => {
    for (const seed of [1, 2, 3, 4]) {
      const t = rig([pack('ember-hound', 2)], { seed });
      const ids = t.m.service.spawnGroup('pack', { aggro: true, leash: false });
      const r = trackCircle(t, ids, 8);
      const starts = ids.map((id) => r.pounceAt.get(id)!);
      for (const id of ids) {
        expect(r.pounceAt.has(id)).toBe(true);
        expect(r.pounceAt.get(id)! - r.ring.get(id)!).toBeGreaterThanOrEqual(HOUND.packCircleMin - 0.05);
        expect(r.pounceAt.get(id)! - r.ring.get(id)!).toBeLessThan(HOUND.packCircleMax + 1.2);
      }
      expect(Math.abs(starts[0]! - starts[1]!)).toBeGreaterThanOrEqual(HOUND.attackStaggerSeconds - 1e-6);
    }
  });

  it('three hounds: staggered starts, all three attack at once (token limit 3), and none starts before 1.5 s of circling', () => {
    const t = rig([pack('ember-hound', 3)], { seed: 3 });
    const ids = t.m.service.spawnGroup('pack', { aggro: true, leash: false });
    let most = 0;
    const phases = new Set(['telegraph', 'attack', 'recover']);
    const ring = new Map<string, number>();
    t.tick(9, () => {
      for (const e of hounds(t, ids)) if (!ring.has(e.id) && distToPlayer(t, e) <= HOUND.ringJoinDistance) ring.set(e.id, t.now());
      most = Math.max(most, hounds(t, ids).filter((e) => phases.has(e.state)).length);
    });
    const starts = ids.map((id) => t.telegraphs.find((p) => p.actorId === id && p.moveId === 'hound.pounce')?.t);
    expect(starts.every((s) => s !== undefined)).toBe(true);
    const sorted = (starts as number[]).slice().sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i]! - sorted[i - 1]!).toBeGreaterThanOrEqual(HOUND.attackStaggerSeconds - 1e-6);
    ids.forEach((id, i) => expect(starts[i]! - ring.get(id)!).toBeGreaterThanOrEqual(HOUND.packCircleMin - 0.05));
    expect(most).toBe(3);
  });

  it('packmate count for the alone rule: a far or dead packmate does not count', () => {
    const t = rig([pack('ember-hound', 2)], { seed: 5 });
    const ids = t.m.service.spawnGroup('pack', { aggro: true, leash: false });
    const [a, b] = hounds(t, ids);
    // Dormant far away: not within 15 m of the other one.
    b!.feet.set(40, 0, 40);
    expect(t.m['env'].packNearby(a!)).toBe(0);
    b!.feet.set(2, 0, 0);
    expect(t.m['env'].packNearby(a!)).toBe(1);
    kill(t, ids[1]!);
    t.tick(0.1);
    expect(t.m['env'].packNearby(a!)).toBe(0);
  });

  it('CircleRush: ring goal stays 4 to 5 m out, steers in from outside and out from inside, no NaN on the target', () => {
    const c = new CircleRush(() => 0.5, { circle: 2.5, approach: 5.5 });
    const target = { x: 0, z: 0 };
    for (const self of [{ x: 4.5, z: 0 }, { x: 9, z: 0 }, { x: 1, z: 0 }, { x: 0, z: 0 }]) {
      const step = c.ringStep({ self, targetPos: target, distance: Math.hypot(self.x, self.z), packNearby: 1 });
      const d = Math.hypot(step.goal.x, step.goal.z);
      expect(Number.isFinite(d)).toBe(true);
      expect(d).toBeGreaterThanOrEqual(HOUND.circleMin - 1e-9);
      expect(d).toBeLessThanOrEqual(HOUND.circleMax + 1e-9);
    }
    expect(c.ringStep({ self: { x: 9, z: 0 }, targetPos: target, distance: 9, packNearby: 0 }).speed).toBe(5.5);
    expect(c.ringStep({ self: { x: 4.5, z: 0 }, targetPos: target, distance: 4.5, packNearby: 0 }).speed).toBe(2.5);
    // The clock only runs on the ring.
    const far = new CircleRush(() => 0, { circle: 2.5, approach: 5.5 });
    expect(far.step(10, { self: { x: 30, z: 0 }, targetPos: target, distance: 30, packNearby: 0 })).not.toBeNull();
    expect(far.isRushing).toBe(false);
    expect(far.step(1.01, { self: { x: 5, z: 0 }, targetPos: target, distance: 5, packNearby: 0 })).toBeNull();
    expect(far.isRushing).toBe(true);
  });

  it('the pounce leaps forward at most 3.5 m in a straight line', () => {
    const t = rig([pack('ember-hound', 1)], { seed: 2 });
    const [id] = t.m.service.spawnGroup('pack', { aggro: true, leash: false, moves: ['hound.pounce'] });
    const e = t.m.get(id!)!;
    let from: { x: number; z: number } | null = null;
    let farthest = 0;
    t.tick(6, () => {
      if (e.state === 'telegraph' && !from) from = { x: e.feet.x, z: e.feet.z };
      if (from && (e.state === 'attack' || e.state === 'recover')) farthest = Math.max(farthest, Math.hypot(e.feet.x - from.x, e.feet.z - from.z));
    });
    expect(from).not.toBeNull();
    expect(farthest).toBeGreaterThan(1.5);
    expect(farthest).toBeLessThanOrEqual(3.5 + 0.1);
  });
});

describe('knockdown and flinch', () => {
  const chasing = (seed = 1) => {
    const t = rig([pack('ember-hound', 1)], { seed });
    const [id] = t.m.service.spawnGroup('pack', { aggro: true, leash: false });
    t.tick(0.5);
    return { t, id: id!, e: t.m.get(id!)! };
  };

  it('a hit after the player dodged this hound knocks it down for 1.2 s, with no poise break', () => {
    const { t, id, e } = chasing();
    expect(e.state).toBe('chase');
    t.fake.bus.emit('player.dodged', { attackerId: id });
    const r = hit(t, id, 1);
    expect(r.staggered).toBe(false);
    t.tick(DT);
    expect(e.state).toBe('stagger');
    expect(e.body.currentClip).toBe('Hit_B'); // the Knockdown clip through the alias
    t.tick(HOUND.knockdownSeconds - 0.15);
    expect(e.state).toBe('stagger');
    t.tick(0.3);
    expect(e.state).not.toBe('stagger');
  });

  it('the same hit without a dodge only flinches', () => {
    const { t, id, e } = chasing();
    hit(t, id, 1);
    t.tick(DT);
    expect(e.state).not.toBe('stagger');
    expect(e.body.currentClip).toBe('Hit_A'); // the Flinch clip
  });

  it('the counter window expires, is spent by the first hit, and only counts for the hound that was dodged', () => {
    const late = chasing();
    late.t.fake.bus.emit('player.dodged', { attackerId: late.id });
    late.t.tick(HOUND.dodgeCounterSeconds + 0.2);
    hit(late.t, late.id, 1);
    late.t.tick(DT);
    expect(late.e.state).not.toBe('stagger');

    const twice = chasing();
    twice.t.fake.bus.emit('player.dodged', { attackerId: twice.id });
    hit(twice.t, twice.id, 1);
    twice.t.tick(HOUND.knockdownSeconds + 0.4);
    expect(twice.e.state).not.toBe('stagger');
    hit(twice.t, twice.id, 1);
    twice.t.tick(DT);
    expect(twice.e.state).not.toBe('stagger'); // the dodge was spent by the first counter

    const other = chasing();
    other.t.fake.bus.emit('player.dodged', { attackerId: 'ash-wraith#99' });
    other.t.fake.bus.emit('player.dodged', { attackerId: null });
    hit(other.t, other.id, 1);
    other.t.tick(DT);
    expect(other.e.state).not.toBe('stagger');
  });

  it('a dodge counter on a footman does nothing (the knockdown is the hound\'s)', () => {
    const t = rig([pack('blighted-soldier', 1)]);
    const [id] = t.m.service.spawnGroup('pack', { aggro: true, leash: false });
    t.tick(0.5);
    t.fake.bus.emit('player.dodged', { attackerId: id! });
    hit(t, id!, 1);
    t.tick(DT);
    expect(t.m.get(id!)!.state).not.toBe('stagger');
  });

  it('any poise break knocks down for 1.2 s', () => {
    const { t, id, e } = chasing();
    const r = hit(t, id, ENEMY_DEFS['ember-hound'].maxPoise);
    expect(r.staggered).toBe(true);
    t.tick(DT);
    expect(e.state).toBe('stagger');
    expect(e.body.currentClip).toBe('Hit_B');
    t.tick(AI.breakStaggerSeconds - 0.15);
    expect(e.state).toBe('stagger');
    t.tick(0.3);
    expect(e.state).not.toBe('stagger');
  });

  it('a knocked-down hound cancels a pounce in its crouch', () => {
    const t = rig([pack('ember-hound', 1)], { seed: 2 });
    const [id] = t.m.service.spawnGroup('pack', { aggro: true, leash: false, moves: ['hound.pounce'] });
    const e = t.m.get(id!)!;
    let guard = 0;
    while (e.state !== 'telegraph' && guard++ < 600) t.tick();
    expect(e.state).toBe('telegraph');
    hit(t, id!, 15);
    t.tick(DT);
    expect(e.state).toBe('stagger');
    expect(t.fake.bus.of('telegraph.cancelled').length).toBe(1);
  });
});

describe('flee at 15%', () => {
  const run = (health: number) => {
    const t = rig([pack('ember-hound', 1)]);
    const [id] = t.m.service.spawnGroup('pack', { aggro: true, leash: false });
    t.tick(0.5);
    const e = t.m.get(id!)!;
    hit(t, id!, 0, e.actor.maxHealth - health);
    t.tick(0.1);
    return { t, e };
  };

  it('flees below 15% health, running away from the player', () => {
    const { t, e } = run(5); // 12.5%
    expect(e.state).toBe('flee');
    const d0 = distToPlayer(t, e);
    t.tick(1);
    expect(distToPlayer(t, e)).toBeGreaterThan(d0 + 2);
  });

  it('does not flee at exactly 15% or above', () => {
    expect(run(6).e.state).not.toBe('flee'); // 6 / 40 = 0.15
    expect(run(20).e.state).not.toBe('flee');
  });
});

describe('calm is refused once an attack has started', () => {
  /** A minimal stand-in for thread 1's Calm entry point: succeeds only while the enemy says Calm is open. */
  const tryCalm = (e: Enemy): 'calmed' | 'refused' => (e.calmOpen ? 'calmed' : 'refused');

  it('open before the first crouch, shut from the telegraph on, until the hound disengages', () => {
    const t = rig([pack('ember-hound', 1)], { seed: 2 });
    const [id] = t.m.service.spawnGroup('pack', { aggro: true, leash: false });
    const e = t.m.get(id!)!;
    expect(tryCalm(e)).toBe('calmed'); // idle, nothing started
    t.tick(0.5);
    expect(e.state).toBe('chase');
    expect(tryCalm(e)).toBe('calmed'); // circling the target
    let guard = 0;
    while (e.state !== 'telegraph' && guard++ < 600) t.tick();
    expect(e.state).toBe('telegraph');
    expect(tryCalm(e)).toBe('refused'); // the pounce window is closed
    t.tick(3);
    expect(['attack', 'recover', 'chase', 'telegraph']).toContain(e.state);
    expect(tryCalm(e)).toBe('refused'); // still refused after the swing ended
  });

  it('a staggered hound is the Warm Hand\'s, not Calm\'s; a dead or sleeping one is neither', () => {
    const t = rig([pack('ember-hound', 1)]);
    const [id] = t.m.service.spawnGroup('pack', { aggro: true, leash: false });
    t.tick(0.5);
    const e = t.m.get(id!)!;
    hit(t, id!, 15);
    t.tick(DT);
    expect(e.state).toBe('stagger');
    expect(tryCalm(e)).toBe('refused');
    expect(e.warmHandOpen).toBe(true);
    kill(t, id!);
    t.tick(DT);
    expect(e.warmHandOpen).toBe(false);
    expect(tryCalm(e)).toBe('refused');
  });
});

describe('pack leader', () => {
  const led = (count: number, leaderSlot: number | undefined, id = 'pack'): SpawnerDef => ({ ...pack('ember-hound', count, id), leaderSlot });

  it('is the member in the spawner\'s leaderSlot and every member agrees on it', () => {
    const t = rig([led(3, 1)]);
    const ids = t.m.service.spawnGroup('pack');
    expect(t.m.service.packLeader('pack')).toBe(ids[1]);
    expect(hounds(t, ids).map((e) => e.isPackLeader)).toEqual([false, true, false]);
  });

  it('edge: a dead leader leaves no leader (no automatic successor); a group with no leaderSlot has none', () => {
    const t = rig([led(3, 0), led(2, undefined, 'plain')]);
    const ids = t.m.service.spawnGroup('pack');
    kill(t, ids[0]!);
    t.tick(DT);
    expect(t.m.service.packLeader('pack')).toBeNull();
    expect(t.m.get(ids[1]!)!.isPackLeader).toBe(false);
    t.m.service.spawnGroup('plain');
    expect(t.m.service.packLeader('plain')).toBeNull();
    expect(t.m.service.packLeader('missing')).toBeNull();
  });

  it('lowerHead plays the head-lowered pose on a hound and returns to idle', () => {
    const t = rig([led(1, 0)]);
    const [id] = t.m.service.spawnGroup('pack');
    const e = t.m.get(id!)!;
    e.lowerHead(true);
    expect(e.body.currentClip).toBe('HeadLower');
    e.lowerHead(false);
    expect(e.body.currentClip).toBe('Idle');
  });
});

describe('burning bite', () => {
  /** A hound next to the player biting only; returns the damage.dealt events it caused. */
  function biter(status: FakeStatus | undefined, seed = 1) {
    const t = rig([pack('ember-hound', 1)], { playerZ: -1.15, seed });
    t.fake.status = status;
    const [id] = t.m.service.spawnGroup('pack', { aggro: true, leash: false, moves: ['hound.bite'] });
    return { t, id: id!, e: t.m.get(id!)! };
  }
  const bitesOn = (t: Rig, id: string) =>
    t.fake.bus.of('damage.dealt').filter((r) => r.attackerId === id && r.targetId === 'player');

  it('applies ignite once per bite with the tuned dps and seconds, sourced from the hound', () => {
    const status = new FakeStatus();
    const { t, id } = biter(status);
    t.tick(8, () => {});
    expect(bitesOn(t, id).length).toBeGreaterThan(0);
    expect(status.calls.length).toBeGreaterThan(0);
    // One apply per swing, never more than one per bite.
    const swings = new Set(bitesOn(t, id).map((r) => r.swingId));
    expect(status.calls.length).toBeLessThanOrEqual(Math.max(swings.size, 1) * 1);
    expect(status.calls[0]).toEqual({
      actorId: 'player',
      spec: { id: BURNING_BITE.id, kind: 'ignite', dps: BURNING_BITE.dps, seconds: BURNING_BITE.seconds, sourceId: id },
    });
  });

  it('a second hit of the same swing does not apply again', () => {
    const status = new FakeStatus();
    const { t, id, e } = biter(status);
    let guard = 0;
    while (status.calls.length === 0 && guard++ < 1500) t.tick();
    expect(status.calls).toHaveLength(1);
    const bite = e.brain.currentMove;
    expect(bite?.id).toBe('hound.bite');
    t.fake.apply({ attackerId: id, targetId: 'player', amount: 1, poise: 1, kind: 'melee' });
    t.fake.apply({ attackerId: id, targetId: 'player', amount: 1, poise: 1, kind: 'melee' });
    expect(status.calls).toHaveLength(1);
  });

  it('does nothing without a status service (the bite still hurts)', () => {
    const { t, id } = biter(undefined);
    expect(() => t.tick(8)).not.toThrow();
    expect(bitesOn(t, id).length).toBeGreaterThan(0);
    expect(t.fake.player.health).toBeLessThan(t.fake.player.maxHealth);
    expect(t.fake.warnings).toEqual([]);
  });

  it('a blocked bite does not ignite', () => {
    const status = new FakeStatus();
    const { t, id } = biter(status);
    t.fake.host.damage.addModifier('test.block', (req) => {
      if (req.attackerId === id) req.outcome = 'blocked';
    }, 0);
    t.tick(8);
    expect(bitesOn(t, id).length).toBeGreaterThan(0);
    expect(status.calls).toEqual([]);
  });

  it('the pounce is red and unblockable and does not ignite', () => {
    const status = new FakeStatus();
    const t = rig([pack('ember-hound', 1)], { playerZ: -4.2, seed: 2 });
    t.fake.status = status;
    const [id] = t.m.service.spawnGroup('pack', { aggro: true, leash: false, moves: ['hound.pounce'] });
    t.tick(8);
    const hits = t.fake.bus.of('damage.dealt').filter((r) => r.attackerId === id && r.targetId === 'player');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]).toMatchObject({ unblockable: true, attackId: 'Pounce', poise: 15 });
    expect(status.calls).toEqual([]);
  });
});

describe('status data and status ticks', () => {
  it('a status tick never flinches, aggroes or provokes; a melee hit does', () => {
    const t = rig([pack('ember-hound', 1)], { playerZ: -60 });
    const [id] = t.m.service.spawnGroup('pack'); // not aggro'd, the player out of sight: idle
    t.tick(0.2);
    const e = t.m.get(id!)!;
    const before = e.body.currentClip;
    hit(t, id!, 0, 2, 'status');
    t.tick(DT);
    expect(e.state).toBe('idle');
    expect(e.body.currentClip).toBe(before);
    expect(t.fake.bus.of('ai.aggro')).toEqual([]);
    hit(t, id!, 0, 2, 'melee');
    t.tick(DT);
    expect(e.state).toBe('chase');
    expect(e.body.currentClip).toBe('Hit_A');
  });

  it('a status tick on an aggroed hound in the chase does not flinch it either', () => {
    const t = rig([pack('ember-hound', 1)]);
    const [id] = t.m.service.spawnGroup('pack', { aggro: true, leash: false });
    t.tick(0.5);
    const e = t.m.get(id!)!;
    hit(t, id!, 0, 2, 'status');
    t.tick(DT);
    expect(e.body.currentClip).not.toBe('Hit_A');
  });

  it('readStatusData: arrays, keyed objects, strongest wins, expired and junk ignored', () => {
    expect(readStatusData(undefined)).toEqual({ stunSeconds: 0, speedScale: 1 });
    expect(readStatusData('x')).toEqual({ stunSeconds: 0, speedScale: 1 });
    expect(readStatusData([{ kind: 'stun', remaining: 0.8 }, { kind: 'stun', remaining: 0.3 }]).stunSeconds).toBe(0.8);
    expect(readStatusData({ stun: { remaining: 1.5 } }).stunSeconds).toBe(1.5);
    expect(readStatusData({ stun: 0 }).stunSeconds).toBe(0);
    expect(readStatusData([{ kind: 'slow', remaining: 2, slow: 0.4 }, { kind: 'slow', remaining: 2, slow: 0.2 }]).speedScale).toBeCloseTo(0.6);
    expect(readStatusData({ slow: { slow: 5, remaining: 1 } }).speedScale).toBeCloseTo(0.1); // clamped to 0.9 removed
    expect(readStatusData([{ kind: 'slow', remaining: -1, slow: 0.5 }]).speedScale).toBe(1);
    expect(readStatusData([null, 3, { kind: 'bleed', remaining: 5 }])).toEqual({ stunSeconds: 0, speedScale: 1 });
    expect(readStatusData({ stun: Number.NaN }).stunSeconds).toBe(0);
  });

  it('a stunned enemy is staggered for the stun; a slowed one moves slower', () => {
    const stun = rig([pack('ember-hound', 1)]);
    const [id] = stun.m.service.spawnGroup('pack', { aggro: true, leash: false });
    stun.tick(0.3);
    const e = stun.m.get(id!)!;
    e.actor.data['status'] = { stun: 0.5 };
    stun.tick(DT);
    expect(e.state).toBe('stagger');
    e.actor.data['status'] = undefined;
    stun.tick(1.4);
    expect(e.state).not.toBe('stagger');

    const travel = (slow: boolean) => {
      const t = rig([pack('ember-hound', 1)], { playerZ: -30 });
      const [hid] = t.m.service.spawnGroup('pack', { aggro: true, leash: false });
      const h = t.m.get(hid!)!;
      if (slow) h.actor.data['status'] = [{ kind: 'slow', remaining: 10, slow: 0.5 }];
      t.tick(0.2);
      const z0 = h.feet.z;
      t.tick(1);
      return z0 - h.feet.z;
    };
    expect(travel(true)).toBeCloseTo(travel(false) * 0.5, 0);
  });
});

describe('per-def attackersPerTarget', () => {
  const concurrent = (kind: SpawnerDef['enemy'], count: number, seconds: number) => {
    const t = rig([pack(kind, count)], { playerZ: -2 });
    t.m.service.spawnGroup('pack', { aggro: true, leash: false });
    const phases = new Set(['telegraph', 'attack', 'recover']);
    let most = 0;
    t.tick(seconds, () => {
      most = Math.max(most, t.m.all().filter((e) => phases.has(e.state)).length);
    });
    return most;
  };

  it('other kinds keep the default limit of 2, hounds get 3', () => {
    expect(AI.attackersPerTarget).toBe(2);
    expect(concurrent('blighted-soldier', 4, 8)).toBeLessThanOrEqual(AI.attackersPerTarget);
    expect(concurrent('blighted-soldier', 4, 8)).toBeGreaterThan(0);
    expect(concurrent('ash-wraith', 4, 10)).toBeLessThanOrEqual(AI.attackersPerTarget);
    expect(concurrent('ember-hound', 4, 10)).toBe(3);
  });
});

describe('quadruped body feed', () => {
  it('setSpeed follows the mover each tick (run when chasing, zero when still) and setSlopePitch the terrain', () => {
    const t = rig([pack('ember-hound', 1)], { heightAt: (_x, z) => -0.3 * z });
    const [id] = t.m.service.spawnGroup('pack', { aggro: true, leash: false });
    const e = t.m.get(id!)!;
    const body = e.body as unknown as { setSpeed(v: number): void; setSlopePitch(v: number): void };
    const speeds: number[] = [];
    const pitches: number[] = [];
    const setSpeed = body.setSpeed.bind(body);
    const setPitch = body.setSlopePitch.bind(body);
    body.setSpeed = (v) => (speeds.push(v), setSpeed(v));
    body.setSlopePitch = (v) => (pitches.push(v), setPitch(v));
    t.tick(1.5);
    expect(speeds.length).toBeGreaterThan(50);
    expect(Math.max(...speeds)).toBeGreaterThan(HOUND.circleSpeed);
    expect(Math.max(...speeds)).toBeLessThanOrEqual(ENEMY_DEFS['ember-hound'].chaseSpeed + 0.3);
    // Facing the player down the -Z slope (height rises with -z): nose up.
    expect(pitches.length).toBe(speeds.length);
    expect(pitches[pitches.length - 1]!).toBeGreaterThan(0.1);
    // Spent: the speed goes to zero when dead.
    kill(t, id!);
    t.tick(0.2);
    expect(speeds[speeds.length - 1]).toBe(0);
  });

  it('slopePitch: flat, uphill, downhill, rotated, and bad input', () => {
    const slope = (_x: number, z: number) => -0.5 * z;
    expect(slopePitch(() => 0, 0, 0, 0, 1)).toBe(0);
    expect(slopePitch(slope, 0, 0, 0, 1)).toBeCloseTo(Math.atan2(0.5, 1)); // facing -Z, height rises that way
    expect(slopePitch(slope, 0, 0, Math.PI, 1)).toBeCloseTo(-Math.atan2(0.5, 1));
    expect(slopePitch(slope, 0, 0, Math.PI / 2, 1)).toBeCloseTo(0);
    expect(slopePitch(slope, 0, 0, 0, 0)).toBe(0);
    expect(slopePitch(() => Number.NaN, 0, 0, 0, 1)).toBe(0);
  });
});

describe('lifecycle', () => {
  it('a hound spawned and despawned leaves nothing behind (actor, hurtboxes, attackers, scene node)', () => {
    const t = rig([pack('ember-hound', 2)]);
    t.m.service.spawnGroup('pack');
    expect(t.fake.targetCount).toBeGreaterThan(1);
    t.m.service.despawnGroup('pack');
    t.tick(DT);
    expect(t.m.count).toBe(0);
    expect(t.fake.attackerCount).toBe(0);
    expect(t.fake.targetCount).toBe(1); // the player's
    expect(t.fake.warnings).toEqual([]);
  });

  it('killing a hound fades and removes it', () => {
    const t = rig([pack('ember-hound', 1)]);
    const [id] = t.m.service.spawnGroup('pack', { aggro: true, leash: false });
    t.tick(0.3);
    kill(t, id!);
    t.tick(4);
    expect(t.m.get(id!)).toBeUndefined();
  });
});
