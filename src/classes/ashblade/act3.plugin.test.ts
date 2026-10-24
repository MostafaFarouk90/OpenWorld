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
import ashbladePlugin from './ashblade.plugin';
import { CINDER_MARK, DECOY_FOOTPRINTS, PHOENIX_ROLL, SKILL } from './tuning';

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

const plugins = [corePlugin, statusPlugin, progressionPlugin, inventoryPlugin, combatVerbsPlugin, spellsPlugin, classesPlugin, ashbladePlugin, ashbladeAct3Plugin];
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
const BEHIND = new THREE.Vector3(0, 0, -1);
const dodge = (t: Booted) => {
  t.run(2);
  t.press('KeyN');
  t.run(2);
  t.release('KeyN');
};
const ignite = (t: Booted, id = 'test.fire') => t.ctx.services.require('status').apply('player', { id, kind: 'ignite', dps: 0, seconds: 30, sourceId: 'foe-x' });

describe('ashblade act 3 plugin: boot and bar', () => {
  it('boots clean and puts the tier 4 skills on the bar with their cooldown and Ember cost', async () => {
    const t = await boot();
    expect(t.statuses.find((s) => s.id === 'ashblade-act3')?.state).toBe('ok');
    t.asMaster();
    for (const id of [SKILL.cinderMark, SKILL.decoyFootprints, SKILL.phoenixRoll]) expect(t.progression().learned(id)).toBe(true);
    expect(t.slotOf(SKILL.cinderMark)).toBeGreaterThanOrEqual(0);
    expect(t.slotOf(SKILL.decoyFootprints)).toBeGreaterThanOrEqual(0);
    expect(warns.filter((w) => w.includes('ashblade'))).toEqual([]);
  });
});

describe('ashblade act 3 plugin: Cinder Mark on the real damage pipeline', () => {
  it('marks the foe ahead, spends 15 Ember, starts the 15 s cooldown, and hits on it deal x1.5', async () => {
    const t = await boot();
    t.asMaster();
    const e = t.enemy(-5);
    const spells = t.ctx.services.require('spells');
    const ember = spells.ember;
    expect(t.use(SKILL.cinderMark)).toEqual({ ok: true });
    expect(spells.ember).toBe(ember - CINDER_MARK.emberCost);
    expect(t.use(SKILL.cinderMark)).toMatchObject({ ok: false, reason: 'cooldown' });
    hit(t, e.id);
    expect(e.health).toBeCloseTo(e.maxHealth - 15);
    hit(t, e.id, { kind: 'spell', attackId: 'x' });
    expect(e.health).toBeCloseTo(e.maxHealth - 30);
    const other = t.enemy(-5, 0, 3);
    hit(t, other.id);
    expect(other.health).toBeCloseTo(other.maxHealth - 10);
  });

  it('a back stab on a marked foe is 3x (Back-Slit 2x, then the mark 1.5x)', async () => {
    const t = await boot();
    t.asMaster();
    const e = t.enemy(-5, 0);
    expect(t.use(SKILL.cinderMark)).toEqual({ ok: true });
    hit(t, e.id, { direction: BEHIND });
    expect(e.health).toBeCloseTo(e.maxHealth - 30);
  });

  it('refuses with no foe in front, spending nothing and starting no cooldown', async () => {
    const t = await boot();
    t.asMaster();
    t.enemy(8, 0);
    const spells = t.ctx.services.require('spells');
    const ember = spells.ember;
    expect(t.use(SKILL.cinderMark)).toMatchObject({ ok: false, reason: 'handler-failed', detail: 'no-target' });
    expect(spells.ember).toBe(ember);
    t.enemy(-4);
    expect(t.use(SKILL.cinderMark)).toEqual({ ok: true });
  });

  it('can mark a boss-sized foe, and ends when the mark dies or despawns', async () => {
    const t = await boot();
    t.asMaster();
    const boss = t.enemy(-5, 0, 0, 'boss');
    t.use(SKILL.cinderMark);
    hit(t, boss.id);
    expect(boss.health).toBeCloseTo(boss.maxHealth - 15);
    t.ctx.actors.despawn(boss.id);
    const next = t.enemy(-5);
    hit(t, next.id);
    expect(next.health).toBeCloseTo(next.maxHealth - 10);
  });

  it('ends on a mercy state, a calm event, a class change, a load and the player\'s death', async () => {
    for (const how of ['mercy', 'calm', 'class', 'load', 'death', 'respec'] as const) {
      const t = await boot();
      t.asMaster();
      const e = t.enemy(-5);
      t.use(SKILL.cinderMark);
      if (how === 'mercy') e.mercyState = () => 'yielding';
      if (how === 'calm') t.ctx.events.emit('ai.calm', { actorId: e.id });
      if (how === 'class') {
        t.progression().setClass('warden');
        t.ctx.events.emit('class.changed', { classId: 'warden', previous: 'ashblade', free: true, cost: 0 });
      }
      if (how === 'load') t.ctx.events.emit('save.loaded', { slot: 'a' });
      if (how === 'death') t.ctx.events.emit('actor.died', { actorId: 'player', killerId: null, kind: 'player', team: 'player', level: 1, spawnTag: undefined } as never);
      if (how === 'respec') {
        const release = t.progression().allowRespec('test');
        t.progression().respec();
        release();
      }
      t.run(2);
      if (how === 'class') t.progression().setClass('ashblade');
      e.mercyState = undefined;
      hit(t, e.id);
      expect(e.health, how).toBeCloseTo(e.maxHealth - 10);
    }
  });

  it('expires after 10 s', async () => {
    const t = await boot();
    t.asMaster();
    const e = t.enemy(-5);
    t.use(SKILL.cinderMark);
    t.run(Math.round(CINDER_MARK.seconds * 60) + 2);
    hit(t, e.id);
    expect(e.health).toBeCloseTo(e.maxHealth - 10);
  });

  it('is refused in another class', async () => {
    const t = await boot();
    t.asMaster();
    t.enemy(-5);
    t.progression().setClass('warden');
    const slot = t.slotOf(SKILL.cinderMark);
    expect(t.ctx.services.require('abilities').use(slot)).toMatchObject({ ok: false });
  });
});

describe('ashblade act 3 plugin: Decoy Footprints with the real perception hub', () => {
  const rig = async () => {
    const t = await boot();
    const hub = new PerceptionHub(() => {});
    t.ctx.services.provide('enemies' as never, { perception: hub } as never);
    const scales = new Map<string, number>();
    t.ctx.services.provide('stealth' as never, { addNoiseScale: (s: string, v: number) => (scales.set(s, v), () => void scales.delete(s)) } as never);
    t.asMaster();
    const pose = (state: string) => () => ({ state, feet: { x: 0, y: 0, z: 0 }, yaw: 0, observerOnly: false }) as never;
    return { t, hub, scales, pose };
  };

  it('silences noise and cuts sight to 60% for unalerted watchers only, then lets go after 6 s', async () => {
    const { t, hub, scales, pose } = await rig();
    expect(t.use(SKILL.decoyFootprints)).toEqual({ ok: true });
    expect(scales.get(DECOY_FOOTPRINTS.noiseSource)).toBe(0);
    expect(hub.combined('player', pose('patrol'))?.sightRangeScale).toBeCloseTo(0.6);
    expect(hub.combined('player', pose('idle'))?.sightRangeScale).toBeCloseTo(0.6);
    for (const s of ['notice', 'chase', 'attack']) expect(hub.combined('player', pose(s)), s).toBeNull();
    t.run(Math.round(DECOY_FOOTPRINTS.seconds * 60) + 2);
    expect(scales.has(DECOY_FOOTPRINTS.noiseSource)).toBe(false);
    expect(hub.size).toBe(0);
    expect(hub.combined('player', pose('patrol'))).toBeNull();
  });

  it('releases both on a load, a class change and the player\'s death', async () => {
    for (const how of ['load', 'class', 'death'] as const) {
      const { t, hub, scales } = await rig();
      t.use(SKILL.decoyFootprints);
      expect(hub.size).toBe(1);
      if (how === 'load') t.ctx.events.emit('save.loaded', { slot: 'a' });
      if (how === 'class') t.ctx.events.emit('class.changed', { classId: 'warden', previous: 'ashblade', free: true, cost: 0 });
      if (how === 'death') t.ctx.events.emit('actor.died', { actorId: 'player', killerId: null, kind: 'player', team: 'player', level: 1, spawnTag: undefined } as never);
      expect(hub.size, how).toBe(0);
      expect(scales.has(DECOY_FOOTPRINTS.noiseSource), how).toBe(false);
    }
  });

  it('a class change seen only by the per-tick check (no event) releases the provider', async () => {
    const { t, hub } = await rig();
    t.use(SKILL.decoyFootprints);
    t.progression().setClass('warden');
    t.run(2);
    expect(hub.size).toBe(0);
  });

  it('dispose releases a live provider', async () => {
    const { t, hub } = await rig();
    t.use(SKILL.decoyFootprints);
    expect(hub.size).toBe(1);
    t.game.dispose();
    expect(hub.size).toBe(0);
  });

  it('refuses with neither the stealth nor the perception service', async () => {
    const t = await boot();
    t.asMaster();
    expect(t.use(SKILL.decoyFootprints)).toMatchObject({ ok: false, reason: 'handler-failed', detail: 'no-stealth' });
  });
});

describe('ashblade act 3 plugin: Phoenix Roll with the real status service', () => {
  it('a dodge while ignited clears every ignite entry and the patch burns a foe inside, without touching Burn, Scars or max health', async () => {
    const t = await boot();
    t.asMaster();
    const spells = t.ctx.services.require('spells') as unknown as { burn: number; scars: number; addBurn(n: number, source: string): void };
    spells.addBurn(30, 'test');
    const player = t.ctx.actors.player;
    const before = { burn: spells.burn, scars: spells.scars, max: player.maxHealth };
    const status = t.ctx.services.require('status');
    ignite(t, 'a.fire');
    ignite(t, 'b.fire');
    expect(status.list('player').filter((s) => s.kind === 'ignite')).toHaveLength(2);
    const near = t.enemy(0, 0, 1);
    const far = t.enemy(0, 0, 9);
    dodge(t);
    expect(status.list('player').filter((s) => s.kind === 'ignite')).toEqual([]);
    expect(spells.burn).toBeCloseTo(before.burn, 0);
    expect(spells.scars).toBe(before.scars);
    expect(player.maxHealth).toBe(before.max);
    t.run(40);
    expect(near.health).toBeLessThan(near.maxHealth);
    expect(status.list(near.id).some((s) => s.id === PHOENIX_ROLL.igniteId && s.kind === 'ignite')).toBe(true);
    expect(far.health).toBe(far.maxHealth);
    expect(spells.burn).toBeCloseTo(before.burn, 0);
    expect(spells.scars).toBe(before.scars);
    expect(player.maxHealth).toBe(before.max);
  });

  it('does nothing when not ignited: no patch, no damage', async () => {
    const t = await boot();
    t.asMaster();
    const near = t.enemy(0, 0, 1);
    dodge(t);
    t.run(80);
    expect(near.health).toBe(near.maxHealth);
  });

  it('does nothing in another class or unlearned', async () => {
    const t = await boot();
    t.asMaster();
    const near = t.enemy(0, 0, 1);
    t.progression().setClass('warden');
    ignite(t);
    dodge(t);
    t.run(80);
    expect(near.health).toBe(near.maxHealth);
    expect(t.ctx.services.require('status').list('player').some((s) => s.kind === 'ignite')).toBe(true);
  });

  it('a foe in a mercy state is not burnt', async () => {
    const t = await boot();
    t.asMaster();
    const near = t.enemy(0, 0, 1);
    near.mercyState = () => 'yielding';
    ignite(t);
    dodge(t);
    t.run(80);
    expect(near.health).toBe(near.maxHealth);
  });
});

describe('ashblade act 3 plugin: set-up twice and teardown', () => {
  it('setup called twice disposes the first run instead of throwing on the duplicate modifier id', async () => {
    const t = await boot();
    expect(() => {
      ashbladeAct3Plugin.setup(t.ctx);
      ashbladeAct3Plugin.setup(t.ctx);
    }).not.toThrow();
    ashbladeAct3Plugin.dispose?.();
  });

  it('dispose releases the modifier id and the system', async () => {
    const t = await boot();
    expect(t.ctx.systems.order('afterCombat')).toContain('ashblade.act3.fixed');
    t.game.dispose();
    const off = t.ctx.damage.addModifier(CINDER_MARK.modifierId, () => undefined);
    off();
  });
});
