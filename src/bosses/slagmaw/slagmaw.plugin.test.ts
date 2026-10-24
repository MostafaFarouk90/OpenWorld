import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import corePlugin from "../../core/core.plugin";
import type { GameEventMap } from "../../core/events";
import { Game } from "../../core/Game";
import { MoveModifiers } from "../../core/MoveModifiers";
import type { GamePlugin, PluginModule } from "../../core/plugins";
import { BOSS_MERCY } from "../../enemies/tuning";
import { InputManager } from "../../input/InputManager";
import { PhysicsWorld } from "../../physics/PhysicsWorld";
import { killXp } from "../../progression/tuning";
import { TerrainColliders } from "../../world/TerrainColliders";
import { World } from "../../world/World";
import { layoutInterior } from "../../interiors/layout";
import {
  DEEPDELVE_ARENA,
  DEEPDELVE_ARENA_TRIGGER,
  DEEPDELVE_DEF,
} from "../../oldsmoke/mines/deepdelve";
import { heightAt } from "../../terrain/heightfield";
import {
  GATE_MARGIN,
  gateIsClear,
  gateVeil,
  OUTCOME_FLAG,
} from "./SlagmawDirector";
import { SLAGMAW_BOSS_DEF, SLAGMAW_WINDOW_SECONDS } from "./SlagmawEncounter";
import slagmawPlugin, { slagmawDirector } from "./slagmaw.plugin";
import {
  ARENA,
  COOLING,
  CYCLE,
  D04_STARTED_FLAG,
  ERUPTION,
  PRESENTATION,
  SLAGMAW,
  SLAGMAW_BOSS_ID,
  SPIT_MOVE,
} from "./tuning";

let physics: PhysicsWorld;

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const modules = (...plugins: GamePlugin[]): Record<string, PluginModule> =>
  Object.fromEntries(
    plugins.map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }]),
  );

const TICK = 1 / 60;
const secs = (s: number) => Math.round(s / TICK);

function fakeEnemies() {
  const plugin: GamePlugin = {
    id: "enemies",
    dependsOn: ["core"],
    setup(c) {
      c.services.provide("enemies", {
        spawnGroup: () => [],
        reset: () => {},
        alive: () => [],
        despawnGroup: () => {},
        view: () => undefined,
      } as never);
    },
  };
  return { plugin };
}

function fakeInteriors(current: string | null) {
  const log: string[] = [];
  const service = {
    current,
    setBlocker: vi.fn((id: string, closed: boolean) =>
      log.push(`blocker:${id}:${closed}`),
    ),
  };
  const plugin: GamePlugin = {
    id: "interiors",
    dependsOn: ["core"],
    setup(c) {
      (c.services.provide as (n: string, v: unknown) => void)(
        "interiors",
        service,
      );
    },
  };
  return { plugin, service, log };
}

function fakeVfx() {
  const shakes: Array<[number, number]> = [];
  const plugin: GamePlugin = {
    id: "fake-vfx",
    dependsOn: ["core"],
    setup(c) {
      (c.services.provide as (n: string, v: unknown) => void)("vfx", {
        shake: (a: number, s: number) => shakes.push([a, s]),
      });
    },
  };
  return { plugin, shakes };
}

type Opts = {
  flag?: boolean;
  model?: boolean;
  interior?: string | null;
  /** false: none; "deepdelve": A4's real layout, translated so the arena centre sits on the player's spawn. */
  anchors?: boolean | "deepdelve";
};

/** A4's Deepdelve laid out the way the interiors plugin does it (translation only), for the real anchors and trigger. */
const DEEPDELVE_LAYOUT = layoutInterior(DEEPDELVE_DEF, heightAt);

async function setup(opts: Opts = {}) {
  const scene = new THREE.Scene();
  const moveModifiers = new MoveModifiers();
  const world = new World(scene, physics, {
    colliders: new TerrainColliders(physics, { patchSize: 50, cells: 16 }),
    moveModifier: () => moveModifiers.state(),
  });
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), {
    pointerLockElement: null as Element | null,
  });
  const element = Object.assign(new EventTarget(), {
    requestPointerLock: () => {},
  }) as unknown as HTMLElement;
  const input = new InputManager(element, win, doc, { storage: null });
  // The model is procedural: any asset loader at all means "build it"; none means headless.
  const assets = opts.model
    ? {
        load: () => Promise.resolve(),
        instantiate: () => new THREE.Group(),
        animations: () => [],
      }
    : null;
  const game = new Game({
    scene,
    physics,
    world,
    input,
    moveModifiers,
    assets: assets as never,
    cameraRig: null as never,
    report: () => {},
  });
  const events: Array<{ type: keyof GameEventMap; payload: any }> = [];
  game.events.onAny((type, payload) => events.push({ type, payload }));
  const enemies = fakeEnemies();
  const interiors = fakeInteriors(
    "interior" in opts ? opts.interior! : ARENA.interiorId,
  );
  const vfx = fakeVfx();
  await game.loadPlugins(
    modules(
      corePlugin,
      enemies.plugin,
      interiors.plugin,
      vfx.plugin,
      slagmawPlugin,
    ),
  );
  const ctx = game.ctx;
  if (opts.flag !== false) ctx.state.setFlag(D04_STARTED_FLAG, true);
  await new Promise((r) => setTimeout(r, 0));
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  /** Ticks and renders, so the player's root follows their feet and the real trigger volumes see them. */
  const walk = (n: number) => {
    for (let i = 0; i < n; i++) {
      game.fixedUpdate();
      game.render(1, TICK);
    }
  };
  run(2);
  const p = ctx.player.feet.clone();
  // Deepdelve's arena runs east: door 7 m behind the player (-X, so they stand 1.2 m clear of the gate rect), centre 9 m ahead
  // (+X), the three valves a few metres around the player.
  const at = (dx: number, dz: number) => ({ x: p.x + dx, y: p.y, z: p.z + dz });
  /** Deepdelve-local metres to world, for the "deepdelve" anchors (identity offset otherwise unused). */
  let local = (x: number, z: number) => ({ x, y: p.y, z });
  if (opts.anchors === "deepdelve") {
    const c = DEEPDELVE_LAYOUT.anchors.find((a) => a.id === ARENA.centre)!;
    const o = DEEPDELVE_LAYOUT.origin;
    // The layout's floor 5 cm under the feet (the player rests on the floor; A4's trigger bottom is flush with it).
    const shift = { x: p.x - c.position.x, y: p.y - c.position.y - 0.05, z: p.z - c.position.z };
    local = (x, z) => ({ x: o.x + x + shift.x, y: p.y, z: o.z + z + shift.z });
    const ids = [ARENA.arenaDoor, ARENA.centre, ARENA.gate, ...ARENA.valves];
    for (const a of DEEPDELVE_LAYOUT.anchors.filter((x) => ids.includes(x.id)))
      ctx.anchors.define({
        id: a.id,
        position: { x: a.position.x + shift.x, y: a.position.y + shift.y, z: a.position.z + shift.z },
        yaw: a.yaw,
      });
    // Start at the door, outside the trigger, before the trigger exists.
    ctx.player.teleport(local(145, -20), -Math.PI / 2);
    walk(2);
    const trg = DEEPDELVE_LAYOUT.triggers.find((x) => x.id === ARENA.arenaTrigger)!;
    ctx.triggers.add({
      id: trg.id,
      shape: {
        type: "box",
        center: { x: trg.center.x + shift.x, y: trg.center.y + shift.y, z: trg.center.z + shift.z },
        half: trg.half,
      },
    });
  } else if (opts.anchors !== false) {
    ctx.anchors.define({ id: ARENA.arenaDoor, position: at(-7, 0), yaw: -Math.PI / 2 });
    ctx.anchors.define({ id: ARENA.centre, position: at(9, 0), yaw: -Math.PI / 2 });
    ctx.anchors.define({ id: ARENA.valves[0], position: at(3, 0), yaw: 0 });
    ctx.anchors.define({ id: ARENA.valves[1], position: at(-3, 0), yaw: 0 });
    ctx.anchors.define({ id: ARENA.valves[2], position: at(0, 3), yaw: 0 });
  }
  const of = <K extends keyof GameEventMap>(type: K): GameEventMap[K][] =>
    events
      .filter((e) => e.type === type)
      .map((e) => e.payload as GameEventMap[K]);
  const enter = () =>
    game.events.emit("trigger.enter", {
      triggerId: ARENA.arenaTrigger,
      actorId: ctx.player.actor.id,
    });
  const exit = () =>
    game.events.emit("trigger.exit", {
      triggerId: ARENA.arenaTrigger,
      actorId: ctx.player.actor.id,
    });
  const boss = () =>
    [...ctx.actors.all()].find((a) => a.kind === "the-slagmaw") ?? null;
  const state = () => ctx.bosses.state(SLAGMAW_BOSS_ID);
  const enc = () => slagmawDirector()!.current!;
  const hit = (
    amount: number,
    poise = amount,
    extra: Record<string, unknown> = {},
  ) =>
    ctx.damage.apply({
      attackerId: ctx.player.actor.id,
      targetId: boss()!.id,
      amount,
      poise,
      kind: "melee",
      ...extra,
    });
  const breakPoise = () => hit(1, SLAGMAW.maxPoise);
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
  /** Ticks (healing the player) until `cond`, at most `max` seconds; returns whether it held. */
  const until = (cond: () => boolean, max = 30) => {
    for (let i = 0; i < secs(max); i++) {
      if (cond()) return true;
      game.fixedUpdate();
      healPlayer();
    }
    return cond();
  };
  const startFight = () => {
    enter();
    run(secs(PRESENTATION.introSeconds) + 1);
  };
  const toSurfaced = () => {
    expect(until(() => enc().brain.state === "surfaced")).toBe(true);
  };
  const toBurrowed = () => {
    expect(until(() => enc().brain.state === "burrowed")).toBe(true);
  };
  const settle = () => runHealed(SLAGMAW.breakSeconds + 0.3);
  const valve = (n: number) => (
    world as unknown as never,
    (ctx.interaction as unknown as { items: Map<string, any> }).items.get(
      `valve:slagmaw-${n}`,
    )
  );
  const turn = (n: number) => {
    const v = valve(n);
    expect(v).toBeDefined();
    expect(v.enabled()).toBe(true);
    v.onInteract(ctx.player.actor);
  };
  const toFraction = (fraction: number, poise = 0) => {
    const s = state()!;
    return hit(s.health - s.maxHealth * fraction, poise);
  };
  /** One cooled break in the current phase: surfaced, turn the valve, break poise. */
  const coolAndBreak = (n: number) => {
    toSurfaced();
    turn(n);
    expect(enc().crustCooled).toBe(true);
    const r = breakPoise();
    expect(r?.outcome).toBe("hit");
  };
  const teardown = () => {
    game.dispose();
    world.dispose();
  };
  return {
    game,
    ctx,
    world,
    events,
    of,
    run,
    runHealed,
    until,
    enter,
    exit,
    boss,
    state,
    enc,
    hit,
    breakPoise,
    healPlayer,
    startFight,
    toSurfaced,
    toBurrowed,
    settle,
    valve,
    turn,
    toFraction,
    coolAndBreak,
    interiors,
    vfx,
    moveModifiers,
    teardown,
    at,
    local,
    walk,
  };
}

type T = Awaited<ReturnType<typeof setup>>;

const eruptionHits = (t: T) =>
  t.of("damage.dealt").filter((d) => d.attackId === ERUPTION.attackId);

describe("The Slagmaw on the real core", () => {
  it("registers its strings and system, and removes them on dispose", async () => {
    const t = await setup();
    expect(t.ctx.strings.has("boss.the-slagmaw.name")).toBe(true);
    expect(t.game.systems.has("bosses.slagmaw")).toBe(true);
    t.teardown();
    expect(t.game.systems.has("bosses.slagmaw")).toBe(false);
  });

  it("the contract the registry and A12 read: no mercy row, no release window (0), kill XP 380, name key and outcome flag", () => {
    expect(BOSS_MERCY[SLAGMAW_BOSS_ID]).toBeUndefined();
    expect(SLAGMAW_BOSS_DEF.mercyVerb).toBeUndefined();
    expect(SLAGMAW_BOSS_DEF.releaseWindowSeconds).toBe(SLAGMAW_WINDOW_SECONDS);
    expect(SLAGMAW_WINDOW_SECONDS).toBe(0);
    expect(SLAGMAW_BOSS_DEF.releaseWindowSeconds).toBe(0);
    expect(killXp(SLAGMAW_BOSS_ID, 15, 15)).toBe(380);
    expect(OUTCOME_FLAG).toBe("boss.the-slagmaw.outcome");
  });

  it("arming: no fight without story.d04.started; setting it while standing in the trigger starts it; after leaving it does not", async () => {
    const t = await setup({ flag: false });
    t.enter();
    t.run(2);
    expect(t.boss()).toBeNull();
    t.ctx.state.setFlag(D04_STARTED_FLAG, true);
    t.run(1);
    expect(t.boss()).not.toBeNull();
    t.teardown();

    const u = await setup({ flag: false });
    u.enter();
    u.exit();
    u.ctx.state.setFlag(D04_STARTED_FLAG, true);
    u.run(2);
    expect(u.boss()).toBeNull();
    u.teardown();
  });

  it("A4 anchors missing: the fight does not start and warns once", async () => {
    const t = await setup({ anchors: false });
    t.enter();
    t.run(secs(1));
    t.exit();
    t.enter();
    t.run(2);
    expect(t.boss()).toBeNull();
    const warns = (
      console.warn as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls.filter((c) => String(c[0]).includes("anchors missing"));
    expect(warns).toHaveLength(1);
    t.teardown();
  });

  it("valves that cannot mount: one warning per attempt (not per retry), no leaked valves, a fresh trigger enter tries again", async () => {
    const t = await setup();
    const items = (
      t.ctx.interaction as unknown as { items: Map<string, unknown> }
    ).items;
    t.ctx.interaction.register({
      id: "valve:slagmaw-1",
      kind: "use",
      position: (out: THREE.Vector3) => out,
    } as never);
    const warns = () =>
      (console.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter(
        (c) => String(c[0]).includes("coolant valves"),
      );
    t.enter();
    t.run(secs(PRESENTATION.introSeconds) + 1);
    // Several retry intervals while the player stays in the trigger.
    t.run(secs(PRESENTATION.retrySeconds * 4 + PRESENTATION.introSeconds));
    expect(warns()).toHaveLength(1);
    expect(t.boss()).toBeNull();
    expect(t.ctx.bosses.active()).toEqual([]);
    expect(items.has("valve:slagmaw-2")).toBe(false);
    expect(items.has("valve:slagmaw-3")).toBe(false);
    // Leaving and re-entering is a new attempt (and warns once more).
    t.exit();
    t.enter();
    t.run(secs(PRESENTATION.introSeconds) + 1);
    t.run(secs(PRESENTATION.retrySeconds * 4 + PRESENTATION.introSeconds));
    expect(warns()).toHaveLength(2);
    t.teardown();
  });

  it("intro freezes the player; he registers after it as three phases of one break, hidden under the floor and untouchable", async () => {
    const t = await setup();
    t.enter();
    expect(t.boss()).not.toBeNull();
    expect(t.boss()!.hittable).toBe(false);
    expect(t.moveModifiers.state().freeze).toBe(true);
    t.run(secs(PRESENTATION.introSeconds) - 2);
    expect(t.of("boss.started")).toEqual([]);
    t.run(3);
    expect(t.of("boss.started")).toEqual([
      { bossId: SLAGMAW_BOSS_ID, actorId: t.boss()!.id },
    ]);
    expect(t.moveModifiers.state().freeze).toBeFalsy();
    expect(t.state()).toMatchObject({
      phases: 3,
      breaksPerPhase: 1,
      phase: 1,
      thresholds: [0.66, 0.33],
      maxHealth: SLAGMAW.maxHealth,
    });
    // Burrowed: no hit lands, nothing to lock onto.
    expect(t.enc().brain.state).toBe("burrowed");
    expect(t.boss()!.hittable).toBe(false);
    expect(t.boss()!.untargetable).toBe(true);
    expect(t.hit(50, 50)).toBeNull();
    expect(t.boss()!.health).toBe(SLAGMAW.maxHealth);
    t.teardown();
  });

  it("an outcome flag already set: he never spawns", async () => {
    const t = await setup();
    t.ctx.state.setFlag(OUTCOME_FLAG, "defeated");
    t.run(1);
    t.enter();
    t.run(2);
    expect(t.boss()).toBeNull();
    t.teardown();
  });

  it("the tremor telegraphs a full 1.2 s before any eruption damage, the shake rides it, and the damage lands once at the spot", async () => {
    const t = await setup();
    t.startFight();
    let teleAt = -1;
    let hitAt = -1;
    let i = 0;
    for (; i < secs(20) && hitAt < 0; i++) {
      t.game.fixedUpdate();
      t.healPlayer();
      if (
        teleAt < 0 &&
        t.of("telegraph").some((e) => e.attackId === ERUPTION.attackId)
      )
        teleAt = i;
      if (hitAt < 0 && eruptionHits(t).length > 0) hitAt = i;
    }
    expect(teleAt).toBeGreaterThanOrEqual(0);
    expect(hitAt - teleAt).toBeGreaterThanOrEqual(
      secs(CYCLE.tremorSeconds) - 1,
    );
    const tele = t
      .of("telegraph")
      .find((e) => e.attackId === ERUPTION.attackId)!;
    expect(tele).toMatchObject({
      kind: "dodge",
      leadSeconds: CYCLE.tremorSeconds,
      actorId: t.boss()!.id,
    });
    expect(t.vfx.shakes[0]).toEqual([CYCLE.shakeMetres, CYCLE.tremorSeconds]);
    const hits = eruptionHits(t);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ outcome: "hit", attackerId: t.boss()!.id });
    t.teardown();
  });

  it("the eruption is dodge only: unblockable and never parried; i-frames take nothing; a player who leaves the locked spot is missed", async () => {
    const t = await setup();
    t.startFight();
    const flags: Array<[unknown, unknown]> = [];
    t.ctx.damage.addModifier(
      "test.watch",
      (req, target) => {
        if (
          target.id === t.ctx.player.actor.id &&
          req.attackId === ERUPTION.attackId
        )
          flags.push([req.unblockable, req.parryable]);
      },
      -50,
    );
    t.ctx.player.actor.invulnerable = true;
    expect(t.until(() => eruptionHits(t).length > 0)).toBe(true);
    expect(eruptionHits(t)[0].outcome).toBe("immune");
    expect(flags).toEqual([[true, false]]);
    t.ctx.player.actor.invulnerable = false;
    t.teardown();

    // Walking away once the spot has locked: the burst lands on empty floor.
    const u = await setup();
    u.startFight();
    expect(u.until(() => u.of("telegraph").length > 0)).toBe(true);
    u.runHealed(CYCLE.tremorSeconds - CYCLE.aimLockBefore + 0.1);
    const p = u.ctx.player.feet;
    u.ctx.player.teleport(
      { x: p.x + CYCLE.eruptionRadius + 2, y: p.y, z: p.z },
      0,
    );
    u.until(() => u.enc().brain.state === "surfaced", 3);
    expect(eruptionHits(u)).toEqual([]);
    u.teardown();
  });

  it("the eruption spot is clamped inside the arena", async () => {
    const t = await setup();
    t.startFight();
    expect(t.until(() => t.of("telegraph").length > 0)).toBe(true);
    const c = t.ctx.anchors.find(ARENA.centre)!.position;
    t.ctx.player.teleport({ x: c.x + 50, y: c.y, z: c.z }, 0);
    t.runHealed(CYCLE.tremorSeconds - CYCLE.aimLockBefore + 0.1);
    const spot = t.enc().eruptionSpot(new THREE.Vector3());
    expect(spot.x - c.x).toBeLessThanOrEqual(ARENA.arenaHalfExtent + 1e-6);
    t.teardown();
  });

  it("he is hittable only above ground: untouchable while burrowed and in the tremor, hittable surfaced, hidden again after", async () => {
    const t = await setup();
    t.startFight();
    expect(t.enc().emergence).toBe(0);
    expect(t.hit(10, 10)).toBeNull();
    expect(t.until(() => t.enc().brain.state === "tremor")).toBe(true);
    expect(t.boss()!.hittable).toBe(false);
    t.toSurfaced();
    expect(t.boss()!.hittable).toBe(true);
    expect(t.boss()!.untargetable).toBe(false);
    t.runHealed(0.5);
    expect(t.enc().emergence).toBe(1);
    expect(t.hit(10, 0)).not.toBeNull();
    expect(t.until(() => t.enc().brain.state === "burrowed")).toBe(true);
    expect(t.boss()!.hittable).toBe(false);
    expect(t.hit(10, 10)).toBeNull();
    t.runHealed(0.5);
    expect(t.enc().emergence).toBe(0);
    t.teardown();
  });

  it("a surfaced Slagmaw spits lava at a player 3 m or more away; the glob lands as a hit", async () => {
    const t = await setup();
    t.startFight();
    t.toSurfaced();
    const b = t.boss()!.root!.position;
    t.ctx.player.teleport({ x: b.x + 8, y: b.y, z: b.z }, 0);
    expect(t.until(() => t.enc().liveSpits > 0, 4)).toBe(true);
    t.runHealed(1.5);
    const spits = t
      .of("damage.dealt")
      .filter((d) => d.attackId === `ranged:${SPIT_MOVE.id}`);
    expect(spits.length).toBeGreaterThan(0);
    expect(spits[0]).toMatchObject({
      outcome: "hit",
      attackerId: t.boss()!.id,
    });
    t.teardown();
  });

  it("hot crust: poise damage does nothing and no break happens, but health damage counts", async () => {
    const t = await setup();
    t.startFight();
    t.toSurfaced();
    const before = t.boss()!.health;
    for (let i = 0; i < 6; i++) t.hit(5, SLAGMAW.maxPoise);
    expect(t.boss()!.poise).toBe(SLAGMAW.maxPoise);
    expect(t.of("boss.break")).toEqual([]);
    expect(
      t.of("actor.staggered").filter((e) => e.actorId === t.boss()!.id),
    ).toEqual([]);
    expect(t.boss()!.health).toBe(before - 30);
    t.teardown();
  });

  it("a forced stagger on a hot crust (damage.stagger) adds no break pip, but a cooled break still does", async () => {
    const t = await setup();
    t.startFight();
    t.toSurfaced();
    expect(t.ctx.damage.stagger(t.boss()!.id, t.ctx.player.actor.id, SLAGMAW.maxPoise)).toBe(true);
    expect(t.of("boss.break")).toEqual([]);
    expect(t.state()!.breaks).toBe(0);
    expect(t.boss()!.poise).toBe(SLAGMAW.maxPoise);
    t.coolAndBreak(1);
    expect(t.state()!.breaks).toBe(1);
    expect(t.of("boss.break")).toHaveLength(1);
    t.teardown();
  });

  it("a valve cools him: the cooling hit fires, poise damage now breaks him, once, then the crust re-heats and the valve is spent", async () => {
    const t = await setup();
    t.startFight();
    t.toSurfaced();
    expect(t.valve(1).enabled()).toBe(true);
    t.turn(1);
    expect(t.of("cooling.hit")).toEqual([
      { actorId: t.boss()!.id, kind: "valve" },
    ]);
    expect(t.enc().crustCooled).toBe(true);
    expect(t.enc().dousing).toBe(true);
    expect(t.breakPoise()?.outcome).toBe("hit");
    expect(t.of("boss.break")).toEqual([
      { bossId: SLAGMAW_BOSS_ID, phase: 1, breaks: 1, last: false },
    ]);
    // No mercy, no window: the break opens none, so no `boss.releaseWindow` fires.
    expect(t.of("boss.releaseWindow")).toEqual([]);
    expect(t.state()!.releaseOpen).toBe(false);
    expect(t.enc().crustCooled).toBe(false);
    expect(t.enc().dousing).toBe(false);
    expect(t.enc().brain.state).toBe("broken");
    expect(t.valve(1).enabled()).toBe(false);
    // Hot again: more poise damage cannot break him a second time in the phase.
    t.settle();
    t.toSurfaced();
    t.hit(1, SLAGMAW.maxPoise);
    expect(t.of("boss.break")).toHaveLength(1);
    expect(t.valve(1).enabled()).toBe(false);
    t.teardown();
  });

  it("the spray cools only a worm inside its disc: a surfaced worm out of reach stays hot and the valve can be turned again", async () => {
    const t = await setup();
    t.startFight();
    // Lure the eruption far from valve 1 (the disc is 7 m).
    expect(t.until(() => t.of("telegraph").length > 0)).toBe(true);
    const c = t.ctx.anchors.find(ARENA.centre)!.position;
    t.ctx.player.teleport({ x: c.x - 11, y: c.y, z: c.z - 8 }, 0);
    t.toSurfaced();
    const valve1 = t.ctx.anchors.find(ARENA.valves[0])!.position;
    const spot = t.enc().eruptionSpot(new THREE.Vector3());
    expect(Math.hypot(spot.x - valve1.x, spot.z - valve1.z)).toBeGreaterThan(
      COOLING.radius,
    );
    t.turn(1);
    expect(t.enc().crustCooled).toBe(false);
    expect(t.of("cooling.hit")).toEqual([]);
    expect(t.valve(1).enabled()).toBe(false);
    t.runHealed(COOLING.seconds + 0.5);
    expect(t.enc().dousing).toBe(false);
    expect(t.valve(1).enabled()).toBe(true);
    t.teardown();
  });

  it("a worm that surfaces inside a running spray is cooled at once; a cooled crust that lapses without a break re-heats, refills poise and re-arms the valve", async () => {
    const t = await setup();
    t.startFight();
    t.toBurrowed();
    // The valves stand around the player; turn valve 1 while he is under, then let him surface into the spray.
    t.valve(1).onInteract(t.ctx.player.actor);
    expect(t.enc().dousing).toBe(true);
    expect(t.enc().crustCooled).toBe(false);
    t.toSurfaced();
    expect(t.enc().crustCooled).toBe(true);
    // A graze of poise (below the break) is refilled when the crust lapses.
    t.hit(1, SLAGMAW.maxPoise / 3);
    expect(t.boss()!.poise).toBeLessThan(SLAGMAW.maxPoise);
    t.runHealed(COOLING.seconds + 0.2);
    expect(t.enc().crustCooled).toBe(false);
    expect(t.boss()!.poise).toBe(SLAGMAW.maxPoise);
    expect(t.of("boss.break")).toEqual([]);
    expect(t.valve(1).enabled()).toBe(true);
    t.teardown();
  });

  it("poise does not regenerate while he is under the floor: a graze taken late in a surfacing survives the submerge", async () => {
    const t = await setup();
    t.startFight();
    t.toSurfaced();
    t.turn(1);
    t.runHealed(3.5);
    expect(t.enc().brain.state).toBe("surfaced");
    t.hit(1, SLAGMAW.maxPoise / 3);
    const grazed = t.boss()!.poise;
    expect(grazed).toBeLessThan(SLAGMAW.maxPoise);
    expect(t.until(() => t.enc().brain.state !== "surfaced")).toBe(true);
    t.runHealed(2.5);
    expect(t.enc().crustCooled).toBe(true);
    expect(t.enc().brain.exposed).toBe(false);
    expect(t.boss()!.poise).toBe(grazed);
    t.teardown();
  });

  it("valve N works only in phase N, and only while he lives", async () => {
    const t = await setup();
    t.startFight();
    t.toSurfaced();
    expect([1, 2, 3].map((n) => t.valve(n).enabled())).toEqual([
      true,
      false,
      false,
    ]);
    t.toFraction(0.65);
    expect(t.state()!.phase).toBe(2);
    expect([1, 2, 3].map((n) => t.valve(n).enabled())).toEqual([
      false,
      true,
      false,
    ]);
    // Phase 3 only opens once phase 2 has had its break.
    t.coolAndBreak(2);
    t.settle();
    t.toSurfaced();
    t.toFraction(0.32);
    expect(t.state()!.phase).toBe(3);
    expect([1, 2, 3].map((n) => t.valve(n).enabled())).toEqual([
      false,
      false,
      true,
    ]);
    t.teardown();
  });

  it("a phase change in the middle of a cool keeps the crust cooled; the break that follows belongs to the valve that cooled him", async () => {
    const t = await setup();
    t.startFight();
    t.toSurfaced();
    t.turn(1);
    t.toFraction(0.65);
    expect(t.state()!.phase).toBe(2);
    expect(t.enc().crustCooled).toBe(true);
    const r = t.breakPoise();
    expect(r?.outcome).toBe("hit");
    expect(t.of("boss.break").map((b) => b.last)).toEqual([false]);
    expect(t.of("boss.releaseWindow")).toEqual([]);
    t.settle();
    t.toSurfaced();
    // Valve 1 produced the break; valve 2 is still unspent and live in phase 2.
    expect(t.valve(2).enabled()).toBe(true);
    expect(t.valve(1).enabled()).toBe(false);
    t.teardown();
  });

  it("a stagger forced on a hot crust (a parried spit, Second Wind) neither breaks him, spends a valve nor lifts the floor", async () => {
    const t = await setup();
    t.startFight();
    t.toSurfaced();
    expect(t.enc().crustCooled).toBe(false);
    t.ctx.damage.stagger(t.enc().actor.id, t.ctx.player.actor.id, 999);
    t.run(2);
    expect(t.boss()!.poise).toBe(SLAGMAW.maxPoise);
    expect(t.valve(1).enabled()).toBe(true);
    t.toFraction(0.0);
    expect(t.state()!.health).toBeGreaterThan(0);
    t.teardown();
  });

  it("the lava spit cannot be parried", () => {
    expect(SPIT_MOVE.parryable).toBe(false);
  });

  it("three valve breaks, one per phase: the third is the last; no Spare or release window ever opens, and the floor holds until then", async () => {
    const t = await setup();
    t.startFight();
    t.coolAndBreak(1);
    t.settle();
    // Before the last break a huge hit crosses into phase 2 and stops above the phase 3 threshold, short of the floor.
    t.until(() => t.enc().brain.state === "surfaced");
    t.hit(1e6, 0);
    expect(t.state()!.health).toBe(Math.floor(SLAGMAW.maxHealth * SLAGMAW.phases[1]!) + 1);
    expect(t.state()!.phase).toBe(2);
    t.settle();
    t.coolAndBreak(2);
    t.settle();
    t.toSurfaced();
    // With phase 2's break taken, a huge hit stops at the floor and crosses into phase 3.
    t.hit(1e6, 0);
    expect(t.state()!.health).toBe(
      Math.ceil(SLAGMAW.maxHealth * SLAGMAW.healthFloor),
    );
    expect(t.state()!.phase).toBe(3);
    t.settle();
    t.coolAndBreak(3);
    expect(t.of("boss.break").map((b) => [b.phase, b.last])).toEqual([
      [1, false],
      [2, false],
      [3, true],
    ]);
    t.teardown();

    const u = await setup();
    u.startFight();
    u.coolAndBreak(1);
    u.settle();
    u.toSurfaced();
    u.toFraction(0.65);
    u.settle();
    u.coolAndBreak(2);
    u.settle();
    u.toSurfaced();
    u.toFraction(0.32);
    u.settle();
    expect(u.state()!.releaseOpen).toBe(false);
    u.coolAndBreak(3);
    expect(u.of("boss.break").map((b) => b.last)).toEqual([false, false, true]);
    // The registry needs a window; it is a single tick and nothing offers it.
    u.run(2);
    expect(u.state()!.releaseOpen).toBe(false);
    expect(u.ctx.bosses.release(SLAGMAW_BOSS_ID)).toBe(false);
    u.runHealed(SLAGMAW.breakSeconds + 5);
    expect(u.of("boss.released")).toEqual([]);
    expect(u.of("boss.spared")).toEqual([]);
    expect(u.state()!.outcome).toBeNull();
    expect(u.ctx.state.hasFlag(OUTCOME_FLAG)).toBe(false);
    expect(u.ctx.bosses.mercyState(SLAGMAW_BOSS_ID)).toBe("none");
    u.teardown();
  });

  it("a burst cannot skip phase 2's break: one hit from phase 1 stops above the phase 3 threshold, and only a phase-2 break lets him go lower", async () => {
    const t = await setup();
    t.startFight();
    t.toSurfaced();
    t.hit(1e6, 0);
    expect(t.state()!.phase).toBe(2);
    expect(t.state()!.health).toBeGreaterThan(SLAGMAW.maxHealth * SLAGMAW.phases[1]!);
    t.hit(1e6, 0);
    expect(t.state()!.phase).toBe(2);
    t.teardown();

    // The same burst while valve 1 cools him and poise breaks: the break lands in phase 2, and only then can he go lower.
    const u = await setup();
    u.startFight();
    u.toSurfaced();
    u.turn(1);
    u.hit(1e6, SLAGMAW.maxPoise);
    expect(u.of("boss.break").map((b) => [b.phase, b.last])).toEqual([[2, false]]);
    expect(u.state()!.phase).toBe(2);
    // The valve that cooled him is spent and locked.
    expect(u.valve(1).enabled()).toBe(false);
    u.settle();
    u.toSurfaced();
    u.hit(1e6, 0);
    expect(u.state()!.phase).toBe(3);
    u.teardown();
  });

  it("the kill: defeated, the outcome flag, no Spare; he sinks and fades, the valves go, the gate opens", async () => {
    const t = await setup();
    t.startFight();
    t.run(2);
    expect(t.interiors.log).toContain(`blocker:${ARENA.gate}:true`);
    t.toSurfaced();
    t.toFraction(0.65);
    t.settle();
    t.coolAndBreak(2);
    t.settle();
    t.toSurfaced();
    t.toFraction(0.32);
    t.settle();
    t.coolAndBreak(3);
    expect(t.of("boss.break").at(-1)!.last).toBe(true);
    // Even the last break opens no release window.
    expect(t.of("boss.releaseWindow")).toEqual([]);
    expect(t.state()!.releaseOpen).toBe(false);
    t.until(() => t.boss()!.hittable);
    t.hit(1e6, 0);
    expect(t.of("boss.defeated")).toHaveLength(1);
    expect(t.of("boss.spared")).toEqual([]);
    expect(t.ctx.state.getFlag(OUTCOME_FLAG)).toBe("defeated");
    expect(t.boss()!.hittable).toBe(false);
    expect(t.valve(3)).toBeUndefined();
    t.run(secs(PRESENTATION.deathSeconds + PRESENTATION.deathFadeSeconds) + 5);
    expect(t.boss()).toBeNull();
    expect(t.of("boss.ended")).toHaveLength(1);
    expect(t.interiors.log.at(-1)).toBe(`blocker:${ARENA.gate}:false`);
    t.teardown();
  });

  it("a kill while he is under the floor still plays the death", async () => {
    const t = await setup();
    t.startFight();
    t.toBurrowed();
    t.ctx.damage.kill(t.boss()!.id);
    expect(t.state()!.outcome).toBe("defeated");
    t.run(secs(PRESENTATION.deathSeconds + PRESENTATION.deathFadeSeconds) + 5);
    expect(t.boss()).toBeNull();
    t.teardown();
  });

  it("valves exist only while the fight is live: mounted at the anchors on register, gone after a reset", async () => {
    const t = await setup();
    t.enter();
    expect(t.valve(1)).toBeUndefined();
    t.run(secs(PRESENTATION.introSeconds) + 1);
    const v = t.valve(1);
    const out = v.position(new THREE.Vector3());
    const a = t.ctx.anchors.find(ARENA.valves[0])!.position;
    expect(out.x).toBeCloseTo(a.x);
    expect(out.z).toBeCloseTo(a.z);
    expect(v.kind).toBe("valve");
    expect(v.radius).toBe(COOLING.interactRadius);
    t.ctx.damage.kill(t.ctx.player.actor.id);
    t.run(2);
    expect([1, 2, 3].map((n) => t.valve(n))).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    t.teardown();
  });

  it("player death resets: one boss.ended, valves, spray and globs gone, the gate open; the retry has fresh valves and full health", async () => {
    const t = await setup();
    t.startFight();
    t.toSurfaced();
    t.turn(1);
    const e = t.enc();
    t.ctx.damage.kill(t.ctx.player.actor.id);
    t.run(2);
    expect(t.boss()).toBeNull();
    expect(t.of("boss.ended")).toHaveLength(1);
    expect(e.liveSpits).toBe(0);
    expect(e.dousing).toBe(false);
    expect(t.interiors.log.at(-1)).toBe(`blocker:${ARENA.gate}:false`);
    t.ctx.damage.revive(t.ctx.player.actor.id, 1, "script");
    t.enter();
    t.run(secs(PRESENTATION.retrySeconds) + 2);
    expect(t.boss()).not.toBeNull();
    expect(t.state()!.health).toBe(SLAGMAW.maxHealth);
    expect(t.state()!.phase).toBe(1);
    expect(t.valve(1).enabled()).toBe(true);
    expect(t.enc().crustCooled).toBe(false);
    expect(t.enc().valveWheel(0)!.position()).toBe(0);
    t.teardown();
  });

  it("reload inside the arena rectangle puts the player at the door; one boss.ended", async () => {
    const t = await setup();
    t.startFight();
    const door = t.ctx.anchors.find(ARENA.arenaDoor)!;
    t.game.events.emit("save.loaded", { slot: "test" });
    t.run(1);
    expect(t.boss()).toBeNull();
    expect(t.of("boss.ended")).toHaveLength(1);
    expect(
      t.ctx.player.feet.distanceTo(
        new THREE.Vector3(
          door.position.x,
          t.ctx.player.feet.y,
          door.position.z,
        ),
      ),
    ).toBeLessThan(0.5);
    expect(t.valve(1)).toBeUndefined();
    t.teardown();
  });

  it("a load after the kill (flag set) builds no fight and leaves the gate open", async () => {
    const t = await setup();
    t.startFight();
    t.toSurfaced();
    t.ctx.damage.kill(t.boss()!.id);
    t.run(secs(PRESENTATION.deathSeconds + PRESENTATION.deathFadeSeconds) + 5);
    t.game.events.emit("save.loaded", {} as never);
    t.run(2);
    expect(t.boss()).toBeNull();
    expect(t.ctx.state.getFlag(OUTCOME_FLAG)).toBe("defeated");
    t.enter();
    t.run(2);
    expect(t.boss()).toBeNull();
    expect(t.interiors.log.at(-1)).toBe(`blocker:${ARENA.gate}:false`);
    t.teardown();
  });

  it("music and bar contract: boss.started carries the id, the state carries the name key and no release", async () => {
    const t = await setup();
    t.startFight();
    expect(t.of("boss.started")).toEqual([
      { bossId: SLAGMAW_BOSS_ID, actorId: t.boss()!.id },
    ]);
    expect(t.state()).toMatchObject({
      bossId: SLAGMAW_BOSS_ID,
      nameKey: "boss.the-slagmaw.name",
      releaseOpen: false,
      outcome: null,
    });
    t.teardown();
  });

  it("headless with no asset loader runs the whole fight without a model", async () => {
    const t = await setup();
    t.startFight();
    expect(t.enc().view).toBeNull();
    t.runHealed(15);
    expect(t.state()).not.toBeNull();
    t.teardown();
  });

  it("with the procedural model: hurtboxes are registered, the worm rises and sinks, and a reset removes it from the scene", async () => {
    const t = await setup({ model: true });
    t.startFight();
    const view = t.enc().view!;
    expect(view).not.toBeNull();
    expect(view.root.parent).not.toBeNull();
    expect(view.root.visible).toBe(false);
    t.toSurfaced();
    t.runHealed(0.5);
    expect(view.root.visible).toBe(true);
    // The cooled look follows the cool, the plain look the re-heat.
    t.turn(1);
    expect(t.enc().crustCooled).toBe(true);
    t.runHealed(COOLING.seconds + 0.2);
    expect(t.enc().crustCooled).toBe(false);
    t.ctx.damage.kill(t.ctx.player.actor.id);
    t.run(2);
    expect(view.root.parent).toBeNull();
    t.teardown();
  });

  it("A8's ids are A4's Deepdelve ids, and the arena constants fit its real 30 x 30 m floor and valves", () => {
    expect(DEEPDELVE_DEF.id).toBe(ARENA.interiorId);
    expect(DEEPDELVE_ARENA_TRIGGER).toBe(ARENA.arenaTrigger);
    expect(DEEPDELVE_DEF.blockers.map((b) => b.id)).toContain(ARENA.gate);
    const local = (id: string) => DEEPDELVE_DEF.anchors.find((a) => a.id === id)!;
    const c = local(ARENA.centre);
    const half = (DEEPDELVE_ARENA.x1 - DEEPDELVE_ARENA.x0) / 2;
    expect(c.x).toBe((DEEPDELVE_ARENA.x0 + DEEPDELVE_ARENA.x1) / 2);
    expect(c.z).toBe((DEEPDELVE_ARENA.z0 + DEEPDELVE_ARENA.z1) / 2);
    // Reload covers the floor exactly; eruptions stay 2 m off the walls.
    expect(ARENA.reloadHalfExtent).toBe(half);
    expect(ARENA.arenaHalfExtent).toBeLessThanOrEqual(half - 2);
    const valves = ARENA.valves.map(local);
    for (const v of valves) {
      expect(Math.abs(v.x - c.x)).toBeLessThanOrEqual(ARENA.arenaHalfExtent);
      expect(Math.abs(v.z - c.z)).toBeLessThanOrEqual(ARENA.arenaHalfExtent);
    }
    // No two valve sprays overlap, so a cool is always the valve the player turned.
    for (let i = 0; i < valves.length; i++)
      for (let j = i + 1; j < valves.length; j++)
        expect(
          Math.hypot(valves[i].x - valves[j].x, valves[i].z - valves[j].z),
        ).toBeGreaterThan(2 * COOLING.radius);
  });

  it("gateIsClear and gateVeil follow the door anchor's translation onto A4's gate rect", () => {
    const anchors = new Map<string, { position: THREE.Vector3Like; yaw: number }>();
    const ctx = { anchors: { find: (id: string) => anchors.get(id) } } as never;
    expect(gateIsClear(ctx, { x: 0, y: 0, z: 0 })).toBe(true);
    expect(gateVeil(ctx)).toBeNull();
    const gate = DEEPDELVE_DEF.blockers.find((b) => b.id === ARENA.gate)!.rect;
    const door = DEEPDELVE_DEF.anchors.find((a) => a.id === ARENA.arenaDoor)!;
    const o = { x: 1000, y: 7, z: -500 };
    anchors.set(ARENA.arenaDoor, { position: { x: door.x + o.x, y: o.y, z: door.z + o.z }, yaw: 0 });
    const edge = gate.x1 + o.x + GATE_MARGIN;
    expect(gateIsClear(ctx, { x: edge - 0.01, y: o.y, z: door.z + o.z })).toBe(false);
    expect(gateIsClear(ctx, { x: edge, y: o.y, z: door.z + o.z })).toBe(true);
    const v = gateVeil(ctx)!;
    expect(v.at.x).toBeCloseTo((gate.x0 + gate.x1) / 2 + o.x);
    expect(v.at.z).toBeCloseTo((gate.z0 + gate.z1) / 2 + o.z);
    expect(v.at.y).toBe(o.y);
    // The rect runs along z: the veil turns a quarter to span it.
    expect(v.yaw).toBeCloseTo(Math.PI / 2);
    expect(ARENA.veilWidth).toBeGreaterThanOrEqual(gate.z1 - gate.z0);
    expect(ARENA.veilWidth).toBeLessThanOrEqual(gate.z1 - gate.z0 + 1);
  });

  it("Deepdelve: a player frozen at the trigger edge, inside the gate's reach, keeps it open; one step clear closes it with the veil on the gate", async () => {
    const t = await setup({ anchors: "deepdelve" });
    const veil = t.ctx.scene.getObjectByName("slagmaw-gate-veil")!;
    expect(veil).toBeDefined();
    // 0.1 m inside the trigger, 0.6 m past the blocker rect: the capsule still overlaps it.
    t.ctx.player.teleport(t.local(150.6, -20), -Math.PI / 2);
    t.walk(3);
    expect(t.of("boss.started")).toEqual([]);
    expect(slagmawDirector()!.introRunning).toBe(true);
    t.run(secs(PRESENTATION.introSeconds) + 2);
    expect(t.state()).not.toBeNull();
    t.runHealed(1);
    expect(t.interiors.log).toEqual([]);
    expect(veil.visible).toBe(false);
    t.ctx.player.teleport(t.local(151, -20), -Math.PI / 2);
    t.run(3);
    expect(t.interiors.log).toEqual([`blocker:${ARENA.gate}:true`]);
    expect(veil.visible).toBe(true);
    const at = t.local(149.25, -20);
    expect(veil.position.x).toBeCloseTo(at.x);
    expect(veil.position.z).toBeCloseTo(at.z);
    expect(veil.rotation.y).toBeCloseTo(Math.PI / 2);
    const geo = (veil as THREE.Mesh).geometry as THREE.PlaneGeometry;
    expect(geo.parameters.width).toBe(ARENA.veilWidth);
    t.teardown();
  });

  it("Deepdelve end to end: walk in through the real trigger, intro, three phases at the real valves, the kill, the gate opens", async () => {
    const t = await setup({ anchors: "deepdelve" });
    expect(t.interiors.log).toEqual([]);
    t.ctx.player.teleport(t.local(153, -20), -Math.PI / 2);
    t.walk(3);
    expect(t.moveModifiers.state().freeze).toBe(true);
    t.run(secs(PRESENTATION.introSeconds) + 2);
    expect(t.of("boss.started")).toHaveLength(1);
    expect(t.interiors.log).toEqual([`blocker:${ARENA.gate}:true`]);
    expect(t.enc()).not.toBeNull();
    const phase = (n: number, below: number | null) => {
      const v = t.ctx.anchors.find(ARENA.valves[n - 1])!.position;
      // Stand by valve N and let him dive and come up under the player, inside its spray.
      t.ctx.player.teleport({ x: v.x + 1, y: v.y, z: v.z }, 0);
      t.toBurrowed();
      t.coolAndBreak(n);
      t.settle();
      if (below !== null) {
        t.toSurfaced();
        t.toFraction(below);
        expect(t.state()!.phase).toBe(n + 1);
        t.settle();
      }
    };
    phase(1, 0.65);
    phase(2, 0.32);
    phase(3, null);
    expect(t.of("boss.break").map((b) => [b.phase, b.last])).toEqual([
      [1, false],
      [2, false],
      [3, true],
    ]);
    t.until(() => t.boss()!.hittable);
    t.hit(1e6, 0);
    expect(t.of("boss.defeated")).toHaveLength(1);
    expect(t.ctx.state.getFlag(OUTCOME_FLAG)).toBe("defeated");
    t.run(secs(PRESENTATION.deathSeconds + PRESENTATION.deathFadeSeconds) + 5);
    expect(t.boss()).toBeNull();
    expect(t.of("boss.ended")).toHaveLength(1);
    expect(t.interiors.log.at(-1)).toBe(`blocker:${ARENA.gate}:false`);
    expect(t.ctx.scene.getObjectByName("slagmaw-gate-veil")!.visible).toBe(false);
    t.teardown();
  });
});
