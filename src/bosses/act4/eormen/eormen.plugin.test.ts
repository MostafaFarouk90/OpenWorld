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
import { isStruckProp } from '../../../actors/struckProps';
import { BOSS_MERCY } from '../../../enemies/tuning';
import { ALL_SPAWNERS } from '../../../enemies/allSpawners';
import { TerrainColliders } from '../../../world/TerrainColliders';
import { World } from '../../../world/World';
import structureBreaksPlugin from '../../structureBreaks.plugin';
import { D08_STARTED_FLAG, OUTCOME_FLAG, RESET_TOAST_KEY } from './EormenDirector';
import { EORMEN_BOSS_DEF } from './EormenEncounter';
import plugin, { eormenDirector } from './eormen.plugin';
import { GONG_INTERACT_ID } from './lastGong';
import { EORMEN_SPAWNERS } from './spawners';
import { winEormenForTest } from './testing';
import { HUSK_CATHEDRAL_DEF } from '../../../waste/interiors/huskCathedral';
import { ARENA, DARK, EORMEN, EORMEN_BOSS_ID, eormenLevel, eormenScale, GONG, GONG_KIND, HUSKS, PRESENTATION, TOLL } from './tuning';

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

/** L1's nave anchors (src/waste/interiors/huskCathedral.ts), in the cathedral's local metres from its door. */
const NAVE_ANCHORS = HUSK_CATHEDRAL_DEF.anchors.filter((a) => a.id.startsWith('waste.cathedral.nave.'));

interface FakeSlot {
  pos: { x: number; y: number; z: number } | null;
  intensity: number;
  released: boolean;
}

type Opts = {
  interior?: string | null;
  level?: number;
  noBreaks?: boolean;
  /** Glow slots the fake env pool hands out (undefined: no env service at all). 0 = the low tier. */
  lights?: number;
  quest?: 'none' | 'inactive' | 'active';
};

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
  const blockers: string[] = [];
  const interiors = {
    current: ('interior' in opts ? opts.interior! : ARENA.interiorId) as string | null,
    setBlocker: (id: string, closed: boolean) => blockers.push(`${id}:${closed}`),
  };
  const spawned: string[] = [];
  const resets: string[] = [];
  const toasts: string[] = [];
  const slots: FakeSlot[] = [];
  const plugins: GamePlugin[] = [
    corePlugin,
    fake('enemies', 'enemies', {
      spawnGroup: (id: string) => (spawned.push(id), []),
      reset: (id: string) => void resets.push(id),
      alive: () => [],
      despawnGroup: () => {},
      view: () => undefined,
    }),
    fake('interiors', 'interiors', interiors),
    plugin,
  ];
  if (!opts.noBreaks) plugins.push(structureBreaksPlugin);
  else plugins.push({ id: 'structure-breaks', dependsOn: ['core'], setup() {} });
  if (opts.level !== undefined) plugins.push(fake('progression', 'progression', { level: opts.level, classId: null }));
  const glow = { tier: 'high' as string };
  if (opts.lights !== undefined) {
    let free = opts.lights;
    plugins.push(
      fake('env', 'env', {
        glow: () => ({ tier: glow.tier }),
        fireLights: {
          acquire: () => {
            if (free <= 0) return null;
            free--;
            const s: FakeSlot = { pos: null, intensity: 0, released: false };
            slots.push(s);
            return {
              set: (p: { x: number; y: number; z: number }, i: number) => {
                s.pos = { ...p };
                s.intensity = i;
              },
              release: () => {
                s.released = true;
                free++;
              },
            };
          },
        },
      }),
    );
  }
  if (opts.quest && opts.quest !== 'none') {
    const st = { s: opts.quest };
    plugins.push(fake('quests', 'quests', { get: (id: string) => (id === 'd08' ? { id } : undefined), state: () => st.s }));
  }
  await game.loadPlugins(modules(...plugins));
  const ctx = game.ctx;
  await new Promise((r) => setTimeout(r, 0));
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  run(2);
  // The cathedral's local frame placed so the player stands at local (0, 20), inside the nave past the arena gate.
  const p = ctx.player.feet.clone();
  const o = { x: p.x, y: p.y, z: p.z - 20 };
  const local = (x: number, z: number) => ({ x: o.x + x, y: p.y, z: o.z + z });
  for (const a of NAVE_ANCHORS) ctx.anchors.define({ id: a.id, position: local(a.x, a.z), yaw: ((a as { yaw?: number }).yaw ?? 0) * (Math.PI / 180) });
  // A hemisphere and the interior's follow light, as SceneEnvironment leaves them inside.
  const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 0.9);
  const follow = new THREE.PointLight(0xffffff, 1.6);
  follow.name = 'interior-light';
  scene.add(hemi, follow);
  (eormenDirector() as unknown as { toast: (t: string) => void }).toast = (t) => toasts.push(t);
  run(2);
  const at = (x: number, z: number) => {
    ctx.player.teleport(local(x, z));
    run(2);
  };
  const of = <K extends keyof GameEventMap>(type: K): GameEventMap[K][] => events.filter((e) => e.type === type).map((e) => e.payload as GameEventMap[K]);
  const enter = () => game.events.emit('trigger.enter', { triggerId: ARENA.trigger, actorId: ctx.player.actor.id });
  const exit = () => game.events.emit('trigger.exit', { triggerId: ARENA.trigger, actorId: ctx.player.actor.id });
  const dir = () => eormenDirector()!;
  const enc = () => dir().current!;
  const boss = () => [...ctx.actors.all()].find((a) => a.kind === 'eormen') ?? null;
  const gongActor = () => [...ctx.actors.all()].find((a) => a.kind === GONG_KIND) ?? null;
  const state = () => ctx.bosses.state(EORMEN_BOSS_ID);
  const heal = () => {
    const pl = ctx.player.actor;
    pl.health = pl.maxHealth;
  };
  const until = (cond: () => boolean, max = 30) => {
    for (let i = 0; i < secs(max); i++) {
      if (cond()) return true;
      game.fixedUpdate();
      heal();
    }
    return cond();
  };
  const runHealed = (seconds: number) => {
    for (let i = 0; i < secs(seconds); i++) {
      game.fixedUpdate();
      heal();
    }
  };
  const hit = (amount: number, poise = amount, extra: Record<string, unknown> = {}) =>
    ctx.damage.apply({ attackerId: ctx.player.actor.id, targetId: boss()!.id, amount, poise, kind: 'melee', ...extra });
  const start = () => {
    enter();
    run(secs(PRESENTATION.introSeconds) + 2);
    expect(enc().contested).toBe(true);
  };
  const gongF = () => (ctx.interaction as unknown as { items: Map<string, any> }).items.get(GONG_INTERACT_ID).onInteract(ctx.player.actor);
  const strikeGong = (kind: 'melee' | 'spell' = 'melee') =>
    ctx.damage.apply({ attackerId: ctx.player.actor.id, targetId: gongActor()!.id, amount: 20, poise: 20, kind, attackId: kind === 'spell' ? 'firebolt' : 'swing' });
  const toFloor = () => hit(state()!.health);
  /** The gong answers only at the phase's floor: brings him there first if needed, then waits for a toll to open it. */
  const waitWindow = () => {
    if (!enc().brain.gongReady) toFloor();
    expect(until(() => enc().brain.windowOpen, Math.max(...TOLL.gap) + 4)).toBe(true);
  };
  const teardown = () => {
    game.dispose();
    world.dispose();
  };
  return {
    glow, game, ctx, scene, interiors, events, blockers, spawned, resets, toasts, slots, hemi, follow, of, run, runHealed, until, at, local,
    enter, exit, dir, enc, boss, gongActor, state, hit, start, gongF, strikeGong, toFloor, waitWindow, teardown,
    step: () => game.fixedUpdate(),
  };
}

describe('eormen numbers', () => {
  it('level 35 capped at P + 3, health and damage 5 % a level, never below half', () => {
    expect(eormenLevel(undefined)).toBe(35);
    expect(eormenLevel(40)).toBe(35);
    expect(eormenLevel(30)).toBe(33);
    expect(eormenScale(35)).toBe(1);
    expect(eormenScale(33)).toBeCloseTo(0.9);
    expect(eormenScale(1)).toBe(0.5);
    expect(eormenScale(Number.NaN)).toBe(1);
  });

  it('kill XP pays 750 at an even level under the Waste’s x 2.4; the gong pays nothing and is a struck prop', () => {
    expect(killXp('eormen', 35, 35, 2.4)).toBe(750);
    expect(killXp('eormen-gong', 35, 35, 2.4)).toBe(0);
    expect(isStruckProp({ team: 'neutral', kind: GONG_KIND })).toBe(true);
  });

  it('a release boss: three phases of one break, the 4 s window, 20 Burn, Ashwalkers +6 on ledger row D08', () => {
    expect(EORMEN_BOSS_DEF.phases).toEqual([0.66, 0.33]);
    expect(EORMEN_BOSS_DEF.breaksPerPhase).toBe(1);
    expect(EORMEN_BOSS_DEF.releaseWindowSeconds).toBe(4);
    expect(EORMEN_BOSS_DEF.mercyVerb).toBe('release');
    expect(BOSS_MERCY['eormen']).toEqual({ verb: 'release', track: 'ashwalkers', amount: 6, burn: 20, ledgerId: 'D08' });
  });

  it('three husk groups of three on ash piles 1 to 3, ephemeral, manual, in the Waste band, in the game’s spawner list', () => {
    expect(EORMEN_SPAWNERS.map((s) => s.id)).toEqual([...HUSKS.groups]);
    for (const s of EORMEN_SPAWNERS) {
      expect(s.count).toBe(3);
      expect(s.memberAnchors).toEqual(['waste.cathedral.nave.ash.1', 'waste.cathedral.nave.ash.2', 'waste.cathedral.nave.ash.3']);
      expect(s).toMatchObject({ enemy: 'ash-wraith', skin: 'wraith-husk', band: 'ashen-waste', activation: 'manual', ephemeral: true, respawn: 'never' });
      expect(ALL_SPAWNERS).toContain(s);
    }
  });
});

describe('eormen plugin', () => {
  it(
    'review fixes: a Release crumbles the husks a tick later (the pulse reads them first); a reset in an open window says it closed',
    async () => {
      const h = await setup();
      let resetsAtRelease = -1;
      h.game.events.on('boss.released', () => {
        resetsAtRelease = h.resets.length;
      });
      h.enter();
      winEormenForTest(h, { outcome: 'released' });
      // Nothing crumbled inside the release's own dispatch; every group crumbled afterwards.
      expect(resetsAtRelease).toBeGreaterThanOrEqual(0);
      expect(h.resets.slice(resetsAtRelease).filter((g) => (HUSKS.groups as readonly string[]).includes(g)).length).toBeGreaterThanOrEqual(3);
      const before = h.resets.slice(0, resetsAtRelease);
      // The only resets before the release are the per-phase refills (reset then spawn), one per group.
      expect(before).toEqual([...HUSKS.groups]);
      h.teardown();

      const r = await setup();
      r.start();
      r.waitWindow();
      const pl = r.ctx.player.actor;
      r.ctx.damage.apply({ attackerId: r.boss()!.id, targetId: pl.id, amount: pl.maxHealth * 10, poise: 0, kind: 'melee' });
      r.run(3);
      expect(r.of('eormen.gong.window').at(-1)).toEqual({ open: false, seconds: 0 });
      r.teardown();
    },
    T30,
  );

  it(
    'review fixes: a glow tier change re-takes the gong’s slot (a high slot goes dark on medium); none on low',
    async () => {
      const h = await setup({ lights: 3 });
      h.start();
      expect(h.slots).toHaveLength(1);
      h.glow.tier = 'medium';
      h.run(secs(1.2));
      expect(h.slots[0].released).toBe(true);
      expect(h.slots).toHaveLength(2);
      expect(h.slots[1].released).toBe(false);
      expect(h.enc().lastGong!.lit).toBe(true);
      h.teardown();
    },
    T30,
  );

  it(
    'the whole fight, defeated: three gong strikes after tolls, husks each phase, the nave dark from phase 2, lights back after',
    async () => {
      const h = await setup();
      h.start();
      expect(h.of('boss.started').map((b) => b.bossId)).toEqual([EORMEN_BOSS_ID]);
      expect(h.state()!.maxHealth).toBe(EORMEN.maxHealth);
      expect(h.blockers).toContain(`${ARENA.gate}:true`);
      expect(h.spawned).toEqual([HUSKS.groups[0]]);
      for (let phase = 1; phase <= 3; phase++) {
        expect(h.state()!.phase).toBe(phase);
        h.toFloor();
        h.waitWindow();
        h.gongF();
        h.run(2);
        expect(h.of('boss.break')).toHaveLength(phase);
        expect(h.enc().brain.state).toBe('staggered');
        if (phase < 3) {
          h.hit(h.state()!.health - h.state()!.maxHealth * EORMEN.phases[phase - 1] + 5);
          expect(h.state()!.phase).toBe(phase + 1);
          expect(h.spawned).toEqual(HUSKS.groups.slice(0, phase + 1));
          h.runHealed(DARK.fadeSeconds + 0.1);
          expect(h.enc().darkness).toBe(1);
          expect(h.hemi.intensity).toBeCloseTo(0.9 * DARK.share);
          expect(h.follow.intensity).toBeCloseTo(1.6 * DARK.share);
        }
      }
      expect(h.of('boss.break').at(-1)!.last).toBe(true);
      expect(h.of('boss.releaseWindow').at(-1)!.open).toBe(true);
      // Let the window pass, then finish him.
      h.runHealed(EORMEN.releaseWindowSeconds + 0.2);
      h.hit(h.state()!.health + 10);
      expect(h.ctx.state.getString(OUTCOME_FLAG)).toBe('defeated');
      expect(h.hemi.intensity).toBeCloseTo(0.9);
      expect(h.follow.intensity).toBeCloseTo(1.6);
      for (const g of HUSKS.groups) expect(h.resets).toContain(g);
      h.run(secs(PRESENTATION.deathSeconds) + 2);
      expect(h.dir().current).toBeNull();
      expect(h.gongActor()).toBeNull();
      expect(h.blockers.at(-1)).toBe(`${ARENA.gate}:false`);
      expect(h.of('structure.struck').map((s) => s.bossId)).toEqual([EORMEN_BOSS_ID, EORMEN_BOSS_ID, EORMEN_BOSS_ID]);
      expect(h.dir().crownShown).toBe(false);
      h.exit();
      h.enter();
      h.run(secs(5));
      expect(h.dir().current).toBeNull();
      h.teardown();
    },
    T30,
  );

  it(
    'winEormenForTest releases him: the outcome is released and his crown rests on the altar, inside the cathedral only',
    async () => {
      const h = await setup();
      h.enter();
      const r = winEormenForTest(h, { outcome: 'released' });
      expect(r.outcome).toBe('released');
      expect(h.ctx.state.getString(OUTCOME_FLAG)).toBe('released');
      expect(h.of('boss.released').map((b) => b.bossId)).toEqual([EORMEN_BOSS_ID]);
      h.run(2);
      expect(h.dir().crownShown).toBe(true);
      const crown = h.scene.getObjectByName('eormen-crown-rest')!;
      const altar = h.local(ARENA.altarLocal.x, ARENA.altarLocal.z);
      expect(crown.position.x).toBeCloseTo(altar.x);
      expect(crown.position.z).toBeCloseTo(altar.z);
      expect(crown.position.y).toBeGreaterThan(altar.y + ARENA.altarLocal.top);
      h.interiors.current = null;
      h.run(2);
      expect(h.dir().crownShown).toBe(false);
      h.teardown();
    },
    T30,
  );

  it(
    'winEormenForTest defeats him, timed inside a fight’s length',
    async () => {
      const h = await setup();
      h.enter();
      const r = winEormenForTest(h);
      expect(r.outcome).toBe('defeated');
      expect(h.ctx.state.getString(OUTCOME_FLAG)).toBe('defeated');
      expect(r.seconds).toBeLessThan(120);
      h.teardown();
    },
    T30,
  );

  it(
    'the gong outside the window is a dud; inside it breaks one bar; a second strike in the same window is a dud',
    async () => {
      const h = await setup();
      h.start();
      h.toFloor();
      h.gongF();
      expect(h.of('eormen.gong.dud')).toHaveLength(1);
      expect(h.of('boss.break')).toEqual([]);
      h.waitWindow();
      expect(h.of('eormen.gong.window').at(-1)).toEqual({ open: true, seconds: TOLL.windowSeconds });
      h.strikeGong('melee');
      h.run(2);
      expect(h.of('boss.break')).toHaveLength(1);
      expect(h.enc().brain.windowOpen).toBe(false);
      h.gongF();
      expect(h.of('boss.break')).toHaveLength(1);
      expect(h.of('eormen.gong.dud')).toHaveLength(2);
      // The next toll, above phase 2's floor, opens nothing: the gong answers only at the floor.
      const opened = h.of('eormen.gong.window').filter((w) => w.open).length;
      expect(h.until(() => h.enc().brain.current === 'toll', Math.max(...TOLL.gap) + 4)).toBe(true);
      h.run(TOLL.windup + 0.2);
      expect(h.enc().brain.windowOpen).toBe(false);
      expect(h.of('eormen.gong.window').filter((w) => w.open)).toHaveLength(opened);
      h.gongF();
      expect(h.of('boss.break')).toHaveLength(1);
      expect(h.of('eormen.gong.dud')).toHaveLength(3);
      h.teardown();
    },
    T30,
  );

  it(
    'a toll inside an open window extends it and never gives a second bar',
    async () => {
      const h = await setup();
      h.start();
      h.waitWindow();
      // Force the next toll now (the early-toll worst case), while the window is still open.
      (h.enc().brain as unknown as { tollIn: number }).tollIn = 0;
      expect(h.until(() => h.enc().brain.current === 'toll', 4)).toBe(true);
      expect(h.until(() => h.enc().brain.state === 'recover', 3)).toBe(true);
      const opens = h.of('eormen.gong.window').filter((w) => w.open);
      expect(opens).toHaveLength(2);
      expect(h.of('eormen.gong.window').filter((w) => !w.open)).toHaveLength(0);
      expect(h.enc().brain.windowRemaining).toBeGreaterThan(TOLL.windowSeconds - 0.2);
      h.toFloor();
      h.gongF();
      h.run(2);
      h.gongF();
      h.run(2);
      expect(h.of('boss.break')).toHaveLength(1);
      h.teardown();
    },
    T30,
  );

  it(
    'a spell or a bolt on the gong strikes it like a sword; a hostile hit does not, and the gong never takes damage',
    async () => {
      const h = await setup();
      h.start();
      h.toFloor();
      h.waitWindow();
      const r = h.strikeGong('spell');
      expect(r?.dealt ?? 0).toBe(0);
      h.run(2);
      expect(h.of('boss.break')).toHaveLength(1);
      h.ctx.damage.apply({ attackerId: h.boss()!.id, targetId: h.gongActor()!.id, amount: 20, poise: 0, kind: 'melee' });
      expect(h.enc().lastGong!.strikes).toBe(1);
      h.teardown();
    },
    T30,
  );

  it(
    'his floor holds health above each threshold until the bar, then at 8 %; reaching it brings the toll early',
    async () => {
      const h = await setup();
      h.start();
      const max = h.state()!.maxHealth;
      h.hit(max * 2);
      expect(h.state()!.health).toBe(Math.floor(max * 0.66) + 1);
      h.run(2);
      expect(h.enc().brain.tollRemaining).toBeLessThanOrEqual(TOLL.atFloor);
      h.waitWindow();
      h.gongF();
      h.run(2);
      h.hit(max * 2);
      expect(h.state()!.phase).toBe(2);
      expect(h.state()!.health).toBe(Math.floor(max * 0.33) + 1);
      h.waitWindow();
      h.gongF();
      h.run(2);
      h.hit(max * 2);
      expect(h.state()!.phase).toBe(3);
      expect(h.state()!.health).toBe(Math.ceil(max * EORMEN.healthFloor));
      expect(h.boss()!.dead).toBe(false);
      h.teardown();
    },
    T30,
  );

  it(
    'weapons drain no poise; a stagger from elsewhere makes no pip',
    async () => {
      const h = await setup();
      h.start();
      h.hit(10, 500);
      expect(h.boss()!.poise).toBe(EORMEN.maxPoise);
      h.ctx.damage.stagger(h.boss()!.id, h.ctx.player.actor.id, 1000);
      h.run(2);
      expect(h.of('boss.break')).toEqual([]);
      h.teardown();
    },
    T30,
  );

  it(
    'the gong takes a glow slot for the fight, bright while open, and gives it back at the end',
    async () => {
      const h = await setup({ lights: 2 });
      h.start();
      expect(h.slots).toHaveLength(1);
      expect(h.enc().lastGong!.lit).toBe(true);
      h.run(2);
      expect(h.slots[0].intensity).toBe(GONG.lightIdle);
      h.waitWindow();
      h.run(1);
      expect(h.slots[0].intensity).toBe(GONG.lightOpen);
      h.dir().dispose();
      expect(h.slots[0].released).toBe(true);
      h.teardown();
    },
    T30,
  );

  it(
    'on the 0-light tier the window still reads: the rim shimmers and the floor ring shows, and go out when it closes',
    async () => {
      const h = await setup({ lights: 0 });
      h.start();
      const gong = h.enc().lastGong!;
      expect(gong.lit).toBe(false);
      expect(gong.decalShown).toBe(false);
      h.waitWindow();
      h.run(3);
      expect(gong.decalShown).toBe(true);
      expect(gong.rimGlow).toBeGreaterThan(0.2);
      expect(h.until(() => !h.enc().brain.windowOpen, TOLL.windowSeconds + 1)).toBe(true);
      expect(gong.decalShown).toBe(false);
      expect(gong.rimGlow).toBe(0);
      h.teardown();
    },
    T30,
  );

  it(
    'death mid-fight resets with the toast: husks crumble, the lights come back, the gate opens, and he waits',
    async () => {
      const h = await setup();
      h.start();
      h.toFloor();
      h.waitWindow();
      h.gongF();
      h.run(2);
      h.hit(h.state()!.health - h.state()!.maxHealth * 0.66 + 5);
      h.runHealed(DARK.fadeSeconds + 0.2);
      expect(h.hemi.intensity).toBeLessThan(0.5);
      const pl = h.ctx.player.actor;
      h.ctx.damage.apply({ attackerId: h.boss()!.id, targetId: pl.id, amount: pl.maxHealth * 10, poise: 0, kind: 'melee' });
      h.run(3);
      expect(h.toasts).toEqual([h.ctx.strings.t(RESET_TOAST_KEY)]);
      expect(h.ctx.state.hasFlag(OUTCOME_FLAG)).toBe(false);
      expect(h.hemi.intensity).toBeCloseTo(0.9);
      expect(h.follow.intensity).toBeCloseTo(1.6);
      for (const g of HUSKS.groups) expect(h.resets).toContain(g);
      expect(h.dir().current).toBeNull();
      expect(h.gongActor()).toBeNull();
      expect(h.blockers.at(-1)).toBe(`${ARENA.gate}:false`);
      h.teardown();
    },
    T30,
  );

  it(
    'leaving the nave floor for 3 s, or the cathedral, resets the fight with the toast',
    async () => {
      const h = await setup();
      h.start();
      h.at(0, 3);
      h.run(secs(ARENA.abandonSeconds) + 2);
      expect(h.dir().current).toBeNull();
      expect(h.toasts).toHaveLength(1);
      h.at(0, 20);
      h.exit();
      h.start();
      h.game.events.emit('interior.exited', { interiorId: ARENA.interiorId } as never);
      h.run(2);
      expect(h.dir().current).toBeNull();
      expect(h.toasts).toHaveLength(2);
      h.teardown();
    },
    T30,
  );

  it(
    'arms only while D08 is active (or its started flag is set) and with the structure-break service',
    async () => {
      const h = await setup({ quest: 'inactive' });
      h.enter();
      h.run(secs(2));
      expect(h.dir().current).toBeNull();
      h.ctx.state.setFlag(D08_STARTED_FLAG, true);
      h.run(2);
      expect(h.dir().introRunning).toBe(true);
      h.teardown();
      const n = await setup({ noBreaks: true });
      n.enter();
      n.run(secs(2));
      expect(n.dir().current).toBeNull();
      n.teardown();
    },
    T30,
  );

  it(
    'he holds his ground when Cael closes in, drifts toward him from afar, and never leaves the open nave',
    async () => {
      const h = await setup();
      h.start();
      const b0 = h.boss()!.root!.position.clone();
      h.ctx.player.teleport({ x: b0.x + 1.5, y: b0.y - EORMEN.hover, z: b0.z - 1.5 });
      h.runHealed(2);
      expect(h.boss()!.root!.position.distanceTo(b0)).toBeLessThan(0.01);
      // Far off, near the west wall: he comes toward Cael but stays between the pillar rows.
      h.at(-14, 12);
      h.runHealed(8);
      const b = h.boss()!.root!.position;
      const lx = b.x - h.local(0, 0).x;
      const lz = b.z - h.local(0, 0).z;
      expect(Math.hypot(b.x - h.ctx.player.feet.x, b.z - h.ctx.player.feet.z)).toBeLessThan(EORMEN.keepMax + 4);
      expect(lx).toBeGreaterThanOrEqual(ARENA.drift.x0 - 1e-6);
      expect(lz).toBeGreaterThanOrEqual(ARENA.drift.z0 - 1e-6);
      h.teardown();
    },
    T30,
  );

  it(
    'his level is capped at P + 3 and scales his health',
    async () => {
      const h = await setup({ level: 30 });
      h.start();
      expect(h.boss()!.level).toBe(33);
      expect(h.state()!.maxHealth).toBe(Math.round(EORMEN.maxHealth * eormenScale(33)));
      h.teardown();
    },
    T30,
  );

  it(
    'the blades and the toll land on a player who stands; the blades are dodge-only',
    async () => {
      const h = await setup();
      h.start();
      h.at(0, 24);
      h.runHealed(TOLL.first + TOLL.windup + 0.5);
      expect(h.of('damage.dealt').some((d) => d.targetId === h.ctx.player.actor.id && d.attackId === 'eormen.blades' && d.dealt > 0)).toBe(true);
      const tele = h.of('telegraph').find((t) => t.attackId === 'eormen.blades')!;
      expect(tele).toMatchObject({ kind: 'dodge', leadSeconds: 0.8, moveId: 'eormen.blades' });
      expect(h.of('telegraph').some((t) => t.attackId === 'eormen.toll' && t.leadSeconds === TOLL.windup)).toBe(true);
      h.teardown();
    },
    T30,
  );
});
