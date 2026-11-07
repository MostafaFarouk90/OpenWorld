import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../../core/core.plugin';
import type { GameEventMap } from '../../../core/events';
import { Game } from '../../../core/Game';
import { MoveModifiers } from '../../../core/MoveModifiers';
import type { GamePlugin, PluginModule } from '../../../core/plugins';
import { InputManager } from '../../../input/InputManager';
import { PhysicsWorld } from '../../../physics/PhysicsWorld';
import { killXp } from '../../../progression/tuning';
import { TerrainColliders } from '../../../world/TerrainColliders';
import { World } from '../../../world/World';
import { BossArenas } from '../../arena';
import { ANVIL_ARENA_LAYOUT } from './anvilArena';
import { OUTCOME_FLAG, ULTHRED_ARENA_ID } from './UlthredDirector';
import { ARMOUR_BARK_KEYS, ULTHRED_BOSS_DEF } from './UlthredEncounter';
import { TRIAL_KIND } from './hammerTrial';
import ulthredPlugin, { hammerTrial, ulthredDirector } from './ulthred.plugin';
import { winUlthredForTest } from './testing';
import { ANVILS, D10_STARTED_FLAG, DROP_ANCHOR, FLAMES, HALL, HEARTSHARD, PRESENTATION, SCAR_TAX, SLAM, ULTHRED, ULTHRED_BOSS_ID, ULTHRED_KIND, VEY_OUTCOME_FLAG } from './tuning';

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
const HEAVY = '1H_Melee_Attack_Chop';

async function setup(opts: { flag?: boolean; scars?: number; teleport?: 'fail' | 'hang' } = {}) {
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
  const blockers: string[] = [];
  const entered: string[] = [];
  const burns: Array<[number, string]> = [];
  const holds: string[] = [];
  const released: string[] = [];
  const interiorsState = { current: HALL.interiorId as string | null };
  const interiors: GamePlugin = {
    id: 'interiors',
    dependsOn: ['core'],
    setup(c) {
      (c.services.provide as (n: string, v: unknown) => void)('interiors', {
        get current() {
          return interiorsState.current;
        },
        setBlocker: (id: string, closed: boolean) => (blockers.push(`${id}:${closed}`), true),
        enter: async (id: string) => {
          entered.push(id);
          interiorsState.current = id;
        },
      });
    },
  };
  const spells: GamePlugin = {
    id: 'spells',
    dependsOn: ['core'],
    setup(c) {
      (c.services.provide as (n: string, v: unknown) => void)('spells', { burn: 0, scars: opts.scars ?? 0, addBurn: (n: number, s: string) => void burns.push([n, s]) });
    },
  };
  let arenas: BossArenas | null = null;
  const act5Core: GamePlugin = {
    id: 'act5-core',
    dependsOn: ['core'],
    setup(c) {
      const safeTeleport = opts.teleport === 'fail' ? async () => ({ ok: false }) : opts.teleport === 'hang' ? () => new Promise<{ ok: boolean }>(() => {}) : undefined;
      arenas = new BossArenas({ warn: () => {}, anchor: (id) => c.anchors.find(id) ?? undefined, ...(safeTeleport ? { safeTeleport } : {}) });
      if (opts.teleport) {
        // A waystones service makes the director use the arena's safe teleport; the autosave hold is counted.
        (c.services.provide as (n: string, v: unknown) => void)('waystones', {});
        (c.services.provide as (n: string, v: unknown) => void)('save', {
          suspend: (reason: string) => {
            holds.push(reason);
            return () => void released.push(reason);
          },
        });
      }
      (c.services.provide as (n: string, v: unknown) => void)('bossArena', arenas);
      c.events.on('boss.ended', (e) => arenas!.onBossEnded(e.bossId));
      c.events.on('save.loaded', () => arenas!.onLoaded());
    },
  };
  await game.loadPlugins(modules(corePlugin, interiors, spells, act5Core, ulthredPlugin));
  const ctx = game.ctx;
  if (opts.flag !== false) ctx.state.setFlag(D10_STARTED_FLAG, true);
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  run(2);
  const p = ctx.player.feet.clone();
  // Hall-local frame: local (0, 3) is the entry anchor; the player stands at local (0, 50), on the hall floor.
  const o = { x: p.x, y: p.y, z: p.z - 50 };
  const loc = (x: number, z: number) => ({ x: o.x + x, y: o.y, z: o.z + z });
  ctx.anchors.define({ id: HALL.entry, position: loc(0, 3), yaw: Math.PI });
  ctx.anchors.define({ id: HALL.mouth, position: loc(0, 36), yaw: Math.PI });
  ctx.anchors.define({ id: HALL.centre, position: loc(0, 60), yaw: 0 });
  HALL.slams.forEach((id, k) => ctx.anchors.define({ id, position: loc(14 * Math.sin((k * Math.PI) / 4), 56 - 14 * Math.cos((k * Math.PI) / 4)), yaw: 0 }));
  const of = <K extends keyof GameEventMap>(type: K): GameEventMap[K][] => events.filter((e) => e.type === type).map((e) => e.payload as GameEventMap[K]);
  const enter = () => game.events.emit('trigger.enter', { triggerId: HALL.trigger, actorId: ctx.player.actor.id });
  const boss = () => [...ctx.actors.all()].find((a) => a.kind === ULTHRED_KIND) ?? null;
  const state = () => ctx.bosses.state(ULTHRED_BOSS_ID);
  const enc = () => ulthredDirector()!.current!;
  const hit = (amount: number, poise = amount, extra: Record<string, unknown> = {}) =>
    ctx.damage.apply({ attackerId: ctx.player.actor.id, targetId: boss()!.id, amount, poise, kind: 'melee', ...extra });
  const heal = () => {
    const pl = ctx.player.actor;
    if (!pl.dead) pl.health = pl.maxHealth;
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
  const untilStuck = () => {
    for (let i = 0; i < secs(15) && !enc().brain.stuck; i++) {
      game.fixedUpdate();
      heal();
    }
    expect(enc().brain.stuck).toBe(true);
  };
  /** Phase 1 or 3: to the floor, then one heavy blow (x 2) at a breakable moment. */
  const breakBar = () => {
    hit(100_000, 0);
    if (enc().brain.phase === 1) untilStuck();
    hit(1, ULTHRED.maxPoise, { attackId: HEAVY });
  };
  const settle = () => runHealed(1.6);
  const flush = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
  /** Phase 1's three bars, then the drop (the first hit after crosses 66%). */
  const toIsland = async () => {
    for (let k = 0; k < 3; k++) {
      breakBar();
      settle();
    }
    hit(100_000, 0);
    for (let i = 0; i < secs(ULTHRED.dropSeconds) + 4; i++) {
      game.fixedUpdate();
      heal();
      await flush();
    }
    runHealed(0.2);
  };
  const teardown = () => {
    game.dispose();
    world.dispose();
  };
  return { game, ctx, events, of, run, runHealed, enter, boss, state, enc, hit, heal, startFight, breakBar, settle, toIsland, flush, blockers, entered, holds, released, burns, interiorsState, arenas: () => arenas!, teardown, loc };
}

describe('Ulthred on the real core', () => {
  it('the contract: def, kill XP, outcome flag, strings, arena pieces', async () => {
    expect(ULTHRED_BOSS_DEF).toMatchObject({ bossId: 'ulthred', phases: [0.66, 0.33], breaksPerPhase: 3, releaseWindowSeconds: 0 });
    expect(killXp(ULTHRED_KIND, 40, 40, 3)).toBe(1200);
    expect(killXp(TRIAL_KIND, 40, 40, 3)).toBe(0);
    expect(OUTCOME_FLAG).toBe('boss.ulthred.outcome');
    expect(ULTHRED.floors).toHaveLength(9);
    const t = await setup();
    expect(t.ctx.strings.has('boss.ulthred.name')).toBe(true);
    expect(t.ctx.strings.has(ARMOUR_BARK_KEYS.body)).toBe(true);
    expect(t.game.systems.has('bosses.ulthred')).toBe(true);
    expect(t.ctx.services.get('hammerTrial')).toBeTruthy();
    expect(t.ctx.anchors.find(DROP_ANCHOR)).toBeTruthy();
    const a = ulthredDirector()!.anvilArena!;
    expect(a.anvils).toHaveLength(3);
    expect(a.flamePosts).toHaveLength(10);
    expect(a.platforms).toHaveLength(4);
    for (const piece of ['floor', 'ring', 'anvils', 'flames', 'lines']) expect(t.arenas().set(ULTHRED_ARENA_ID, piece, 'probe')).toBe(true);
    t.teardown();
  });

  it('arms only with story.d10.started and no outcome; the gate closes behind Cael', async () => {
    const t = await setup({ flag: false });
    t.enter();
    t.run(10);
    expect(t.boss()).toBeNull();
    t.ctx.state.setFlag(D10_STARTED_FLAG, true);
    t.run(2);
    expect(t.boss()).not.toBeNull();
    t.run(secs(PRESENTATION.introSeconds) + 2);
    expect(t.state()).toMatchObject({ bossId: 'ulthred', phase: 1, breaksPerPhase: 3 });
    expect(t.blockers).toContain(`${HALL.gate}:true`);
    t.teardown();
    const u = await setup();
    u.ctx.state.setFlag(OUTCOME_FLAG, 'defeated');
    u.enter();
    u.run(secs(PRESENTATION.introSeconds) + 2);
    expect(u.boss()).toBeNull();
    u.teardown();
  });

  it('phase 1: health holds at each floor; poise lands only while the hammer is stuck; an early break does not count', async () => {
    const t = await setup();
    t.startFight();
    const max = t.state()!.maxHealth;
    t.hit(100_000, 0);
    expect(t.state()!.health).toBe(Math.ceil(max * ULTHRED.floors[0]!));
    const b = t.boss()!;
    // Not stuck: no poise.
    expect(t.enc().brain.stuck).toBe(false);
    t.hit(1, 20, { attackId: HEAVY });
    expect(b.poise).toBe(ULTHRED.maxPoise);
    t.breakBar();
    expect(t.enc().bars).toBe(1);
    t.settle();
    // Above the next floor, a full stagger is not a bar.
    const before = t.enc().earlyStaggers;
    for (let i = 0; i < secs(15) && !t.enc().brain.stuck; i++) t.runHealed(TICK);
    t.hit(1, ULTHRED.maxPoise, { attackId: HEAVY });
    expect(t.enc().bars).toBe(1);
    expect(t.enc().earlyStaggers).toBe(before + 1);
    t.teardown();
  });

  it('a slam telegraphs 1.2 s and leaves a lava line in phase 1 that is gone after 6 s', async () => {
    const t = await setup();
    t.startFight();
    for (let i = 0; i < secs(15) && t.enc().lines.count === 0; i++) t.runHealed(TICK);
    expect(t.enc().lines.count).toBe(1);
    const tell = t.of('telegraph').find((e) => e.attackId === SLAM.attackId)!;
    expect(tell.leadSeconds).toBeCloseTo(SLAM.windupSeconds);
    t.runHealed(6.1);
    expect(t.enc().lines.count).toBeLessThanOrEqual(1);
    t.teardown();
  });

  it('the drop: at 66% the floor cracks and breaks, Cael lands at the drop anchor, the same actor moves and keeps phase 2', async () => {
    const t = await setup();
    t.startFight();
    const id = t.boss()!.id;
    await t.toIsland();
    expect(t.of('boss.phase').map((e) => e.phase)).toEqual([2]);
    expect(t.of('arena.piece' as never)).toBeDefined();
    expect(t.arenas().state(ULTHRED_ARENA_ID, 'floor')).toBe('broken');
    expect(t.blockers).toContain(`${HALL.floorBlocker}:false`);
    expect(t.arenas().state(ULTHRED_ARENA_ID, 'ring')).toBe('turning');
    expect(t.enc().island).toBe(true);
    expect(t.boss()!.id).toBe(id);
    expect(t.of('boss.ended').filter((e) => e.bossId === 'ulthred')).toHaveLength(0);
    const drop = t.ctx.anchors.find(DROP_ANCHOR)!;
    expect(Math.hypot(t.ctx.player.feet.x - drop.position.x, t.ctx.player.feet.z - drop.position.z)).toBeLessThan(3);
    t.teardown();
  });

  it('phase 2: hits carry no poise; a cracked anvil (hold-F or leap and swing) breaks the bar; a cracked anvil stays cracked', async () => {
    const t = await setup();
    t.startFight();
    await t.toIsland();
    const b = t.boss()!;
    t.hit(1, 50, { attackId: HEAVY });
    expect(b.poise).toBe(ULTHRED.maxPoise);
    expect(t.enc().bars).toBe(3);
    expect(t.enc().crackAnvil(0)).toBe(true);
    expect(t.enc().bars).toBe(4);
    expect(t.enc().crackAnvil(0)).toBe(false);
    t.settle();
    // The leap route: land within 2.5 m of anvil 2, then any swing within 6 s.
    const at = ulthredDirector()!.anvilArena!.anvils[1]!;
    t.ctx.player.teleport({ x: at.x + 1.5, y: at.y + 0.1, z: at.z }, 0);
    t.game.events.emit('player.leap', { phase: 'land', from: at, to: { x: at.x + 1.5, y: at.y, z: at.z } });
    // A player swing opens its attack window (the real player emits no `telegraph`, so that must not crack anything).
    t.game.events.emit('telegraph', { actorId: t.ctx.player.actor.id, kind: 'block', attackId: HEAVY, moveId: HEAVY, swingId: 1, leadSeconds: 0.3 });
    expect(t.enc().bars).toBe(4);
    t.game.events.emit('attack.window', { actorId: t.ctx.player.actor.id, attackId: HEAVY, swingId: 1, phase: 'close' });
    expect(t.enc().bars).toBe(4);
    t.game.events.emit('attack.window', { actorId: t.ctx.player.actor.id, attackId: HEAVY, swingId: 2, phase: 'open' });
    expect(t.enc().bars).toBe(5);
    expect(t.enc().cracked).toBe(2);
    t.teardown();
  });

  it('phase 3: Vey\'s armour by D09 (defeated: his body; spared: hollow), the spirit-flames (+2% each), and no Scar tax at 11', async () => {
    for (const [vey, look] of [['defeated', 'body'], ['spared', 'hollow']] as const) {
      const t = await setup({ scars: 11 });
      t.ctx.state.setFlag(VEY_OUTCOME_FLAG, vey);
      t.startFight();
      await t.toIsland();
      for (let k = 0; k < 3; k++) {
        t.hit(100_000, 0);
        t.enc().crackAnvil(k);
        t.settle();
      }
      t.hit(100_000, 0);
      expect(t.state()!.phase).toBe(3);
      expect(t.enc().armour).toBe(look);
      expect(t.enc().flames).toBeGreaterThanOrEqual(5);
      expect(t.enc().flames).toBeLessThanOrEqual(FLAMES.cap);
      expect(t.arenas().state(ULTHRED_ARENA_ID, 'flames')).toBe(`lit:${t.enc().flames}`);
      expect(t.burns).toEqual([]);
      // The flames lift Cael's hits.
      t.breakBar();
      t.settle();
      const h0 = t.boss()!.health;
      const r = t.hit(10, 0);
      expect(r?.dealt ?? h0 - t.boss()!.health).toBeCloseTo(10 * (1 + FLAMES.bonus * t.enc().flames), 3);
      t.teardown();
    }
  });

  it('the Scar tax: at 12 Scars phase 3 opens with +20 Burn', async () => {
    const t = await setup({ scars: SCAR_TAX.scars });
    t.startFight();
    await t.toIsland();
    for (let k = 0; k < 3; k++) {
      t.hit(100_000, 0);
      t.enc().crackAnvil(k);
      t.settle();
    }
    t.hit(100_000, 0);
    expect(t.burns).toContainEqual([SCAR_TAX.burn, SCAR_TAX.source]);
    t.teardown();
  });

  it('the Heartshard: the ninth break leaves him kneeling at 1 HP and immune; only the Heartshard kills; no Burn', async () => {
    const t = await setup();
    t.startFight();
    await t.toIsland();
    for (let k = 0; k < 3; k++) {
      t.hit(100_000, 0);
      t.enc().crackAnvil(k);
      t.settle();
    }
    t.hit(100_000, 0);
    for (let k = 0; k < 3; k++) {
      t.breakBar();
      if (k < 2) t.settle();
    }
    expect(t.enc().bars).toBe(9);
    expect(t.enc().kneeling).toBe(true);
    expect(t.boss()!.health).toBeLessThanOrEqual(1 + Math.ceil(t.state()!.maxHealth * ULTHRED.floorMargin));
    t.hit(100_000, 0);
    expect(t.boss()!.dead).toBe(false);
    t.runHealed(3);
    expect(t.enc().kneeling).toBe(true);
    expect(t.enc().heartshard()).toBe(true);
    expect(t.ctx.state.getFlag(OUTCOME_FLAG)).toBe('defeated');
    expect(t.of('damage.dealt').some((e) => e.attackId === HEARTSHARD.attackId)).toBe(true);
    expect(t.burns).toEqual([]);
    t.runHealed(PRESENTATION.deathClipSeconds + PRESENTATION.deathFadeSeconds + 0.2);
    expect(ulthredDirector()!.current).toBeNull();
    t.teardown();
  });

  it('loads: a load mid-fight resets every piece and despawns him; a load on the Anvil puts Cael back at the hall mouth', async () => {
    const t = await setup();
    t.startFight();
    await t.toIsland();
    t.enc().crackAnvil(0);
    t.interiorsState.current = null;
    t.game.events.emit('save.loaded', {} as never);
    await t.flush();
    t.run(2);
    expect(t.boss()).toBeNull();
    expect(t.arenas().state(ULTHRED_ARENA_ID, 'floor')).toBeUndefined();
    expect(t.arenas().state(ULTHRED_ARENA_ID, 'ring')).toBeUndefined();
    expect(ulthredDirector()!.reloadsToMouth).toBe(1);
    expect(t.entered).toContain(HALL.interiorId);
    const mouth = t.ctx.anchors.find(HALL.mouth)!;
    expect(Math.hypot(t.ctx.player.feet.x - mouth.position.x, t.ctx.player.feet.z - mouth.position.z)).toBeLessThan(1);
    t.teardown();
  });

  it('leaving the Anvil for 3 s ends the fight as a death does (no outcome)', async () => {
    const t = await setup();
    t.startFight();
    await t.toIsland();
    const c = ulthredDirector()!.anvilArena!.centre;
    t.ctx.player.teleport({ x: c.x + ANVIL_ARENA_LAYOUT.arenaR + 30, y: c.y + 0.5, z: c.z }, 0);
    t.runHealed(3.5);
    expect(t.boss()).toBeNull();
    expect(t.ctx.state.getFlag(OUTCOME_FLAG)).toBeUndefined();
    expect(ulthredDirector()!.resetsAnnounced).toBeGreaterThanOrEqual(1);
    t.teardown();
  });

  it('winUlthredForTest finishes D10 headless', async () => {
    const t = await setup();
    const r = await winUlthredForTest({ ctx: t.ctx, step: () => t.game.fixedUpdate() });
    expect(t.ctx.state.getFlag(OUTCOME_FLAG)).toBe('defeated');
    expect(r.seconds).toBeGreaterThan(10);
    t.teardown();
  }, 60_000);

  it('edge: the helper refuses without story.d10.started', async () => {
    const t = await setup({ flag: false });
    await expect(winUlthredForTest({ ctx: t.ctx, step: () => t.game.fixedUpdate() })).rejects.toThrow(/story\.d10\.started/);
    t.teardown();
  });
});

describe('Ulthred: the drop teleport fails', () => {
  for (const mode of ['fail', 'hang'] as const) {
    it(`edge (${mode}): the fight resets, autosave is released, and the floor piece never closes the pit itself`, async () => {
      const t = await setup({ teleport: mode });
      t.startFight();
      const before = t.blockers.length;
      const first = t.enc();
      const firstId = t.boss()!.id;
      await t.toIsland();
      if (mode === 'hang') {
        for (let i = 0; i < secs(ULTHRED.dropTimeoutSeconds) + 4; i++) {
          t.game.fixedUpdate();
          t.heal();
          await t.flush();
        }
      }
      // That fight is over (the hall restarts it from phase 1 while Cael stands in the trigger), never on the island.
      expect(first.done).toBe(true);
      expect(first.island).toBe(false);
      expect(t.ctx.actors.get(firstId)).toBeFalsy();
      expect(t.ctx.state.getFlag(OUTCOME_FLAG)).toBeUndefined();
      expect(t.holds).toEqual(['ulthred.drop']);
      expect(t.released).toEqual(['ulthred.drop']);
      // The break opened the floor; closing it again is N2's pit guard, never this piece.
      const floor = t.blockers.slice(before).filter((b) => b.startsWith(`${HALL.floorBlocker}:`));
      expect(floor).toContain(`${HALL.floorBlocker}:false`);
      expect(floor).not.toContain(`${HALL.floorBlocker}:true`);
      t.teardown();
    });
  }
});

describe('the M55 hammer trial', () => {
  it('refuses outside the hall; three rounds of five slams that miss Cael win it; it never takes Cael below 1 HP', async () => {
    const t = await setup({ flag: false });
    t.interiorsState.current = null;
    const trial = hammerTrial()!;
    expect(trial.start()).toBe(false);
    t.interiorsState.current = HALL.interiorId;
    expect(trial.start()).toBe(true);
    expect(t.of('ulthred.trial.round')).toEqual([{ n: 1 }]);
    // Cael waits on the line, then steps 3.5 m aside half way through each tell: every slam is aimed at him and misses.
    let tells = 0;
    let side = 1;
    let stepAt = -1;
    for (let i = 0; i < secs(300) && trial.running; i++) {
      const seen = t.of('telegraph').filter((e) => e.attackId === SLAM.attackId).length;
      if (seen > tells) {
        tells = seen;
        stepAt = i + secs(SLAM.windupSeconds / 2);
      }
      if (i === stepAt) {
        const opp = [...t.ctx.actors.all()].find((a) => a.kind === TRIAL_KIND)!;
        const yaw = opp.root!.rotation.y;
        const f = t.ctx.player.feet;
        t.ctx.player.teleport({ x: f.x + Math.cos(yaw) * 3.5 * side, y: f.y, z: f.z - Math.sin(yaw) * 3.5 * side }, 0);
        side = -side;
      }
      t.game.fixedUpdate();
    }
    expect(t.of('damage.dealt').filter((e) => e.attackId === SLAM.attackId && e.outcome === 'hit')).toHaveLength(0);
    expect(t.of('ulthred.trial.round').map((e) => e.n)).toEqual([1, 2, 3]);
    expect(t.of('ulthred.trial.won')).toHaveLength(1);
    expect(trial.running).toBe(false);
    expect([...t.ctx.actors.all()].some((a) => a.kind === TRIAL_KIND)).toBe(false);
    t.teardown();
  }, 60_000);

  it('edge: staying out of his reach is not dodging (he closes in; a slam not aimed at Cael does not count)', async () => {
    const t = await setup({ flag: false });
    const trial = hammerTrial()!;
    expect(trial.start()).toBe(true);
    for (let i = 0; i < secs(60) && trial.running; i++) {
      const opp = [...t.ctx.actors.all()].find((a) => a.kind === TRIAL_KIND)!;
      const p = opp.root!.position;
      const f = t.ctx.player.feet;
      const d = Math.hypot(p.x - f.x, p.z - f.z);
      // Always keep 12 m between them (beyond the slam's 9 m).
      if (d < 12) t.ctx.player.teleport({ x: p.x + ((f.x - p.x) / (d || 1)) * 12, y: f.y, z: p.z + ((f.z - p.z) / (d || 1)) * 12 }, 0);
      t.game.fixedUpdate();
    }
    expect(t.of('telegraph').filter((e) => e.attackId === SLAM.attackId).length).toBeGreaterThan(2);
    expect(trial.round).toBe(1);
    expect(trial.counted).toBe(0);
    trial.stop();
    t.teardown();
  });

  it('a slam that lands does not count, and leaves Cael at 1 HP at worst; leaving the hall stops it with no win', async () => {
    const t = await setup({ flag: false });
    const trial = hammerTrial()!;
    expect(trial.start()).toBe(true);
    t.ctx.player.actor.health = 2;
    let landed = 0;
    for (let i = 0; i < secs(30) && landed === 0; i++) {
      const opp = [...t.ctx.actors.all()].find((a) => a.kind === TRIAL_KIND)!;
      const p = opp.root!.position;
      // Stand right in front of him so the slam lands.
      t.ctx.player.teleport({ x: p.x - Math.sin(opp.root!.rotation.y) * 2, y: t.ctx.player.feet.y, z: p.z - Math.cos(opp.root!.rotation.y) * 2 }, 0);
      t.game.fixedUpdate();
      landed = t.of('damage.dealt').filter((e) => e.attackId === SLAM.attackId && e.outcome === 'hit').length;
    }
    expect(landed).toBeGreaterThan(0);
    expect(trial.counted).toBe(0);
    expect(t.ctx.player.actor.health).toBeGreaterThanOrEqual(1);
    expect(t.ctx.player.actor.dead).toBe(false);
    t.game.events.emit('interior.exited', { interiorId: HALL.interiorId } as never);
    expect(trial.running).toBe(false);
    expect(t.of('ulthred.trial.won')).toHaveLength(0);
    t.teardown();
  });

  it('edge: refuses while the D10 fight runs, and a second start while running', async () => {
    const t = await setup();
    t.startFight();
    expect(hammerTrial()!.start()).toBe(false);
    t.teardown();
    const u = await setup({ flag: false });
    expect(hammerTrial()!.start()).toBe(true);
    expect(hammerTrial()!.start()).toBe(false);
    expect(ANVILS.count).toBe(3);
    u.teardown();
  });
});
