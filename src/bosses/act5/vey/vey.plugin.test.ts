import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../../core/core.plugin';
import type { GameEventMap } from '../../../core/events';
import { Game } from '../../../core/Game';
import { MoveModifiers } from '../../../core/MoveModifiers';
import type { GamePlugin, PluginModule } from '../../../core/plugins';
import { BOSS_MERCY } from '../../../enemies/tuning';
import { InputManager } from '../../../input/InputManager';
import { PhysicsWorld } from '../../../physics/PhysicsWorld';
import { killXp } from '../../../progression/tuning';
import { TerrainColliders } from '../../../world/TerrainColliders';
import { World } from '../../../world/World';
import { BossArenas } from '../../arena';
import { VEY_SPAWNERS } from './spawners';
import { OUTCOME_FLAG, VEY_ARENA_ID } from './VeyDirector';
import { VEY_BOSS_DEF } from './VeyEncounter';
import veyPlugin, { veyDirector } from './vey.plugin';
import { winVeyForTest } from './testing';
import { warhostLineLint } from '../../../enemies/act5/lint';
import { ARENA, COMBO, CROWD, D09_STARTED_FLAG, F7_FLAG, PRESENTATION, SURGE, VEY, VEY_BOSS_ID, VEY_KIND } from './tuning';

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

async function setup(opts: { flag?: boolean; f7?: string } = {}) {
  const scene = new THREE.Scene();
  const moveModifiers = new MoveModifiers();
  const world = new World(scene, physics, { colliders: new TerrainColliders(physics, { patchSize: 50, cells: 16 }), moveModifier: () => moveModifiers.state() });
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null as Element | null });
  const element = Object.assign(new EventTarget(), { requestPointerLock: () => {} }) as unknown as HTMLElement;
  const input = new InputManager(element, win, doc, { storage: null });
  const game = new Game({ scene, physics, world, input, moveModifiers, assets: null as never, cameraRig: null as never, report: () => {} });
  const events: Array<{ type: keyof GameEventMap; payload: any }> = [];
  game.events.onAny((type, payload) => events.push({ type, payload }));
  const spawned: string[] = [];
  const resets: string[] = [];
  const blockers: string[] = [];
  const enemies: GamePlugin = {
    id: 'enemies',
    dependsOn: ['core'],
    setup(c) {
      c.services.provide('enemies', {
        spawnGroup: (id: string) => (spawned.push(id), []),
        reset: (id: string) => void resets.push(id),
        alive: () => [],
        despawnGroup: () => {},
        view: () => undefined,
      } as never);
    },
  };
  const interiors: GamePlugin = {
    id: 'interiors',
    dependsOn: ['core'],
    setup(c) {
      (c.services.provide as (n: string, v: unknown) => void)('interiors', { current: ARENA.interiorId, setBlocker: (id: string, closed: boolean) => blockers.push(`${id}:${closed}`) });
    },
  };
  let arenas: BossArenas | null = null;
  const act5Core: GamePlugin = {
    id: 'act5-core',
    dependsOn: ['core'],
    setup(c) {
      arenas = new BossArenas({ warn: () => {} });
      (c.services.provide as (n: string, v: unknown) => void)('bossArena', arenas);
      c.events.on('boss.ended', (e) => arenas!.onBossEnded(e.bossId));
      c.events.on('save.loaded', () => arenas!.onLoaded());
    },
  };
  await game.loadPlugins(modules(corePlugin, enemies, interiors, act5Core, veyPlugin));
  const ctx = game.ctx;
  if (opts.flag !== false) ctx.state.setFlag(D09_STARTED_FLAG, true);
  if (opts.f7) ctx.state.setFlag(F7_FLAG, opts.f7);
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  run(2);
  const p = ctx.player.feet.clone();
  // Foundry-local frame: local (0, 136) is the entry anchor; the player stands at local (0, 140), on the ring floor.
  const o = { x: p.x, y: p.y, z: p.z - 140 };
  const loc = (x: number, z: number) => ({ x: o.x + x, y: o.y, z: o.z + z });
  ctx.anchors.define({ id: ARENA.entry, position: loc(0, 136), yaw: Math.PI });
  ctx.anchors.define({ id: ARENA.mouth, position: loc(0, 132.8), yaw: Math.PI });
  ctx.anchors.define({ id: ARENA.centre, position: loc(0, 145), yaw: 0 });
  ARENA.caches.forEach((id, i) => ctx.anchors.define({ id, position: loc(i % 2 ? 14 : -14, 141 + i * 3), yaw: 0 }));
  const of = <K extends keyof GameEventMap>(type: K): GameEventMap[K][] => events.filter((e) => e.type === type).map((e) => e.payload as GameEventMap[K]);
  const enter = () => game.events.emit('trigger.enter', { triggerId: ARENA.trigger, actorId: ctx.player.actor.id });
  const boss = () => [...ctx.actors.all()].find((a) => a.kind === VEY_KIND) ?? null;
  const state = () => ctx.bosses.state(VEY_BOSS_ID);
  const enc = () => veyDirector()!.current!;
  const hit = (amount: number, poise = amount, extra: Record<string, unknown> = {}) =>
    ctx.damage.apply({ attackerId: ctx.player.actor.id, targetId: boss()!.id, amount, poise, kind: 'melee', ...extra });
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
  const startFight = () => {
    enter();
    run(secs(PRESENTATION.introSeconds) + 2);
  };
  /** A heavy blow that empties his poise (the Knight's chop id, x 2). */
  const breakBar = () => {
    hit(10_000, 0);
    return hit(1, VEY.maxPoise, { attackId: '1H_Melee_Attack_Chop' });
  };
  /** Waits out the break's stagger and surge. */
  const settle = () => runHealed(1.2 + SURGE.roarSeconds + SURGE.windup + 0.3);
  const teardown = () => {
    game.dispose();
    world.dispose();
  };
  return { game, ctx, events, of, run, runHealed, enter, boss, state, enc, hit, heal, startFight, breakBar, settle, spawned, resets, blockers, arenas: () => arenas!, teardown, loc };
}

type T = Awaited<ReturnType<typeof setup>>;

function toWindow(t: T) {
  for (let i = 0; i < VEY.breaksPerPhase - 1; i++) {
    t.breakBar();
    t.settle();
  }
  t.breakBar();
}

describe('Morcant Vey on the real core', () => {
  it('the contract: mercy row, def, kill XP, crowd lines, strings', async () => {
    expect(BOSS_MERCY[VEY_BOSS_ID]).toMatchObject({ verb: 'spare', track: 'oswin', amount: 4, burn: 0, ledgerId: 'D09' });
    expect(VEY_BOSS_DEF).toMatchObject({ bossId: 'vey', phases: [], breaksPerPhase: 4, releaseWindowSeconds: 6, mercyVerb: 'spare' });
    expect(killXp(VEY_KIND, 38, 38, 3)).toBe(900);
    expect(OUTCOME_FLAG).toBe('boss.vey.outcome');
    expect(warhostLineLint(VEY_SPAWNERS)).toEqual([]);
    expect(VEY_SPAWNERS.every((s) => s.area === 'caldera-foundry' && s.ephemeral && s.activation === 'manual')).toBe(true);
    const t = await setup();
    expect(t.ctx.strings.has('boss.vey.name')).toBe(true);
    expect(t.game.systems.has('bosses.vey')).toBe(true);
    t.teardown();
  });

  it('arms only with story.d09.started and no outcome; starts after the intro and registers', async () => {
    const t = await setup({ flag: false });
    t.enter();
    t.run(10);
    expect(t.boss()).toBeNull();
    t.ctx.state.setFlag(D09_STARTED_FLAG, true);
    t.run(2);
    expect(t.boss()).not.toBeNull();
    t.run(secs(PRESENTATION.introSeconds) + 2);
    expect(t.state()).toMatchObject({ bossId: 'vey', breaksPerPhase: 4 });
    expect(t.of('boss.started').some((e) => e.bossId === 'vey')).toBe(true);
    expect(t.arenas().state(VEY_ARENA_ID, 'lights')).toBe('lit');
    t.teardown();
    const u = await setup();
    u.ctx.state.setFlag(OUTCOME_FLAG, 'spared');
    u.enter();
    u.run(secs(PRESENTATION.introSeconds) + 2);
    expect(u.boss()).toBeNull();
    u.teardown();
  });

  it('holds: each bar holds his health at its floor until it breaks; a 10,000 hit never skips a floor', async () => {
    const t = await setup();
    t.startFight();
    const max = t.state()!.maxHealth;
    for (let k = 0; k < VEY.floors.length; k++) {
      t.hit(10_000, 0);
      expect(t.state()!.health).toBe(Math.ceil(max * VEY.floors[k]!));
      t.hit(10_000, 0);
      expect(t.state()!.health).toBe(Math.ceil(max * VEY.floors[k]!));
      if (k < VEY.floors.length - 1) {
        t.breakBar();
        t.settle();
      }
    }
    expect(t.state()!.outcome).toBeNull();
    t.teardown();
  });

  it('heavy hits do double poise and light hits half; nothing lands through the roar', async () => {
    const t = await setup();
    t.startFight();
    const b = t.boss()!;
    t.hit(1, 20, { attackId: '1H_Melee_Attack_Chop' });
    expect(VEY.maxPoise - b.poise).toBe(40);
    b.restorePoise();
    t.hit(1, 20, { attackId: '1H_Melee_Attack_Slice_Horizontal' });
    expect(VEY.maxPoise - b.poise).toBe(10);
    b.restorePoise();
    t.breakBar();
    t.runHealed(1.25);
    expect(t.enc().brain.state).toBe('roar');
    const before = t.state()!.health;
    expect(t.hit(50, 50)?.outcome).toBe('immune');
    expect(t.state()!.health).toBe(before);
    t.teardown();
  });

  it('edge: a poise break above the bar\'s floor is only a stagger (no bar, poise refilled); at the floor it counts', async () => {
    const t = await setup();
    t.startFight();
    t.hit(1, VEY.maxPoise, { attackId: '1H_Melee_Attack_Chop' });
    expect(t.state()!.breaks).toBe(0);
    expect(t.enc().earlyStaggers).toBe(1);
    expect(t.boss()!.poise).toBe(VEY.maxPoise);
    t.breakBar();
    expect(t.state()!.breaks).toBe(1);
    t.teardown();
  });

  it.each([
    ['knight', '1H_Melee_Attack_Chop'],
    ['warden', 'warden.skullsplitter'],
    ['ashblade', 'ashblade-heavy'],
    ['pathfinder', 'pathfinder.bolt.2'],
    ['emberwright', 'emberwright.flameBall'],
  ])('every class breaks every bar: %s by its heavy route', async (_cls, id) => {
    const { ASHBLADE_HEAVY_CLIP } = await import('../../../classes/ashblade/attackSet');
    const attackId = id === 'ashblade-heavy' ? ASHBLADE_HEAVY_CLIP : id;
    const t = await setup();
    t.startFight();
    for (let bar = 0; bar < VEY.breaksPerPhase; bar++) {
      t.hit(10_000, 0);
      // A heavy route breaks the 120-poise bar in at most six blows of 10 raw poise (x 2).
      for (let n = 0; n < 6 && t.state()!.breaks === bar; n++) {
        t.hit(1, 10, { attackId });
        t.runHealed(0.1);
      }
      expect(t.state()!.breaks).toBe(bar + 1);
      if (bar < VEY.breaksPerPhase - 1) t.settle();
    }
    expect(t.state()!.releaseOpen).toBe(true);
    t.teardown();
  });

  it('a break restocks the caches and the surge burns Cael inside 6 m', async () => {
    const t = await setup();
    t.ctx.services.provide('progression' as never, { classId: 'pathfinder', level: 37 } as never);
    t.startFight();
    const caches = t.enc().caches;
    expect(caches.count).toBe(6);
    expect(caches.take(0)).toBeGreaterThan(0);
    expect(caches.stocked(0)).toBe(false);
    const b = t.boss()!.root!.position;
    t.ctx.player.teleport({ x: b.x + 2, y: b.y, z: b.z }, 0);
    t.breakBar();
    expect(caches.stocked(0)).toBe(true);
    const hp = t.ctx.player.actor.health;
    t.run(secs(1.2 + SURGE.roarSeconds + SURGE.windup + 0.1));
    expect(t.events.some((e) => e.type === 'damage.dealt' && e.payload.attackId === SURGE.attackId)).toBe(true);
    expect(t.ctx.player.actor.health).toBeLessThan(hp);
    t.teardown();
  });

  it('F7 Public: four household guards at the second break; Private or unset: none', async () => {
    for (const f7 of ['public', 'private', undefined]) {
      const t = await setup({ f7 });
      t.startFight();
      t.breakBar();
      t.settle();
      expect(t.spawned).toEqual([]);
      t.breakBar();
      t.settle();
      expect(t.spawned).toEqual(f7 === 'public' ? [...CROWD.groups] : []);
      t.teardown();
    }
  });

  it('the fourth break opens a 6 s Spare window (boss.releaseWindow); Spare gives spared', async () => {
    const t = await setup({ f7: 'public' });
    t.startFight();
    toWindow(t);
    expect(t.of('boss.releaseWindow').at(-1)).toEqual({ bossId: 'vey', open: true });
    expect(t.enc().brain.state).toBe('window');
    expect(t.ctx.bosses.release(VEY_BOSS_ID)).toBe(true);
    expect(t.ctx.state.getFlag(OUTCOME_FLAG)).toBe('spared');
    // the crowd leaves with him
    expect(t.resets.filter((r) => CROWD.groups.includes(r)).length).toBeGreaterThanOrEqual(4);
    t.runHealed(PRESENTATION.spareKneelSeconds + PRESENTATION.spareFadeSeconds + 0.2);
    expect(t.boss()).toBeNull();
    expect(veyDirector()!.current).toBeNull();
    expect(t.blockers.at(-1)).toBe(`${ARENA.gate}:false`);
    t.teardown();
  });

  it('strike: any hit from Cael with the window open strikes him down (defeated)', async () => {
    const t = await setup();
    t.startFight();
    toWindow(t);
    t.hit(1, 0);
    expect(t.ctx.state.getFlag(OUTCOME_FLAG)).toBe('defeated');
    expect(t.of('boss.releaseWindow').at(-1)).toEqual({ bossId: 'vey', open: false });
    t.teardown();
  });

  it('a lapsed window: he rises at the floor, fights on, and the next break reopens it', async () => {
    const t = await setup();
    t.startFight();
    toWindow(t);
    t.runHealed(VEY.releaseWindowSeconds + 0.2);
    expect(t.state()!.releaseOpen).toBe(false);
    expect(t.state()!.outcome).toBeNull();
    expect(t.state()!.health).toBeGreaterThan(0);
    t.runHealed(1);
    t.breakBar();
    expect(t.state()!.releaseOpen).toBe(true);
    t.teardown();
  });

  it('combo: hits 1 and 2 cannot be parried, hit 3 can', async () => {
    const t = await setup();
    const seen: Array<{ attackId?: string; parryable?: boolean }> = [];
    t.ctx.damage.addModifier('test.peek', (req) => void (req.targetId === t.ctx.player.actor.id && seen.push({ attackId: req.attackId, parryable: req.parryable })), -500);
    t.startFight();
    const b = t.boss()!.root!.position;
    const yaw = t.boss()!.root!.rotation.y;
    t.ctx.player.teleport({ x: b.x - Math.sin(yaw) * 2, y: b.y, z: b.z - Math.cos(yaw) * 2 }, 0);
    t.runHealed(4);
    const combo = seen.filter((s) => s.attackId?.startsWith('vey.combo'));
    expect(combo.length).toBeGreaterThanOrEqual(3);
    expect(combo.find((s) => s.attackId === COMBO.hits[0]!.attackId)!.parryable).toBe(false);
    expect(combo.find((s) => s.attackId === COMBO.hits[1]!.attackId)!.parryable).toBe(false);
    expect(combo.find((s) => s.attackId === COMBO.hits[2]!.attackId)!.parryable).not.toBe(false);
    t.teardown();
  });

  it('a load mid-fight resets the arena, despawns him and puts Cael at checkpoint 3; walking in starts a fresh fight', async () => {
    const t = await setup({ f7: 'public' });
    t.startFight();
    t.breakBar();
    t.settle();
    t.breakBar();
    t.settle();
    expect(t.blockers).toContain(`${ARENA.gate}:true`);
    t.game.events.emit('save.loaded', {} as never);
    t.run(2);
    expect(t.boss()).toBeNull();
    expect(t.arenas().state(VEY_ARENA_ID, 'lights')).toBeUndefined();
    expect(t.blockers.at(-1)).toBe(`${ARENA.gate}:false`);
    const mouth = t.ctx.anchors.find(ARENA.mouth)!.position;
    expect(t.ctx.player.feet.distanceTo(mouth as THREE.Vector3)).toBeLessThan(0.5);
    t.ctx.player.teleport(t.loc(0, 140), 0);
    t.startFight();
    expect(t.state()!.health).toBe(t.state()!.maxHealth);
    expect(t.state()!.breaks).toBe(0);
    t.teardown();
  });

  it('Cael dying mid-fight resets it with no outcome', async () => {
    const t = await setup();
    t.startFight();
    t.breakBar();
    const pl = t.ctx.player.actor;
    t.ctx.damage.apply({ attackerId: null, targetId: pl.id, amount: pl.health + 10, kind: 'melee', unblockable: true } as never);
    t.run(3);
    expect(t.boss()).toBeNull();
    expect(t.ctx.state.hasFlag(OUTCOME_FLAG)).toBe(false);
    t.teardown();
  });

  it('winVeyForTest reaches both outcomes on the real rules', async () => {
    for (const outcome of ['spared', 'defeated'] as const) {
      const t = await setup();
      t.enter();
      const r = winVeyForTest({ ctx: t.ctx, step: () => t.game.fixedUpdate() }, outcome);
      expect(t.ctx.state.getFlag(OUTCOME_FLAG)).toBe(outcome);
      expect(r.seconds).toBeGreaterThan(5);
      t.teardown();
    }
  });
}, 60_000);
