import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { segmentVsCapsules } from '../../combat/sweep';
import { SCORCHHOLD_KEEP_DEF } from '../../cinderreach/scorchholdKeep';
import corePlugin from '../../core/core.plugin';
import type { GameEventMap } from '../../core/events';
import { Game } from '../../core/Game';
import { MoveModifiers } from '../../core/MoveModifiers';
import type { GamePlugin, PluginModule } from '../../core/plugins';
import { BOSS_MERCY } from '../../enemies/tuning';
import { InputManager } from '../../input/InputManager';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { killXp } from '../../progression/tuning';
import { TerrainColliders } from '../../world/TerrainColliders';
import { World } from '../../world/World';
import { gateIsClear, gateVeil, OUTCOME_FLAG } from './RedmaneDirector';
import redmanePlugin, { redmaneDirector } from './redmane.plugin';
import {
  ARENA,
  CHARGE,
  COUNTER,
  D03_STARTED_FLAG,
  MOVES,
  NET_MOVE,
  PRESENTATION,
  REDMANE,
  REDMANE_BOSS_ID,
  THRUST,
  TRAP,
} from './tuning';

let physics: PhysicsWorld;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };

beforeAll(async () => {
  (globalThis as any).self ??= globalThis;
  const fsModule = 'node:fs';
  const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as any;
  const file = readFileSync('public/assets/kaykit-adventurers/characters/Barbarian.glb');
  const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res as any, rej));
});

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

function fakeEnemies() {
  const plugin: GamePlugin = {
    id: 'enemies',
    dependsOn: ['core'],
    setup(c) {
      c.services.provide('enemies', { spawnGroup: () => [], reset: () => {}, alive: () => [], despawnGroup: () => {}, view: () => undefined } as never);
    },
  };
  return { plugin };
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

function fakeStatus() {
  const applied: Array<{ id: string; spec: any }> = [];
  const plugin: GamePlugin = {
    id: 'fake-status',
    dependsOn: ['core'],
    setup(c) {
      (c.services.provide as (n: string, v: unknown) => void)('status', {
        apply: (id: string, spec: any) => applied.push({ id, spec }) > 0,
        clear: () => {},
        has: () => false,
        list: () => [],
      });
    },
  };
  return { plugin, applied };
}

type Opts = { flag?: boolean; model?: boolean; interior?: string | null; cameraRig?: unknown; failedModel?: boolean };

async function setup(opts: Opts = {}) {
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
  const assets = opts.failedModel
    ? { load: () => Promise.reject(new Error('no glb')), instantiate: () => { throw new Error('no glb'); }, animations: () => [] }
    : opts.model
      ? { load: () => Promise.resolve(), instantiate: () => cloneSkinned(gltf.scene), animations: () => gltf.animations }
      : null;
  const game = new Game({ scene, physics, world, input, moveModifiers, assets: assets as never, cameraRig: (opts.cameraRig ?? null) as never, report: () => {} });
  const events: Array<{ type: keyof GameEventMap; payload: any }> = [];
  game.events.onAny((type, payload) => events.push({ type, payload }));
  const enemies = fakeEnemies();
  const interiors = fakeInteriors('interior' in opts ? opts.interior! : ARENA.interiorId);
  const status = fakeStatus();
  await game.loadPlugins(modules(corePlugin, enemies.plugin, interiors.plugin, status.plugin, redmanePlugin));
  const ctx = game.ctx;
  if (opts.flag !== false) ctx.state.setFlag(D03_STARTED_FLAG, true);
  // Let the model promise settle.
  await new Promise((r) => setTimeout(r, 0));
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
  const boss = () => [...ctx.actors.all()].find((a) => a.kind === 'thrandil-redmane') ?? null;
  const state = () => ctx.bosses.state(REDMANE_BOSS_ID);
  const enc = () => redmaneDirector()!.current!;
  const hit = (amount: number, poise = amount, extra: Record<string, unknown> = {}) =>
    ctx.damage.apply({ attackerId: ctx.player.actor.id, targetId: boss()!.id, amount, poise, kind: 'melee', ...extra });
  const breakPoise = () => hit(1, REDMANE.maxPoise);
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
  const settle = () => runHealed(REDMANE.breakSeconds + 0.3);
  const toFraction = (fraction: number, poise: number = REDMANE.maxPoise) => {
    const s = state()!;
    return hit(s.health - s.maxHealth * fraction, poise);
  };
  /** Puts the player `d` metres in front of Redmane (along his facing), at his height. */
  const placeInFront = (d: number) => {
    const b = boss()!.root!.position;
    const yaw = boss()!.root!.rotation.y;
    ctx.player.teleport({ x: b.x - Math.sin(yaw) * d, y: b.y, z: b.z - Math.cos(yaw) * d }, 0);
  };
  const teardown = () => {
    game.dispose();
    world.dispose();
  };
  return {
    game, ctx, world, events, of, run, runHealed, enter, exit, boss, state, enc, hit, breakPoise, healPlayer, startFight, settle,
    toFraction, placeInFront, interiors, status, moveModifiers, teardown, at,
  };
}

type T = Awaited<ReturnType<typeof setup>>;

/** Three breaks in phase 1, the phase crossing without a break, three in phase 2: the sixth opens the window. */
function toWindow(t: T) {
  for (let i = 0; i < REDMANE.breaksPerPhase; i++) {
    t.breakPoise();
    t.settle();
  }
  t.toFraction(0.45, 0);
  expect(t.state()!.phase).toBe(2);
  t.settle();
  for (let i = 0; i < REDMANE.breaksPerPhase; i++) {
    expect(t.state()!.releaseOpen).toBe(false);
    t.breakPoise();
    if (i < REDMANE.breaksPerPhase - 1) t.settle();
  }
  expect(t.state()!.releaseOpen).toBe(true);
}

describe('Thrandil Redmane on the real core', () => {
  it('registers its strings and system, and removes them on dispose', async () => {
    const t = await setup();
    expect(t.ctx.strings.has('boss.thrandil-redmane.name')).toBe(true);
    expect(t.game.systems.has('bosses.redmane')).toBe(true);
    t.teardown();
    expect(t.game.systems.has('bosses.redmane')).toBe(false);
  });

  it('the mercy row, kill XP and name key are the contract the registry and A12 read', () => {
    expect(BOSS_MERCY[REDMANE_BOSS_ID]).toMatchObject({ verb: 'spare', track: 'oswin', amount: 3, ledgerId: 'D03' });
    expect(killXp(REDMANE_BOSS_ID, 14, 14)).toBe(300);
    expect(OUTCOME_FLAG).toBe('boss.thrandil-redmane.outcome');
  });

  it('arming: no fight without story.d03.started; setting it while standing in the trigger starts it; after leaving it does not', async () => {
    const t = await setup({ flag: false });
    t.enter();
    t.run(2);
    expect(t.boss()).toBeNull();
    t.ctx.state.setFlag(D03_STARTED_FLAG, true);
    t.run(1);
    expect(t.boss()).not.toBeNull();
    t.teardown();

    const u = await setup({ flag: false });
    u.enter();
    u.exit();
    u.ctx.state.setFlag(D03_STARTED_FLAG, true);
    u.run(2);
    expect(u.boss()).toBeNull();
    u.teardown();
  });

  it('intro freezes the player; he registers after it as two phases of three breaks, spare verb, one threshold at 0.5', async () => {
    const t = await setup();
    t.enter();
    expect(t.boss()).not.toBeNull();
    expect(t.boss()!.hittable).toBe(false);
    expect(t.moveModifiers.state().freeze).toBe(true);
    t.run(secs(PRESENTATION.introSeconds) - 2);
    expect(t.of('boss.started')).toEqual([]);
    t.run(3);
    expect(t.of('boss.started')).toEqual([{ bossId: REDMANE_BOSS_ID, actorId: t.boss()!.id }]);
    expect(t.moveModifiers.state().freeze).toBeFalsy();
    expect(t.state()).toMatchObject({ phases: 2, breaksPerPhase: 3, phase: 1, thresholds: [0.5], maxHealth: REDMANE.maxHealth });
    expect(t.boss()!.hittable).toBe(true);
    t.teardown();
  });

  it('an outcome flag already set: he never spawns', async () => {
    const t = await setup();
    t.ctx.state.setFlag(OUTCOME_FLAG, 'spared');
    t.run(1);
    t.enter();
    t.run(2);
    expect(t.boss()).toBeNull();
    t.teardown();
  });

  it('six breaks over two phases; the window opens only at the third phase-2 break; the 8% floor holds until then', async () => {
    const t = await setup();
    t.startFight();
    for (let i = 1; i <= 3; i++) {
      t.breakPoise();
      expect(t.state()!.breaks).toBe(i);
      expect(t.state()!.releaseOpen).toBe(false);
      t.settle();
    }
    // Before the last break a huge hit stops at the floor, and crosses into phase 2.
    t.hit(1e6, 0);
    expect(t.state()!.health).toBe(Math.ceil(REDMANE.maxHealth * REDMANE.healthFloor));
    expect(t.state()!.phase).toBe(2);
    t.settle();
    t.breakPoise();
    t.settle();
    t.breakPoise();
    t.settle();
    expect(t.state()!.releaseOpen).toBe(false);
    t.breakPoise();
    expect(t.state()!.releaseOpen).toBe(true);
    expect(t.of('boss.break').map((b) => b.last)).toEqual([false, false, false, false, false, true]);
    expect(t.of('boss.releaseWindow')).toEqual([{ bossId: REDMANE_BOSS_ID, open: true }]);
    t.teardown();
  });

  it('Spare through bosses.release: boss.released then boss.spared, outcome spared, unhittable at once, kneels, despawns, gate opens', async () => {
    const t = await setup();
    t.startFight();
    toWindow(t);
    expect(t.ctx.bosses.release(REDMANE_BOSS_ID)).toBe(true);
    const order = t.events.map((e) => e.type).filter((e) => e === 'boss.released' || e === 'boss.spared');
    expect(order).toEqual(['boss.released', 'boss.spared']);
    expect(t.state()!.outcome).toBe('spared');
    expect(t.ctx.state.getFlag(OUTCOME_FLAG)).toBe('spared');
    expect(t.boss()!.hittable).toBe(false);
    expect(t.boss()!.untargetable).toBe(true);
    expect(t.ctx.bosses.mercyState(REDMANE_BOSS_ID)).toBe('leaving');
    // A strike on the spared Redmane is dropped: no damage, no mercy.revoked.
    const healthBefore = t.boss()!.health;
    t.hit(50, 10);
    expect(t.boss()!.health).toBe(healthBefore);
    expect(t.of('mercy.revoked')).toEqual([]);
    t.run(secs(PRESENTATION.spareKneelSeconds + PRESENTATION.spareFadeSeconds) + 5);
    expect(t.boss()).toBeNull();
    expect(t.of('boss.ended')).toHaveLength(1);
    expect(t.interiors.log.at(-1)).toBe(`blocker:${ARENA.gate}:false`);
    t.teardown();
  });

  it('allies: a companion hit during the window lands but leaves him at 1 HP; once spared (leaving) a companion hit is dropped', async () => {
    const t = await setup();
    t.startFight();
    toWindow(t);
    const ally = t.ctx.actors.spawn({ kind: 'companion', team: 'ally', maxHealth: 100, root: new THREE.Group() });
    const strike = () => t.ctx.damage.apply({ attackerId: ally.id, targetId: t.boss()!.id, amount: 1e6, poise: 0, kind: 'melee' });
    strike();
    expect(t.boss()!.health).toBe(1);
    expect(t.of('boss.defeated')).toEqual([]);
    expect(t.ctx.bosses.release(REDMANE_BOSS_ID)).toBe(true);
    expect(strike()).toBeNull();
    expect(t.boss()!.health).toBe(1);
    t.teardown();
  });

  it('dodge counter: a non-melee player request (a status tick, a spell) does not consume it', async () => {
    const t = await setup();
    t.startFight();
    t.ctx.events.emit('player.dodged', { attackerId: t.boss()!.id, swingId: 1 });
    t.hit(1, 0, { kind: 'spell' });
    expect(t.enc().counterArmed).toBe(true);
    expect(t.hit(10, 5)!.dealt).toBe(20);
    t.teardown();
  });

  it('a spare does not change the kill: a strike in the window kills him, defeated, no spared event', async () => {
    const t = await setup();
    t.startFight();
    toWindow(t);
    t.hit(1e6, 0);
    expect(t.of('boss.defeated')).toHaveLength(1);
    expect(t.of('boss.spared')).toEqual([]);
    expect(t.ctx.state.getFlag(OUTCOME_FLAG)).toBe('defeated');
    expect(t.of('mercy')).toEqual([]);
    t.run(secs(PRESENTATION.deathClipSeconds + PRESENTATION.deathFadeSeconds) + 2);
    expect(t.boss()).toBeNull();
    expect(t.of('boss.ended')).toHaveLength(1);
    t.teardown();
  });

  it('a lapsed window does not lose the Spare: he fights on, Release is refused while closed, the next break reopens it, the floor stays lifted', async () => {
    const t = await setup();
    t.startFight();
    toWindow(t);
    t.runHealed(REDMANE.releaseWindowSeconds + 0.5);
    expect(t.state()!.releaseOpen).toBe(false);
    expect(t.ctx.bosses.release(REDMANE_BOSS_ID)).toBe(false);
    expect(t.boss()!.poise).toBe(REDMANE.maxPoise);
    t.breakPoise();
    expect(t.state()!.releaseOpen).toBe(true);
    // A break while open restarts the timer without a second open event.
    t.runHealed(2);
    t.breakPoise();
    expect(t.of('boss.releaseWindow').filter((e) => e.open)).toHaveLength(2);
    expect(t.ctx.bosses.release(REDMANE_BOSS_ID)).toBe(true);
    expect(t.of('boss.spared')).toHaveLength(1);
    t.teardown();

    // And a kill after a lapse is a plain defeat.
    const u = await setup();
    u.startFight();
    toWindow(u);
    u.runHealed(REDMANE.releaseWindowSeconds + 0.5);
    u.hit(1e6, 0);
    expect(u.of('boss.defeated')).toHaveLength(1);
    expect(u.of('boss.spared')).toEqual([]);
    u.teardown();
  });

  it('dodge counter: after a dodged swing the next player hit deals double damage and poise, once, and it lapses after a second', async () => {
    const t = await setup();
    t.startFight();
    const b = t.boss()!;
    const plain = t.hit(10, 5)!;
    expect(plain.dealt).toBe(10);
    t.ctx.events.emit('player.dodged', { attackerId: b.id, swingId: 1 });
    expect(t.enc().counterArmed).toBe(true);
    const counter = t.hit(10, 5)!;
    expect(counter.dealt).toBe(10 * COUNTER.scale);
    expect(counter.poiseDealt).toBe(5 * COUNTER.scale);
    expect(t.hit(10, 5)!.dealt).toBe(10);
    // Lapses.
    t.ctx.events.emit('player.dodged', { attackerId: b.id, swingId: 2 });
    t.runHealed(COUNTER.seconds + 0.2);
    expect(t.enc().counterArmed).toBe(false);
    expect(t.hit(10, 5)!.dealt).toBe(10);
    // A dodge of someone else's swing does not arm it; neither does a non-player hit consume it.
    t.ctx.events.emit('player.dodged', { attackerId: 'someone-else', swingId: 3 });
    expect(t.enc().counterArmed).toBe(false);
    t.teardown();
  });

  it('dodge counter: a phase change clears it', async () => {
    const t = await setup();
    t.startFight();
    t.ctx.events.emit('player.dodged', { attackerId: t.boss()!.id, swingId: 1 });
    expect(t.enc().counterArmed).toBe(true);
    t.toFraction(0.45, 0);
    expect(t.state()!.phase).toBe(2);
    expect(t.enc().counterArmed).toBe(false);
    t.teardown();
  });

  it('the Redmane sound-alikes are untouched: A6b enemy modifiers leave his script hits at their own numbers', async () => {
    const t = await setup();
    t.startFight();
    t.placeInFront(1.5);
    const e = t.enc();
    const before = t.ctx.player.actor.health;
    e.strike(MOVES.thrust, 99);
    const hits = t.of('damage.dealt').filter((d) => d.attackId === MOVES.thrust.attackId);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ outcome: 'hit', attackerId: t.boss()!.id });
    expect(before - t.ctx.player.actor.health).toBe(hits[0].dealt);
    t.teardown();
  });

  it('thrust: a blocked thrust is never parried (a script hit has no window) and never counts a break', async () => {
    const t = await setup();
    t.startFight();
    const parryable: unknown[] = [];
    t.ctx.damage.addModifier('test.guard', (req, target) => {
      if (target.id !== t.ctx.player.actor.id || req.attackId !== MOVES.thrust.attackId) return;
      parryable.push(req.parryable);
      req.outcome = 'blocked';
      req.amount = 0;
    }, -50);
    t.placeInFront(1.5);
    t.enc().strike(MOVES.thrust, 1);
    expect(parryable).toEqual([false]);
    expect(t.of('damage.dealt').find((d) => d.attackId === MOVES.thrust.attackId)).toMatchObject({ outcome: 'blocked' });
    expect(t.of('actor.staggered').filter((e) => e.actorId === t.boss()!.id)).toEqual([]);
    expect(t.of('boss.break')).toEqual([]);
    t.teardown();
  });

  it('thrust: out of reach, behind him, or at another height it whiffs', async () => {
    const t = await setup();
    t.startFight();
    const e = t.enc();
    t.placeInFront(THRUST.reach + 1);
    e.strike(MOVES.thrust, 1);
    t.placeInFront(-1.5);
    e.strike(MOVES.thrust, 2);
    const b = t.boss()!.root!.position;
    t.ctx.player.teleport({ x: b.x, y: b.y + 6, z: b.z - 1.5 }, 0);
    e.strike(MOVES.thrust, 3);
    expect(t.of('damage.dealt').filter((d) => d.attackId === MOVES.thrust.attackId)).toEqual([]);
    t.teardown();
  });

  it('charge: telegraphs 0.8 s, then hits a player standing in the lane exactly once (dodge only, unblockable)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const t = await setup();
    t.startFight();
    const charges = () => t.of('telegraph').filter((e) => e.attackId === MOVES.charge.attackId);
    let guard = 0;
    while (charges().length === 0 && guard++ < secs(20)) {
      t.placeInFront(7);
      t.healPlayer();
      t.run(1);
    }
    expect(charges()).toHaveLength(1);
    expect(charges()[0]).toMatchObject({ kind: 'dodge', leadSeconds: MOVES.charge.windup });
    // Hold the player in the lane through the couch and the run.
    for (let i = 0; i < secs(MOVES.charge.windup + 0.3); i++) {
      t.healPlayer();
      t.run(1);
    }
    for (let i = 0; i < secs(1.5); i++) {
      t.healPlayer();
      t.run(1);
    }
    const hits = t.of('damage.dealt').filter((d) => d.attackId === MOVES.charge.attackId);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ outcome: 'hit' });
    t.teardown();
  });

  it('charge: a player who side-steps after the lane locks is missed; one dodge i-frame ending mid-sweep does not hit on a later tick', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const t = await setup();
    t.startFight();
    const charges = () => t.of('telegraph').filter((e) => e.attackId === MOVES.charge.attackId);
    let guard = 0;
    while (charges().length === 0 && guard++ < secs(20)) {
      t.placeInFront(7);
      t.healPlayer();
      t.run(1);
    }
    t.runHealed(MOVES.charge.windup - 0.05);
    const p = t.ctx.player.feet;
    t.ctx.player.teleport({ x: p.x + 4, y: p.y, z: p.z }, 0);
    t.runHealed(1.5);
    expect(t.of('damage.dealt').filter((d) => d.attackId === MOVES.charge.attackId)).toEqual([]);
    t.teardown();

    // I-frames: the first contact is 'immune' and is the swing's only attempt.
    const u = await setup();
    u.startFight();
    u.ctx.player.actor.invulnerable = true;
    const e = u.enc();
    u.placeInFront(2);
    e.aim();
    e.chargeStart();
    e.chargeTick(1, 0.2);
    u.ctx.player.actor.invulnerable = false;
    e.chargeTick(1, TICK * 4);
    e.chargeTick(1, TICK * 4);
    const attempts = u.of('damage.dealt').filter((d) => d.attackId === MOVES.charge.attackId);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].outcome).toBe('immune');
    u.teardown();
  });

  it('charge: stops at the arena wall ("wall"), runs its length in open floor ("done"), and never leaves the arena', async () => {
    const t = await setup();
    t.startFight();
    const e = t.enc();
    const centre = t.ctx.anchors.find(ARENA.centre)!.position;
    // Facing -Z from the middle: 11 m is inside a 12 m half-extent.
    t.boss()!.root!.position.set(centre.x, centre.y, centre.z);
    t.ctx.player.teleport({ x: centre.x, y: centre.y, z: centre.z - 8 }, 0);
    e.aim();
    e.chargeStart();
    let progress: string = 'running';
    for (let i = 0; i < 200 && progress === 'running'; i++) progress = e.chargeTick(1, TICK);
    expect(progress).toBe('done');
    // From the far edge toward the wall.
    t.boss()!.root!.position.set(centre.x, centre.y, centre.z - 8);
    e.aim();
    e.chargeStart();
    progress = 'running';
    for (let i = 0; i < 200 && progress === 'running'; i++) progress = e.chargeTick(2, TICK);
    expect(progress).toBe('wall');
    expect(Math.abs(t.boss()!.root!.position.z - centre.z)).toBeLessThanOrEqual(ARENA.arenaHalfExtent + 1e-6);
    t.teardown();
  });

  it('net: flies to the player and roots on a hit; a blocked net does not root and is never parried', async () => {
    const t = await setup();
    t.startFight();
    t.placeInFront(7);
    t.enc().netRelease();
    expect(t.enc().liveNets).toBe(1);
    t.runHealed(1);
    const net = t.of('damage.dealt').filter((d) => d.attackId === `ranged:${NET_MOVE.id}`);
    expect(net).toHaveLength(1);
    expect(net[0]).toMatchObject({ outcome: 'hit', attackerId: t.boss()!.id });
    expect(t.status.applied).toEqual([
      { id: t.ctx.player.actor.id, spec: { id: `${NET_MOVE.id}.root`, kind: 'root', seconds: NET_MOVE.ranged!.root, sourceId: t.boss()!.id } },
    ]);
    t.teardown();

    const u = await setup();
    u.startFight();
    const parryable: unknown[] = [];
    u.ctx.damage.addModifier('test.guard', (req, target) => {
      if (target.id !== u.ctx.player.actor.id || req.attackId !== `ranged:${NET_MOVE.id}`) return;
      parryable.push(req.parryable);
      req.outcome = 'blocked';
      req.amount = 0;
    }, -50);
    u.placeInFront(7);
    u.enc().netRelease();
    u.runHealed(1);
    expect(parryable).toEqual([false]);
    expect(u.status.applied).toEqual([]);
    expect(u.of('actor.staggered').filter((e) => e.actorId === u.boss()!.id)).toEqual([]);
    expect(u.of('boss.break')).toEqual([]);
    u.teardown();
  });

  it('net: a miss flies on and expires at its range; a break cancels it in the air; a reset leaves none', async () => {
    const t = await setup();
    t.startFight();
    // Player far to the side: the net goes toward where they stood and never hits.
    const b = t.boss()!.root!.position;
    t.ctx.player.teleport({ x: b.x + 30, y: b.y, z: b.z }, 0);
    t.enc().netRelease();
    expect(t.enc().liveNets).toBe(1);
    t.runHealed(NET_MOVE.ranged!.maxRange / NET_MOVE.ranged!.speed + 0.5);
    expect(t.enc().liveNets).toBe(0);
    // A net in the air toward a standing player is cancelled by a break: it never lands.
    t.placeInFront(7);
    t.enc().netRelease();
    t.breakPoise();
    t.runHealed(1);
    expect(t.of('damage.dealt').filter((d) => d.attackId === `ranged:${NET_MOVE.id}`)).toEqual([]);
    expect(t.status.applied).toEqual([]);
    t.teardown();
  });

  it('trap: springs after its arming time and hits a player still standing in it, once, with a root; a player who steps out is missed', async () => {
    const t = await setup();
    t.startFight();
    const e = t.enc();
    t.placeInFront(5);
    e.trapPlace();
    expect(e.liveTraps).toBe(1);
    t.runHealed(TRAP.armSeconds - 0.2);
    expect(t.of('damage.dealt').filter((d) => d.attackId === MOVES.trap.attackId)).toEqual([]);
    t.runHealed(0.4);
    const hits = t.of('damage.dealt').filter((d) => d.attackId === MOVES.trap.attackId);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ outcome: 'hit' });
    expect(t.status.applied).toEqual([{ id: t.ctx.player.actor.id, spec: expect.objectContaining({ id: TRAP.rootStatusId, kind: 'root', seconds: TRAP.rootSeconds }) }]);
    // Standing in the spikes does not hit again, and they drop after their time.
    t.runHealed(TRAP.spikeSeconds + 0.5);
    expect(t.of('damage.dealt').filter((d) => d.attackId === MOVES.trap.attackId)).toHaveLength(1);
    expect(e.liveTraps).toBe(0);
    t.teardown();

    const u = await setup();
    u.startFight();
    u.placeInFront(5);
    u.enc().trapPlace();
    u.runHealed(0.5);
    const p = u.ctx.player.feet;
    u.ctx.player.teleport({ x: p.x + TRAP.radius + 1, y: p.y, z: p.z }, 0);
    u.runHealed(TRAP.armSeconds + 0.5);
    expect(u.of('damage.dealt').filter((d) => d.attackId === MOVES.trap.attackId)).toEqual([]);
    u.teardown();
  });

  it('trap: a break, a phase change and a spare all clear the traps; a trap is planted inside the cage-free half-extent', async () => {
    const t = await setup();
    t.startFight();
    const e = t.enc();
    const centre = t.ctx.anchors.find(ARENA.centre)!.position;
    t.ctx.player.teleport({ x: centre.x + 30, y: centre.y, z: centre.z }, 0);
    e.trapPlace();
    expect(e.liveTraps).toBe(1);
    t.breakPoise();
    expect(e.liveTraps).toBe(0);
    t.settle();
    t.ctx.player.teleport({ x: centre.x + 3, y: centre.y, z: centre.z }, 0);
    e.trapPlace();
    t.toFraction(0.45, 0);
    expect(e.liveTraps).toBe(0);
    t.teardown();
  });

  it('player death resets: one boss.ended, traps and nets gone, the gate open; the next entry retries with a shorter intro and no camera shot', async () => {
    const release = vi.fn();
    const override = vi.fn(() => ({ active: true, release }));
    const t = await setup({ cameraRig: { override } });
    t.startFight();
    expect(override).toHaveBeenCalledTimes(1);
    t.run(2);
    expect(t.interiors.log).toContain(`blocker:${ARENA.gate}:true`);
    const e = t.enc();
    t.placeInFront(7);
    e.trapPlace();
    e.netRelease();
    t.ctx.damage.kill(t.ctx.player.actor.id);
    t.run(2);
    expect(t.boss()).toBeNull();
    expect(t.of('boss.ended')).toHaveLength(1);
    expect(e.liveTraps).toBe(0);
    expect(e.liveNets).toBe(0);
    expect(t.interiors.log.at(-1)).toBe(`blocker:${ARENA.gate}:false`);
    t.ctx.damage.revive(t.ctx.player.actor.id, 1, 'script');
    t.enter();
    t.run(secs(PRESENTATION.retrySeconds) + 2);
    expect(t.boss()).not.toBeNull();
    expect(override).toHaveBeenCalledTimes(1);
    expect(t.state()!.health).toBe(REDMANE.maxHealth);
    t.teardown();
  });

  it('death mid-fight to the charge itself: the player is killed, the encounter resets cleanly', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const t = await setup();
    t.startFight();
    const charges = () => t.of('telegraph').filter((e) => e.attackId === MOVES.charge.attackId);
    let guard = 0;
    while (charges().length === 0 && guard++ < secs(20)) {
      t.placeInFront(7);
      t.healPlayer();
      t.run(1);
    }
    t.ctx.player.actor.health = 1;
    t.run(secs(MOVES.charge.windup + 1.5));
    expect(t.ctx.player.actor.dead).toBe(true);
    t.run(2);
    expect(t.boss()).toBeNull();
    expect(t.of('boss.ended')).toHaveLength(1);
    t.teardown();
  });

  it('reload inside the arena rectangle puts the player at the door; the entry hall is left alone; one boss.ended', async () => {
    const t = await setup();
    t.startFight();
    const door = t.ctx.anchors.find(ARENA.arenaDoor)!;
    t.game.events.emit('save.loaded', { slot: 'test' });
    t.run(1);
    expect(t.boss()).toBeNull();
    expect(t.of('boss.ended')).toHaveLength(1);
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

  it('a load mid-intro ends the intro and unfreezes; a load after the Spare (flag set) builds no fight and leaves the gate open', async () => {
    const t = await setup();
    t.enter();
    t.run(secs(1));
    expect(t.moveModifiers.state().freeze).toBe(true);
    t.game.events.emit('save.loaded', { slot: 'test' });
    t.run(1);
    expect(t.boss()).toBeNull();
    expect(t.moveModifiers.state().freeze).toBeFalsy();
    expect(t.of('boss.started')).toEqual([]);
    t.teardown();

    const u = await setup();
    u.startFight();
    toWindow(u);
    u.ctx.bosses.release(REDMANE_BOSS_ID);
    u.run(secs(0.5));
    u.game.events.emit('save.loaded', {} as never);
    u.run(2);
    expect(u.boss()).toBeNull();
    expect(u.ctx.state.getFlag(OUTCOME_FLAG)).toBe('spared');
    expect(u.interiors.log.at(-1)).toBe(`blocker:${ARENA.gate}:false`);
    u.enter();
    u.run(2);
    expect(u.boss()).toBeNull();
    u.teardown();
  });

  it('a save holding only the older outcomes loads: the older flags do not block this fight', async () => {
    const t = await setup();
    t.ctx.state.setFlag('boss.ashen-prior.outcome', 'released');
    t.ctx.state.setFlag('boss.gaffer-grimtooth.outcome', 'defeated');
    t.startFight();
    expect(t.boss()).not.toBeNull();
    expect(t.state()).not.toBeNull();
    t.teardown();
  });

  it('a fresh session with the arena never entered leaves the gate open and spawns nothing', async () => {
    const t = await setup();
    t.run(secs(5));
    expect(t.boss()).toBeNull();
    expect(t.interiors.log.filter((l) => l.startsWith(`blocker:${ARENA.gate}:true`))).toEqual([]);
    t.teardown();
  });

  it('headless with no asset loader runs the whole fight without a model; a failed model load never starts it and warns once', async () => {
    const t = await setup();
    t.startFight();
    expect(t.enc().view).toBeNull();
    t.runHealed(5);
    expect(t.state()).not.toBeNull();
    t.teardown();

    const u = await setup({ failedModel: true });
    u.enter();
    u.run(secs(PRESENTATION.introSeconds) + 2);
    expect(u.boss()).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Redmane fight cannot start'));
    u.teardown();
  });

  it('the gate stays open on the frozen player at the trigger edge and closes once they are 3.5 m past the door', async () => {
    const t = await setup();
    const door = t.ctx.anchors.find(ARENA.arenaDoor)!.position;
    t.ctx.player.teleport({ x: door.x, y: door.y, z: door.z - 3.2 }, 0);
    t.run(1);
    t.startFight();
    expect(t.interiors.log).toEqual([]);
    t.ctx.player.teleport({ x: door.x, y: door.y, z: door.z - 5.5 }, 0);
    t.run(2);
    expect(t.interiors.log).toEqual([`blocker:${ARENA.gate}:true`]);
    t.teardown();
  });

  it('a player at the side edge of the 14 m gate, far from the door axis but inside its rect, never has it closed on them', async () => {
    const t = await setup();
    const door = t.ctx.anchors.find(ARENA.arenaDoor)!.position;
    // The rect spans local z -14.5 to -13.5 from a door at -12: 2.5 to 1.5 m past the door anchor. x = 6 is 6.5 m from the door.
    t.ctx.player.teleport({ x: door.x + 6, y: door.y, z: door.z - 2 }, 0);
    t.run(1);
    t.startFight();
    t.run(10);
    expect(t.interiors.log).toEqual([]);
    t.ctx.player.teleport({ x: door.x + 6, y: door.y, z: door.z - 5 }, 0);
    t.run(2);
    expect(t.interiors.log).toEqual([`blocker:${ARENA.gate}:true`]);
    t.teardown();
  });

  it('the yield glyph runs for the window and stops when it closes, on the outcome and on a reset', async () => {
    const stops: number[] = [];
    const spawn = vi.fn(() => ({ stop: () => stops.push(1) }));
    const t = await setup();
    (t.ctx.services.provide as (n: string, v: unknown) => void)('vfx', { spawnEffect: spawn });
    t.startFight();
    toWindow(t);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn.mock.calls[0]).toEqual(['yield-glyph', expect.anything(), { seconds: REDMANE.releaseWindowSeconds }]);
    t.runHealed(REDMANE.releaseWindowSeconds + 0.5);
    expect(stops).toHaveLength(1);
    t.breakPoise();
    expect(spawn).toHaveBeenCalledTimes(2);
    t.ctx.bosses.release(REDMANE_BOSS_ID);
    expect(stops).toHaveLength(2);
    t.teardown();
  });

  it('music and bar contract: the registered state carries what the boss bar and the hush read', async () => {
    const t = await setup();
    t.startFight();
    expect(t.state()).toMatchObject({ bossId: REDMANE_BOSS_ID, nameKey: 'boss.thrandil-redmane.name', releaseOpen: false, outcome: null });
    toWindow(t);
    expect(t.of('boss.releaseWindow').at(-1)).toEqual({ bossId: REDMANE_BOSS_ID, open: true });
    t.runHealed(REDMANE.releaseWindowSeconds + 0.5);
    expect(t.of('boss.releaseWindow').at(-1)).toEqual({ bossId: REDMANE_BOSS_ID, open: false });
    t.teardown();
  });

  it('with the real Barbarian model the fight runs, and a real blade sweep reaches his hurtboxes through the combat bridge', async () => {
    const t = await setup({ model: true });
    t.startFight();
    const e = t.enc();
    expect(e.view).not.toBeNull();
    const b = t.boss()!;
    const combat = (t.world as any).combat.combat;
    const sets = [...(combat.targets as Set<any>)].filter((s) => t.ctx.actors.byOwner(s.owner)?.id === b.id);
    expect(sets).toHaveLength(1);
    const set = sets[0];
    set.update();
    expect(set.capsules.length).toBeGreaterThan(0);
    const cap = set.capsules[0];
    const mid = cap.a.clone().lerp(cap.b, 0.5);
    const sweep = segmentVsCapsules(mid.clone().add(new THREE.Vector3(0.5, 0.4, 0)), mid.clone().add(new THREE.Vector3(-0.5, -0.4, 0)), set, 1);
    expect(sweep).not.toBeNull();
    const playerOwner = {};
    t.ctx.actors.bindOwner(t.ctx.player.actor, playerOwner);
    const before = b.health;
    combat.bus.emit({ bone: sweep!.bone, point: sweep!.point, normal: sweep!.normal, attacker: playerOwner, target: set.owner, damage: 5 });
    expect(b.health).toBeLessThan(before);
    t.runHealed(5);
    t.teardown();
  });

  it('with the real model: a Spare drops the lance, fades, and disposes the model', async () => {
    const t = await setup({ model: true });
    t.startFight();
    const view = t.enc().view!;
    toWindow(t);
    t.ctx.bosses.release(REDMANE_BOSS_ID);
    expect(view.lance.parent).toBe(view.root);
    t.run(secs(PRESENTATION.spareKneelSeconds + PRESENTATION.spareFadeSeconds) + 5);
    expect(t.boss()).toBeNull();
    expect(view.root.parent).toBeNull();
    t.teardown();
  });
});

describe("A3's real keep geometry", () => {
  it('the closed gate never overlaps the capsule of a player standing where it may close', () => {
    const anchor = (id: string) => SCORCHHOLD_KEEP_DEF.anchors.find((a) => a.id === id)!;
    const door = anchor(ARENA.arenaDoor);
    const centre = anchor(ARENA.centre);
    const gate = SCORCHHOLD_KEEP_DEF.blockers!.find((b) => b.id === ARENA.gate)!.rect;
    const trigger = SCORCHHOLD_KEEP_DEF.triggers!.find((x) => x.id === ARENA.arenaTrigger)!;
    const radius = 0.35;
    const doorToCentre = Math.hypot(centre.x - door.x, centre.z - door.z);
    let checked = 0;
    for (let x = trigger.center.x - trigger.half.x; x <= trigger.center.x + trigger.half.x; x += 0.25) {
      for (let z = trigger.center.z - trigger.half.z; z <= trigger.center.z + trigger.half.z; z += 0.25) {
        const fromDoor = Math.hypot(x - door.x, z - door.z);
        const toCentre = Math.hypot(x - centre.x, z - centre.z);
        if (fromDoor < ARENA.gateClearance || toCentre >= doorToCentre) continue;
        // The arena's own extra test: the player is wholly past the gate rect.
        const anchors = { find: (id: string) => (id === ARENA.arenaDoor ? { position: { x: door.x, y: 0, z: door.z }, yaw: 0 } : null) };
        if (!gateIsClear({ anchors } as never, { x, y: 0, z })) continue;
        checked++;
        const nx = Math.max(gate.x0, Math.min(gate.x1, x));
        const nz = Math.max(gate.z0, Math.min(gate.z1, z));
        expect(Math.hypot(x - nx, z - nz)).toBeGreaterThan(radius);
      }
    }
    expect(checked).toBeGreaterThan(0);
    // The veil sits at the gate's centre and spans its long side, in world space for any site offset.
    const off = { x: 19900, z: 4900 };
    const anchors = { find: (id: string) => (id === ARENA.arenaDoor ? { position: { x: door.x + off.x, y: 155, z: door.z + off.z }, yaw: 0 } : null) };
    const veil = gateVeil({ anchors } as never)!;
    expect(veil.at.x - off.x).toBeCloseTo((gate.x0 + gate.x1) / 2);
    expect(veil.at.z - off.z).toBeCloseTo((gate.z0 + gate.z1) / 2);
    expect(veil.at.y).toBe(155);
    expect(veil.yaw).toBe(0);
    expect(gateVeil({ anchors: { find: () => null } } as never)).toBeNull();
  });

  it('the arena anchors are inside A3 interior: the charge lane fits, the trap field clears the cages, and the reload box is the arena only', () => {
    const anchor = (id: string) => SCORCHHOLD_KEEP_DEF.anchors.find((a) => a.id === id)!;
    const centre = anchor(ARENA.centre);
    const arena = SCORCHHOLD_KEEP_DEF.rooms.find((r) => r.id === 'arena')!;
    expect(centre.x - ARENA.arenaHalfExtent).toBeGreaterThanOrEqual(arena.x0);
    expect(centre.x + ARENA.arenaHalfExtent).toBeLessThanOrEqual(arena.x1);
    expect(centre.z - ARENA.arenaHalfExtent).toBeGreaterThanOrEqual(arena.z0);
    expect(centre.z + ARENA.arenaHalfExtent).toBeLessThanOrEqual(arena.z1);
    expect(CHARGE.maxMetres).toBeLessThan(ARENA.arenaHalfExtent * 2);
    for (const id of ['cinderreach.d03.prisoner.1', 'cinderreach.d03.prisoner.2']) {
      expect(Math.abs(anchor(id).x - centre.x) - ARENA.trapHalfExtent - TRAP.radius).toBeGreaterThanOrEqual(0);
    }
    // The entry hall (search points) lies outside the reload rectangle.
    for (const id of ['cinderreach.d03.keep.1', 'cinderreach.d03.keep.3']) {
      expect(Math.abs(anchor(id).z - centre.z)).toBeGreaterThan(ARENA.reloadHalfExtent);
    }
  });
});
