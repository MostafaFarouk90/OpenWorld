import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../../core/core.plugin';
import type { GameEventMap } from '../../core/events';
import { Game } from '../../core/Game';
import { MoveModifiers } from '../../core/MoveModifiers';
import type { GamePlugin, PluginModule } from '../../core/plugins';
import { BOSS_MERCY } from '../../enemies/tuning';
import { DEEPS_DEF } from '../../greyfen/deepsInterior';
import { InputManager } from '../../input/InputManager';
import { layoutInterior } from '../../interiors/layout';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { killXp } from '../../progression/tuning';
import { heightAt } from '../../terrain/heightfield';
import { TerrainColliders } from '../../world/TerrainColliders';
import { World } from '../../world/World';
import { GATE_MARGIN, gateIsClear, gateVeil, murkjawLevel, OUTCOME_FLAG } from './MurkjawDirector';
import { ArenaFrame } from './arenaGeometry';
import { MURKJAW_BOSS_DEF, rackId, SPEAR_THROW_ID, WAVE_PUSH_OWNER } from './MurkjawEncounter';
import murkjawPlugin, { MURKJAW_CODEX_ID, murkjawDirector } from './murkjaw.plugin';
import { ARENA, BITE, CYCLE, D05_STARTED_FLAG, DROP, LUNGE, MURKJAW, MURKJAW_BOSS_ID, PRESENTATION, SPEARS, WAVE } from './tuning';

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

type Opts = {
  flag?: boolean;
  model?: boolean;
  interior?: string | null;
  anchors?: boolean;
  /** The Greyfen block's top level (undefined: not locked). */
  top?: number;
  preview?: number;
  codex?: boolean;
  rng?: () => number;
};

/** K3's Deeps laid out the way the interiors plugin does it (translation only). */
const DEEPS_LAYOUT = layoutInterior(DEEPS_DEF, heightAt);

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
  const assets = opts.model ? { load: () => Promise.resolve(), instantiate: () => new THREE.Group(), animations: () => [] } : null;
  const game = new Game({ scene, physics, world, input, moveModifiers, assets: assets as never, cameraRig: null as never, report: () => {} });
  const events: Array<{ type: keyof GameEventMap; payload: any }> = [];
  game.events.onAny((type, payload) => events.push({ type, payload }));
  const blockers: string[] = [];
  const interiors = {
    current: 'interior' in opts ? opts.interior! : ARENA.interiorId,
    setBlocker: vi.fn((id: string, closed: boolean) => blockers.push(`${id}:${closed}`)),
  };
  const holds: Array<{ x: number; z: number; speed: number } | null> = [];
  const verbs = {
    holdForcedMove: vi.fn((owner: string, move: { x: number; z: number; speed: number } | null) => {
      if (owner === WAVE_PUSH_OWNER) holds.push(move);
    }),
  };
  const unlocked = new Set<string>();
  const registered: string[] = [];
  const codex = {
    register: (entries: { id: string }[]) => {
      registered.push(...entries.map((e) => e.id));
      return () => {};
    },
    unlock: (id: string) => unlocked.add(id),
    has: (id: string) => unlocked.has(id),
    open: () => {},
  };
  const enemies = {
    spawnGroup: () => [],
    reset: () => {},
    alive: () => [],
    despawnGroup: () => {},
    view: () => undefined,
    blockTopLevel: () => opts.top,
    blockPreview: () => opts.preview,
  };
  const plugins = [
    corePlugin,
    fakeService('enemies', 'enemies', enemies),
    fakeService('interiors', 'interiors', interiors),
    fakeService('fake-verbs', 'combatVerbs', verbs),
    ...(opts.codex ? [fakeService('fake-codex', 'codex', codex)] : []),
    murkjawPlugin,
  ];
  await game.loadPlugins(modules(...plugins));
  const ctx = game.ctx;
  if (opts.flag !== false) ctx.state.setFlag(D05_STARTED_FLAG, true);
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
  const p = ctx.player.feet.clone();
  // The arena laid out so its `.player` anchor sits on the player's spawn; the floor 5 cm under the feet.
  const pl = DEEPS_LAYOUT.anchors.find((a) => a.id === 'greyfen.d05.arena.player')!;
  const shift = { x: p.x - pl.position.x, y: p.y - pl.position.y - 0.05, z: p.z - pl.position.z };
  const o = DEEPS_LAYOUT.origin;
  const local = (x: number, z: number) => ({ x: o.x + x + shift.x, y: p.y, z: o.z + z + shift.z });
  if (opts.anchors !== false)
    for (const a of DEEPS_LAYOUT.anchors.filter((x) => x.id.startsWith('greyfen.d05.arena.')))
      ctx.anchors.define({ id: a.id, position: { x: a.position.x + shift.x, y: a.position.y + shift.y, z: a.position.z + shift.z }, yaw: a.yaw });
  const of = <K extends keyof GameEventMap>(type: K): GameEventMap[K][] =>
    events.filter((e) => e.type === type).map((e) => e.payload as GameEventMap[K]);
  const enter = () => game.events.emit('trigger.enter', { triggerId: ARENA.trigger, actorId: ctx.player.actor.id });
  const exit = () => game.events.emit('trigger.exit', { triggerId: ARENA.trigger, actorId: ctx.player.actor.id });
  const boss = () => [...ctx.actors.all()].find((a) => a.kind === 'murkjaw') ?? null;
  const state = () => ctx.bosses.state(MURKJAW_BOSS_ID);
  const enc = () => murkjawDirector()!.current!;
  const healPlayer = () => {
    const pl2 = ctx.player.actor;
    pl2.health = pl2.maxHealth;
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
  const hit = (amount: number, poise = amount, extra: Record<string, unknown> = {}) =>
    ctx.damage.apply({ attackerId: ctx.player.actor.id, targetId: boss()!.id, amount, poise, kind: 'melee', ...extra });
  const startFight = () => {
    enter();
    run(secs(PRESENTATION.introSeconds) + 1);
  };
  /** Ticks until he is up and stays up for at least `need` seconds more (surfaced or beached). */
  const toUp = () => expect(until(() => ['surfaced', 'beached', 'broken'].includes(enc().brain.state) && enc().brain.state !== 'broken')).toBe(true);
  const toBeached = () => expect(until(() => enc().brain.state === 'beached', 90)).toBe(true);
  /** Takes a spear (the first rack with one) and throws it at him while he is up; ticks until it lands. */
  const spear = () => {
    toUp();
    const rack = [0, 1, 2, 3].find((i) => enc().racks.canTake(i))!;
    expect(enc().take(rack)).toBe(true);
    expect(enc().throwSpear()).toBe(true);
    runHealed(SPEARS.flightSeconds + 0.05);
  };
  const toFraction = (fraction: number, poise = 0) => {
    const s = state()!;
    return hit(s.health - s.maxHealth * fraction, poise);
  };
  /** One break by spears in the current phase. */
  const spearBreak = () => {
    const before = of('boss.break').length;
    for (let i = 0; i < 6 && of('boss.break').length === before; i++) spear();
    expect(of('boss.break').length).toBe(before + 1);
  };
  const teleport = (lx: number, lz: number) => {
    ctx.player.teleport(local(lx, lz));
    walk(2);
  };
  const teardown = () => {
    game.dispose();
    world.dispose();
  };
  return {
    game, ctx, events, of, run, walk, runHealed, until, enter, exit, boss, state, enc, hit, startFight, toUp, toBeached, spear,
    spearBreak, toFraction, teleport, local, interiors, blockers, holds, verbs, unlocked, registered, healPlayer, teardown, shift,
  };
}

type T = Awaited<ReturnType<typeof setup>>;
const items = (t: T) => (t.ctx.interaction as unknown as { items: Map<string, any> }).items;

describe('Murkjaw on the real core', () => {
  it('registers its strings and system, and removes them on dispose', async () => {
    const t = await setup();
    expect(t.ctx.strings.has('boss.murkjaw.name')).toBe(true);
    expect(t.game.systems.has('bosses.murkjaw')).toBe(true);
    murkjawPlugin.dispose?.();
    expect(t.game.systems.has('bosses.murkjaw')).toBe(false);
    t.teardown();
  }, T30);

  it('the contract: no mercy row, a zero window, kill XP about 600 (599) in the Greyfen, the outcome flag', () => {
    expect(BOSS_MERCY[MURKJAW_BOSS_ID]).toBeUndefined();
    expect(MURKJAW_BOSS_DEF.releaseWindowSeconds).toBe(0);
    expect(MURKJAW_BOSS_DEF.mercyVerb).toBeUndefined();
    expect(killXp(MURKJAW_BOSS_ID, 23, 23, 1.8)).toBe(599);
    expect(killXp(MURKJAW_BOSS_ID, 26, 26, 1.8)).toBe(599);
    expect(OUTCOME_FLAG).toBe('boss.murkjaw.outcome');
  });

  it('his level is the Greyfen top (23 or 26), else the preview + 5, else 23', () => {
    expect(murkjawLevel({ blockTopLevel: () => 23 })).toBe(23);
    expect(murkjawLevel({ blockTopLevel: () => 26 })).toBe(26);
    expect(murkjawLevel({ blockTopLevel: () => undefined, blockPreview: () => 19 })).toBe(24);
    expect(murkjawLevel({ blockTopLevel: () => NaN })).toBe(MURKJAW.fallbackLevel);
    expect(murkjawLevel({ blockTopLevel: () => { throw new Error('x'); } })).toBe(MURKJAW.fallbackLevel);
    expect(murkjawLevel(undefined)).toBe(MURKJAW.fallbackLevel);
  });

  it.each([
    [23, 1800],
    [26, 2070],
  ])('level %i from the block lock gives %i health', async (top, health) => {
    const t = await setup({ top });
    t.startFight();
    expect(t.boss()!.level).toBe(top);
    expect(t.boss()!.maxHealth).toBe(health);
    t.teardown();
  }, T30);

  it('arming: nothing without story.d05.started; setting it while in the trigger starts it', async () => {
    const t = await setup({ flag: false });
    t.enter();
    t.run(2);
    expect(t.boss()).toBeNull();
    t.ctx.state.setFlag(D05_STARTED_FLAG, true);
    t.run(1);
    expect(t.boss()).not.toBeNull();
    t.teardown();
  }, T30);

  it('anchors missing: no fight and one warning', async () => {
    const t = await setup({ anchors: false });
    t.enter();
    t.run(secs(1));
    t.exit();
    t.enter();
    t.run(2);
    expect(t.boss()).toBeNull();
    const warns = (console.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter((c) => String(c[0]).includes('anchors missing'));
    expect(warns).toHaveLength(1);
    t.teardown();
  }, T30);

  it('intro, then boss.started murkjaw with three phases of one break; hidden and untouchable under the water', async () => {
    const t = await setup();
    t.enter();
    t.run(secs(1));
    expect(t.of('boss.started')).toHaveLength(0);
    t.run(secs(PRESENTATION.introSeconds));
    expect(t.of('boss.started')).toEqual([{ bossId: MURKJAW_BOSS_ID, actorId: t.boss()!.id }]);
    const s = t.state()!;
    expect(s.phases).toBe(3);
    expect(s.breaksPerPhase).toBe(1);
    expect(t.enc().brain.state).toBe('submerged');
    expect(t.boss()!.hittable).toBe(false);
    expect(t.hit(50)).toBeNull();
    t.teardown();
  }, T30);

  it('every attack comes after a 1.0 s telegraph; the bite is yellow, the wave and lunge red', async () => {
    const t = await setup();
    t.startFight();
    const seen = new Set<string>();
    expect(t.until(() => {
      for (const tg of t.of('telegraph')) seen.add(`${tg.attackId}:${tg.kind}:${tg.leadSeconds}`);
      return seen.size >= 3;
    }, 120)).toBe(true);
    expect(seen).toEqual(new Set([`${BITE.attackId}:block:1`, `${WAVE.attackId}:dodge:1`, `${LUNGE.attackId}:dodge:1`]));
    t.teardown();
  }, T30);

  it('the lunge beaches him: a hit lands only on the beached jaw, and it takes x1.25 there', async () => {
    const t = await setup();
    t.startFight();
    t.toUp();
    // Up after a bite or a wave: no jaw bonus.
    const st = t.enc().brain.state;
    if (st === 'surfaced') {
      const r = t.hit(20, 0)!;
      expect(r.dealt).toBe(20);
    }
    t.toBeached();
    expect(t.enc().brain.jawOnWalkway).toBe(true);
    const r = t.hit(20, 10)!;
    expect(r.dealt).toBe(20 * MURKJAW.jawScale);
    expect(r.poiseDealt ?? 10 * MURKJAW.jawScale).toBeCloseTo(10 * MURKJAW.jawScale);
    // A status tick takes no jaw bonus.
    const tick = t.hit(8, 0, { kind: 'status' })!;
    expect(tick.dealt).toBe(8);
    t.teardown();
  }, T30);

  it('a break counts only while he is up; a stagger forced under the water is refused and his poise restored', async () => {
    const t = await setup();
    t.startFight();
    expect(t.until(() => t.enc().brain.state === 'submerged' && t.state()!.breaks === 0)).toBe(true);
    const b = t.boss()!;
    // A stagger that reaches him under the water (as a status tick could): forced hittable for the test.
    b.hittable = true;
    b.poise = 1;
    t.ctx.damage.stagger(b.id, t.ctx.player.actor.id, 10);
    expect(t.of('boss.break')).toHaveLength(0);
    expect(b.poise).toBe(b.maxPoise);
    t.teardown();
  }, T30);

  it('spears: one carried at a time, thrown only while he is up, three spears break him and beach him stunned', async () => {
    const t = await setup();
    t.startFight();
    expect(t.until(() => t.enc().brain.state === 'submerged')).toBe(true);
    expect(t.enc().take(0)).toBe(true);
    expect(t.enc().take(1)).toBe(false);
    expect(t.enc().throwSpear()).toBe(false);
    expect(t.enc().racks.carrying).toBe(true);
    t.toUp();
    expect(t.enc().throwSpear()).toBe(true);
    t.runHealed(SPEARS.flightSeconds + 0.05);
    expect(t.enc().lastSpearHit?.outcome).toBe('hit');
    t.spearBreak();
    expect(t.enc().brain.state).toBe('broken');
    expect(t.enc().brain.jawOnWalkway).toBe(true);
    t.teardown();
  }, T30);

  it('a spear that lands after he went under is fished back onto its rack', async () => {
    const t = await setup();
    t.startFight();
    // Thrown in the last moment of his slide back off a walkway: it lands while he sinks.
    expect(t.until(() => t.enc().brain.state === 'sliding', 90)).toBe(true);
    t.runHealed(CYCLE.slideSeconds - 0.15);
    expect(t.enc().brain.exposed).toBe(true);
    expect(t.enc().take(0)).toBe(true);
    expect(t.enc().racks.count(0)).toBe(SPEARS.perRack - 1);
    expect(t.enc().throwSpear()).toBe(true);
    t.runHealed(SPEARS.flightSeconds + 0.05);
    expect(t.enc().brain.exposed).toBe(false);
    expect(t.enc().spearsInFlight).toBe(0);
    expect(t.enc().lastSpearHit).toBeNull();
    expect(t.enc().racks.count(0)).toBe(SPEARS.perRack);
    t.teardown();
  }, T30);

  it('the rack and throw interactables exist only in the fight, with the right enabled states', async () => {
    const t = await setup();
    expect(items(t).get(rackId(1))).toBeUndefined();
    t.startFight();
    for (let n = 1; n <= 4; n++) expect(items(t).get(rackId(n))).toBeDefined();
    const thrower = items(t).get(SPEAR_THROW_ID);
    expect(thrower.radius).toBe(SPEARS.range);
    expect(items(t).get(rackId(1)).enabled()).toBe(true);
    expect(thrower.enabled()).toBe(false);
    items(t).get(rackId(1)).onInteract(t.ctx.player.actor);
    expect(items(t).get(rackId(2)).enabled()).toBe(false);
    t.toUp();
    expect(thrower.enabled()).toBe(true);
    // A carried spear goes back when the player leaves the hall.
    t.teleport(4, -56);
    expect(t.enc().racks.carrying).toBe(false);
    expect(t.enc().racks.count(0)).toBe(SPEARS.perRack);
    t.teardown();
  }, T30);

  it('every class finishes him with spears and beached blows alone: three breaks, the last, death, outcome defeated, no window', async () => {
    const t = await setup({ codex: true });
    t.startFight();
    // Phase 1: spears.
    t.spearBreak();
    t.runHealed(MURKJAW.breakSeconds + 1);
    t.toUp();
    t.toFraction(0.6);
    expect(t.state()!.phase).toBe(2);
    // Phase 2: blows on the beached jaw.
    const before = t.of('boss.break').length;
    for (let i = 0; i < 6 && t.of('boss.break').length === before; i++) {
      t.toBeached();
      t.hit(10, 40);
      t.hit(10, 40);
      t.runHealed(CYCLE.beachedSeconds);
    }
    expect(t.of('boss.break').length).toBe(before + 1);
    t.runHealed(MURKJAW.breakSeconds + 1);
    t.toUp();
    t.toFraction(0.3);
    expect(t.state()!.phase).toBe(3);
    t.spearBreak();
    const last = t.of('boss.break').at(-1)!;
    expect(last.last).toBe(true);
    t.hit(5000, 0);
    expect(t.of('boss.defeated')).toHaveLength(1);
    expect(t.ctx.state.getFlag(OUTCOME_FLAG)).toBe('defeated');
    expect(t.of('boss.releaseWindow')).toHaveLength(0);
    t.runHealed(PRESENTATION.deathSeconds + PRESENTATION.deathFadeSeconds + 0.2);
    expect(t.boss()).toBeNull();
    expect(t.unlocked.has(MURKJAW_CODEX_ID)).toBe(true);
    expect(t.registered).toContain(MURKJAW_CODEX_ID);
    expect(murkjawDirector()!.gateIsClosed).toBe(false);
    t.teardown();
  }, T30);

  it('the floor: each phase holds until its break, and before the last break he never drops below 8%', async () => {
    const t = await setup();
    t.startFight();
    t.toUp();
    // Phase 1, no break yet: a burst cannot even reach phase 2 (review S1).
    t.hit(99_999, 0);
    let s = t.state()!;
    expect(s.phase).toBe(1);
    expect(s.health).toBeGreaterThan(s.maxHealth * MURKJAW.phases[0]);
    // After the phase 1 break, a burst reaches phase 2 and holds above phase 3.
    t.spearBreak();
    t.hit(99_999, 0);
    s = t.state()!;
    expect(s.phase).toBe(2);
    expect(s.health).toBeGreaterThan(s.maxHealth * MURKJAW.phases[1]);
    // After the phase 2 break, phase 3 and the 8% floor until the last break.
    t.runHealed(MURKJAW.breakSeconds + 1);
    t.spearBreak();
    t.hit(99_999, 0);
    s = t.state()!;
    expect(s.phase).toBe(3);
    expect(s.health).toBeGreaterThanOrEqual(Math.ceil(s.maxHealth * MURKJAW.healthFloor));
    expect(t.of('boss.defeated')).toHaveLength(0);
    t.teardown();
  }, T30);

  it('the wave hits a player on its beach and pushes them away along the walkway, stopping at the edge', async () => {
    const t = await setup();
    t.startFight();
    expect(t.until(() => t.enc().brain.attack === 'wave' && t.enc().brain.state === 'bulge', 90)).toBe(true);
    // Stand on the wave's own beach: inside the ring, on walkway, with the hall wall or a channel behind.
    const b = t.ctx.anchors.find(ARENA.beaches[t.enc().brain.point])!.position;
    t.ctx.player.teleport({ x: b.x, y: t.ctx.player.feet.y, z: b.z });
    t.walk(2);
    const holdsBefore = t.holds.length;
    t.runHealed(CYCLE.bulgeSeconds + CYCLE.waveSeconds + WAVE.pushSeconds + 0.2);
    const waves = t.of('damage.dealt').filter((d) => d.attackId === WAVE.attackId);
    expect(waves).toHaveLength(1);
    expect(waves[0].outcome).toBe('hit');
    const holds = t.holds.slice(holdsBefore);
    expect(holds.filter((h) => h !== null).length).toBeGreaterThan(0);
    // Released at the end (or at the edge), and still on a walkway: never shoved into a channel.
    expect(holds.at(-1)).toBeNull();
    for (const h of holds) if (h) expect(h.speed).toBeLessThanOrEqual(WAVE.pushSpeed + 1e-6);
    const c = t.ctx.anchors.find(ARENA.centre)!.position;
    const f = t.ctx.player.feet;
    expect(new ArenaFrame(c).walkable(f.x, f.z, true)).toBe(true);
    t.teardown();
  }, T30);

  it('a dodging player (i-frames) takes the wave as immune and gets no push', async () => {
    const t = await setup();
    t.startFight();
    expect(t.until(() => t.enc().brain.attack === 'wave' && t.enc().brain.state === 'bulge', 90)).toBe(true);
    // Stand right by the wave's spot.
    const p = t.enc().brain.point;
    const s = t.ctx.anchors.find(ARENA.beaches[p])!.position;
    t.ctx.player.teleport({ x: s.x, y: t.ctx.player.feet.y, z: s.z });
    t.walk(2);
    t.ctx.player.actor.invulnerable = true;
    const before = t.holds.length;
    t.runHealed(CYCLE.bulgeSeconds + CYCLE.waveSeconds);
    const waves = t.of('damage.dealt').filter((d) => d.attackId === WAVE.attackId);
    expect(waves).toHaveLength(1);
    expect(waves[0].outcome).toBe('immune');
    expect(t.holds.length).toBe(before);
    t.teardown();
  }, T30);

  it('phase 2 crumbles the crossing; it waits while the player stands on it and drops once they step off', async () => {
    const t = await setup();
    t.startFight();
    t.spearBreak();
    t.toFraction(0.6);
    expect(t.state()!.phase).toBe(2);
    expect(t.enc().drop).toBe('crumbling');
    t.teleport(-17, -56);
    t.runHealed(3);
    expect(t.enc().drop).toBe('crumbling');
    expect(t.blockers).not.toContain(`${ARENA.drop}:false`);
    t.teleport(-28, -56);
    t.runHealed(0.2);
    expect(t.enc().drop).toBe('dropped');
    expect(t.blockers).toContain(`${ARENA.drop}:false`);
    t.teardown();
  }, T30);

  it('player death resets: the crossing stands again, one boss.ended, the gate opens; the retry is at full health', async () => {
    const t = await setup();
    t.startFight();
    t.spearBreak();
    t.toFraction(0.6);
    t.teleport(-28, -56);
    t.runHealed(3);
    expect(t.enc().drop).toBe('dropped');
    t.ctx.damage.kill(t.ctx.player.actor.id, null);
    t.run(2);
    expect(t.blockers.at(-1)?.startsWith(`${ARENA.gate}:false`) || t.blockers.includes(`${ARENA.drop}:true`)).toBe(true);
    expect(t.blockers).toContain(`${ARENA.drop}:true`);
    expect(t.of('boss.ended')).toHaveLength(1);
    expect(t.boss()).toBeNull();
    expect(t.blockers.filter((b) => b.startsWith(`${ARENA.gate}:`)).at(-1)).toBe(`${ARENA.gate}:false`);
    expect(murkjawDirector()!.gateIsClosed).toBe(false);
    // The retry: revived at the door, he comes back at full health in phase 1.
    t.ctx.damage.revive(t.ctx.player.actor.id, 1, 'script');
    t.ctx.player.teleport(t.ctx.anchors.find('greyfen.d05.arena.player')!.position);
    t.walk(2);
    t.enter();
    t.run(secs(PRESENTATION.introSeconds) + 2);
    expect(t.state()!.health).toBe(t.state()!.maxHealth);
    expect(t.state()!.phase).toBe(1);
    expect(t.enc().drop).toBe('standing');
    t.teardown();
  }, T30);

  it('the gate closes once the player is past the clearance and opens on a reset', async () => {
    const t = await setup();
    t.startFight();
    t.runHealed(0.5);
    expect(murkjawDirector()!.gateIsClosed).toBe(true);
    expect(t.blockers).toContain(`${ARENA.gate}:true`);
    t.enc().reset();
    t.run(1);
    expect(t.blockers.at(-1)).toBe(`${ARENA.gate}:false`);
    t.teardown();
  }, T30);

  it('a load inside the hall puts the player at the door; save.loaded re-derives the crossing and the gate', async () => {
    const t = await setup();
    t.startFight();
    t.game.events.emit('save.loaded', { slot: 'test' } as never);
    t.walk(2);
    expect(t.boss()).toBeNull();
    const door = t.ctx.anchors.find(ARENA.door)!.position;
    expect(Math.hypot(t.ctx.player.feet.x - door.x, t.ctx.player.feet.z - door.z)).toBeLessThan(0.5);
    expect(t.blockers).toContain(`${ARENA.drop}:true`);
    expect(t.blockers).toContain(`${ARENA.gate}:false`);
    t.teardown();
  }, T30);

  it('an outcome flag set from outside ends the fight; a set flag never spawns him', async () => {
    const t = await setup();
    t.startFight();
    t.ctx.state.setFlag(OUTCOME_FLAG, 'defeated');
    t.run(2);
    expect(t.boss()).toBeNull();
    t.exit();
    t.enter();
    t.run(secs(PRESENTATION.introSeconds) + 2);
    expect(t.boss()).toBeNull();
    t.teardown();
  }, T30);

  it('with the procedural model: hurtboxes registered, he rises from the water and a reset removes him', async () => {
    const t = await setup({ model: true });
    t.startFight();
    const root = t.enc().view!.root;
    expect(root.parent).not.toBeNull();
    expect(root.visible).toBe(false);
    t.toUp();
    t.runHealed(0.3);
    expect(root.visible).toBe(true);
    t.enc().reset();
    expect(root.parent).toBeNull();
    t.teardown();
  }, T30);

  it('gateIsClear and gateVeil sit on K3 gate rect', async () => {
    const t = await setup();
    const g = gateVeil(t.ctx)!;
    const gate = DEEPS_DEF.blockers!.find((b) => b.id === ARENA.gate)!.rect;
    expect(g.at.x).toBeCloseTo(t.local((gate.x0 + gate.x1) / 2, 0).x);
    expect(g.yaw).toBeCloseTo(Math.PI / 2);
    expect(gateIsClear(t.ctx, t.local(gate.x0 - GATE_MARGIN - 0.1, -68))).toBe(true);
    expect(gateIsClear(t.ctx, t.local(gate.x0 - GATE_MARGIN + 0.3, -68))).toBe(false);
    t.teardown();
  }, T30);

  it('leaving the Deeps by the far exit ends the fight like a death: one boss.ended, the gate open, the crossing raised', async () => {
    const t = await setup();
    t.startFight();
    t.spearBreak();
    t.toFraction(0.6);
    t.teleport(-28, -60);
    t.runHealed(DROP.crumbleSeconds + 0.5);
    expect(t.enc().drop).toBe('dropped');
    expect(murkjawDirector()!.gateIsClosed).toBe(true);
    t.game.events.emit('interior.exited', { interiorId: ARENA.interiorId, doorId: 'greyfen-deeps.exit' } as never);
    t.run(2);
    expect(t.boss()).toBeNull();
    expect(t.of('boss.ended')).toHaveLength(1);
    expect(murkjawDirector()!.gateIsClosed).toBe(false);
    expect(t.blockers.at(-1)).toBe(`${ARENA.gate}:false`);
    expect(t.blockers).toContain(`${ARENA.drop}:true`);
    // Another interior's exit is ignored.
    t.enter();
    t.run(secs(PRESENTATION.introSeconds) + 2);
    expect(t.boss()).not.toBeNull();
    t.game.events.emit('interior.exited', { interiorId: 'some-other-house', doorId: 'x' } as never);
    t.run(2);
    expect(t.boss()).not.toBeNull();
    t.teardown();
  }, T30);

  it('out of the hall for 2 s by any other way ends the fight; a shorter step out does not', async () => {
    const t = await setup();
    t.startFight();
    t.runHealed(0.5);
    const back = t.ctx.anchors.find('greyfen.d05.arena.player')!.position;
    t.teleport(4, -56);
    t.runHealed(1);
    t.ctx.player.teleport(back);
    t.walk(2);
    t.runHealed(1.5);
    expect(t.boss()).not.toBeNull();
    t.teleport(4, -56);
    t.runHealed(1.5);
    expect(t.boss()).not.toBeNull();
    t.runHealed(0.7);
    expect(t.boss()).toBeNull();
    expect(t.of('boss.ended')).toHaveLength(1);
    expect(murkjawDirector()!.gateIsClosed).toBe(false);
    t.teardown();
  }, T30);

  it('the crossing waits while the player is over a channel or in the air, and drops once they stand on walkway', async () => {
    const t = await setup();
    t.startFight();
    t.spearBreak();
    t.toFraction(0.6);
    expect(t.enc().drop).toBe('crumbling');
    // Over the east channel, clear of the crossing (K7 would push them back; until then the drop waits).
    const f0 = t.local(-17, -61);
    t.ctx.player.teleport(f0);
    for (let i = 0; i < secs(3); i++) {
      t.ctx.player.teleport(f0);
      t.game.fixedUpdate();
      t.healPlayer();
    }
    expect(t.enc().drop).toBe('crumbling');
    // In the air above the centre walkway.
    const air = t.local(-28, -60);
    air.y += 3;
    for (let i = 0; i < secs(0.5); i++) {
      t.ctx.player.teleport(air);
      t.game.fixedUpdate();
      t.healPlayer();
    }
    expect(t.enc().drop).toBe('crumbling');
    // Standing on walkway.
    t.teleport(-28, -60);
    t.runHealed(0.2);
    expect(t.enc().drop).toBe('dropped');
    t.teardown();
  }, T30);

  it('a break with the player on the east ring flings his jaw to them, not to the island beach', async () => {
    const t = await setup();
    t.startFight();
    t.teleport(-10, -56);
    t.spearBreak();
    expect(t.enc().brain.state).toBe('broken');
    const jaw = t.enc().jawAt!;
    const f = t.ctx.player.feet;
    expect(Math.hypot(jaw.x - f.x, jaw.z - f.z)).toBeLessThan(4);
    // Off the walkway again once the break ends.
    t.runHealed(MURKJAW.breakSeconds + CYCLE.slideSeconds + 0.1);
    expect(t.enc().jawAt).toBeNull();
    t.teardown();
  }, T30);

  it('a spear carried into a wading pool on the island stays carried', async () => {
    const t = await setup();
    t.startFight();
    expect(t.enc().take(0)).toBe(true);
    // The pool's basin (below the trigger floor in K3's layout), still inside the hall.
    t.teleport(-31, -59);
    t.game.events.emit('trigger.exit', { triggerId: ARENA.trigger, actorId: t.ctx.player.actor.id });
    t.runHealed(0.5);
    expect(t.enc().racks.carrying).toBe(true);
    t.teardown();
  }, T30);

  // Class modifiers (the classes' own, as the class plugins register them) must not touch the spear: it is a `script` hit.
  it.each([
    ['knight', (r: any) => r.kind === 'melee' && ((r.amount *= 1.1), (r.poise *= 1.1))],
    ['ashblade', (r: any) => r.kind === 'melee' && ((r.amount *= 1.25), (r.poise *= 0.6))],
    ['warden', (r: any) => r.kind === 'melee' && ((r.amount *= 0.4), (r.poise *= 0.4))],
    ['pathfinder', (r: any) => r.kind === 'ranged' && ((r.amount *= 1.4), (r.poise *= 0.5))],
    ['emberwright', (r: any) => (r.kind === 'spell' || r.kind === 'melee') && ((r.amount *= 0.5), (r.poise *= 0.3))],
  ])('%s: the spear keeps its full poise, and three spears per phase break him through all three phases', async (_cls, mod) => {
    const t = await setup();
    t.ctx.damage.addModifier('test.class', mod as never, 10);
    t.startFight();
    expect(t.until(() => t.enc().brain.state === 'surfaced', 90)).toBe(true);
    expect(t.enc().take([0, 1, 2, 3].find((i) => t.enc().racks.canTake(i))!)).toBe(true);
    expect(t.enc().throwSpear()).toBe(true);
    t.runHealed(SPEARS.flightSeconds + 0.05);
    expect(t.enc().lastSpearHit?.poiseDealt).toBeCloseTo(SPEARS.poise);
    expect(t.enc().lastSpearHit?.dealt).toBeCloseTo(SPEARS.damage);
    // Three breaks by spears only.
    t.spearBreak();
    t.runHealed(MURKJAW.breakSeconds + 1);
    // The health between breaks by any hit (a script hit here, so the class's own scale does not matter).
    const toFraction = (f: number) => t.hit(t.state()!.health - t.state()!.maxHealth * f, 0, { kind: 'script' });
    t.toUp();
    toFraction(0.6);
    expect(t.state()!.phase).toBe(2);
    t.spearBreak();
    t.runHealed(MURKJAW.breakSeconds + 1);
    t.toUp();
    toFraction(0.3);
    expect(t.state()!.phase).toBe(3);
    t.spearBreak();
    expect(t.of('boss.break').at(-1)!.last).toBe(true);
    expect(t.of('boss.break')).toHaveLength(3);
    t.teardown();
  }, T30);
});
