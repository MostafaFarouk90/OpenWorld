import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../../core/core.plugin';
import type { GameEventMap } from '../../../core/events';
import { Game } from '../../../core/Game';
import { MoveModifiers } from '../../../core/MoveModifiers';
import type { GamePlugin, PluginModule } from '../../../core/plugins';
import { InputManager } from '../../../input/InputManager';
import { CRUCIBLE_ARENA_GATE_FLAG, CRUCIBLE_DEF, CRUCIBLE_LOCK_FLAG } from '../../../interiors/harrowmark/act4/crucible';
import { PhysicsWorld } from '../../../physics/PhysicsWorld';
import { killXp } from '../../../progression/tuning';
import { TerrainColliders } from '../../../world/TerrainColliders';
import { World } from '../../../world/World';
import { ACT4_SITES, CRUCIBLE_ID } from '../../../harrowmark/act4/sites';
import { regionAt } from '../../../region/regionMask';
import structureBreaksPlugin from '../../structureBreaks.plugin';
import { winBellowsForTest } from './testing';
import { VALVE_INTERACT_PREFIX } from './valves';
import { BELLOWS_VALVE_PREFIX } from '../../../audio/act2SfxRouter';
import { OUTCOME_FLAG, RESET_TOAST_KEY } from './BellowsDirector';
import { BELLOWS_BOSS_DEF, pickLiveValve } from './BellowsEncounter';
import plugin, { bellowsEngineDirector } from './bellowsEngine.plugin';
import { buildBellowsModel } from './BellowsModel';
import { ARENA, BELLOWS, BELLOWS_BOSS_ID, bellowsLevel, bellowsScale, COAL, PRESENTATION, RHYTHM, VALVES, VENT } from './tuning';

let physics: PhysicsWorld;

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const T30 = 30_000;
const TICK = 1 / 60;
const secs = (s: number) => Math.round(s / TICK);

const modules = (...plugins: GamePlugin[]): Record<string, PluginModule> =>
  Object.fromEntries(plugins.map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }]));

function fake(id: string, name: string, service: unknown): GamePlugin {
  return {
    id,
    dependsOn: ['core'],
    setup(c) {
      (c.services.provide as (n: string, v: unknown) => void)(name, service);
    },
  };
}

type Opts = { flags?: boolean; interior?: string | null; level?: number; noBreaks?: boolean; model?: boolean };

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
  // The model is procedural: any asset loader at all means "build it"; none means headless.
  const assets = opts.model ? { load: () => Promise.resolve(), instantiate: () => new THREE.Group(), animations: () => [] } : null;
  const game = new Game({ scene, physics, world, input, moveModifiers, assets: assets as never, cameraRig: null as never, report: () => {} });
  const events: Array<{ type: keyof GameEventMap; payload: any }> = [];
  game.events.onAny((type, payload) => events.push({ type, payload }));
  const blockers: string[] = [];
  const interiors = {
    current: ('interior' in opts ? opts.interior! : ARENA.interiorId) as string | null,
    setBlocker: (id: string, closed: boolean) => blockers.push(`${id}:${closed}`),
  };
  const plugins: GamePlugin[] = [
    corePlugin,
    fake('enemies', 'enemies', { spawnGroup: () => [], reset: () => {}, alive: () => [], despawnGroup: () => {}, view: () => undefined }),
    fake('interiors', 'interiors', interiors),
    plugin,
  ];
  if (!opts.noBreaks) plugins.push(structureBreaksPlugin);
  else plugins.push({ id: 'structure-breaks', dependsOn: ['core'], setup() {} });
  if (opts.level !== undefined) plugins.push(fake('progression', 'progression', { level: opts.level }));
  await game.loadPlugins(modules(...plugins));
  const ctx = game.ctx;
  if (opts.flags !== false) {
    ctx.state.setFlag(CRUCIBLE_LOCK_FLAG, true);
    ctx.state.setFlag(CRUCIBLE_ARENA_GATE_FLAG, true);
  }
  await new Promise((r) => setTimeout(r, 0));
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  run(2);
  // The Crucible's local frame placed so the player stands at local (0, 52), inside the arena past the gate.
  const p = ctx.player.feet.clone();
  const o = { x: p.x - 0, y: p.y, z: p.z - 52 };
  const local = (x: number, z: number) => ({ x: o.x + x, y: p.y, z: o.z + z });
  const def = (id: string) => CRUCIBLE_DEF.anchors.find((a) => a.id === id)!;
  for (const id of [ARENA.entry, ARENA.centre, ...ARENA.valves, ...ARENA.chutes]) {
    const a = def(id);
    ctx.anchors.define({ id, position: local(a.x, a.z), yaw: ((a as { yaw?: number }).yaw ?? 0) * (Math.PI / 180) });
  }
  run(2);
  const at = (x: number, z: number) => {
    ctx.player.teleport(local(x, z));
    run(2);
  };
  const of = <K extends keyof GameEventMap>(type: K): GameEventMap[K][] => events.filter((e) => e.type === type).map((e) => e.payload as GameEventMap[K]);
  const enter = () => game.events.emit('trigger.enter', { triggerId: ARENA.trigger, actorId: ctx.player.actor.id });
  const exit = () => game.events.emit('trigger.exit', { triggerId: ARENA.trigger, actorId: ctx.player.actor.id });
  const dir = () => bellowsEngineDirector()!;
  const enc = () => dir().current!;
  const boss = () => [...ctx.actors.all()].find((a) => a.kind === 'bellows-engine') ?? null;
  const state = () => ctx.bosses.state(BELLOWS_BOSS_ID);
  const heal = () => {
    const pl = ctx.player.actor;
    pl.health = pl.maxHealth;
  };
  const runHealed = (seconds: number) => {
    for (let i = 0; i < secs(seconds); i++) {
      game.fixedUpdate();
      heal();
    }
  };
  const until = (cond: () => boolean, max = 30) => {
    for (let i = 0; i < secs(max); i++) {
      if (cond()) return true;
      game.fixedUpdate();
      heal();
    }
    return cond();
  };
  const hit = (amount: number, poise = amount, extra: Record<string, unknown> = {}) =>
    ctx.damage.apply({ attackerId: ctx.player.actor.id, targetId: boss()!.id, amount, poise, kind: 'melee', ...extra });
  const start = () => {
    enter();
    run(secs(PRESENTATION.introSeconds) + 2);
    expect(enc().contested).toBe(true);
  };
  const interactable = (n: number) => (ctx.interaction as unknown as { items: Map<string, any> }).items.get(`${VALVE_INTERACT_PREFIX}${n}`);
  const turn = (n: number) => interactable(n).onInteract(ctx.player.actor);
  const strikeValve = (index: number, kind: 'melee' | 'spell' = 'melee', attackerId: string = ctx.player.actor.id) =>
    ctx.damage.apply({ attackerId, targetId: enc().valveBank!.actorId(index)!, amount: 20, poise: 20, kind, attackId: kind === 'spell' ? 'firebolt' : 'swing' });
  /** Health just above the floor of the current phase. */
  const toFloor = () => hit(state()!.health);
  /** Waits for a live valve and shuts it with F. */
  const shutLive = () => {
    expect(until(() => enc().liveValve >= 0 && enc().brain.canBreak)).toBe(true);
    const i = enc().liveValve;
    turn(i + 1);
    return i;
  };
  const teardown = () => {
    game.dispose();
    world.dispose();
  };
  return { game, ctx, scene, interiors, events, blockers, of, run, runHealed, until, at, local, enter, exit, dir, enc, boss, state, hit, start, interactable, turn, strikeValve, toFloor, shutLive, teardown };
}

describe('bellows-engine numbers', () => {
  it('level 31 capped at P + 3, health 2,200 at 31 scaled 5 % a level', () => {
    expect(bellowsLevel(undefined)).toBe(31);
    expect(bellowsLevel(30)).toBe(31);
    expect(bellowsLevel(22)).toBe(25);
    expect(bellowsScale(31)).toBe(1);
    expect(Math.round(BELLOWS.maxHealth * bellowsScale(25))).toBe(1540);
    expect(bellowsScale(1)).toBe(0.5);
  });

  it('kill XP pays 700 at an even level under Harrowmark’s x 2.4, and the valves pay nothing', () => {
    expect(killXp('bellows-engine', 31, 31, 2.4)).toBe(700);
    expect(killXp('bellows-valve', 31, 31, 2.4)).toBe(0);
    // The Crucible floats inside Harrowmark's region (whose Act 4 factor is 2.4), arena included.
    const site = ACT4_SITES[CRUCIBLE_ID];
    expect(regionAt(site.x, site.z)?.id).toBe('harrowmark');
    expect(regionAt(site.x + ARENA.rect.x0, site.z + ARENA.rect.z1)?.id).toBe('harrowmark');
  });

  it('a machine: no mercy window, three phases of one break', () => {
    expect(BELLOWS_BOSS_DEF.releaseWindowSeconds).toBe(0);
    expect(BELLOWS_BOSS_DEF.mercyVerb).toBeUndefined();
    expect(BELLOWS_BOSS_DEF.phases).toEqual([0.66, 0.33]);
    expect(BELLOWS_BOSS_DEF.breaksPerPhase).toBe(1);
  });

  it('the live valve is the farthest unused one, ties by number', () => {
    const v = [
      { x: -14, z: 58 },
      { x: 14, z: 58 },
      { x: 0, z: 69 },
      { x: 9, z: 47 },
    ];
    expect(pickLiveValve(v, new Set(), { x: -10, z: 50 })).toBe(1);
    expect(pickLiveValve(v, new Set([1]), { x: -10, z: 50 })).toBe(2);
    expect(pickLiveValve(v, new Set([3]), { x: 0, z: 58 })).toBe(0);
    expect(pickLiveValve(v, new Set([0, 1, 2, 3]), { x: 0, z: 58 })).toBe(-1);
  });
});

describe('bellows-engine plugin', () => {
  it(
    'arms only with D07 started and the gate flag; the arena mouth anchor is defined from L2’s entry',
    async () => {
      const h = await setup({ flags: false });
      const mouth = h.ctx.anchors.find(ARENA.mouth)!;
      expect(mouth).toBeDefined();
      const expected = h.local(ARENA.mouthLocal.x, ARENA.mouthLocal.z);
      expect(mouth.position.x).toBeCloseTo(expected.x);
      expect(mouth.position.z).toBeCloseTo(expected.z);
      h.enter();
      h.run(secs(5));
      expect(h.dir().current).toBeNull();
      h.ctx.state.setFlag(CRUCIBLE_LOCK_FLAG, true);
      h.run(10);
      expect(h.dir().current).toBeNull();
      // Armed while standing in the trigger: the poll starts it.
      h.ctx.state.setFlag(CRUCIBLE_ARENA_GATE_FLAG, true);
      h.run(2);
      expect(h.dir().introRunning).toBe(true);
      h.teardown();
    },
    T30,
  );

  it(
    'the whole fight: three valve shuts break three bars, it dies, defeated, no release window',
    async () => {
      const h = await setup();
      h.start();
      expect(h.of('boss.started').map((b) => b.bossId)).toEqual([BELLOWS_BOSS_ID]);
      expect(h.state()!.maxHealth).toBe(BELLOWS.maxHealth);
      expect(h.blockers).toContain(`${ARENA.gate}:true`);
      for (let phase = 1; phase <= 3; phase++) {
        expect(h.state()!.phase).toBe(phase);
        h.toFloor();
        h.shutLive();
        expect(h.of('boss.break')).toHaveLength(phase);
        expect(h.of('boss.break').at(-1)!.phase).toBe(phase);
        expect(h.enc().brain.vented).toBe(true);
        expect(h.enc().liveValve).toBe(-1);
        if (phase < 3) {
          h.hit(h.state()!.health - h.state()!.maxHealth * BELLOWS.phases[phase - 1] + 5);
          expect(h.state()!.phase).toBe(phase + 1);
          // The seal waits for the vent, then the volleys; the next valve lights after them.
          expect(h.until(() => h.enc().brain.sealed, VENT.seconds + 1)).toBe(true);
          expect(h.enc().liveValve).toBe(-1);
        }
      }
      expect(h.of('boss.break').at(-1)!.last).toBe(true);
      h.hit(h.state()!.health + 10);
      expect(h.ctx.state.getString(OUTCOME_FLAG)).toBe('defeated');
      expect(h.of('boss.releaseWindow')).toEqual([]);
      h.run(secs(PRESENTATION.deathSeconds) + 2);
      expect(h.dir().current).toBeNull();
      expect(h.blockers.at(-1)).toBe(`${ARENA.gate}:false`);
      expect(h.of('structure.struck').map((s) => s.bossId)).toEqual([BELLOWS_BOSS_ID, BELLOWS_BOSS_ID, BELLOWS_BOSS_ID]);
      // A beaten engine never comes back.
      h.exit();
      h.enter();
      h.run(secs(5));
      expect(h.dir().current).toBeNull();
      h.teardown();
    },
    T30,
  );

  it(
    'player hits drain no poise; a forced stagger from elsewhere makes no pip and refills poise',
    async () => {
      const h = await setup();
      h.start();
      h.hit(10, 500);
      expect(h.boss()!.poise).toBe(BELLOWS.maxPoise);
      h.ctx.damage.stagger(h.boss()!.id, h.ctx.player.actor.id, 1000);
      expect(h.of('boss.break')).toEqual([]);
      expect(h.boss()!.poise).toBe(BELLOWS.maxPoise);
      h.teardown();
    },
    T30,
  );

  it(
    'the health floor holds above each threshold until its bar, and at 8 % until the last',
    async () => {
      const h = await setup();
      h.start();
      const max = h.state()!.maxHealth;
      h.hit(max * 2);
      expect(h.state()!.health).toBe(Math.floor(max * 0.66) + 1);
      expect(h.state()!.phase).toBe(1);
      h.shutLive();
      h.hit(max * 2);
      expect(h.state()!.health).toBe(Math.floor(max * 0.33) + 1);
      expect(h.state()!.phase).toBe(2);
      expect(h.until(() => h.enc().liveValve >= 0 && h.enc().brain.canBreak, 20)).toBe(true);
      h.shutLive();
      h.hit(max * 2);
      expect(h.state()!.phase).toBe(3);
      expect(h.until(() => h.enc().liveValve >= 0 && h.enc().brain.canBreak, 20)).toBe(true);
      h.hit(max * 2);
      expect(h.state()!.health).toBe(Math.ceil(max * BELLOWS.healthFloor));
      expect(h.boss()!.dead).toBe(false);
      h.teardown();
    },
    T30,
  );

  it(
    'a dark valve is a dud and springs back; the live one is refused while vented and sealed, then works',
    async () => {
      const h = await setup();
      h.start();
      const live = h.enc().liveValve;
      const dark = [0, 1, 2, 3].find((i) => i !== live)!;
      h.turn(dark + 1);
      expect(h.of('bellows.valve.dud').map((d) => d.n)).toEqual([dark + 1]);
      expect(h.of('boss.break')).toEqual([]);
      expect(h.interactable(dark + 1).enabled()).toBe(false);
      h.run(secs(VALVES.dudSeconds) + 2);
      expect(h.interactable(dark + 1).enabled()).toBe(true);
      expect(h.enc().valveBank!.wheel(dark)!.position()).toBe(0);
      // The live valve works.
      h.turn(live + 1);
      expect(h.of('boss.break')).toHaveLength(1);
      expect(h.enc().valveBank!.look(live)).toBe('shut');
      expect(h.interactable(live + 1).enabled()).toBe(false);
      // Vented: no valve is live, a second shut is a dud.
      h.turn(dark + 1);
      expect(h.of('boss.break')).toHaveLength(1);
      // The next phase: sealed for the volleys, then a new live valve that is not the used one.
      h.hit(h.state()!.health - h.state()!.maxHealth * 0.66 + 5);
      expect(h.until(() => h.enc().brain.sealed, VENT.seconds + 1)).toBe(true);
      const sealedShut = h.enc().shutValve(dark);
      expect(sealedShut === 'dud' || sealedShut === 'refused').toBe(true);
      expect(h.until(() => h.enc().liveValve >= 0, 10)).toBe(true);
      expect(h.enc().liveValve).not.toBe(live);
      h.shutLive();
      expect(h.of('boss.break')).toHaveLength(2);
      h.teardown();
    },
    T30,
  );

  it(
    'any player attack shuts a valve (a blade, a spell); a hostile hit never does and the wheel takes no damage',
    async () => {
      const h = await setup();
      h.start();
      const live = h.enc().liveValve;
      const valveActor = h.ctx.actors.get(h.enc().valveBank!.actorId(live)!)!;
      // A hostile hit (a coal shot's attacker is the engine).
      h.strikeValve(live, 'melee', h.boss()!.id);
      expect(h.of('boss.break')).toEqual([]);
      const r = h.strikeValve(live, 'spell');
      expect(r?.dealt ?? 0).toBe(0);
      expect(valveActor.health).toBe(valveActor.maxHealth);
      expect(h.of('boss.break')).toHaveLength(1);
      // A second phase, shut with a blade.
      h.hit(h.state()!.health - h.state()!.maxHealth * 0.66 + 5);
      expect(h.until(() => h.enc().liveValve >= 0 && h.enc().brain.canBreak, 20)).toBe(true);
      h.strikeValve(h.enc().liveValve, 'melee');
      expect(h.of('boss.break')).toHaveLength(2);
      h.teardown();
    },
    T30,
  );

  it(
    'vented it takes x 1.5; sealed it is immune',
    async () => {
      const h = await setup();
      h.start();
      const a = h.hit(100);
      expect(a?.dealt).toBe(100);
      h.shutLive();
      const b = h.hit(100);
      expect(b?.dealt).toBeCloseTo(100 * VENT.damageScale);
      h.hit(h.state()!.health - h.state()!.maxHealth * 0.66 + 5);
      expect(h.until(() => h.enc().brain.sealed, VENT.seconds + 1)).toBe(true);
      const c = h.hit(100);
      expect(c?.outcome).toBe('immune');
      h.teardown();
    },
    T30,
  );

  it(
    'it punches, jets and lobs coal at the player with the named telegraphs, and the head turns at its rate',
    async () => {
      const h = await setup();
      h.at(0, 57.5); // 4.5 m in front of the engine
      h.start();
      h.runHealed(RHYTHM.first + 1.2);
      const tele = h.of('telegraph').filter((t) => t.actorId === h.boss()!.id);
      expect(tele[0]).toMatchObject({ attackId: 'bellows.punch', moveId: 'bellows.punch', leadSeconds: 1 });
      expect(h.of('damage.dealt').some((d) => d.attackId === 'bellows.punch' && d.targetId === h.ctx.player.actor.id)).toBe(true);
      // Middle range: the jet.
      h.at(0, 54);
      h.runHealed(8);
      expect(h.of('damage.dealt').some((d) => d.attackId === 'bellows.steam')).toBe(true);
      // Far: lobbed coal shots land on the player.
      h.at(-13, 47);
      const before = h.of('damage.dealt').filter((d) => d.attackId === COAL.attackId).length;
      h.runHealed(10);
      expect(h.of('damage.dealt').filter((d) => d.attackId === COAL.attackId).length).toBeGreaterThan(before);
      // Behind it, the head needs time to come round.
      h.at(0, 68);
      const y0 = h.enc().headYaw;
      h.run(6);
      const turned = Math.abs(h.enc().headYaw - y0);
      expect(turned).toBeLessThanOrEqual(BELLOWS.turnRate * (6 / 60) + 1e-6);
      expect(turned).toBeGreaterThan(0);
      h.teardown();
    },
    T30,
  );

  it(
    'a player death resets it with the toast; the next try starts at full health with a short intro',
    async () => {
      const h = await setup();
      h.start();
      h.toFloor();
      h.shutLive();
      h.ctx.damage.apply({ attackerId: null, targetId: h.ctx.player.actor.id, amount: 1e6, kind: 'script' });
      h.run(2);
      expect(h.dir().current).toBeNull();
      expect(h.dir().resetsAnnounced).toBe(1);
      expect(h.ctx.strings.t(RESET_TOAST_KEY)).toContain('winds down');
      expect(h.blockers.at(-1)).toBe(`${ARENA.gate}:false`);
      expect(h.ctx.state.getString(OUTCOME_FLAG)).toBeFalsy();
      h.ctx.damage.revive(h.ctx.player.actor.id, 1, 'respawn');
      h.exit();
      h.enter();
      h.run(secs(PRESENTATION.retrySeconds) + 2);
      expect(h.enc().contested).toBe(true);
      expect(h.state()!.health).toBe(h.state()!.maxHealth);
      expect(h.state()!.breaks).toBe(0);
      h.teardown();
    },
    T30,
  );

  it(
    'leaving the Crucible or the arena floor mid-fight resets it and says so',
    async () => {
      const h = await setup();
      h.start();
      h.game.events.emit('interior.exited', { interiorId: ARENA.interiorId, doorId: 'crucible-cellars' });
      h.run(2);
      expect(h.dir().current).toBeNull();
      expect(h.dir().resetsAnnounced).toBe(1);
      h.enter();
      h.run(secs(PRESENTATION.retrySeconds) + 2);
      expect(h.enc().contested).toBe(true);
      h.at(0, 30); // out past the gate (the test world has no blocker)
      h.run(secs(ARENA.abandonSeconds - 0.5));
      expect(h.dir().current).not.toBeNull();
      h.run(secs(1));
      expect(h.dir().current).toBeNull();
      expect(h.dir().resetsAnnounced).toBe(2);
      h.teardown();
    },
    T30,
  );

  it(
    'a load inside the arena puts the player at the mouth with the fight gone; a beaten engine loads beaten',
    async () => {
      const h = await setup();
      h.start();
      h.game.events.emit('save.loaded', {} as never);
      h.run(2);
      expect(h.dir().current).toBeNull();
      const mouth = h.ctx.anchors.find(ARENA.mouth)!;
      expect(h.ctx.player.feet.z).toBeCloseTo(mouth.position.z, 0);
      h.ctx.state.setFlag(OUTCOME_FLAG, 'defeated');
      h.game.events.emit('save.loaded', {} as never);
      h.enter();
      h.run(secs(5));
      expect(h.dir().current).toBeNull();
      h.teardown();
    },
    T30,
  );

  it(
    'the capped level for a low-level player',
    async () => {
      const h = await setup({ level: 22 });
      h.start();
      expect(h.boss()!.level).toBe(25);
      expect(h.state()!.maxHealth).toBe(Math.round(BELLOWS.maxHealth * bellowsScale(25)));
      h.teardown();
    },
    T30,
  );

  it(
    'without the structure-break service the fight refuses to start, with a warning',
    async () => {
      const h = await setup({ noBreaks: true });
      h.enter();
      h.run(secs(PRESENTATION.introSeconds) + 2);
      expect(h.dir().current).toBeNull();
      expect(h.of('boss.started')).toEqual([]);
      expect((console.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls.some((c) => String(c[0]).includes('structureBreaks'))).toBe(true);
      h.teardown();
    },
    T30,
  );
});

describe('bellows-engine review fixes', () => {
  it(
    'poise is full again once a bar is counted (nothing reads it as staggered through the vent)',
    async () => {
      const h = await setup();
      h.start();
      h.shutLive();
      expect(h.of('boss.break')).toHaveLength(1);
      expect(h.boss()!.poise).toBe(BELLOWS.maxPoise);
      h.teardown();
    },
    T30,
  );

  it(
    'the punch is blockable and parryable, the jet and coal are not; a parried punch is no pip',
    async () => {
      const h = await setup();
      h.at(0, 57.5);
      const requests: Array<{ attackId?: string; parryable?: false; unblockable?: boolean }> = [];
      h.ctx.damage.addModifier('test.spy', (req) => {
        if (req.targetId === h.ctx.player.actor.id) requests.push({ attackId: req.attackId, parryable: req.parryable, unblockable: req.unblockable });
      }, -150);
      h.start();
      h.runHealed(RHYTHM.first + 1.2);
      const punch = requests.find((r) => r.attackId === 'bellows.punch')!;
      expect(punch.parryable).toBeUndefined();
      expect(punch.unblockable).toBeFalsy();
      h.at(0, 54);
      h.runHealed(8);
      const jet = requests.find((r) => r.attackId === 'bellows.steam')!;
      expect(jet.parryable).toBe(false);
      expect(jet.unblockable).toBe(true);
      // A parry staggers its attacker: on the engine that is refused and its poise refills.
      h.ctx.damage.stagger(h.boss()!.id, h.ctx.player.actor.id, 1e6);
      expect(h.of('boss.break')).toEqual([]);
      expect(h.boss()!.poise).toBe(BELLOWS.maxPoise);
      h.teardown();
    },
    T30,
  );

  it(
    'a shut whose bar the registry does not count reopens its valve, lit, and a second shut works',
    async () => {
      const h = await setup();
      h.start();
      const svc = h.ctx.services.get('structureBreaks')!;
      const real = svc.acceptBreak.bind(svc);
      let refuse = 1;
      svc.acceptBreak = (id: string) => (refuse-- > 0 ? false : real(id));
      const live = h.enc().liveValve;
      h.turn(live + 1);
      expect(h.of('boss.break')).toEqual([]);
      h.run(3);
      expect(h.enc().liveValve).toBe(live);
      expect(h.enc().valveBank!.look(live)).toBe('live');
      expect(h.interactable(live + 1).enabled()).toBe(true);
      // The armed break was drained: a stray stagger makes no pip.
      h.ctx.damage.stagger(h.boss()!.id, h.ctx.player.actor.id, 1e6);
      expect(h.of('boss.break')).toEqual([]);
      h.turn(live + 1);
      expect(h.of('boss.break')).toHaveLength(1);
      h.teardown();
    },
    T30,
  );

  it(
    'with a model: the fight runs on it, and a beaten engine stands as a wreck only while the Crucible is current',
    async () => {
      const h = await setup({ model: true });
      h.start();
      expect(h.scene.getObjectByName('boss-bellows-engine')).toBeDefined();
      // The engine is solid: a ray along the floor from 6 m out stops at its body, not at the far wall.
      const enc = h.dir().current!;
      expect(enc.bodyCollider).not.toBeNull();
      h.run(0.1);
      const c = enc.actor.worldPosition(new THREE.Vector3());
      const ray = () => physics.raycast({ x: c.x + 6, y: c.y + 1, z: c.z }, { x: -1, y: 0, z: 0 }, 6);
      const hit = ray();
      expect(hit?.collider).toBe(enc.bodyCollider);
      expect(hit!.distance).toBeCloseTo(6 - BELLOWS.colliderRadius, 1);
      winBellowsForTest({ ctx: h.ctx, step: () => h.game.fixedUpdate() });
      h.run(2);
      expect(h.dir().wreckShown).toBe(true);
      const wreck = h.scene.getObjectByName('bellows-engine')!;
      expect(wreck.visible).toBe(true);
      // The fight's body went with it.
      expect(enc.bodyCollider).toBeNull();
      expect(ray()?.collider === hit!.collider).toBe(false);
      h.interiors.current = null;
      h.run(2);
      expect(wreck.visible).toBe(false);
      h.teardown();
    },
    T30,
  );
});

describe('valve ids', () => {
  it('never take the Act 2 Weeping Bellows wheels’ ids or their SFX prefix', () => {
    expect(VALVE_INTERACT_PREFIX.startsWith(BELLOWS_VALVE_PREFIX)).toBe(false);
    expect(BELLOWS_VALVE_PREFIX.startsWith(VALVE_INTERACT_PREFIX)).toBe(false);
  });

  it(
    'a failed valve mount stops the fight without a retry loop until the player walks in again',
    async () => {
      const h = await setup();
      // Something else already holds valve 1's id: the mount fails.
      const off = h.ctx.interaction.register({ id: `${VALVE_INTERACT_PREFIX}1`, kind: 'valve', position: (o: THREE.Vector3) => o.set(0, 0, 0), radius: 1, promptKey: 'x', onInteract: () => {} } as never);
      h.enter();
      h.run(secs(PRESENTATION.introSeconds) + 2);
      expect(h.dir().current).toBeNull();
      h.run(secs(10));
      expect(h.dir().current).toBeNull();
      const fails = (console.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter((c) => String(c[0]).includes('could not mount')).length;
      expect(fails).toBe(1);
      // Freed and walked into again: it starts.
      off();
      h.exit();
      h.enter();
      h.run(secs(PRESENTATION.introSeconds) + 2);
      expect(h.enc().contested).toBe(true);
      h.teardown();
    },
    T30,
  );
});

describe('winBellowsForTest (L13)', () => {
  it(
    'wins the fight headless by the rules, defeated',
    async () => {
      const h = await setup();
      h.enter();
      const r = winBellowsForTest({ ctx: h.ctx, step: () => h.game.fixedUpdate() });
      expect(h.ctx.state.getString(OUTCOME_FLAG)).toBe('defeated');
      expect(h.of('boss.break')).toHaveLength(3);
      expect(r.seconds).toBeGreaterThan(PRESENTATION.introSeconds);
      h.teardown();
    },
    T30,
  );

  it(
    'says why when the fight never starts',
    async () => {
      const h = await setup({ flags: false });
      h.enter();
      expect(() => winBellowsForTest({ ctx: h.ctx, step: () => h.game.fixedUpdate() })).toThrow(/fight starting/);
      h.teardown();
    },
    T30,
  );
});

describe('BellowsModel', () => {
  it('builds with hurtboxes on the boiler, head and arms, animates and disposes', () => {
    const m = buildBellowsModel();
    expect(m.hurtboxes.missing).toEqual([]);
    expect(m.hurtboxes.count).toBe(5);
    const armZ = () => (m.body.getObjectByName('bellows-arm-l') as THREE.Object3D).position.z;
    const z0 = armZ();
    m.setDraw(1);
    expect(armZ()).toBeGreaterThan(z0);
    m.setDraw(0);
    m.slam();
    m.update(0.1);
    expect(armZ()).toBeLessThan(z0);
    m.setYaw(1);
    expect(m.yaw).toBe(1);
    m.setVented(true);
    m.setWrecked();
    m.update(0.1);
    const out = m.nozzleWorld(new THREE.Vector3());
    expect(Number.isFinite(out.x)).toBe(true);
    m.dispose();
  });
});
