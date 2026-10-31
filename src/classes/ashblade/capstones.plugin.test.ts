import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { KnightAvatar } from '../../characters/KnightAvatar';
import corePlugin from '../../core/core.plugin';
import { Game } from '../../core/Game';
import { MoveModifiers } from '../../core/MoveModifiers';
import type { PluginModule } from '../../core/plugins';
import { InputManager } from '../../input/InputManager';
import inventoryPlugin from '../../inventory/inventory.plugin';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import combatVerbsPlugin from '../../player/combatVerbs.plugin';
import progressionPlugin from '../../progression/progression.plugin';
import { resetClassSkills } from '../../progression/skills';
import spellsPlugin from '../../spells/spells.plugin';
import { TerrainColliders } from '../../world/TerrainColliders';
import { World } from '../../world/World';
import classesPlugin from '../classes.plugin';
import { PerceptionHub } from '../../enemies/perceptionHook';
import statusPlugin from '../../status/status.plugin';
import ashbladeAct3Plugin from './act3.plugin';
import ashbladeCapstonesPlugin from './capstones.plugin';
import { perceive } from '../../enemies/ai/perception';
import { getSkill } from '../../progression/skills';
import ashbladePlugin from './ashblade.plugin';
import { FLICKER_STRIKE, GHOST_OF_THE_HEARTH, SKILL, THOUSAND_SPARKS } from './tuning';

let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
let physics: PhysicsWorld;

beforeAll(async () => {
  (globalThis as any).self ??= globalThis;
  const fsModule = 'node:fs';
  const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as any;
  const file = readFileSync('public/assets/kaykit-adventurers/characters/Knight.glb');
  const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res as any, rej));
});

let warns: string[] = [];
beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  warns = [];
  vi.spyOn(console, 'warn').mockImplementation((m: unknown) => void warns.push(String(m)));
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  resetClassSkills();
});
afterEach(() => vi.restoreAllMocks());

const plugins = [corePlugin, statusPlugin, progressionPlugin, inventoryPlugin, combatVerbsPlugin, spellsPlugin, classesPlugin, ashbladePlugin, ashbladeAct3Plugin, ashbladeCapstonesPlugin];
const modules = (list = plugins): Record<string, PluginModule> => Object.fromEntries(list.map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }]));

async function boot(list = plugins) {
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
  const game = new Game({ scene, physics, world, input, moveModifiers, report: () => {} });
  const ctx = game.ctx;
  ctx.state.setFlag('tutorial.complete', true);
  ctx.input.bindings.rebind('dodge', 0, { device: 'key', code: 'KeyN' });
  const statuses = await game.loadPlugins(modules(list));
  const avatar = new KnightAvatar({ model: cloneSkinned(gltf.scene), clips: gltf.animations, sword: null, shield: null }, { warn: () => {} });
  world.setAvatar(avatar);
  game.attachAvatar(avatar);
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  const press = (code: string) => win.dispatchEvent(Object.assign(new Event('keydown'), { code, repeat: false, preventDefault: () => {} }));
  const release = (code: string) => win.dispatchEvent(Object.assign(new Event('keyup'), { code, repeat: false, preventDefault: () => {} }));
  run(2);
  const progression = () => ctx.services.require('progression');
  /** The Ashblade with Act 3 begun, the master's book given and every tier 1 to 4 skill learned. */
  const asMaster = () => {
    ctx.state.setFlag('story.gate.a3', true);
    ctx.state.setFlag('trainer.ashblade.masterBook', true);
    progression().setClass('ashblade');
    progression().grantSkillPoint(40, 'test');
    for (const id of Object.values(SKILL)) progression().learn(id);
  };
  const enemy = (z: number, yaw = 0, x = 0, kind = 'ash-wraith') => {
    const root = new THREE.Object3D();
    root.position.set(world.spawn.x + x, world.spawn.y, world.spawn.z + z);
    root.rotation.y = yaw;
    scene.add(root);
    root.updateMatrixWorld(true);
    return ctx.actors.spawn({ kind, team: 'hostile', maxHealth: 200, maxPoise: 20, root });
  };
  const slotOf = (id: string) => progression().bar().indexOf(id);
  const use = (id: string) => ctx.services.require('abilities').use(slotOf(id));
  return { game, ctx, world, statuses, run, press, release, progression, asMaster, enemy, slotOf, use };
}

type Booted = Awaited<ReturnType<typeof boot>>;

/** Not attack 1, so Twin Fangs never splits it. */
const SLICE = 'Dualwield_Melee_Attack_Stab';
const hit = (t: Booted, target: string, over: Record<string, unknown> = {}) =>
  t.ctx.damage.apply({ attackerId: 'player', targetId: target, amount: 10, poise: 0, kind: 'melee', attackId: SLICE, swingId: 1, direction: new THREE.Vector3(0, 0, 1), ...over });
const dodge = (t: Booted) => {
  t.run(2);
  t.press('KeyN');
  t.run(2);
  t.release('KeyN');
};

describe('ashblade capstones plugin: boot and bar', () => {
  it('boots clean and puts the three capstones on the bar with their cooldown and Ember cost', async () => {
    const t = await boot();
    expect(t.statuses.find((s) => s.id === 'ashblade-capstones')?.state).toBe('ok');
    t.asMaster();
    // One capstone per character: the others are excluded once the first is learned, so check the rows, not the bar.
    expect(getSkill(SKILL.deathByAThousandSparks)).toMatchObject({ kind: 'active', cooldown: 40, emberCost: 35, cost: 5, capstone: true });
    expect(getSkill(SKILL.ghostOfTheHearth)).toMatchObject({ kind: 'active', cooldown: 60, emberCost: 30, cost: 5, capstone: true });
    expect(getSkill(SKILL.flickerStrike)).toMatchObject({ kind: 'active', cooldown: 25, emberCost: 25, cost: 5, capstone: true });
    expect(warns.filter((w) => w.includes('ashblade'))).toEqual([]);
  });
});

/** The Ashblade with Act 3 begun, the book given and only the capstone `id` learned on top of the tier 1 to 4 skills. */
const asCapstone = (t: Booted, id: string) => {
  t.ctx.state.setFlag('story.gate.a3', true);
  t.ctx.state.setFlag('trainer.ashblade.masterBook', true);
  t.progression().setClass('ashblade');
  t.progression().grantSkillPoint(60, 'test');
  for (const sid of Object.values(SKILL)) {
    if (getSkill(sid)?.capstone && sid !== id) continue;
    t.progression().learn(sid);
  }
  expect(t.progression().learned(id)).toBe(true);
};
/** Runs until the player's dodge or other action is over. */
const untilIdle = (t: Booted) => {
  const c = () => t.ctx.world.avatar!.controller as unknown as { currentAction: string | null };
  for (let i = 0; i < 120 && c().currentAction !== null; i++) t.run(1);
  t.run(1);
};
const world0 = (t: Booted) => t.world.spawn.z;
const playerFeet = (t: Booted) => ({ x: t.ctx.player.feet.x, y: t.ctx.player.feet.y, z: t.ctx.player.feet.z });
const near = (t: Booted, e: { id: string }) => {
  const a = t.ctx.actors.get(e.id)!;
  const v = new THREE.Vector3();
  a.worldPosition(v);
  const f = playerFeet(t);
  return Math.hypot(v.x - f.x, v.z - f.z);
};

describe('ashblade capstones plugin: Death by a Thousand Sparks on the real pipeline', () => {
  it('hops to the foes, strikes 12 times for 0.6x, spends 35 Ember, starts the cooldown and ends after 3 s', async () => {
    const t = await boot();
    asCapstone(t, SKILL.deathByAThousandSparks);
    const a = t.enemy(-4, 0, 0);
    const b = t.enemy(-6, 0, 4);
    const spells = t.ctx.services.require('spells');
    const ember = spells.ember;
    const start = playerFeet(t);
    expect(t.use(SKILL.deathByAThousandSparks)).toEqual({ ok: true });
    expect(spells.ember).toBe(ember - THOUSAND_SPARKS.emberCost);
    expect(t.use(SKILL.deathByAThousandSparks)).toMatchObject({ ok: false, reason: 'cooldown' });
    expect(a.health).toBeLessThan(a.maxHealth);
    t.run(Math.round(THOUSAND_SPARKS.seconds * 60) + 6);
    const dealt = a.maxHealth - a.health + (b.maxHealth - b.health);
    expect(dealt).toBeCloseTo(12 * THOUSAND_SPARKS.damage, 3);
    expect(Math.hypot(playerFeet(t).x - start.x, playerFeet(t).z - start.z)).toBeGreaterThan(1);
    expect(Math.min(near(t, a), near(t, b))).toBeLessThan(3);
  });

  it('the Ashblade cannot be hurt during the flurry and can be afterwards', async () => {
    const t = await boot();
    asCapstone(t, SKILL.deathByAThousandSparks);
    t.enemy(-4);
    const player = t.ctx.actors.player;
    t.use(SKILL.deathByAThousandSparks);
    t.run(30);
    const before = player.health;
    t.ctx.damage.apply({ attackerId: 'foe-x', targetId: 'player', amount: 20, poise: 0, kind: 'melee', attackId: 'x' });
    expect(player.health).toBe(before);
    t.run(Math.round(THOUSAND_SPARKS.seconds * 60));
    t.ctx.damage.apply({ attackerId: 'foe-x', targetId: 'player', amount: 20, poise: 0, kind: 'melee', attackId: 'y' });
    expect(player.health).toBeLessThan(before);
  });

  it('is refused with no hostile within 10 m, spending nothing and starting no cooldown', async () => {
    const t = await boot();
    asCapstone(t, SKILL.deathByAThousandSparks);
    t.enemy(-12);
    const spells = t.ctx.services.require('spells');
    const ember = spells.ember;
    expect(t.use(SKILL.deathByAThousandSparks)).toMatchObject({ ok: false, reason: 'handler-failed', detail: 'no-target' });
    expect(spells.ember).toBe(ember);
    t.enemy(-5);
    expect(t.use(SKILL.deathByAThousandSparks)).toEqual({ ok: true });
  });

  it('never strikes a foe in a mercy state', async () => {
    const t = await boot();
    asCapstone(t, SKILL.deathByAThousandSparks);
    const calm = t.enemy(-3);
    calm.mercyState = () => 'yielding';
    const ok = t.enemy(-6, 0, 3);
    t.use(SKILL.deathByAThousandSparks);
    t.run(200);
    expect(calm.health).toBe(calm.maxHealth);
    expect(ok.health).toBeLessThan(ok.maxHealth);
  });

  it('ends on the player\'s death, a class change, a load and dispose, releasing the invulnerability', async () => {
    for (const how of ['death', 'class', 'load', 'dispose'] as const) {
      const t = await boot();
      asCapstone(t, SKILL.deathByAThousandSparks);
      const e = t.enemy(-4);
      t.use(SKILL.deathByAThousandSparks);
      t.run(5);
      const hits = e.maxHealth - e.health;
      if (how === 'death') t.ctx.events.emit('actor.died', { actorId: 'player', killerId: null, kind: 'player', team: 'player', level: 1, spawnTag: undefined } as never);
      if (how === 'class') t.ctx.events.emit('class.changed', { classId: 'warden', previous: 'ashblade', free: true, cost: 0 });
      if (how === 'load') t.ctx.events.emit('save.loaded', { slot: 'a' });
      if (how === 'dispose') t.game.dispose();
      t.run(60);
      expect(e.maxHealth - e.health, how).toBe(hits);
      if (how !== 'dispose' && how !== 'death') {
        const p = t.ctx.actors.player.health;
        t.ctx.damage.apply({ attackerId: 'foe-x', targetId: 'player', amount: 5, poise: 0, kind: 'melee', attackId: 'z' });
        expect(t.ctx.actors.player.health, how).toBeLessThan(p);
      }
    }
  });

  it('lands only where the open area is: with every landing outside it the cast is refused and nothing is spent', async () => {
    const t = await boot();
    asCapstone(t, SKILL.deathByAThousandSparks);
    t.enemy(-4);
    const start = playerFeet(t);
    t.ctx.services.provide('containment' as never, { isOpen: (x: number, z: number) => Math.hypot(x - start.x, z - start.z) < 2 } as never);
    const spells = t.ctx.services.require('spells');
    const ember = spells.ember;
    expect(t.use(SKILL.deathByAThousandSparks)).toMatchObject({ ok: false, reason: 'handler-failed', detail: 'no-spot' });
    expect(spells.ember).toBe(ember);
  });

  it('never lands inside an interior the cast did not begin in', async () => {
    const t = await boot();
    asCapstone(t, SKILL.deathByAThousandSparks);
    // The foe faces the player, so 'behind it' (z -3.7) is inside the hall: the landing falls back to the player's side of it.
    const e = t.enemy(-2.5, Math.PI);
    t.ctx.services.provide('interiors' as never, { current: null, interiorAt: (p: { z: number }) => (p.z < world0(t) - 3 ? 'hall' : null) } as never);
    t.use(SKILL.deathByAThousandSparks);
    t.run(200);
    expect(e.health).toBeLessThan(e.maxHealth);
    expect(playerFeet(t).z).toBeGreaterThanOrEqual(world0(t) - 3);
  });

  it('is refused in another class', async () => {
    const t = await boot();
    asCapstone(t, SKILL.deathByAThousandSparks);
    t.enemy(-4);
    t.progression().setClass('warden');
    expect(t.ctx.services.require('abilities').use(t.slotOf(SKILL.deathByAThousandSparks))).toMatchObject({ ok: false });
  });
});

describe('ashblade capstones plugin: Ghost of the Hearth with the real perception hub and damage pipeline', () => {
  const rig = async () => {
    const t = await boot();
    const hub = new PerceptionHub(() => {});
    const enemies: Record<string, unknown> = { perception: hub };
    t.ctx.services.provide('enemies' as never, enemies as never);
    const scales = new Map<string, number>();
    t.ctx.services.provide('stealth' as never, { addNoiseScale: (s: string, v: number) => (scales.set(s, v), () => void scales.delete(s)) } as never);
    asCapstone(t, SKILL.ghostOfTheHearth);
    const pose = (state: string) => () => ({ state, feet: { x: 0, y: 0, z: 0 }, yaw: 0, observerOnly: false }) as never;
    /** What an unalerted watcher 6 m ahead of it, looking at the player, perceives right now. */
    const watcher = (state = 'patrol') =>
      perceive({
        selfFeet: { x: 0, y: 0, z: 0 },
        selfYaw: 0,
        targetFeet: { x: 0, y: 0, z: -6 },
        targetAlive: true,
        targetLoud: false,
        damagedBy: false,
        lineOfSight: () => true,
        modifiers: hub.combined('player', pose(state)),
      });
    return { t, hub, enemies, scales, pose, watcher };
  };

  it('blinds and deafens unalerted watchers, spends 30 Ember, and an alerted foe still sees', async () => {
    const { t, hub, scales, watcher } = await rig();
    expect(watcher().sees).toBe(true);
    const spells = t.ctx.services.require('spells');
    const ember = spells.ember;
    expect(t.use(SKILL.ghostOfTheHearth)).toEqual({ ok: true });
    expect(spells.ember).toBe(ember - GHOST_OF_THE_HEARTH.emberCost);
    expect(t.use(SKILL.ghostOfTheHearth)).toMatchObject({ ok: false, reason: 'cooldown' });
    expect(scales.get(GHOST_OF_THE_HEARTH.noiseSource)).toBe(0);
    expect(hub.size).toBe(1);
    expect(watcher()).toMatchObject({ sees: false, hears: false, notices: false });
    expect(watcher('chase').sees).toBe(true);
  });

  it('ends at 12 s and an unalerted watcher then perceives the player as before (no permanent invisibility)', async () => {
    const { t, hub, scales, watcher } = await rig();
    const before = watcher();
    t.use(SKILL.ghostOfTheHearth);
    t.run(Math.round(GHOST_OF_THE_HEARTH.seconds * 60) - 10);
    expect(hub.size).toBe(1);
    expect(watcher().sees).toBe(false);
    t.run(20);
    expect(hub.size).toBe(0);
    expect(scales.has(GHOST_OF_THE_HEARTH.noiseSource)).toBe(false);
    expect(watcher()).toEqual(before);
    expect(watcher().sees).toBe(true);
  });

  it('the first blow on a foe that is not a boss deals its whole health, and the Ghost is spent', async () => {
    const { t, hub, scales } = await rig();
    const e = t.enemy(-3);
    const other = t.enemy(-3, 0, 3);
    t.use(SKILL.ghostOfTheHearth);
    t.run(30);
    hit(t, e.id);
    expect(e.dead).toBe(true);
    expect(hub.size).toBe(0);
    expect(scales.has(GHOST_OF_THE_HEARTH.noiseSource)).toBe(false);
    hit(t, other.id);
    expect(other.health).toBeCloseTo(other.maxHealth - 10);
  });

  it('a foe the enemies service says can yield is left at 1 HP with its poise broken (the Brain then yields it)', async () => {
    const { t, hub, enemies } = await rig();
    Object.assign(enemies, {
      mercyUnlocked: (v: string) => v === 'spare',
      ground: { get: (id: string) => ({ def: { mercy: { when: id === e.id ? 'yielding' : 'calming' } } }) },
    });
    const e = t.enemy(-3);
    t.use(SKILL.ghostOfTheHearth);
    t.run(30);
    hit(t, e.id);
    expect(e.dead).toBe(false);
    expect(e.health).toBe(1);
    expect(e.poise).toBe(0);
    expect(hub.size).toBe(0);
  });

  it('a foe whose def does not yield dies of the Ghost strike', async () => {
    const { t, enemies } = await rig();
    Object.assign(enemies, { mercyUnlocked: () => true, ground: { get: () => ({ def: { mercy: { when: 'calming' } } }) } });
    const e = t.enemy(-3);
    t.use(SKILL.ghostOfTheHearth);
    t.run(30);
    hit(t, e.id);
    expect(e.dead).toBe(true);
  });

  it('a foe in a mercy state is not struck down, and the Ghost stays', async () => {
    const { t, hub } = await rig();
    const e = t.enemy(-3);
    e.mercyState = () => 'yielding';
    t.use(SKILL.ghostOfTheHearth);
    t.run(30);
    hit(t, e.id);
    expect(e.health).toBeCloseTo(e.maxHealth - 10);
    expect(hub.size).toBe(1);
  });

  it('the first real attack makes the player seen at once, and the swing keeps its strike', async () => {
    const { t, hub, scales, watcher } = await rig();
    const e = t.enemy(-0.8);
    t.use(SKILL.ghostOfTheHearth);
    t.run(30);
    expect(watcher().sees).toBe(false);
    t.press('Digit1');
    t.run(3);
    t.release('Digit1');
    expect(hub.size).toBe(0);
    expect(scales.has(GHOST_OF_THE_HEARTH.noiseSource)).toBe(false);
    expect(watcher().sees).toBe(true);
    hit(t, e.id);
    expect(e.dead).toBe(true);
  });

  it('using another skill ends it, with no strike afterwards', async () => {
    const { t, hub } = await rig();
    const e = t.enemy(-3);
    t.use(SKILL.ghostOfTheHearth);
    t.run(30);
    t.ctx.events.emit('ability.used', { skillId: SKILL.cinderMark, slot: 1 });
    expect(hub.size).toBe(0);
    hit(t, e.id);
    expect(e.health).toBeCloseTo(e.maxHealth - 10);
  });

  it('ends on a load, a class change and the player\'s death, and dispose releases a live provider', async () => {
    for (const how of ['load', 'class', 'death', 'dispose'] as const) {
      const { t, hub, scales } = await rig();
      t.use(SKILL.ghostOfTheHearth);
      expect(hub.size).toBe(1);
      if (how === 'load') t.ctx.events.emit('save.loaded', { slot: 'a' });
      if (how === 'class') t.ctx.events.emit('class.changed', { classId: 'warden', previous: 'ashblade', free: true, cost: 0 });
      if (how === 'death') t.ctx.events.emit('actor.died', { actorId: 'player', killerId: null, kind: 'player', team: 'player', level: 1, spawnTag: undefined } as never);
      if (how === 'dispose') t.game.dispose();
      expect(hub.size, how).toBe(0);
      expect(scales.has(GHOST_OF_THE_HEARTH.noiseSource), how).toBe(false);
    }
  });

  it('the shimmer attaches to the avatar at a zero offset: a non-zero root is not counted twice', async () => {
    const { t } = await rig();
    const seen: Array<{ id: string; t: any }> = [];
    t.ctx.services.provide('vfx' as never, { spawnEffect: (id: string, tr: unknown) => (seen.push({ id, t: tr }), { stop: () => {} }) } as never);
    t.world.avatar!.root.position.set(100, 5, -200);
    t.world.avatar!.root.updateMatrixWorld(true);
    t.use(SKILL.ghostOfTheHearth);
    const shimmer = seen.find((s) => s.id === GHOST_OF_THE_HEARTH.effectId)!;
    expect(shimmer.t.attach).toBe(t.ctx.actors.player.root);
    expect(shimmer.t.position).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('refuses with neither the stealth nor the perception service, spending nothing', async () => {
    const t = await boot();
    asCapstone(t, SKILL.ghostOfTheHearth);
    const spells = t.ctx.services.require('spells');
    const ember = spells.ember;
    expect(t.use(SKILL.ghostOfTheHearth)).toMatchObject({ ok: false, reason: 'handler-failed', detail: 'no-stealth' });
    expect(spells.ember).toBe(ember);
  });
});

describe('ashblade capstones plugin: Flicker Strike on the real pipeline', () => {
  it('dashes 6 m ahead, hits the foes it passes once for 1.2x, spends 25 Ember and starts the cooldown', async () => {
    const t = await boot();
    asCapstone(t, SKILL.flickerStrike);
    const a = t.enemy(-2.5, Math.PI);
    const b = t.enemy(-4.5, Math.PI, 0.3);
    const side = t.enemy(-3, Math.PI, 4);
    const calm = t.enemy(-3.5, Math.PI);
    calm.mercyState = () => 'yielding';
    const spells = t.ctx.services.require('spells');
    const ember = spells.ember;
    const start = playerFeet(t);
    expect(t.use(SKILL.flickerStrike)).toEqual({ ok: true });
    expect(spells.ember).toBe(ember - FLICKER_STRIKE.emberCost);
    expect(t.use(SKILL.flickerStrike)).toMatchObject({ ok: false, reason: 'cooldown' });
    t.run(30);
    expect(a.maxHealth - a.health).toBeCloseTo(FLICKER_STRIKE.damage, 3);
    expect(b.maxHealth - b.health).toBeCloseTo(FLICKER_STRIKE.damage, 3);
    expect(side.health).toBe(side.maxHealth);
    expect(calm.health).toBe(calm.maxHealth);
    const moved = Math.hypot(playerFeet(t).x - start.x, playerFeet(t).z - start.z);
    expect(moved).toBeGreaterThan(4);
    expect(moved).toBeLessThan(7);
  });

  it('is invulnerable during the dash', async () => {
    const t = await boot();
    asCapstone(t, SKILL.flickerStrike);
    t.enemy(-3);
    const player = t.ctx.actors.player;
    t.use(SKILL.flickerStrike);
    t.run(3);
    const before = player.health;
    t.ctx.damage.apply({ attackerId: 'foe-x', targetId: 'player', amount: 20, poise: 0, kind: 'melee', attackId: 'x' });
    expect(player.health).toBe(before);
    t.run(40);
    t.ctx.damage.apply({ attackerId: 'foe-x', targetId: 'player', amount: 20, poise: 0, kind: 'melee', attackId: 'y' });
    expect(player.health).toBeLessThan(before);
  });

  it('never leaves the open area: with the edge 2 m ahead the dash stops there', async () => {
    const t = await boot();
    asCapstone(t, SKILL.flickerStrike);
    const z0 = playerFeet(t).z;
    t.ctx.services.provide('containment' as never, { isOpen: (_x: number, z: number) => z > z0 - 2.2 } as never);
    t.use(SKILL.flickerStrike);
    t.run(40);
    expect(playerFeet(t).z).toBeGreaterThan(z0 - 2.2);
    expect(z0 - playerFeet(t).z).toBeGreaterThan(1);
  });

  it('a dodge within 1.5 s of a dash that hit dashes again once the dodge is over (alongside it); a dash that hit nothing leaves the dodge alone', async () => {
    const t = await boot();
    asCapstone(t, SKILL.flickerStrike);
    const a = t.enemy(-3, Math.PI);
    const second = t.enemy(-12, Math.PI);
    t.use(SKILL.flickerStrike);
    t.run(30);
    expect(a.health).toBeLessThan(a.maxHealth);
    expect(second.health).toBe(second.maxHealth);
    dodge(t);
    untilIdle(t);
    const afterDodge = playerFeet(t);
    t.run(25);
    // The second dash: 6 m on top of the dodge, and it reached the second foe (the dodge ran backwards, away from it).
    const moved = Math.hypot(playerFeet(t).x - afterDodge.x, playerFeet(t).z - afterDodge.z);
    expect(moved).toBeGreaterThan(5);
    expect(moved).toBeLessThan(7);

    const u = await boot();
    asCapstone(u, SKILL.flickerStrike);
    u.use(SKILL.flickerStrike);
    u.run(30);
    dodge(u);
    untilIdle(u);
    const still = playerFeet(u);
    u.run(25);
    expect(Math.hypot(playerFeet(u).x - still.x, playerFeet(u).z - still.z)).toBeLessThan(0.5);
  });

  it('a dodge after the 1.5 s window dashes no more', async () => {
    const t = await boot();
    asCapstone(t, SKILL.flickerStrike);
    t.enemy(-3, Math.PI);
    t.use(SKILL.flickerStrike);
    t.run(30 + 90);
    dodge(t);
    untilIdle(t);
    const still = playerFeet(t);
    t.run(25);
    expect(Math.hypot(playerFeet(t).x - still.x, playerFeet(t).z - still.z)).toBeLessThan(0.5);
  });

  it('a class change ends the chain: the next dodge is only a dodge', async () => {
    const t = await boot();
    asCapstone(t, SKILL.flickerStrike);
    const a = t.enemy(-3, Math.PI);
    t.use(SKILL.flickerStrike);
    t.run(30);
    expect(a.health).toBeLessThan(a.maxHealth);
    t.ctx.events.emit('class.changed', { classId: 'warden', previous: 'ashblade', free: true, cost: 0 });
    dodge(t);
    untilIdle(t);
    const still = playerFeet(t);
    t.run(25);
    expect(Math.hypot(playerFeet(t).x - still.x, playerFeet(t).z - still.z)).toBeLessThan(0.5);
  });
});

describe('ashblade capstones plugin: set-up twice and teardown', () => {
  it('setup called twice disposes the first run instead of throwing on the duplicate modifier id', async () => {
    const t = await boot();
    expect(() => {
      ashbladeCapstonesPlugin.setup(t.ctx);
      ashbladeCapstonesPlugin.setup(t.ctx);
    }).not.toThrow();
    ashbladeCapstonesPlugin.dispose?.();
  });

  it('dispose releases the modifier id and the system', async () => {
    const t = await boot();
    expect(t.ctx.systems.order('afterCombat')).toContain('ashblade.capstones.fixed');
    t.game.dispose();
    const off = t.ctx.damage.addModifier(GHOST_OF_THE_HEARTH.modifierId, () => undefined);
    off();
  });
});
