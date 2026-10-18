import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActorId } from '../../actors/Actor';
import { segmentVsCapsules } from '../../combat/sweep';
import corePlugin from '../../core/core.plugin';
import type { GameEventMap } from '../../core/events';
import { Game } from '../../core/Game';
import { MoveModifiers } from '../../core/MoveModifiers';
import type { GamePlugin, PluginModule } from '../../core/plugins';
import { BOSS_MERCY } from '../../enemies/tuning';
import { InputManager } from '../../input/InputManager';
import { UNDERWAYS_DEF } from '../../interiors/underways/generate';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { killXp } from '../../progression/tuning';
import { d02 } from '../../quests/content/d02.quest';
import { TerrainColliders } from '../../world/TerrainColliders';
import { World } from '../../world/World';
import { OUTCOME_FLAG } from './GrimtoothDirector';
import grimtoothPlugin from './grimtooth.plugin';
import { ARENA, BITE, D02, GRIMTOOTH, GRIMTOOTH_BOSS_ID, HOWLS, MOVES, PRESENTATION, SUMMON_GROUP } from './tuning';

let physics: PhysicsWorld;

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const modules = (...plugins: GamePlugin[]): Record<string, PluginModule> =>
  Object.fromEntries(plugins.map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }]));

const TICK = 1 / 60;
const secs = (s: number) => Math.round(s / TICK);

/** Thread 5's `grimtooth-summons` as a stand-in, under the real plugin id: `count` hounds per call; `reset` despawns them. */
function fakeEnemies() {
  const live: ActorId[] = [];
  const calls: string[] = [];
  let ctx: Game['ctx'] | null = null;
  const service = {
    spawnGroup: (id: string, opts?: { aggro?: boolean; count?: number }) => {
      calls.push(`spawn:${id}:${opts?.count ?? 'all'}`);
      const ids: ActorId[] = [];
      for (let i = 0; i < (opts?.count ?? 4); i++) {
        ids.push(ctx!.actors.spawn({ kind: 'ember-hound', team: 'hostile', maxHealth: 40, maxPoise: 15, root: new THREE.Group() }).id);
      }
      live.push(...ids);
      return ids;
    },
    reset: (id: string) => {
      calls.push(`reset:${id}`);
      for (const a of live.splice(0)) if (ctx!.actors.get(a)) ctx!.actors.despawn(a);
    },
    alive: () => live.filter((a) => ctx!.actors.get(a) && !ctx!.actors.get(a)!.dead),
    despawnGroup: () => {},
    view: () => undefined,
  };
  const plugin: GamePlugin = {
    id: 'enemies',
    dependsOn: ['core'],
    setup(c) {
      ctx = c as Game['ctx'];
      c.services.provide('enemies', service as never);
    },
  };
  return { plugin, calls, live, service };
}

function fakeInteriors(current: string | null) {
  const log: string[] = [];
  const service = { current, setBlocker: vi.fn((id: string, closed: boolean) => log.push(`blocker:${id}:${closed}`)) };
  const plugin: GamePlugin = {
    id: 'interiors',
    dependsOn: ['core'],
    setup(c) {
      (c.services.provide as (n: string, v: unknown) => void)('interiors', service);
    },
  };
  return { plugin, service, log };
}

/** D02's state as far as the arena reads it. */
function fakeQuests(houndsDone: boolean) {
  const listeners = new Set<() => void>();
  const q = {
    done: houndsDone,
    completed: false,
    objectiveDone: vi.fn((quest: string, obj: string) => quest === D02.questId && obj === D02.houndObjective && q.done),
    state: (id: string) => (id === D02.questId && q.completed ? 'completed' : 'active'),
    onChange: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    set(done: boolean) {
      q.done = done;
      for (const l of listeners) l();
    },
  };
  const plugin: GamePlugin = {
    id: 'fake-quests',
    dependsOn: ['core'],
    setup(c) {
      (c.services.provide as (n: string, v: unknown) => void)('quests', q);
    },
  };
  return { plugin, q };
}

function fakeStatus() {
  const applied: unknown[] = [];
  const plugin: GamePlugin = {
    id: 'fake-status',
    dependsOn: ['core'],
    setup(c) {
      (c.services.provide as (n: string, v: unknown) => void)('status', {
        apply: (id: string, spec: unknown) => applied.push({ id, spec }) > 0,
        clear: () => {},
        has: () => false,
        list: () => [],
      });
    },
  };
  return { plugin, applied };
}

async function setup(opts: { houndsDone?: boolean; quests?: boolean; interior?: string | null; cameraRig?: unknown } = {}) {
  const scene = new THREE.Scene();
  const moveModifiers = new MoveModifiers();
  const world = new World(scene, physics, {
    colliders: new TerrainColliders(physics, { patchSize: 50, cells: 16 }),
    moveModifier: () => moveModifiers.state(),
  });
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null as Element | null });
  const element = Object.assign(new EventTarget(), { requestPointerLock: () => {} }) as unknown as HTMLElement;
  const input = new InputManager(element, win, doc, { storage: null });
  const game = new Game({ scene, physics, world, input, moveModifiers, assets: null, cameraRig: (opts.cameraRig ?? null) as never, report: () => {} });
  const events: Array<{ type: keyof GameEventMap; payload: any }> = [];
  game.events.onAny((type, payload) => events.push({ type, payload }));
  const enemies = fakeEnemies();
  const interiors = fakeInteriors('interior' in opts ? opts.interior! : ARENA.interiorId);
  const quests = fakeQuests(opts.houndsDone ?? true);
  const status = fakeStatus();
  const plugins: GamePlugin[] = [corePlugin, enemies.plugin, interiors.plugin, status.plugin];
  if (opts.quests !== false) plugins.push(quests.plugin);
  plugins.push(grimtoothPlugin);
  await game.loadPlugins(modules(...plugins));
  const ctx = game.ctx;
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  run(2);
  const p = ctx.player.feet.clone();
  // Door 6 m behind the player (+Z), centre 9 m ahead.
  const at = (dx: number, dz: number) => ({ x: p.x + dx, y: p.y, z: p.z + dz });
  ctx.anchors.define({ id: ARENA.arenaDoor, position: at(0, 6), yaw: 0 });
  ctx.anchors.define({ id: ARENA.centre, position: at(0, -9), yaw: Math.PI });
  const of = <K extends keyof GameEventMap>(type: K): GameEventMap[K][] =>
    events.filter((e) => e.type === type).map((e) => e.payload as GameEventMap[K]);
  const enter = () => game.events.emit('trigger.enter', { triggerId: ARENA.arenaTrigger, actorId: ctx.player.actor.id });
  const exit = () => game.events.emit('trigger.exit', { triggerId: ARENA.arenaTrigger, actorId: ctx.player.actor.id });
  const boss = () => [...ctx.actors.all()].find((a) => a.kind === 'gaffer-grimtooth') ?? null;
  const state = () => ctx.bosses.state(GRIMTOOTH_BOSS_ID);
  const hit = (amount: number, poise = amount, extra: Record<string, unknown> = {}) =>
    ctx.damage.apply({ attackerId: ctx.player.actor.id, targetId: boss()!.id, amount, poise, kind: 'melee', ...extra });
  const breakPoise = () => hit(1, GRIMTOOTH.maxPoise);
  const healPlayer = () => {
    const pl = ctx.player.actor;
    pl.health = pl.maxHealth;
  };
  const runHealed = (seconds: number) => {
    for (let i = 0; i < secs(seconds); i++) {
      game.fixedUpdate();
      healPlayer();
    }
  };
  const startFight = () => {
    enter();
    run(secs(PRESENTATION.introSeconds) + 1);
  };
  /** Waits out a break's knockdown. */
  const settle = () => runHealed(GRIMTOOTH.breakSeconds + 0.3);
  /** Health to `fraction` of max with one hit that also breaks. */
  const toFraction = (fraction: number, poise: number = GRIMTOOTH.maxPoise) => {
    const s = state()!;
    return hit(s.health - s.maxHealth * fraction, poise);
  };
  const teardown = () => {
    game.dispose();
    world.dispose();
  };
  return {
    game, ctx, world, events, of, run, runHealed, enter, exit, boss, state, hit, breakPoise, healPlayer, startFight, settle,
    toFraction, enemies, interiors, quests, status, moveModifiers, teardown, at,
  };
}

type T = Awaited<ReturnType<typeof setup>>;

/** Phase 1 break, phase 2 (crossing with a break), then the phase-3 crossing hit that breaks: the window opens. */
function toWindow(t: T) {
  t.breakPoise();
  t.settle();
  t.toFraction(0.6);
  expect(t.state()!.phase).toBe(2);
  t.settle();
  t.toFraction(0.3);
  expect(t.state()!.phase).toBe(3);
  expect(t.state()!.releaseOpen).toBe(true);
}

describe('Gaffer Grimtooth on the real core', () => {
  it('registers its strings and system, and removes them on dispose', async () => {
    const t = await setup();
    expect(t.ctx.strings.has('boss.gaffer-grimtooth.name')).toBe(true);
    expect(t.game.systems.has('bosses.grimtooth')).toBe(true);
    t.teardown();
    expect(t.game.systems.has('bosses.grimtooth')).toBe(false);
  });

  it('intro freezes the player; he registers after it with three phases and one break each', async () => {
    const t = await setup();
    t.enter();
    expect(t.boss()).not.toBeNull();
    expect(t.boss()!.hittable).toBe(false);
    expect(t.moveModifiers.state().freeze).toBe(true);
    t.run(secs(PRESENTATION.introSeconds) - 2);
    expect(t.of('boss.started')).toEqual([]);
    t.run(3);
    expect(t.of('boss.started')).toEqual([{ bossId: GRIMTOOTH_BOSS_ID, actorId: t.boss()!.id }]);
    expect(t.moveModifiers.state().freeze).toBeFalsy();
    expect(t.state()).toMatchObject({ phases: 3, breaksPerPhase: 1, phase: 1 });
    t.teardown();
  });

  it('arming: no fight before the hound objective; a quest change while inside the trigger starts it', async () => {
    const t = await setup({ houndsDone: false });
    t.enter();
    t.run(2);
    expect(t.boss()).toBeNull();
    t.quests.q.set(true);
    t.run(1);
    expect(t.boss()).not.toBeNull();
    t.teardown();
  });

  it('arming: a quest change after the player left the trigger does not start it', async () => {
    const t = await setup({ houndsDone: false });
    t.enter();
    t.exit();
    t.quests.q.set(true);
    t.run(2);
    expect(t.boss()).toBeNull();
    t.teardown();
  });

  it('arming: a completed D02 also arms; without a quests service the arena is armed', async () => {
    const t = await setup({ houndsDone: false });
    t.quests.q.completed = true;
    t.enter();
    expect(t.boss()).not.toBeNull();
    t.teardown();
    const u = await setup({ quests: false });
    u.enter();
    expect(u.boss()).not.toBeNull();
    u.teardown();
  });

  it("contract: thread 6's D02 has the hound objective the arena reads and finishes on his outcome", () => {
    expect(d02.id).toBe(D02.questId);
    expect(d02.objectives.find((o) => o.id === D02.houndObjective)).toMatchObject({ type: 'kill', target: 'ember-hound' });
    expect(JSON.stringify(d02.objectives)).toContain(GRIMTOOTH_BOSS_ID);
  });

  it("contract: thread 1's boss Calm row scatters his summon group", () => {
    expect(BOSS_MERCY[GRIMTOOTH_BOSS_ID]).toMatchObject({ verb: 'calm', ledgerId: 'D02', summonGroups: [SUMMON_GROUP] });
  });

  it('an outcome flag already set: he never spawns', async () => {
    const t = await setup();
    t.ctx.state.setFlag(OUTCOME_FLAG, 'released');
    t.run(1);
    t.enter();
    t.run(2);
    expect(t.boss()).toBeNull();
    t.teardown();
  });

  it('the window opens at the first break of phase 3 (his third break); the 8% floor holds until then', async () => {
    const t = await setup();
    t.startFight();
    t.breakPoise();
    expect(t.of('boss.break')).toHaveLength(1);
    expect(t.state()!.releaseOpen).toBe(false);
    t.settle();
    t.toFraction(0.6);
    t.settle();
    expect(t.state()!.releaseOpen).toBe(false);
    // Before the last break a huge hit stops at the floor.
    t.hit(1e6, 0);
    expect(t.state()!.health).toBe(Math.ceil(GRIMTOOTH.maxHealth * GRIMTOOTH.healthFloor));
    expect(t.state()!.phase).toBe(3);
    t.breakPoise();
    expect(t.state()!.releaseOpen).toBe(true);
    expect(t.of('boss.break').at(-1)).toMatchObject({ last: true });
    t.teardown();
  });

  it('calm through bosses.release: one boss.released, the pack is left to the scatter, he walks off and despawns', async () => {
    const t = await setup();
    t.startFight();
    toWindow(t);
    const howlsBefore = t.enemies.calls.length;
    expect(t.ctx.bosses.release(GRIMTOOTH_BOSS_ID)).toBe(true);
    expect(t.of('boss.released')).toHaveLength(1);
    expect(t.boss()!.hittable).toBe(false);
    expect(t.boss()!.untargetable).toBe(true);
    t.run(secs(PRESENTATION.calmDespawnAfter) + 5);
    expect(t.boss()).toBeNull();
    expect(t.of('boss.ended')).toHaveLength(1);
    // No reset or despawn of the summon group on the calm path, before or after his despawn (review B3).
    expect(t.enemies.calls.slice(howlsBefore).filter((c) => c.startsWith('reset'))).toEqual([]);
    t.run(secs(2));
    expect(t.enemies.calls.slice(howlsBefore).filter((c) => c.startsWith('reset'))).toEqual([]);
    expect(t.ctx.state.hasFlag(OUTCOME_FLAG)).toBe(true);
    t.teardown();
  });

  it('a strike in the window kills him: boss.defeated, the pack crumbles, one boss.ended', async () => {
    const t = await setup();
    t.startFight();
    toWindow(t);
    t.hit(1e6, 0);
    expect(t.of('boss.defeated')).toHaveLength(1);
    expect(t.enemies.calls.at(-1)).toBe(`reset:${SUMMON_GROUP}`);
    t.run(secs(PRESENTATION.deathClipSeconds + PRESENTATION.deathFadeSeconds) + 2);
    expect(t.boss()).toBeNull();
    expect(t.of('boss.ended')).toHaveLength(1);
    t.teardown();
  });

  it('after the window closes unanswered he fights on, can die outside it, and the window reopens on the next break', async () => {
    const t = await setup();
    t.startFight();
    toWindow(t);
    t.runHealed(GRIMTOOTH.releaseWindowSeconds + 0.5);
    expect(t.state()!.releaseOpen).toBe(false);
    expect(t.boss()!.poise).toBe(GRIMTOOTH.maxPoise);
    t.breakPoise();
    expect(t.state()!.releaseOpen).toBe(true);
    t.runHealed(GRIMTOOTH.releaseWindowSeconds + 0.5);
    expect(t.state()!.releaseOpen).toBe(false);
    // The floor is lifted for good at the last break.
    t.hit(1e6, 0);
    expect(t.of('boss.defeated')).toHaveLength(1);
    t.teardown();
  });

  it('tail from behind breaks his poise once per phase; from the front it only hurts more', async () => {
    const t = await setup();
    t.startFight();
    const b = t.boss()!;
    const yaw = b.root!.rotation.y;
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const behind = t.hit(10, 1, { bone: 'tail', direction: forward.clone() });
    expect(behind!.poiseDealt).toBe(GRIMTOOTH.maxPoise);
    expect(t.of('boss.break')).toHaveLength(1);
    t.settle();
    t.boss()!.restorePoise();
    // A second tail hit in the same phase: no break, x1.5 damage.
    const second = t.hit(10, 1, { bone: 'tail', direction: forward.clone() });
    expect(second!.dealt).toBeCloseTo(15);
    expect(t.of('boss.break')).toHaveLength(1);
    const front = t.hit(10, 1, { bone: 'tail', direction: forward.clone().negate() });
    expect(front!.dealt).toBeCloseTo(15);
    expect(front!.poiseDealt).toBe(1);
    // A non-melee hit carries no bone and never counts.
    const spell = t.ctx.damage.apply({ attackerId: t.ctx.player.actor.id, targetId: b.id, amount: 10, poise: 1, kind: 'spell', direction: forward.clone() });
    expect(spell!.dealt).toBe(10);
    t.teardown();
  });

  it('tail: a real blade sweep on the 1.8x rig reaches the tail hurtbox and breaks him through the bridge', async () => {
    const t = await setup();
    t.startFight();
    const b = t.boss()!;
    const combat = (t.world as any).combat.combat;
    const tail = findTail(combat, b.id, t);
    expect(tail).not.toBeNull();
    // A blade swept down across the middle of the tail capsule.
    const mid = tail!.a.clone().lerp(tail!.b, 0.5);
    const sweep = segmentVsCapsules(mid.clone().add(new THREE.Vector3(0.5, 0.4, 0)), mid.clone().add(new THREE.Vector3(-0.5, -0.4, 0)), tail!.set, 1);
    expect(sweep?.bone).toBe('tail');
    // Turn him to face straight away from the player, so the bridge's root-to-root direction runs along his facing.
    const root = b.root!;
    const feet = t.ctx.player.actor.root!.getWorldPosition(new THREE.Vector3());
    root.rotation.y = Math.atan2(-(root.position.x - feet.x), -(root.position.z - feet.z));
    root.updateMatrixWorld(true);
    const tailNow = findTail(combat, b.id, t)!;
    const midNow = tailNow.a.clone().lerp(tailNow.b, 0.5);
    const hitNow = segmentVsCapsules(midNow.clone().add(new THREE.Vector3(0.5, 0.4, 0)), midNow.clone().add(new THREE.Vector3(-0.5, -0.4, 0)), tailNow.set, 1)!;
    const playerOwner = {};
    t.ctx.actors.bindOwner(t.ctx.player.actor, playerOwner);
    combat.bus.emit({ bone: hitNow.bone, point: hitNow.point, normal: hitNow.normal, attacker: playerOwner, target: tailNow.set.owner, damage: 5 });
    expect(t.of('boss.break')).toHaveLength(1);
    t.teardown();
  });

  it('howls: phase 2 calls 2 hounds after a reset, phase 3 calls 3; a howl waits while hounds live', async () => {
    const t = await setup();
    t.startFight();
    t.toFraction(0.6, 0);
    t.runHealed(GRIMTOOTH.circleSecondsMax + MOVES.pounce.windup + MOVES.pounce.recover + GRIMTOOTH.howlSeconds + 1);
    expect(t.enemies.calls).toEqual([`reset:${SUMMON_GROUP}`, `spawn:${SUMMON_GROUP}:${HOWLS.counts[0]}`]);
    t.toFraction(0.5, 0);
    t.toFraction(0.3, 0);
    expect(t.state()!.phase).toBe(3);
    t.runHealed(8);
    // Two hounds still live: the phase-3 howl waits.
    expect(t.enemies.calls).toHaveLength(2);
    for (const id of t.enemies.service.alive()) t.ctx.damage.kill(id);
    t.runHealed(GRIMTOOTH.circleSecondsMax + MOVES.pounce.recover + GRIMTOOTH.howlSeconds + 2);
    expect(t.enemies.calls.slice(2)).toEqual([`reset:${SUMMON_GROUP}`, `spawn:${SUMMON_GROUP}:${HOWLS.counts[1]}`]);
    t.teardown();
  });

  it('howls: a double phase-cross plays one howl; a window opened by the phase-3 hit drops the howl for good', async () => {
    const t = await setup();
    t.startFight();
    t.toFraction(0.2, 0);
    expect(t.state()!.phase).toBe(3);
    t.runHealed(GRIMTOOTH.circleSecondsMax + MOVES.pounce.recover + GRIMTOOTH.howlSeconds + 2);
    expect(t.enemies.calls.filter((c) => c.startsWith('spawn'))).toEqual([`spawn:${SUMMON_GROUP}:${HOWLS.counts[1]}`]);
    t.teardown();

    const u = await setup();
    u.startFight();
    u.breakPoise();
    u.settle();
    u.toFraction(0.6);
    u.settle();
    // The hit that crosses 33% also breaks: the window opens on it and the phase-3 howl never starts.
    u.toFraction(0.3);
    expect(u.state()!.releaseOpen).toBe(true);
    for (const id of u.enemies.service.alive()) u.ctx.damage.kill(id);
    u.runHealed(GRIMTOOTH.releaseWindowSeconds + 6);
    expect(u.enemies.calls.filter((c) => c.endsWith(`:${HOWLS.counts[1]}`))).toEqual([]);
    u.teardown();
  });

  it('pounce: a player standing still is hit (unblockable); one who side-steps after the aim locks is missed', async () => {
    const t = await setup();
    t.startFight();
    const swings = () => t.of('telegraph').filter((e) => e.attackId === MOVES.pounce.attackId);
    // Stand in the pounce band and wait for one.
    const placeAt = (d: number) => {
      const b = t.boss()!.root!.position;
      t.ctx.player.teleport({ x: b.x, y: b.y, z: b.z + d }, 0);
    };
    placeAt(5);
    let guard = 0;
    while (swings().length === 0 && guard++ < secs(20)) {
      t.healPlayer();
      t.run(1);
    }
    expect(swings()).toHaveLength(1);
    t.runHealed(MOVES.pounce.windup + 0.6);
    const hits = t.of('damage.dealt').filter((d) => d.attackId === MOVES.pounce.attackId);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ outcome: 'hit', attackerId: t.boss()!.id });
    t.teardown();

    const u = await setup();
    u.startFight();
    const swingsU = () => u.of('telegraph').filter((e) => e.attackId === MOVES.pounce.attackId);
    const b = u.boss()!.root!.position;
    u.ctx.player.teleport({ x: b.x, y: b.y, z: b.z + 5 }, 0);
    guard = 0;
    while (swingsU().length === 0 && guard++ < secs(20)) {
      u.healPlayer();
      u.run(1);
    }
    // Wait for the aim lock, then side-step 3 m.
    u.runHealed(MOVES.pounce.windup - 0.05);
    const p = u.ctx.player.feet;
    u.ctx.player.teleport({ x: p.x + 3, y: p.y, z: p.z }, 0);
    u.runHealed(0.8);
    expect(u.of('damage.dealt').filter((d) => d.attackId === MOVES.pounce.attackId)).toEqual([]);
    u.teardown();
  });

  it('bite: a blocked bite is never parried and burns only on a hit', async () => {
    const t = await setup();
    t.startFight();
    const blocks: unknown[] = [];
    t.ctx.damage.addModifier('test.guard', (req, target) => {
      if (target.id !== t.ctx.player.actor.id || req.attackId !== MOVES.bite.attackId) return;
      blocks.push(req.parryable);
      req.outcome = 'blocked';
      req.amount = 0;
    }, -50);
    const b = t.boss()!.root!.position;
    const bites = () => t.of('damage.dealt').filter((d) => d.attackId === MOVES.bite.attackId);
    let guard = 0;
    while (bites().length === 0 && guard++ < secs(30)) {
      // Keep the player right in front of his jaws.
      const yaw = t.boss()!.root!.rotation.y;
      t.ctx.player.teleport({ x: b.x - Math.sin(yaw) * 1.4, y: b.y, z: b.z - Math.cos(yaw) * 1.4 }, 0);
      t.healPlayer();
      t.run(1);
    }
    expect(bites()[0]).toMatchObject({ outcome: 'blocked' });
    expect(blocks[0]).toBe(false);
    expect(t.status.applied).toEqual([]);
    expect(t.of('actor.staggered').filter((e) => e.actorId === t.boss()!.id)).toEqual([]);
    t.teardown();
  });

  it('bite: a bite that lands applies the burning status from him', async () => {
    const t = await setup();
    t.startFight();
    const b = t.boss()!.root!.position;
    const bites = () => t.of('damage.dealt').filter((d) => d.attackId === MOVES.bite.attackId);
    let guard = 0;
    while (bites().length === 0 && guard++ < secs(30)) {
      const yaw = t.boss()!.root!.rotation.y;
      t.ctx.player.teleport({ x: b.x - Math.sin(yaw) * 1.4, y: b.y, z: b.z - Math.cos(yaw) * 1.4 }, 0);
      t.healPlayer();
      t.run(1);
    }
    expect(bites()[0]).toMatchObject({ outcome: 'hit' });
    expect(t.status.applied[0]).toMatchObject({ id: t.ctx.player.actor.id, spec: { ...BITE.status, sourceId: t.boss()!.id } });
    t.teardown();
  });

  it('player death resets: one boss.ended, the pack reset, the gate open; the next entry retries', async () => {
    const t = await setup();
    t.startFight();
    t.run(2);
    expect(t.interiors.log).toContain(`blocker:${ARENA.gate}:true`);
    t.ctx.damage.kill(t.ctx.player.actor.id);
    t.run(2);
    expect(t.boss()).toBeNull();
    expect(t.of('boss.ended')).toHaveLength(1);
    expect(t.enemies.calls).toContain(`reset:${SUMMON_GROUP}`);
    expect(t.interiors.log.at(-1)).toBe(`blocker:${ARENA.gate}:false`);
    t.teardown();
  });

  it('reload inside the arena rectangle puts the player at the door; a load elsewhere in the Underways does not', async () => {
    const t = await setup();
    t.startFight();
    const door = t.ctx.anchors.find(ARENA.arenaDoor)!;
    t.game.events.emit('save.loaded', {} as never);
    t.run(1);
    expect(t.boss()).toBeNull();
    expect(t.ctx.player.feet.distanceTo(new THREE.Vector3(door.position.x, t.ctx.player.feet.y, door.position.z))).toBeLessThan(0.5);
    t.teardown();

    const u = await setup();
    const centre = u.ctx.anchors.find(ARENA.centre)!;
    u.ctx.player.teleport({ x: centre.position.x + ARENA.reloadHalfExtent + 4, y: centre.position.y, z: centre.position.z }, 0);
    u.run(1);
    const before = u.ctx.player.feet.clone();
    u.game.events.emit('save.loaded', {} as never);
    u.run(1);
    expect(u.ctx.player.feet.distanceTo(before)).toBeLessThan(0.5);
    u.teardown();
  });

  it('a load mid-intro ends the intro and unfreezes; a load with the outcome set leaves nothing behind', async () => {
    const t = await setup();
    t.enter();
    t.run(secs(1));
    expect(t.moveModifiers.state().freeze).toBe(true);
    t.game.events.emit('save.loaded', {} as never);
    t.run(1);
    expect(t.boss()).toBeNull();
    expect(t.moveModifiers.state().freeze).toBeFalsy();
    expect(t.of('boss.started')).toEqual([]);
    t.teardown();

    // A save taken during the calm walk-off holds the outcome: after the load nothing spawns and the gate stays open.
    const u = await setup();
    u.startFight();
    toWindow(u);
    u.ctx.bosses.release(GRIMTOOTH_BOSS_ID);
    u.run(secs(PRESENTATION.calmHeadSeconds + 0.5));
    u.game.events.emit('save.loaded', {} as never);
    u.run(2);
    expect(u.boss()).toBeNull();
    expect(u.interiors.log.at(-1)).toBe(`blocker:${ARENA.gate}:false`);
    u.enter();
    u.run(2);
    expect(u.boss()).toBeNull();
    u.teardown();
  });

  it('the gate stays open on the frozen player at the trigger edge and closes once they are 5 m in', async () => {
    const t = await setup();
    const door = t.ctx.anchors.find(ARENA.arenaDoor)!.position;
    t.ctx.player.teleport({ x: door.x, y: door.y, z: door.z - 4.2 }, 0);
    t.run(1);
    t.startFight();
    expect(t.interiors.log).toEqual([]);
    t.ctx.player.teleport({ x: door.x, y: door.y, z: door.z - 5.5 }, 0);
    t.run(2);
    expect(t.interiors.log).toEqual([`blocker:${ARENA.gate}:true`]);
    t.teardown();
  });

  it('camera: the first intro takes a shot; a retry after death does not', async () => {
    const release = vi.fn();
    const override = vi.fn(() => ({ active: true, release }));
    const t = await setup({ cameraRig: { override } });
    t.startFight();
    expect(override).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalled();
    t.ctx.damage.kill(t.ctx.player.actor.id);
    t.run(2);
    t.ctx.damage.revive(t.ctx.player.actor.id, 1, 'script');
    t.enter();
    t.run(secs(PRESENTATION.retrySeconds) + 2);
    expect(override).toHaveBeenCalledTimes(1);
    t.teardown();
  });

  it('kill XP: 260 base for Gaffer Grimtooth, scaled by level like any kill', () => {
    expect(killXp(GRIMTOOTH_BOSS_ID, 9, 9)).toBe(260);
  });
});

describe("3a's real Underways geometry", () => {
  it('the closed gate never overlaps the capsule of a player standing where it may close', () => {
    const anchor = (id: string) => UNDERWAYS_DEF.anchors.find((a) => a.id === id)!;
    const door = anchor(ARENA.arenaDoor);
    const centre = anchor(ARENA.centre);
    const gate = UNDERWAYS_DEF.blockers!.find((b) => b.id === ARENA.gate)!.rect;
    const trigger = UNDERWAYS_DEF.triggers!.find((x) => x.id === ARENA.arenaTrigger)!;
    const radius = 0.35;
    const doorToCentre = Math.hypot(centre.x - door.x, centre.z - door.z);
    let checked = 0;
    // Every point of the trigger box and the arena between it and the centre where the arena would close the gate.
    for (let x = trigger.center.x - 8; x <= trigger.center.x + 8; x += 0.25) {
      for (let z = trigger.center.z - 8; z <= trigger.center.z + 8; z += 0.25) {
        const fromDoor = Math.hypot(x - door.x, z - door.z);
        const toCentre = Math.hypot(x - centre.x, z - centre.z);
        if (fromDoor < ARENA.gateClearance || toCentre >= doorToCentre) continue;
        checked++;
        const nx = Math.max(gate.x0, Math.min(gate.x1, x));
        const nz = Math.max(gate.z0, Math.min(gate.z1, z));
        expect(Math.hypot(x - nx, z - nz)).toBeGreaterThan(radius);
      }
    }
    expect(checked).toBeGreaterThan(0);
    // The veil is drawn inside the gate's span.
    const vx = door.x + ((centre.x - door.x) / doorToCentre) * ARENA.veilOffset;
    const vz = door.z + ((centre.z - door.z) / doorToCentre) * ARENA.veilOffset;
    expect(vx).toBeGreaterThanOrEqual(gate.x0 - 1e-6);
    expect(vx).toBeLessThanOrEqual(gate.x1 + 1e-6);
    expect(vz).toBeGreaterThanOrEqual(gate.z0 - 1e-6);
    expect(vz).toBeLessThanOrEqual(gate.z1 + 1e-6);
  });

  it('the summon anchors sit inside his arena half-extent of the centre', () => {
    const centre = UNDERWAYS_DEF.anchors.find((a) => a.id === ARENA.centre)!;
    for (let n = 1; n <= 4; n++) {
      const s = UNDERWAYS_DEF.anchors.find((a) => a.id === `underways.summon.${n}`)!;
      expect(Math.abs(s.x - centre.x)).toBeLessThanOrEqual(ARENA.arenaHalfExtent);
      expect(Math.abs(s.z - centre.z)).toBeLessThanOrEqual(ARENA.arenaHalfExtent);
    }
  });
});

/** The tail capsule of the boss's hurtbox set (the set whose owner the actor registry maps to him). */
function findTail(combat: any, bossId: string, t: T) {
  for (const set of combat.targets as Set<any>) {
    if (t.ctx.actors.byOwner(set.owner)?.id !== bossId) continue;
    set.update();
    const cap = set.capsules.find((c: any) => c.name === 'tail');
    return cap ? { a: cap.a as THREE.Vector3, b: cap.b as THREE.Vector3, set } : null;
  }
  return null;
}
