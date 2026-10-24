import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { KnightAvatar } from '../../characters/KnightAvatar';
import corePlugin from '../../core/core.plugin';
import { Game } from '../../core/Game';
import { MoveModifiers } from '../../core/MoveModifiers';
import type { PluginModule } from '../../core/plugins';
import { StealthEffects } from '../../stealth/hooks';
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
import { origin } from '../../vfx/effects';
import ashbladePlugin from './ashblade.plugin';
import { SKILL, TWIN_FANGS } from './tuning';

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

const plugins = [corePlugin, progressionPlugin, inventoryPlugin, combatVerbsPlugin, spellsPlugin, classesPlugin, ashbladePlugin];
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
  const asAshblade = (points = 6) => {
    progression().setClass('ashblade');
    progression().grantSkillPoint(points, 'test');
  };
  /** A hostile `z` metres ahead whose root faces `yaw` (root forward is -Z). */
  const enemy = (z: number, yaw = 0, x = 0) => {
    const root = new THREE.Object3D();
    root.position.set(world.spawn.x + x, world.spawn.y, world.spawn.z + z);
    root.rotation.y = yaw;
    scene.add(root);
    root.updateMatrixWorld(true);
    return ctx.actors.spawn({ kind: 'ash-wraith', team: 'hostile', maxHealth: 200, maxPoise: 20, root });
  };
  return { game, ctx, world, statuses, run, press, release, progression, asAshblade, enemy };
}


type Booted = Awaited<ReturnType<typeof boot>>;

const SLICE = 'Dualwield_Melee_Attack_Slice';
const learnTier3 = (t: Booted, ...ids: string[]) => {
  t.asAshblade(30);
  for (const id of [SKILL.backSlit, SKILL.bleedingEmber, SKILL.quietSoles, SKILL.ashCloud, SKILL.sparkDodge, ...ids]) {
    t.progression().learn(id);
  }
};
const hit = (t: Booted, target: string, over: Record<string, unknown> = {}) =>
  t.ctx.damage.apply({ attackerId: 'player', targetId: target, amount: 10, poise: 10, kind: 'melee', attackId: SLICE, swingId: 1, direction: new THREE.Vector3(0, 0, 1), ...over });

describe('ashblade tier 3 plugin: Twin Fangs on the real damage pipeline', () => {
  it('splits attack 1 into two 0.6x hits 0.12 s apart on the same target', async () => {
    const t = await boot();
    learnTier3(t, SKILL.twinFangs);
    expect(t.progression().learned(SKILL.twinFangs)).toBe(true);
    const e = t.enemy(-3, 0);
    const events: number[] = [];
    t.ctx.events.on('damage.dealt', (r) => void (r.targetId === e.id && events.push(r.dealt)));
    hit(t, e.id);
    expect(e.health).toBeCloseTo(e.maxHealth - 6);
    t.run(6);
    expect(e.health).toBeCloseTo(e.maxHealth - 6);
    t.run(2);
    expect(e.health).toBeCloseTo(e.maxHealth - 12);
    expect(events).toEqual([6, 6]);
  });

  it('does not touch the other attacks, and does nothing unlearned or in another class', async () => {
    const t = await boot();
    learnTier3(t);
    const e = t.enemy(-3, 0);
    hit(t, e.id);
    t.run(10);
    expect(e.health).toBeCloseTo(e.maxHealth - 10);
    learnTier3(t, SKILL.twinFangs);
    hit(t, e.id, { attackId: 'Dualwield_Melee_Attack_Chop' });
    t.run(10);
    expect(e.health).toBeCloseTo(e.maxHealth - 20);
    t.progression().setClass('warden');
    hit(t, e.id);
    t.run(10);
    expect(e.health).toBeCloseTo(e.maxHealth - 30);
  });

  it('skips the second hit when the first was blocked (immune) and on a foe that turned to a mercy state', async () => {
    const t = await boot();
    learnTier3(t, SKILL.twinFangs);
    const a = t.enemy(-3, 0);
    a.invulnerable = true;
    hit(t, a.id);
    a.invulnerable = false;
    t.run(10);
    expect(a.health).toBe(a.maxHealth);
    const b = t.enemy(-5, 0, 2);
    hit(t, b.id);
    b.mercyState = () => 'yielding';
    t.run(10);
    expect(b.health).toBeCloseTo(b.maxHealth - 6);
  });

  it('a respec between the hits drops the second one', async () => {
    const t = await boot();
    learnTier3(t, SKILL.twinFangs);
    const e = t.enemy(-3, 0);
    hit(t, e.id);
    const release = t.progression().allowRespec('test');
    expect(t.progression().respec().ok).toBe(true);
    release();
    t.run(10);
    expect(e.health).toBeCloseTo(e.maxHealth - 6);
  });
});

describe('ashblade tier 3 plugin: set-up twice and teardown', () => {
  it('dispose releases the modifier id and the systems, and a second Game loads cleanly', async () => {
    const t = await boot();
    expect(t.statuses.find((s) => s.id === 'ashblade')?.state).toBe('ok');
    expect(t.ctx.systems.order('intent')).toContain('ashblade.tier3.intent');
    expect(t.ctx.systems.order('rules')).toContain('ashblade.tier3.rules');
    t.game.dispose();
    const off = t.ctx.damage.addModifier('ashblade-twin-fangs', () => undefined);
    off();
    const again = await boot();
    expect(again.statuses.find((s) => s.id === 'ashblade')?.state).toBe('ok');
    learnTier3(again, SKILL.twinFangs);
    const e = again.enemy(-3, 0);
    hit(again, e.id);
    again.run(10);
    expect(e.health).toBeCloseTo(e.maxHealth - 12);
    expect(TWIN_FANGS.delaySeconds).toBe(0.12);
  });
});

describe('ashblade tier 3 plugin: Soot Cloak with the real stealth hooks', () => {
  it('a dodge cloaks while learned, an attack ends it, and a respec releases it', async () => {
    const fx = new StealthEffects();
    const t = await boot();
    t.ctx.services.provide('stealth' as never, fx as never);
    learnTier3(t, SKILL.sootCloak);
    t.run(2);
    t.press('KeyN');
    t.run(2);
    t.release('KeyN');
    expect(fx.blockers().length).toBe(1);
    const e = t.enemy(-3, 0);
    hit(t, e.id);
    expect(fx.blockers()).toEqual([]);
  });

  it('the cloak effect attaches at a zero offset: at the player, not twice the player position', async () => {
    const t = await boot();
    const seen: Array<{ id: string; t: any }> = [];
    t.ctx.services.provide('vfx' as never, { spawnEffect: (id: string, tr: unknown) => (seen.push({ id, t: tr }), { stop: () => {} }) } as never);
    t.ctx.services.provide('stealth' as never, new StealthEffects() as never);
    learnTier3(t, SKILL.sootCloak);
    t.run(2);
    t.world.avatar!.root.position.set(100, 5, -200);
    t.world.avatar!.root.updateMatrixWorld(true);
    t.press('KeyN');
    t.run(2);
    const cloak = seen.find((s) => s.id === 'soot-cloak')!;
    expect(cloak.t.attach).toBe(t.world.avatar!.root);
    const o = origin(cloak.t);
    const at = new THREE.Vector3();
    t.world.avatar!.root.getWorldPosition(at);
    expect([o.x, o.y, o.z]).toEqual(at.toArray());
    expect(Math.abs(o.x - 100)).toBeLessThan(1);
    expect(Math.abs(o.z + 200)).toBeLessThan(1);
  });

  it('does nothing in another class', async () => {
    const fx = new StealthEffects();
    const t = await boot();
    t.ctx.services.provide('stealth' as never, fx as never);
    learnTier3(t, SKILL.sootCloak);
    t.progression().setClass('warden');
    t.run(2);
    t.press('KeyN');
    t.run(3);
    expect(fx.blockers()).toEqual([]);
  });
});

describe('ashblade tier 3 plugin: resets and set-up twice', () => {
  it('a save load or the player\'s death drops a queued second hit, the cloak and a kick hold', async () => {
    for (const how of ['load', 'death'] as const) {
      const fx = new StealthEffects();
      const t = await boot();
      t.ctx.services.provide('stealth' as never, fx as never);
      learnTier3(t, SKILL.twinFangs, SKILL.sootCloak);
      t.run(2);
      t.press('KeyN');
      t.run(2);
      t.release('KeyN');
      expect(fx.blockers().length).toBe(1);
      const e = t.enemy(-3, 0);
      hit(t, e.id);
      expect(fx.blockers()).toEqual([]);
      if (how === 'load') t.ctx.events.emit('save.loaded', { slot: 'a' });
      else t.ctx.events.emit('actor.died', { actorId: t.ctx.actors.player.id, killerId: null, kind: 'player', team: 'player', level: 1, spawnTag: undefined } as never);
      t.run(10);
      expect(e.health).toBeCloseTo(e.maxHealth - 6);
    }
  });

  it('a death elsewhere does not reset the cloak', async () => {
    const fx = new StealthEffects();
    const t = await boot();
    t.ctx.services.provide('stealth' as never, fx as never);
    learnTier3(t, SKILL.sootCloak);
    t.run(2);
    t.press('KeyN');
    t.run(2);
    t.release('KeyN');
    t.ctx.events.emit('actor.died', { actorId: 'someone-else', killerId: null, kind: 'x', team: 'hostile', level: 1, spawnTag: undefined } as never);
    expect(fx.blockers().length).toBe(1);
  });

  it('a respec releases a live cloak', async () => {
    const fx = new StealthEffects();
    const t = await boot();
    t.ctx.services.provide('stealth' as never, fx as never);
    learnTier3(t, SKILL.sootCloak);
    t.run(2);
    t.press('KeyN');
    t.run(2);
    t.release('KeyN');
    expect(fx.blockers().length).toBe(1);
    const release = t.progression().allowRespec('test');
    expect(t.progression().respec().ok).toBe(true);
    release();
    t.run(2);
    expect(fx.blockers()).toEqual([]);
  });

  it('reports the Back-Slit trigger for the first hit only, though the second hit is doubled again', async () => {
    const t = await boot();
    const triggers: string[] = [];
    const abilities = t.ctx.services.require('abilities') as { reportTrigger?(id: string): boolean };
    (vi.spyOn(abilities as any, 'reportTrigger') as any).mockImplementation((id: string) => (triggers.push(id), true));
    learnTier3(t, SKILL.twinFangs);
    const e = t.enemy(-3, 0);
    hit(t, e.id, { direction: new THREE.Vector3(0, 0, -1) });
    t.run(10);
    expect(e.health).toBeCloseTo(e.maxHealth - 24);
    expect(triggers.filter((i) => i === SKILL.backSlit)).toHaveLength(1);
  });

  it('setup called twice on the same context disposes the first run instead of throwing on duplicate ids', async () => {
    const t = await boot();
    expect(() => {
      ashbladePlugin.setup(t.ctx);
      ashbladePlugin.setup(t.ctx);
    }).not.toThrow();
    learnTier3(t, SKILL.twinFangs);
    const e = t.enemy(-3, 0);
    hit(t, e.id);
    t.run(10);
    expect(e.health).toBeCloseTo(e.maxHealth - 12);
    ashbladePlugin.dispose?.();
  });
});
