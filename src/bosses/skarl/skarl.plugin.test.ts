import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../core/core.plugin';
import type { GameEventMap } from '../../core/events';
import { Game } from '../../core/Game';
import { MoveModifiers } from '../../core/MoveModifiers';
import type { GamePlugin, PluginModule } from '../../core/plugins';
import { BOSS_MERCY } from '../../enemies/tuning';
import { SKARL_DRAKE_DEF, SKARL_DRAKE_DIVE_WINDUP } from '../../enemies/wyrm/drake/def';
import { InputManager } from '../../input/InputManager';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { killXp } from '../../progression/tuning';
import { TerrainColliders } from '../../world/TerrainColliders';
import { World } from '../../world/World';
import { OUTCOME_FLAG } from './SkarlDirector';
import { KICK_SHOVE_OWNER, SKARL_BOSS_DEF } from './SkarlEncounter';
import skarlPlugin, { SKARL_CODEX_ID, skarlDirector } from './skarl.plugin';
import { SKARL_SPAWNERS } from './spawners';
import {
  ARENA,
  BOLT,
  CHAIN,
  D06_STARTED_FLAG,
  DRAKE_SPAWNER,
  KICK,
  LEVER,
  PRESENTATION,
  SKARL,
  SKARL_BOSS_ID,
  SKARL_CHAIN_ID,
  SKARL_LEVER_ID,
  skarlLevel,
} from './tuning';

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
const T30 = 30_000;

function fakeService(id: string, name: string, service: unknown): GamePlugin {
  return {
    id,
    dependsOn: ['core'],
    setup(c) {
      (c.services.provide as (n: string, v: unknown) => void)(name, service);
    },
  };
}

type Opts = { flag?: boolean; anchors?: boolean; playerLevel?: number; codex?: boolean; drake?: boolean };

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
  const game = new Game({ scene, physics, world, input, moveModifiers, assets: null as never, cameraRig: null as never, report: () => {} });
  const events: Array<{ type: keyof GameEventMap; payload: any }> = [];
  game.events.onAny((type, payload) => events.push({ type, payload }));
  const holds: Array<{ x: number; z: number; speed: number } | null> = [];
  const verbs = {
    holdForcedMove: vi.fn((owner: string, move: { x: number; z: number; speed: number } | null) => {
      if (owner === KICK_SHOVE_OWNER) holds.push(move);
    }),
  };
  // The drake: a plain actor the fake enemies service spawns; the fake drakes service lands and frees it on demand.
  let ctxRef: any = null;
  const drake = { id: null as string | null, landed: false, chained: 0, freed: 0, spawns: 0, despawns: 0 };
  const enemies = {
    spawnGroup: (id: string) => {
      if (id !== DRAKE_SPAWNER || opts.drake === false) return [];
      drake.spawns++;
      const a = ctxRef.actors.spawn({ kind: 'skarl-drake', team: 'hostile', level: 27, maxHealth: 160, maxPoise: 50, root: new THREE.Group() });
      drake.id = a.id;
      return [a.id];
    },
    despawnGroup: (id: string) => {
      if (id !== DRAKE_SPAWNER || !drake.id) return;
      drake.despawns++;
      if (ctxRef.actors.get(drake.id)) ctxRef.actors.despawn(drake.id);
      drake.id = null;
    },
    reset: () => {},
    alive: () => [],
    view: () => undefined,
  };
  const drakes = {
    chain: vi.fn(() => {
      drake.chained++;
      return () => {};
    }),
    chainLow: () => (drake.landed ? postAt() : null),
    strike: vi.fn(() => drake.landed),
    release: vi.fn((id: string) => {
      if (id !== drake.id) return false;
      drake.freed++;
      ctxRef.events.emit('wyrm.drake.freed', { actorId: id });
      return true;
    }),
  };
  const unlocked = new Set<string>();
  const codex = {
    register: () => () => {},
    unlock: (id: string) => unlocked.add(id),
    has: (id: string) => unlocked.has(id),
    open: () => {},
  };
  const plugins = [
    corePlugin,
    fakeService('enemies', 'enemies', enemies),
    fakeService('fake-drakes', 'drakes', drakes),
    fakeService('fake-verbs', 'combatVerbs', verbs),
    ...(opts.playerLevel !== undefined ? [fakeService('fake-progression', 'progression', { level: opts.playerLevel })] : []),
    ...(opts.codex ? [fakeService('fake-codex', 'codex', codex)] : []),
    skarlPlugin,
  ];
  await game.loadPlugins(modules(...plugins));
  const ctx = game.ctx;
  ctxRef = ctx;
  if (opts.flag !== false) ctx.state.setFlag(D06_STARTED_FLAG, true);
  await new Promise((r) => setTimeout(r, 0));
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  const walk = (n: number) => {
    for (let i = 0; i < n; i++) {
      game.fixedUpdate();
      game.render(1, TICK);
    }
  };
  run(2);
  // The courtyard laid out as K4 does (the centre, Skarl 10 m north facing it, the post 14 m east and 12 m north), its centre
  // 30 m north of the player's spawn, at the spawn's height.
  const p = ctx.player.feet.clone();
  const centre = new THREE.Vector3(p.x, p.y, p.z + 30);
  const at = (dx: number, dz: number) => ({ x: centre.x + dx, y: p.y, z: centre.z + dz });
  const postAt = () => at(14, 12 - 1.8);
  if (opts.anchors !== false) {
    ctx.anchors.define({ id: ARENA.centre, position: at(0, 0), yaw: 0 });
    ctx.anchors.define({ id: ARENA.skarl, position: at(0, 10), yaw: 0 });
    ctx.anchors.define({ id: ARENA.drake, position: at(11.5, 12), yaw: 0 });
    ctx.anchors.define({ id: ARENA.post, position: postAt(), yaw: 0 });
  }
  const of = <K extends keyof GameEventMap>(type: K): GameEventMap[K][] =>
    events.filter((e) => e.type === type).map((e) => e.payload as GameEventMap[K]);
  const boss = () => [...ctx.actors.all()].find((a) => a.kind === 'corvin-skarl') ?? null;
  const state = () => ctx.bosses.state(SKARL_BOSS_ID);
  const enc = () => skarlDirector()!.current!;
  const healPlayer = () => {
    const pl = ctx.player.actor;
    if (!pl.dead) pl.health = pl.maxHealth;
  };
  const runHealed = (seconds: number) => {
    for (let i = 0; i < secs(seconds); i++) {
      game.fixedUpdate();
      healPlayer();
    }
  };
  const until = (cond: () => boolean, max = 30) => {
    for (let i = 0; i < secs(max); i++) {
      if (cond()) return true;
      game.fixedUpdate();
      healPlayer();
    }
    return cond();
  };
  const teleport = (dx: number, dz: number) => {
    ctx.player.teleport(at(dx, dz));
    walk(2);
  };
  /** Walks in (teleports inside the start radius) and runs the first intro. */
  const startFight = () => {
    teleport(0, -8);
    run(secs(PRESENTATION.introSeconds) + 2);
    expect(state()).not.toBeNull();
  };
  const hit = (amount: number, poise = amount, extra: Record<string, unknown> = {}) =>
    ctx.damage.apply({ attackerId: ctx.player.actor.id, targetId: boss()!.id, amount, poise, kind: 'melee', ...extra });
  const land = () => {
    drake.landed = true;
    ctx.events.emit('wyrm.drake.landed', { actorId: drake.id! });
  };
  /** One break through the lever (waiting out its cooldown and his kneel first). */
  const leverBreak = () => {
    const before = of('boss.break').length;
    expect(until(() => enc().leverCooldown <= 0 && enc().brain.state !== 'broken', 30)).toBe(true);
    expect(enc().pullLever()).toBe(true);
    expect(of('boss.break').length).toBe(before + 1);
  };
  const toFraction = (f: number) => hit(state()!.health - state()!.maxHealth * f, 0, { kind: 'script' });
  const teardown = () => {
    game.dispose();
    world.dispose();
  };
  return {
    game, ctx, events, of, run, walk, runHealed, until, teleport, startFight, hit, boss, state, enc, land, leverBreak, toFraction,
    healPlayer, drake, drakes, holds, verbs, unlocked, at, centre, teardown,
  };
}

type T = Awaited<ReturnType<typeof setup>>;
const items = (t: T) => (t.ctx.interaction as unknown as { items: Map<string, any> }).items;

/** All three breaks by lever, the health between them by script hits; returns once the Spare window is open. */
function toWindow(t: T): void {
  t.leverBreak();
  t.runHealed(SKARL.breakSeconds + 0.2);
  t.toFraction(0.6);
  expect(t.state()!.phase).toBe(2);
  t.runHealed(LEVER.cooldown);
  t.leverBreak();
  t.runHealed(SKARL.breakSeconds + 0.2);
  t.toFraction(0.3);
  expect(t.state()!.phase).toBe(3);
  t.runHealed(LEVER.cooldown);
  // The drake is freed at the last break, so the third break is a chain-free lever pull only if the chain still holds.
  t.leverBreak();
  expect(t.of('boss.break').at(-1)!.last).toBe(true);
  expect(t.state()!.releaseOpen).toBe(true);
}

describe('Corvin Skarl on the real core', () => {
  it('registers its strings and system, and removes them on dispose', async () => {
    const t = await setup();
    expect(t.ctx.strings.has('boss.corvin-skarl.name')).toBe(true);
    expect(t.game.systems.has('bosses.corvin-skarl')).toBe(true);
    skarlPlugin.dispose?.();
    expect(t.game.systems.has('bosses.corvin-skarl')).toBe(false);
    t.teardown();
  }, T30);

  it('the contract: Spare at the last break (6 s), the mercy row Oswin +3 for D06, kill XP 650, the drake spawner and its 1.0 s dive', () => {
    expect(SKARL_BOSS_DEF.mercyVerb).toBe('spare');
    expect(SKARL_BOSS_DEF.releaseWindowSeconds).toBe(6);
    expect(BOSS_MERCY[SKARL_BOSS_ID]).toEqual({ verb: 'spare', track: 'oswin', amount: 3, burn: 0, ledgerId: 'D06' });
    expect(killXp(SKARL_BOSS_ID, 27, 27)).toBe(650);
    expect(OUTCOME_FLAG).toBe('boss.corvin-skarl.outcome');
    expect(SKARL_SPAWNERS).toEqual([expect.objectContaining({ id: DRAKE_SPAWNER, enemy: 'skarl-drake', anchor: ARENA.drake, activation: 'manual', respawn: 'never', ephemeral: true })]);
    expect(SKARL_DRAKE_DEF.moves.find((m) => m.id === 'drake.dive')!.windup).toBe(SKARL_DRAKE_DIVE_WINDUP);
    expect(SKARL_DRAKE_DIVE_WINDUP).toBe(1);
  });

  it.each([
    [undefined, 27, 2000],
    [30, 27, 2000],
    [24, 27, 2000],
    [22, 25, 1800],
    [20, 23, 1600],
  ])('player level %s: Skarl level %i, %i health (the summit cap P + 3)', async (playerLevel, level, health) => {
    expect(skarlLevel(playerLevel)).toBe(level);
    const t = await setup({ playerLevel });
    t.startFight();
    expect(t.boss()!.level).toBe(level);
    expect(t.boss()!.maxHealth).toBe(health);
    t.teardown();
  }, T30);

  it('arming: nothing without story.d06.started or with an outcome set; near the centre it starts, far from it never', async () => {
    const t = await setup({ flag: false });
    t.teleport(0, -8);
    t.run(secs(PRESENTATION.introSeconds) + 2);
    expect(t.boss()).toBeNull();
    t.ctx.state.setFlag(D06_STARTED_FLAG, true);
    t.teleport(0, -ARENA.startRadius - 3);
    t.run(secs(PRESENTATION.introSeconds) + 2);
    expect(t.boss()).toBeNull();
    t.teleport(0, -8);
    t.run(2);
    expect(t.boss()).not.toBeNull();
    expect(skarlDirector()!.introRunning).toBe(true);
    t.teardown();
    const u = await setup();
    u.ctx.state.setFlag(OUTCOME_FLAG, 'spared');
    u.teleport(0, -8);
    u.run(secs(PRESENTATION.introSeconds) + 2);
    expect(u.boss()).toBeNull();
    u.teardown();
  }, T30);

  it('anchors missing: no fight and one warning', async () => {
    const t = await setup({ anchors: false });
    t.ctx.player.teleport(t.at(0, -8));
    t.run(secs(2));
    expect(t.boss()).toBeNull();
    const warns = (console.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter((c) => String(c[0]).includes('anchors missing'));
    expect(warns).toHaveLength(1);
    t.teardown();
  }, T30);

  it('intro, then boss.started with three phases of one break; untouchable in the intro; the drake spawned and chained to the post', async () => {
    const t = await setup();
    t.teleport(0, -8);
    t.run(secs(1));
    expect(t.of('boss.started')).toHaveLength(0);
    expect(t.boss()!.hittable).toBe(false);
    expect(t.hit(50)).toBeNull();
    t.run(secs(PRESENTATION.introSeconds));
    expect(t.of('boss.started')).toEqual([{ bossId: SKARL_BOSS_ID, actorId: t.boss()!.id }]);
    expect(t.state()!.phases).toBe(3);
    expect(t.state()!.breaksPerPhase).toBe(1);
    expect(t.boss()!.hittable).toBe(true);
    expect(t.drake.spawns).toBe(1);
    t.teardown();
  }, T30);

  it('bolts: a 0.8 s yellow aim, then a bolt that hits a standing player and is blocked by a guard', async () => {
    const t = await setup();
    t.startFight();
    expect(t.until(() => t.of('telegraph').some((g) => g.attackId === BOLT.attackId))).toBe(true);
    const tg = t.of('telegraph').find((g) => g.attackId === BOLT.attackId)!;
    expect(tg.kind).toBe('block');
    expect(tg.leadSeconds).toBe(BOLT.aimSeconds);
    expect(t.until(() => t.of('damage.dealt').some((d) => d.attackId === BOLT.attackId), 10)).toBe(true);
    expect(t.of('damage.dealt').find((d) => d.attackId === BOLT.attackId)!.outcome).toBe('hit');
    // A guard that blocks every hit from the front.
    t.ctx.damage.addModifier('test.guard', (req: any) => {
      if (req.targetId === t.ctx.player.actor.id) req.outcome = 'blocked';
    }, 50);
    const before = t.of('damage.dealt').filter((d) => d.attackId === BOLT.attackId).length;
    expect(t.until(() => t.of('damage.dealt').filter((d) => d.attackId === BOLT.attackId).length > before, 10)).toBe(true);
    expect(t.of('damage.dealt').filter((d) => d.attackId === BOLT.attackId).at(-1)!.outcome).toBe('blocked');
    t.teardown();
  }, T30);

  it('a dodging player (i-frames) takes a bolt as immune; a bolt that misses flies out of range and is gone', async () => {
    const t = await setup();
    t.startFight();
    t.ctx.player.actor.invulnerable = true;
    expect(t.until(() => t.of('damage.dealt').some((d) => d.attackId === BOLT.attackId), 10)).toBe(true);
    expect(t.of('damage.dealt').find((d) => d.attackId === BOLT.attackId)!.outcome).toBe('immune');
    t.ctx.player.actor.invulnerable = false;
    // Aimed, then the player steps 6 m aside: it misses and flies on.
    expect(t.until(() => t.enc().brain.state === 'aim', 10)).toBe(true);
    const n = t.of('damage.dealt').filter((d) => d.attackId === BOLT.attackId).length;
    expect(t.until(() => t.enc().brain.state === 'loose' || t.enc().boltsInFlight > 0, 2)).toBe(true);
    const f = t.ctx.player.feet;
    t.ctx.player.teleport({ x: f.x + 6, y: f.y, z: f.z });
    t.walk(2);
    t.runHealed(BOLT.range / BOLT.speed + 0.2);
    expect(t.enc().boltsInFlight).toBe(0);
    expect(t.of('damage.dealt').filter((d) => d.attackId === BOLT.attackId).length).toBe(n);
    t.teardown();
  }, T30);

  it('phase 2 looses a burst of two, phase 3 a fan of three', async () => {
    const t = await setup();
    t.startFight();
    t.leverBreak();
    t.runHealed(SKARL.breakSeconds + 0.2);
    t.toFraction(0.6);
    expect(t.enc().brain.volley).toEqual({ count: 2, fan: false });
    t.runHealed(LEVER.cooldown);
    t.leverBreak();
    t.runHealed(SKARL.breakSeconds + 0.2);
    t.toFraction(0.3);
    expect(t.enc().brain.volley).toEqual({ count: 3, fan: true });
    t.ctx.player.actor.invulnerable = true;
    const before = t.of('damage.dealt').filter((d) => d.attackId === BOLT.attackId).length;
    expect(t.until(() => t.enc().boltsInFlight === 3, 10)).toBe(true);
    t.runHealed(BOLT.range / BOLT.speed + 0.2);
    // The fan's middle bolt reaches the player; the outer two pass beside them.
    expect(t.of('damage.dealt').filter((d) => d.attackId === BOLT.attackId).length).toBeGreaterThan(before);
    t.teardown();
  }, T30);

  it('close quarters: he hops back; a player who stays 1.5 s is kicked and shoved, and the shove is released', async () => {
    const t = await setup();
    t.startFight();
    const s = t.boss()!.root!.position;
    t.ctx.player.teleport({ x: s.x, y: t.ctx.player.feet.y, z: s.z - 2 });
    t.walk(1);
    expect(t.until(() => t.enc().brain.state === 'backstep', 2)).toBe(true);
    // Stay on him.
    expect(
      t.until(() => {
        const b = t.boss()!.root!.position;
        t.ctx.player.teleport({ x: b.x, y: t.ctx.player.feet.y, z: b.z - 1.6 });
        return t.of('damage.dealt').some((d) => d.attackId === KICK.attackId);
      }, 10),
    ).toBe(true);
    const tg = t.of('telegraph').find((g) => g.attackId === KICK.attackId)!;
    expect(tg.kind).toBe('block');
    expect(tg.leadSeconds).toBe(KICK.windup);
    expect(t.holds.filter((h) => h !== null).length).toBeGreaterThan(0);
    t.runHealed(KICK.shoveSeconds + 0.1);
    expect(t.holds.at(-1)).toBeNull();
    t.teardown();
  }, T30);

  it('the lever: a forced break counted by the registry, then 20 s before it works again; a poise break counts too', async () => {
    const t = await setup();
    t.startFight();
    expect(items(t).get(SKARL_LEVER_ID).enabled()).toBe(true);
    items(t).get(SKARL_LEVER_ID).onInteract(t.ctx.player.actor);
    expect(t.of('boss.break')).toHaveLength(1);
    expect(t.enc().brain.state).toBe('broken');
    expect(t.enc().forcedBreaks).toBe(1);
    expect(items(t).get(SKARL_LEVER_ID).enabled()).toBe(false);
    t.runHealed(SKARL.breakSeconds + 0.2);
    expect(t.enc().pullLever()).toBe(false);
    t.runHealed(LEVER.cooldown - SKARL.breakSeconds);
    expect(t.enc().leverCooldown).toBe(0);
    // Kneeling: x1.25 on him.
    t.toFraction(0.6);
    t.enc().pullLever();
    const r = t.hit(40, 0)!;
    expect(r.dealt).toBe(40 * SKARL.brokenScale);
    t.runHealed(SKARL.breakSeconds + 0.2);
    // Phase 3 by health, then a plain poise break counts.
    t.toFraction(0.3);
    expect(t.state()!.phase).toBe(3);
    const before = t.of('boss.break').length;
    t.hit(1, SKARL.maxPoise);
    expect(t.of('boss.break').length).toBe(before + 1);
    expect(t.of('boss.break').at(-1)!.last).toBe(true);
    t.teardown();
  }, T30);

  it('the chain: struck only while the drake is down (F at its low point); a forced break; the drake down window lapses', async () => {
    const t = await setup();
    t.startFight();
    expect(items(t).get(SKARL_CHAIN_ID).enabled()).toBe(false);
    expect(t.enc().strikeChain()).toBe(false);
    t.land();
    expect(t.enc().chainOpen).toBe(true);
    expect(items(t).get(SKARL_CHAIN_ID).enabled()).toBe(true);
    items(t).get(SKARL_CHAIN_ID).onInteract(t.ctx.player.actor);
    expect(t.drakes.strike).toHaveBeenCalledWith(t.drake.id, t.ctx.player.actor.id);
    expect(t.of('boss.break')).toHaveLength(1);
    expect(t.enc().forcedBreaks).toBe(1);
    // Down again later, but airborne by the time the player reaches it.
    t.runHealed(SKARL.breakSeconds + 0.2);
    t.land();
    t.runHealed(CHAIN.landedSeconds + 0.1);
    expect(t.enc().chainOpen).toBe(false);
    expect(t.enc().strikeChain()).toBe(false);
    t.teardown();
  }, T30);

  it('phase holds: a burst cannot skip a phase before its break, and the 8% floor holds until the last break', async () => {
    const t = await setup();
    t.startFight();
    t.hit(99_999, 0);
    expect(t.state()!.phase).toBe(1);
    expect(t.state()!.health).toBeGreaterThan(t.state()!.maxHealth * SKARL.phases[0]);
    t.leverBreak();
    t.hit(99_999, 0);
    expect(t.state()!.phase).toBe(2);
    expect(t.state()!.health).toBeGreaterThan(t.state()!.maxHealth * SKARL.phases[1]);
    t.runHealed(LEVER.cooldown);
    t.leverBreak();
    t.hit(99_999, 0);
    expect(t.state()!.phase).toBe(3);
    expect(t.state()!.health).toBeGreaterThanOrEqual(Math.ceil(t.state()!.maxHealth * SKARL.healthFloor));
    expect(t.of('boss.defeated')).toHaveLength(0);
    t.teardown();
  }, T30);

  it('the Spare: only at the last break, a 6 s window; spared, dragons -2 once, the drake freed, no bolt or dive in the window', async () => {
    const t = await setup({ codex: true });
    t.startFight();
    // Not before the last break.
    expect(t.ctx.bosses.release(SKARL_BOSS_ID)).toBe(false);
    const dragons = t.ctx.state.favour('dragons');
    toWindow(t);
    // Freed at the last break: the chain gave, so no dive can fall in the window.
    expect(t.drake.freed).toBe(1);
    expect(t.enc().drakeIsFree).toBe(true);
    expect(t.enc().brain.state).toBe('window');
    const bolts = t.of('telegraph').length;
    t.runHealed(3);
    expect(t.of('telegraph').length).toBe(bolts);
    expect(t.enc().boltsInFlight).toBe(0);
    expect(t.ctx.bosses.release(SKARL_BOSS_ID)).toBe(true);
    expect(t.ctx.state.getFlag(OUTCOME_FLAG)).toBe('spared');
    expect(t.of('boss.spared')).toHaveLength(1);
    expect(t.ctx.state.favour('dragons')).toBe(dragons - 2);
    expect(t.boss()!.hittable).toBe(false);
    t.runHealed(PRESENTATION.spareKneelSeconds + PRESENTATION.spareFadeSeconds + 0.2);
    expect(t.boss()).toBeNull();
    expect(t.drake.freed).toBe(1);
    expect(t.ctx.state.favour('dragons')).toBe(dragons - 2);
    expect(t.unlocked.has(SKARL_CODEX_ID)).toBe(true);
    // Done: never again.
    t.teleport(0, -40);
    t.teleport(0, -8);
    t.run(secs(PRESENTATION.introSeconds) + 2);
    expect(t.boss()).toBeNull();
    t.teardown();
  }, T30);

  it('the kill: the window lapses and blows finish him; defeated, dragons +2 once, the drake freed, no Spare after', async () => {
    const t = await setup();
    t.startFight();
    const dragons = t.ctx.state.favour('dragons');
    toWindow(t);
    t.runHealed(SKARL.releaseWindowSeconds + 0.2);
    expect(t.state()!.releaseOpen).toBe(false);
    expect(t.enc().brain.state).not.toBe('window');
    expect(t.ctx.bosses.release(SKARL_BOSS_ID)).toBe(false);
    t.hit(99_999, 0);
    expect(t.of('boss.defeated')).toHaveLength(1);
    expect(t.ctx.state.getFlag(OUTCOME_FLAG)).toBe('defeated');
    expect(t.ctx.state.favour('dragons')).toBe(dragons + 2);
    expect(t.drake.freed).toBe(1);
    t.runHealed(PRESENTATION.deathClipSeconds + PRESENTATION.deathFadeSeconds + 0.2);
    expect(t.boss()).toBeNull();
    expect(t.ctx.state.favour('dragons')).toBe(dragons + 2);
    t.teardown();
  }, T30);

  it('with no drake (spawn failed) the lever still breaks him and the fight can be won', async () => {
    const t = await setup({ drake: false });
    t.startFight();
    expect(t.enc().drakeId).toBeNull();
    toWindow(t);
    expect(t.ctx.bosses.release(SKARL_BOSS_ID)).toBe(true);
    t.teardown();
  }, T30);

  it('the post stays reachable: standing on the player-to-post line, he leaves it within one bolt cycle', async () => {
    const t = await setup();
    t.startFight();
    // The player south-west of the post, Skarl put on the line between them.
    t.teleport(-6, -4);
    const f = t.ctx.player.feet.clone();
    const post = t.at(14, 10.2);
    const b = t.boss()!.root!.position;
    b.set((f.x + post.x) / 2, b.y, (f.z + post.z) / 2);
    const dist = () => {
      const p = t.boss()!.root!.position;
      const vx = post.x - f.x;
      const vz = post.z - f.z;
      const k = Math.max(0, Math.min(1, ((p.x - f.x) * vx + (p.z - f.z) * vz) / (vx * vx + vz * vz)));
      return Math.hypot(p.x - (f.x + vx * k), p.z - (f.z + vz * k));
    };
    expect(dist()).toBeLessThan(SKARL.postLaneClear);
    for (let i = 0; i < secs(BOLT.aimSeconds + BOLT.reloadSeconds + 2 * BOLT.burstGap); i++) {
      t.ctx.player.teleport(f);
      t.game.fixedUpdate();
      t.healPlayer();
    }
    expect(dist()).toBeGreaterThanOrEqual(SKARL.postLaneClear);
    t.teardown();
  }, T30);

  it('player death resets: one boss.ended, Skarl and the drake gone; the retry is a short intro at full health', async () => {
    const t = await setup();
    t.startFight();
    t.leverBreak();
    t.toFraction(0.6);
    t.ctx.damage.kill(t.ctx.player.actor.id, null);
    t.run(2);
    expect(t.of('boss.ended')).toHaveLength(1);
    expect(t.boss()).toBeNull();
    expect(t.drake.despawns).toBe(1);
    t.ctx.damage.revive(t.ctx.player.actor.id, 1, 'script');
    t.teleport(0, -8);
    t.run(secs(PRESENTATION.retrySeconds) + 2);
    expect(t.of('boss.started')).toHaveLength(2);
    expect(t.state()!.health).toBe(t.state()!.maxHealth);
    expect(t.state()!.phase).toBe(1);
    expect(t.drake.spawns).toBe(2);
    t.teardown();
  }, T30);

  it('out of the ring for 3 s ends the fight; a shorter step out does not; a kick shove never counts', async () => {
    const t = await setup();
    t.startFight();
    t.teleport(0, -(ARENA.ring + 4));
    t.runHealed(2);
    t.teleport(0, -8);
    t.runHealed(2);
    expect(t.boss()).not.toBeNull();
    t.teleport(0, -(ARENA.ring + 4));
    t.runHealed(2);
    expect(t.boss()).not.toBeNull();
    t.runHealed(1.2);
    expect(t.boss()).toBeNull();
    expect(t.of('boss.ended')).toHaveLength(1);
    t.teardown();
  }, T30);

  it('a kick near the ring edge shoves the player no farther than 2 m inside the ring', async () => {
    const t = await setup();
    t.startFight();
    // Skarl at the leash edge, the player just outside him toward the ring.
    const b = t.boss()!.root!.position;
    b.set(t.centre.x, b.y, t.centre.z - ARENA.leash);
    const pz = t.centre.z - (ARENA.ring - 2.5);
    expect(
      t.until(() => {
        t.ctx.player.teleport({ x: t.centre.x, y: t.ctx.player.feet.y, z: pz });
        b.set(t.centre.x, b.y, pz + 1.6);
        return t.of('damage.dealt').some((d) => d.attackId === KICK.attackId);
      }, 10),
    ).toBe(true);
    // The player stood 2.5 m inside the ring with the shove pointing out: it is cut to 0.5 m, so they stay 2 m inside.
    expect(t.enc().lastShoveMetres).toBeLessThanOrEqual(0.5 + 1e-9);
    expect(t.enc().lastShoveMetres).toBeLessThan(KICK.shoveMetres);
    t.runHealed(KICK.shoveSeconds + 0.1);
    expect(t.holds.at(-1)).toBeNull();
    expect(skarlDirector()!.outsideSeconds).toBe(0);
    t.teardown();
  }, T30);

  it('a load ends the fight (both despawned, one boss.ended); an outcome flag set from outside ends it without favour', async () => {
    const t = await setup();
    t.startFight();
    t.game.events.emit('save.loaded', { slot: 'test' } as never);
    // The loaded position is out in the courtyard's approach (a load inside the start radius simply begins a retry).
    t.teleport(0, -40);
    expect(t.boss()).toBeNull();
    expect(t.of('boss.ended')).toHaveLength(1);
    expect(t.drake.despawns).toBe(1);
    t.teleport(0, -8);
    t.run(secs(PRESENTATION.retrySeconds) + 2);
    expect(t.boss()).not.toBeNull();
    const dragons = t.ctx.state.favour('dragons');
    t.ctx.state.setFlag(OUTCOME_FLAG, 'defeated');
    t.run(2);
    expect(t.boss()).toBeNull();
    expect(t.ctx.state.favour('dragons')).toBe(dragons);
    t.teardown();
  }, T30);

  it.each([
    ['a weak blade (melee x0.4)', 'melee', 0.4],
    ['a caster (spells x1.5, poise x0.3)', 'spell', 1.5],
  ])('every class: %s still breaks him three times by the lever and reaches the Spare window', async (_n, kind, scale) => {
    const t = await setup();
    const seen = vi.fn();
    t.ctx.damage.addModifier('test.class', ((r: any) => {
      if (r.kind !== kind || r.targetId !== t.boss()?.id) return;
      seen();
      r.amount *= scale;
      r.poise *= kind === 'spell' ? 0.3 : scale;
    }) as never, 10);
    t.startFight();
    // The class's own hits are scaled (the modifier runs) ...
    expect(t.hit(10, 0, { kind })!.dealt).toBeCloseTo(10 * scale);
    expect(seen).toHaveBeenCalled();
    // ... and the lever's forced breaks are not, so the breaks come whatever the class.
    toWindow(t);
    expect(t.enc().forcedBreaks).toBe(3);
    t.teardown();
  }, T30);

  it('the chain: any player hit on the drake while it is down strikes the chain (a bow or a spell reaches it)', async () => {
    const t = await setup();
    t.startFight();
    t.ctx.damage.apply({ attackerId: t.ctx.player.actor.id, targetId: t.drake.id!, amount: 5, poise: 0, kind: 'spell' });
    expect(t.of('boss.break')).toHaveLength(0);
    t.land();
    t.ctx.damage.apply({ attackerId: t.ctx.player.actor.id, targetId: t.drake.id!, amount: 5, poise: 0, kind: 'spell' });
    expect(t.of('boss.break')).toHaveLength(1);
    expect(t.enc().forcedBreaks).toBe(1);
    t.teardown();
  }, T30);

  it('the ring timer does not count while a kick shove holds the player, and counts again once it ends', async () => {
    const t = await setup();
    t.startFight();
    const e = t.enc() as unknown as { shove: { x: number; z: number; left: number } | null };
    e.shove = { x: 0, z: -1, left: 1 };
    t.ctx.player.teleport(t.at(0, -(ARENA.ring + 4)));
    for (let i = 0; i < secs(ARENA.outsideSeconds + 1); i++) {
      e.shove = { x: 0, z: -1, left: 1 };
      t.game.fixedUpdate();
      t.healPlayer();
    }
    expect(skarlDirector()!.outsideSeconds).toBe(0);
    expect(t.boss()).not.toBeNull();
    e.shove = null;
    t.runHealed(ARENA.outsideSeconds + 0.2);
    expect(t.boss()).toBeNull();
    t.teardown();
  }, T30);

  it('after the last break the lever is spent (no second Spare window from it, even with no drake)', async () => {
    const t = await setup({ drake: false });
    t.startFight();
    toWindow(t);
    t.runHealed(SKARL.releaseWindowSeconds + LEVER.cooldown + 0.5);
    expect(t.enc().pullLever()).toBe(false);
    expect(items(t).get(SKARL_LEVER_ID).enabled()).toBe(false);
    t.teardown();
  }, T30);

  it('the drake chain is attached with no flag condition (released and unchained by the fight itself)', async () => {
    const t = await setup();
    t.startFight();
    expect(t.drakes.chain).toHaveBeenCalledWith(DRAKE_SPAWNER, ARENA.post);
    t.teardown();
  }, T30);
});
