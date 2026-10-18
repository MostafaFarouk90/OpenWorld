import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActorId } from '../../actors/Actor';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { AssetLoader } from '../../assets/AssetLoader';
import corePlugin from '../../core/core.plugin';
import type { GameEventMap } from '../../core/events';
import { Game } from '../../core/Game';
import { MoveModifiers } from '../../core/MoveModifiers';
import type { GamePlugin, PluginModule } from '../../core/plugins';
import { InputManager } from '../../input/InputManager';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { TerrainColliders } from '../../world/TerrainColliders';
import { World } from '../../world/World';
import { OUTCOME_FLAG } from './PriorDirector';
import { CHAIN_SLOW_SOURCE, PRIOR_FLOOR_MODIFIER_ID } from './PriorEncounter';
import priorPlugin from './prior.plugin';
import { MOVES, PRESENTATION, PRIOR, PRIOR_BOSS_ID, SUMMON_GROUPS, VAULT } from './tuning';

let physics: PhysicsWorld;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const modules = (...plugins: GamePlugin[]): Record<string, PluginModule> =>
  Object.fromEntries(plugins.map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }]));

const TICK = 1 / 60;
const secs = (s: number) => Math.round(s / TICK);

/** Thread 5's summon groups as a stand-in: each spawns one hostile wraith actor; `reset` despawns and frees the slot. */
function fakeEnemies() {
  const live = new Map<string, ActorId[]>();
  const calls: string[] = [];
  let ctx: Game['ctx'] | null = null;
  const service = {
    spawnGroup: (id: string, opts?: { aggro?: boolean }) => {
      calls.push(`spawn:${id}:${opts?.aggro ? 'aggro' : ''}`);
      const a = ctx!.actors.spawn({ kind: 'ash-wraith', team: 'hostile', maxHealth: 30, maxPoise: 20, root: new THREE.Group() });
      live.set(id, [...(live.get(id) ?? []), a.id]);
      return [a.id];
    },
    reset: (id: string) => {
      calls.push(`reset:${id}`);
      for (const a of live.get(id) ?? []) if (ctx!.actors.get(a)) ctx!.actors.despawn(a);
      live.set(id, []);
    },
    alive: (id: string) => (live.get(id) ?? []).filter((a) => ctx!.actors.get(a) && !ctx!.actors.get(a)!.dead),
    despawnGroup: () => {},
    view: () => undefined,
    setMercyUnlocked: () => {},
    mercyUnlocked: () => true,
    setWarmthTier: () => {},
    lockBlockLevel: () => {},
  };
  const plugin: GamePlugin = {
    id: 'fake-enemies',
    dependsOn: ['core'],
    setup(c) {
      ctx = c as Game['ctx'];
      c.services.provide('enemies', service as never);
    },
  };
  return { plugin, calls, live, service };
}

function fakeInteriors(current: string | null = VAULT.interiorId) {
  const log: string[] = [];
  const service = {
    current,
    setBlocker: vi.fn((id: string, closed: boolean) => log.push(`blocker:${id}:${closed}`)),
  };
  const plugin: GamePlugin = {
    id: 'fake-interiors',
    dependsOn: ['core'],
    setup(c) {
      (c.services.provide as (n: string, v: unknown) => void)('interiors', service);
    },
  };
  return { plugin, service, log };
}

async function setup(
  opts: { enemies?: boolean; interiors?: string | null | false; anchors?: boolean; assets?: AssetLoader; cameraRig?: unknown } = {},
) {
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
  const game = new Game({ scene, physics, world, input, moveModifiers, assets: opts.assets ?? null, cameraRig: (opts.cameraRig ?? null) as never, report: () => {} });
  const events: Array<{ type: keyof GameEventMap; payload: any }> = [];
  game.events.onAny((type, payload) => events.push({ type, payload }));
  const enemies = fakeEnemies();
  const interiors = fakeInteriors(opts.interiors === false ? null : 'interiors' in opts ? (opts.interiors as string | null) : VAULT.interiorId);
  // The Prior loads last, so its dispose runs first and can still reopen the gate through the interiors service.
  const plugins: GamePlugin[] = [corePlugin];
  if (opts.enemies !== false) plugins.push(enemies.plugin);
  if (opts.interiors !== false) plugins.push(interiors.plugin);
  plugins.push(priorPlugin);
  await game.loadPlugins(modules(...plugins));
  await Promise.resolve();
  const ctx = game.ctx;
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  run(2);
  const p = ctx.player.feet.clone();
  // The arena laid out around the player on the terrain: door 6 m behind (+Z), centre 9 m ahead, pillars around it.
  const at = (dx: number, dz: number) => ({ x: p.x + dx, y: p.y, z: p.z + dz });
  if (opts.anchors !== false) {
    ctx.anchors.define({ id: VAULT.arenaDoor, position: at(0, 6), yaw: 0 });
    ctx.anchors.define({ id: VAULT.centre, position: at(0, -9), yaw: Math.PI });
    VAULT.pillars.forEach((id, i) =>
      ctx.anchors.define({ id, position: at(i % 2 ? 6 : -6, i < 2 ? -3 : -15), yaw: 0 }),
    );
  }
  const of = <K extends keyof GameEventMap>(type: K): GameEventMap[K][] =>
    events.filter((e) => e.type === type).map((e) => e.payload as GameEventMap[K]);
  const enter = () => game.events.emit('trigger.enter', { triggerId: VAULT.arenaTrigger, actorId: ctx.player.actor.id });
  const prior = () => [...ctx.actors.all()].find((a) => a.kind === 'ashen-prior') ?? null;
  const state = () => ctx.bosses.state(PRIOR_BOSS_ID);
  const hit = (amount: number, poise = amount, attackId?: string) =>
    ctx.damage.apply({ attackerId: 'player', targetId: prior()!.id, amount, poise, kind: attackId ? 'spell' : 'melee', attackId });
  const surge = () => hit(15, 40, 'heartshard-surge');
  /** One counted break: empties the poise with a 1-health hit. */
  const breakPoise = () => hit(1, PRIOR.maxPoise);
  /** Waits out a break stagger and the teleport after it (and a following cast if any). */
  const settle = (s = 2.5) => run(secs(s));
  const startFight = () => {
    enter();
    run(secs(PRESENTATION.introSeconds) + 1);
  };
  /** Waits until the summon cast after a phase opening (or the phase-1 opening) has ended. */
  const healPlayer = () => {
    const pl = ctx.player.actor;
    pl.health = pl.maxHealth;
  };
  /** Runs `seconds` keeping the player alive (the Prior keeps attacking a player who stands still). */
  const runHealed = (seconds: number) => {
    for (let i = 0; i < secs(seconds); i++) {
      game.fixedUpdate();
      healPlayer();
    }
  };
  const teardown = () => {
    game.dispose();
    world.dispose();
  };
  return {
    game, ctx, world, events, of, run, runHealed, enter, prior, state, hit, surge, breakPoise, settle, startFight, healPlayer,
    enemies, interiors, moveModifiers, teardown, at,
  };
}

type T = Awaited<ReturnType<typeof setup>>;

/** Phase-1 opening done, the shield dropped by a Surge. */
function openFight(t: T) {
  t.startFight();
  t.run(secs(PRIOR.summonCastSeconds) + 2);
  expect(t.state()!.shield).toBe(true);
  t.surge();
  expect(t.state()!.shield).toBe(false);
}

/** From an open phase 1: cross into phase 2 with a hit that also breaks, wait for the shielded opening, drop the shield. */
function toPhaseTwo(t: T) {
  const s = t.state()!;
  t.hit(s.health - s.maxHealth * 0.5 + 1, PRIOR.maxPoise);
  expect(t.state()!.phase).toBe(2);
  t.settle(PRIOR.breakSeconds + 1.2 + PRIOR.summonCastSeconds + 0.3);
  expect(t.state()!.shield).toBe(true);
  t.surge();
  expect(t.state()!.shield).toBe(false);
}

/** Phase-2 breaks until the window opens. */
function toWindow(t: T) {
  for (let i = 0; i < 3 && !t.state()!.releaseOpen; i++) {
    t.breakPoise();
    if (!t.state()!.releaseOpen) t.settle();
  }
  expect(t.state()!.releaseOpen).toBe(true);
}

describe('Ashen Prior on the real core', () => {
  it('registers its strings and system, and removes them on dispose', async () => {
    const t = await setup();
    expect(t.ctx.strings.has('boss.ashen-prior.name')).toBe(true);
    expect(t.game.systems.has('bosses.prior')).toBe(true);
    t.teardown();
    expect(t.game.systems.has('bosses.prior')).toBe(false);
  });

  it('intro: the player is frozen in the cutscene context, the boss registers only after it (headless: no camera shot)', async () => {
    const t = await setup();
    expect(t.ctx.cameraRig).toBeNull();
    t.enter();
    expect(t.prior()).not.toBeNull();
    expect(t.prior()!.hittable).toBe(false);
    expect(t.moveModifiers.state().freeze).toBe(true);
    expect(t.ctx.input.contexts.top()).toBe('cutscene');
    t.run(secs(PRESENTATION.introSeconds) - 2);
    expect(t.of('boss.started')).toEqual([]);
    t.run(3);
    expect(t.of('boss.started')).toEqual([{ bossId: PRIOR_BOSS_ID, actorId: t.prior()!.id }]);
    expect(t.moveModifiers.state().freeze).toBeFalsy();
    expect(t.ctx.input.contexts.top()).toBe('gameplay');
    expect(t.prior()!.hittable).toBe(true);
    expect(t.state()).toMatchObject({ phases: 2, breaksPerPhase: 3, phase: 1 });
    t.teardown();
  });

  it('the trigger firing twice starts one encounter; other triggers and actors are ignored', async () => {
    const t = await setup();
    t.game.events.emit('trigger.enter', { triggerId: 'trg.vault.door', actorId: t.ctx.player.actor.id });
    t.game.events.emit('trigger.enter', { triggerId: VAULT.arenaTrigger, actorId: 'someone#1' });
    expect(t.prior()).toBeNull();
    t.enter();
    t.enter();
    t.run(secs(PRESENTATION.introSeconds) + 2);
    t.enter();
    expect([...t.ctx.actors.all()].filter((a) => a.kind === 'ashen-prior')).toHaveLength(1);
    expect(t.of('boss.started')).toHaveLength(1);
    t.teardown();
  });

  it('missing vault anchors: one warning, nothing spawns', async () => {
    const t = await setup({ anchors: false });
    t.enter();
    t.enter();
    expect(t.prior()).toBeNull();
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('vault anchors missing'))).toHaveLength(1);
    t.teardown();
  });

  it('closes 3a gate once the player is inside and draws the veil; opens it on the outcome', async () => {
    const t = await setup();
    t.startFight();
    expect(t.interiors.log).toEqual([`blocker:${VAULT.gate}:true`]);
    expect(t.ctx.scene.getObjectByName('prior-ash-veil')!.visible).toBe(true);
    openFight(t);
    toPhaseTwo(t);
    toWindow(t);
    t.hit(1e6);
    expect(t.interiors.log).toEqual([`blocker:${VAULT.gate}:true`]);
    t.run(secs(PRESENTATION.deathClipSeconds + PRESENTATION.deathDissolveSeconds) + 2);
    expect(t.interiors.log).toEqual([`blocker:${VAULT.gate}:true`, `blocker:${VAULT.gate}:false`]);
    expect(t.ctx.scene.getObjectByName('prior-ash-veil')!.visible).toBe(false);
    t.teardown();
  });

  it('never closes the gate on the player standing near the door', async () => {
    const t = await setup();
    const p = t.ctx.player.feet.clone();
    // move the door right next to the player: the clearance rule keeps the gate open
    t.ctx.anchors.find(VAULT.arenaDoor)!.position.z = p.z + 1;
    t.startFight();
    t.run(30);
    expect(t.interiors.service.setBlocker).not.toHaveBeenCalled();
    t.teardown();
  });

  it('phase-1 opening: shielded cast, two aggroed summons through thread 5 groups, each slot reset first', async () => {
    const t = await setup();
    t.startFight();
    expect(t.of('boss.shield')).toEqual([{ bossId: PRIOR_BOSS_ID, up: true }]);
    t.run(secs(PRIOR.summonCastSeconds) + 2);
    expect(t.enemies.calls).toEqual([
      `reset:${SUMMON_GROUPS[0]}`,
      `spawn:${SUMMON_GROUPS[0]}:aggro`,
      `reset:${SUMMON_GROUPS[1]}`,
      `spawn:${SUMMON_GROUPS[1]}:aggro`,
    ]);
    t.teardown();
  });

  it('shield: ordinary hits are immune and count no break; a landed Surge drops it', async () => {
    const t = await setup();
    t.startFight();
    const before = t.prior()!.health;
    const r = t.hit(50, PRIOR.maxPoise);
    expect(r!.outcome).toBe('immune');
    expect(t.prior()!.health).toBe(before);
    expect(t.of('boss.break')).toEqual([]);
    t.surge();
    expect(t.state()!.shield).toBe(false);
    t.teardown();
  });

  it('breaks key on last: four phase-1 breaks give no last; crossing 50% with a break counts it in phase 2', async () => {
    const t = await setup();
    openFight(t);
    for (let i = 0; i < 4; i++) {
      t.breakPoise();
      t.settle();
    }
    expect(t.of('boss.break').map((b) => [b.phase, b.breaks, b.last])).toEqual([
      [1, 1, false],
      [1, 2, false],
      [1, 3, false],
      [1, 4, false],
    ]);
    const n = t.events.length;
    toPhaseTwo(t);
    const order = t.events.slice(n).filter((e) => e.type === 'boss.phase' || e.type === 'boss.break' || e.type === 'boss.shield');
    // the registry reports the phase first, then the break of the same hit; the phase-2 shield comes later, at the cast
    expect(order.map((e) => e.type)).toEqual(['boss.phase', 'boss.break', 'boss.shield', 'boss.shield']);
    expect(order[1].payload).toMatchObject({ phase: 2, breaks: 1, last: false });
    t.breakPoise();
    t.settle();
    t.breakPoise();
    expect(t.of('boss.break').at(-1)).toMatchObject({ phase: 2, breaks: 3, last: true });
    expect(t.state()!.releaseOpen).toBe(true);
    t.teardown();
  });

  it('floor: before the last break a huge hit leaves 8% and still breaks poise; after it, the same hit kills', async () => {
    const t = await setup();
    openFight(t);
    const floor = Math.ceil(PRIOR.maxHealth * PRIOR.healthFloor);
    const r = t.hit(1e6, PRIOR.maxPoise);
    expect(t.prior()!.health).toBe(floor);
    // the floor clamps health only: the same hit still empties the poise and breaks him
    expect(r!.staggered).toBe(true);
    expect(t.prior()!.poise).toBe(0);
    expect(t.state()!.phase).toBe(2);
    t.settle(PRIOR.breakSeconds + 1.2 + PRIOR.summonCastSeconds + 0.3);
    t.surge();
    expect(t.prior()!.health).toBe(floor);
    toWindow(t);
    t.hit(1e6);
    expect(t.prior()!.dead).toBe(true);
    expect(t.of('boss.defeated')).toHaveLength(1);
    expect(t.ctx.state.getFlag(OUTCOME_FLAG)).toBe('defeated');
    t.teardown();
  });

  it('the floor modifier is registered at order 99 and removed with the encounter', async () => {
    const t = await setup();
    const mods = () => (t.ctx.damage as unknown as { modifiers: { id: string; order: number }[] }).modifiers;
    t.startFight();
    expect(mods().find((m) => m.id === PRIOR_FLOOR_MODIFIER_ID)?.order).toBe(99);
    t.ctx.damage.kill('player');
    expect(mods().find((m) => m.id === PRIOR_FLOOR_MODIFIER_ID)).toBeUndefined();
    t.teardown();
  });

  it('defeat: death clip and dissolve, then exactly one boss.ended; summons reset; nothing on a later teardown', async () => {
    const t = await setup();
    openFight(t);
    toPhaseTwo(t);
    toWindow(t);
    t.hit(1e6);
    expect(t.of('boss.ended')).toEqual([]);
    t.run(secs(PRESENTATION.deathClipSeconds + PRESENTATION.deathDissolveSeconds) + 2);
    expect(t.of('boss.ended')).toHaveLength(1);
    expect(t.prior()).toBeNull();
    for (const g of SUMMON_GROUPS) expect(t.enemies.calls).toContain(`reset:${g}`);
    expect(t.enemies.service.alive(SUMMON_GROUPS[0])).toEqual([]);
    t.teardown();
    expect(t.of('boss.ended')).toHaveLength(1);
  });

  it('release (as thread 1 calls it): kneel, gold dissolve, despawn with one boss.ended; no interactable of 3b', async () => {
    const t = await setup();
    const items = () => [...(t.ctx.interaction as unknown as { items: Map<string, unknown> }).items.keys()];
    openFight(t);
    toPhaseTwo(t);
    toWindow(t);
    expect(t.ctx.bosses.release(PRIOR_BOSS_ID)).toBe(true);
    expect(t.ctx.state.getFlag(OUTCOME_FLAG)).toBe('released');
    expect(t.prior()!.hittable).toBe(false);
    t.run(secs(PRESENTATION.releaseDissolveSeconds) - 5);
    expect(t.prior()).not.toBeNull();
    t.run(10);
    expect(t.prior()).toBeNull();
    expect(t.of('boss.released')).toHaveLength(1);
    expect(t.of('boss.ended')).toHaveLength(1);
    expect(items().filter((id) => id.startsWith('release:'))).toEqual([]);
    t.teardown();
  });

  it('a window closing unused: release is refused, he stands, teleports and fights on; the next break reopens it', async () => {
    const t = await setup();
    openFight(t);
    toPhaseTwo(t);
    toWindow(t);
    t.run(secs(PRIOR.releaseWindowSeconds) + 2);
    expect(t.state()!.releaseOpen).toBe(false);
    // a hold that completes after the window closed does nothing
    expect(t.ctx.bosses.release(PRIOR_BOSS_ID)).toBe(false);
    expect(t.ctx.state.hasFlag(OUTCOME_FLAG)).toBe(false);
    t.settle(2);
    expect(t.prior()!.poise).toBe(PRIOR.maxPoise);
    t.breakPoise();
    expect(t.state()!.releaseOpen).toBe(true);
    t.teardown();
  });

  it('B1: a careful Release-path fight needs two Surges; from Burn 0 it ends at 70 with no Scar (thread 1 charging stand-in)', async () => {
    const t = await setup();
    // Stand-in for threads 1 and 2: a Surge adds 25 Burn, the boss Release 20, each scarring at 75 or more.
    let burn = 0;
    let scars = 0;
    const shard = (gain: number) => {
      if (burn >= 75) scars++;
      burn = Math.min(100, burn + gain);
    };
    t.startFight();
    // a long careful phase 1 with the re-summon happening
    t.run(secs(PRIOR.summonCastSeconds) + 2);
    shard(25);
    t.surge();
    // kill the opening summons so the phase-1 re-summon happens: it must not raise the shield
    for (const g of SUMMON_GROUPS) for (const id of t.enemies.service.alive(g)) t.ctx.damage.kill(id, 'player');
    t.runHealed(30);
    expect(t.enemies.calls.filter((c) => c.startsWith('spawn:'))).toHaveLength(4);
    expect(t.of('boss.shield').filter((e) => e.up)).toHaveLength(1);
    const s = t.state()!;
    t.hit(s.health - s.maxHealth * 0.5 + 1, 0);
    t.run(secs(1.2 + PRIOR.summonCastSeconds + 0.5));
    if (t.state()!.shield) {
      shard(25);
      t.surge();
    }
    t.runHealed(30);
    expect(t.state()!.shield).toBe(false);
    toWindow(t);
    expect(t.ctx.bosses.release(PRIOR_BOSS_ID)).toBe(true);
    shard(20);
    expect(t.of('boss.shield').filter((e) => e.up)).toHaveLength(2);
    expect(burn).toBeLessThanOrEqual(70);
    expect(scars).toBe(0);
    t.teardown();
  });

  it('release succeeds at Burn 90 (one Scar) and at Burn 100 (Burn stays 100): the Prior never gates on Burn', async () => {
    for (const start of [90, 100]) {
      const t = await setup();
      let burn = start;
      let scars = 0;
      openFight(t);
      toPhaseTwo(t);
      toWindow(t);
      expect(t.ctx.bosses.release(PRIOR_BOSS_ID)).toBe(true);
      if (burn >= 75) scars++;
      burn = Math.min(100, burn + 20);
      expect(scars).toBe(1);
      expect(burn).toBe(100);
      t.run(secs(PRESENTATION.releaseDissolveSeconds) + 2);
      expect(t.prior()).toBeNull();
      t.teardown();
    }
  });

  it('waves: the openings plus one re-summon per phase, at most four; a spent slot refills after a reset', async () => {
    const t = await setup();
    openFight(t);
    t.healPlayer();
    // kill both summons: slots free up, and the re-summon refills the same groups after resetting them
    for (const g of SUMMON_GROUPS.slice(0, 2)) for (const id of t.enemies.service.alive(g)) t.ctx.damage.kill(id, 'player');
    t.runHealed(30);
    const spawns = () => t.enemies.calls.filter((c) => c.startsWith('spawn:')).length;
    expect(spawns()).toBe(4);
    const second = t.enemies.calls.slice(4);
    expect(second.slice(0, 2)).toEqual([`reset:${SUMMON_GROUPS[0]}`, `spawn:${SUMMON_GROUPS[0]}:aggro`]);
    for (const g of SUMMON_GROUPS) for (const id of t.enemies.service.alive(g)) t.ctx.damage.kill(id, 'player');
    t.runHealed(60);
    expect(spawns()).toBe(4);
    t.teardown();
  });

  it('telegraphs carry the full payload, a break cancels a wind-up, and the censer is a dodge-only hit', async () => {
    const t = await setup();
    openFight(t);
    let guard = 0;
    while (t.of('telegraph').length === 0 && guard++ < secs(20)) t.run(1);
    const tel = t.of('telegraph')[0];
    expect(tel).toMatchObject({ actorId: t.prior()!.id, swingId: 1 });
    expect(['prior.censer', 'prior.chain']).toContain(tel.attackId);
    expect(tel.moveId).toBe(`ashen-prior.${tel.attackId.split('.')[1]}`);
    expect(tel.leadSeconds).toBe(tel.kind === 'dodge' ? MOVES.censer.windup : MOVES.chain.windup);
    t.breakPoise();
    expect(t.of('telegraph.cancelled')).toEqual([{ actorId: t.prior()!.id, swingId: 1 }]);
    t.teardown();
  });

  it('the censer hits the player in range as unblockable; the chain is blockable and slows for 2 s', async () => {
    const t = await setup();
    openFight(t);
    const toPlayer = () => t.of('damage.dealt').filter((d) => d.targetId === 'player');
    let guard = 0;
    while (!toPlayer().some((d) => d.attackId === 'prior.chain') && guard++ < secs(30)) {
      t.healPlayer();
      t.run(1);
    }
    const chain = toPlayer().find((d) => d.attackId === 'prior.chain')!;
    expect(chain.unblockable).toBeFalsy();
    expect(t.moveModifiers.state().speedScale).toBeCloseTo(0.6);
    t.run(secs(2.1));
    expect(t.moveModifiers.state().speedScale).toBe(1);
    guard = 0;
    while (!toPlayer().some((d) => d.attackId === 'prior.censer') && guard++ < secs(30)) {
      t.healPlayer();
      t.run(1);
    }
    const censer = toPlayer().find((d) => d.attackId === 'prior.censer')!;
    expect(censer.unblockable).toBe(true);
    expect(censer.dealt).toBe(MOVES.censer.damage);
    expect(CHAIN_SLOW_SOURCE).toBe('bosses.prior.chain-slow');
    t.teardown();
  });

  it('player death resets: one boss.ended, summons and Prior gone, gate open; re-entry plays the short rise and re-registers at full health', async () => {
    const t = await setup();
    openFight(t);
    t.hit(100);
    t.ctx.damage.kill('player');
    expect(t.prior()).toBeNull();
    expect(t.of('boss.ended')).toEqual([expect.objectContaining({ bossId: PRIOR_BOSS_ID, reason: 'despawned' })]);
    expect(t.interiors.log.at(-1)).toBe(`blocker:${VAULT.gate}:false`);
    for (const g of SUMMON_GROUPS) expect(t.enemies.service.alive(g)).toEqual([]);
    t.ctx.damage.revive('player', 1, 'respawn');
    t.enter();
    expect(t.moveModifiers.state().freeze).toBe(true);
    t.run(secs(PRESENTATION.retrySeconds) + 2);
    expect(t.of('boss.started')).toHaveLength(2);
    expect(t.prior()!.health).toBe(PRIOR.maxHealth);
    expect(t.state()!.phase).toBe(1);
    t.teardown();
  });

  it('load inside the vault with the outcome unset: fight torn down, gate opened, then the player goes to vault.arena.door', async () => {
    const t = await setup();
    openFight(t);
    const teleport = vi.spyOn(t.ctx.player, 'teleport').mockImplementation(() => {
      t.interiors.log.push('teleport');
      return { ready: () => true };
    });
    t.game.events.emit('save.loaded', { slot: 'auto' });
    expect(t.prior()).toBeNull();
    expect(t.of('boss.ended')).toHaveLength(1);
    expect(t.interiors.log.slice(-2)).toEqual([`blocker:${VAULT.gate}:false`, 'teleport']);
    const door = t.ctx.anchors.get(VAULT.arenaDoor);
    expect(teleport).toHaveBeenCalledWith(door.position, door.yaw);
    for (const g of SUMMON_GROUPS) expect(t.enemies.calls).toContain(`reset:${g}`);
    t.teardown();
  });

  it('load outdoors or with the outcome set does not teleport; a beaten Prior never spawns again', async () => {
    const out = await setup({ interiors: null });
    const tp = vi.spyOn(out.ctx.player, 'teleport');
    out.game.events.emit('save.loaded', { slot: 'auto' });
    expect(tp).not.toHaveBeenCalled();
    out.teardown();

    const t = await setup();
    t.ctx.state.setFlag(OUTCOME_FLAG, 'released');
    const tp2 = vi.spyOn(t.ctx.player, 'teleport');
    t.game.events.emit('save.loaded', { slot: 'auto' });
    expect(tp2).not.toHaveBeenCalled();
    t.enter();
    t.run(10);
    expect(t.prior()).toBeNull();
    t.teardown();
  });

  it('the outcome flag set by another path mid-fight ends the encounter on the next tick', async () => {
    const t = await setup();
    openFight(t);
    t.ctx.state.setFlag(OUTCOME_FLAG, 'defeated');
    t.run(2);
    expect(t.prior()).toBeNull();
    expect(t.of('boss.ended')).toHaveLength(1);
    t.teardown();
  });

  it('teardown mid-fight unregisters: exactly one boss.ended "unregistered", veil hidden', async () => {
    const t = await setup();
    openFight(t);
    const veil = t.ctx.scene.getObjectByName('prior-ash-veil')!;
    expect(veil.visible).toBe(true);
    t.teardown();
    expect(t.of('boss.ended')).toEqual([expect.objectContaining({ reason: 'unregistered' })]);
    expect(veil.visible).toBe(false);
    expect(veil.parent).toBeNull();
  });

  it('teardown during the intro releases the freeze and the input context', async () => {
    const t = await setup();
    t.enter();
    expect(t.moveModifiers.state().freeze).toBe(true);
    t.teardown();
    expect(t.moveModifiers.state().freeze).toBeFalsy();
    expect(t.of('boss.started')).toEqual([]);
  });

  it('without the enemies, interiors, vfx and audio services the fight still runs to an outcome', async () => {
    const t = await setup({ enemies: false, interiors: false });
    openFight(t);
    toPhaseTwo(t);
    toWindow(t);
    expect(t.ctx.bosses.release(PRIOR_BOSS_ID)).toBe(true);
    t.run(secs(PRESENTATION.releaseDissolveSeconds) + 2);
    expect(t.prior()).toBeNull();
    t.teardown();
  });

  it('with the Mage loaded the Prior is the model, and the model leaves the scene with him', async () => {
    (globalThis as any).self ??= globalThis;
    const fsModule = 'node:fs';
    const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as any;
    const file = readFileSync('public/assets/kaykit-adventurers/characters/Mage.glb');
    const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    const gltf: any = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res as any, rej));
    const assets = {
      load: vi.fn(async () => gltf),
      instantiate: vi.fn(() => cloneSkinned(gltf.scene)),
      animations: vi.fn(() => gltf.animations),
      has: () => true,
    } as unknown as AssetLoader;
    const t = await setup({ assets });
    t.startFight();
    const root = t.ctx.scene.getObjectByName('boss-ashen-prior')!;
    expect(root).toBeDefined();
    expect(t.prior()!.root).toBe(root);
    openFight(t);
    toPhaseTwo(t);
    toWindow(t);
    t.hit(1e6);
    t.run(secs(PRESENTATION.deathClipSeconds + PRESENTATION.deathDissolveSeconds) + 2);
    expect(t.ctx.scene.getObjectByName('boss-ashen-prior')).toBeUndefined();
    t.teardown();
  });

  it('the chain stays unparryable: a timed block (guard stand-in honouring parryable) blocks, counts no boss break', async () => {
    const t = await setup();
    openFight(t);
    // Stand-in for CombatVerbs.guardModifier at -50, mirroring GuardModel.resolve: a timed block on a swing with no window
    // parries and staggers the attacker unless the request says `parryable: false`, when it is a plain block.
    const seen: { attackerId: string | null; parryable: unknown }[] = [];
    t.ctx.damage.addModifier('test.parry', (req, target, attacker) => {
      if (target.id !== 'player' || req.attackId !== 'prior.chain') return;
      seen.push({ attackerId: req.attackerId, parryable: req.parryable });
      req.amount = 0;
      req.poise = 0;
      if (req.parryable === false) {
        req.outcome = 'blocked';
        return;
      }
      req.outcome = 'parried';
      if (attacker) t.ctx.damage.stagger(attacker.id, 'player', 999);
    }, -50);
    let guard = 0;
    const chains = () => t.of('damage.dealt').filter((d) => d.attackId === 'prior.chain');
    while (chains().length === 0 && guard++ < secs(30)) {
      t.healPlayer();
      t.run(1);
    }
    expect(seen[0]).toEqual({ attackerId: t.prior()!.id, parryable: false });
    expect(chains()[0]).toMatchObject({ outcome: 'blocked', dealt: 0 });
    t.run(2);
    expect(t.of('boss.break')).toEqual([]);
    expect(t.of('actor.staggered').filter((e) => e.actorId === t.prior()!.id)).toEqual([]);
    t.teardown();
  });

  it('he cannot be hit while fading in after a teleport (no break lost to the arrival)', async () => {
    const t = await setup();
    openFight(t);
    t.breakPoise();
    let guard = 0;
    while (t.game.ctx.actors && guard++ < secs(5)) {
      t.run(1);
      const enc = t.prior();
      if (enc && !enc.hittable && t.of('boss.break').length === 1) break;
    }
    // during teleportOut, hidden and teleportIn every hit is dropped
    const r = t.hit(1, PRIOR.maxPoise);
    expect(r).toBeNull();
    t.settle(1.5);
    expect(t.prior()!.hittable).toBe(true);
    expect(t.prior()!.poise).toBe(PRIOR.maxPoise);
    t.teardown();
  });

  it('a trigger while the Mage loads waits for it, then starts; a failed load never starts the fight', async () => {
    (globalThis as any).self ??= globalThis;
    const fsModule = 'node:fs';
    const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as any;
    const file = readFileSync('public/assets/kaykit-adventurers/characters/Mage.glb');
    const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    const gltf: any = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res as any, rej));
    let resolveLoad!: () => void;
    const loaded = new Promise<void>((r) => (resolveLoad = r));
    const assets = {
      load: vi.fn(async () => {
        await loaded;
        return gltf;
      }),
      instantiate: vi.fn(() => cloneSkinned(gltf.scene)),
      animations: vi.fn(() => gltf.animations),
      has: () => true,
    } as unknown as AssetLoader;
    const t = await setup({ assets });
    t.enter();
    t.run(10);
    expect(t.prior()).toBeNull();
    resolveLoad();
    await new Promise((r) => setTimeout(r, 0));
    t.run(2);
    expect(t.prior()).not.toBeNull();
    expect(t.ctx.scene.getObjectByName('boss-ashen-prior')).toBeDefined();
    t.teardown();

    const failing = { ...(assets as any), load: vi.fn(async () => Promise.reject(new Error('404'))) } as unknown as AssetLoader;
    const f = await setup({ assets: failing });
    await new Promise((r) => setTimeout(r, 0));
    f.enter();
    f.run(10);
    f.enter();
    expect(f.prior()).toBeNull();
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('fight does not start'))).toHaveLength(1);
    f.teardown();
  });

  it('with a camera rig the first intro overrides the camera toward the arena and releases it when the intro ends; retries skip it', async () => {
    const release = vi.fn();
    const rig = { override: vi.fn(() => ({ active: true, release })) };
    const t = await setup({ cameraRig: rig });
    t.enter();
    expect(rig.override).toHaveBeenCalledTimes(1);
    const shot = (rig.override.mock.calls[0] as unknown as [{ lookAt: { x: number; z: number } }])[0];
    const centre = t.ctx.anchors.get(VAULT.centre).position;
    expect(shot.lookAt).toMatchObject({ x: centre.x, z: centre.z });
    t.run(secs(PRESENTATION.introSeconds) - 5);
    expect(release).not.toHaveBeenCalled();
    t.run(6);
    // (the core's scoped wrapper may forward the release more than once; the real rig's release is idempotent)
    expect(release).toHaveBeenCalled();
    t.ctx.damage.kill('player');
    t.ctx.damage.revive('player', 1, 'respawn');
    t.enter();
    t.run(secs(PRESENTATION.retrySeconds) + 1);
    expect(rig.override).toHaveBeenCalledTimes(1);
    t.teardown();
  });

  it('teardown during the first intro releases the camera override', async () => {
    const release = vi.fn();
    const rig = { override: vi.fn(() => ({ active: true, release })) };
    const t = await setup({ cameraRig: rig });
    t.enter();
    t.teardown();
    expect(release).toHaveBeenCalled();
  });

  it('the gate does not close during the outcome presentation', async () => {
    const t = await setup();
    const door = t.ctx.anchors.find(VAULT.arenaDoor)!;
    const p = t.ctx.player.feet;
    door.position.z = p.z + 1; // the player stays within the clearance: the gate stays open through the fight
    openFight(t);
    toPhaseTwo(t);
    toWindow(t);
    t.ctx.bosses.release(PRIOR_BOSS_ID);
    door.position.z = p.z + 10; // now far enough, but the outcome is in
    t.run(secs(PRESENTATION.releaseDissolveSeconds) + 2);
    expect(t.interiors.service.setBlocker).not.toHaveBeenCalled();
    t.teardown();
  });
});
