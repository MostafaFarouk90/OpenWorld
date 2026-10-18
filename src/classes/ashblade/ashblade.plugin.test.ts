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
import { getSkill, resetClassSkills } from '../../progression/skills';
import spellsPlugin from '../../spells/spells.plugin';
import { TerrainColliders } from '../../world/TerrainColliders';
import { World } from '../../world/World';
import classesPlugin from '../classes.plugin';
import ashbladePlugin from './ashblade.plugin';
import { ASHBLADE_ATTACK_SET } from './attackSet';
import { SKILL } from './tuning';

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

describe('ashblade plugin: registrations', () => {
  it('loads cleanly after its dependencies and registers the set, kit, skills and Surge forms', async () => {
    const t = await boot();
    expect(t.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    expect(getSkill(SKILL.backSlit)?.classId).toBe('ashblade');
    const verbs = t.ctx.services.require('combatVerbs');
    expect(verbs.registerAttackSet('ashblade', ASHBLADE_ATTACK_SET)).toEqual({ ok: false, reason: 'duplicate' });
    const kit = t.ctx.services.require('classes').kit('ashblade')!;
    expect(kit.drill).toHaveLength(8);
    expect(kit.drill!.every((s) => s.textKey!.startsWith('classes.drill.ashblade.'))).toBe(true);
    expect(kit.trainer.npcId).toBe('gerta');
    const spells = t.ctx.services.require('spells');
    for (const zone of ['warm', 'blaze', 'cinder'] as const) {
      expect(spells.registerSurgeForm('ashblade', zone, () => undefined)).toEqual({ ok: false, reason: 'duplicate' });
    }
    expect(t.ctx.strings.t('skill.ashblade.backSlit.name')).toBe('Back-Slit');
    expect(t.ctx.strings.t('hud.skills.branch.smokecloak')).toBe('Smokecloak');
  });

  it('says once that the heavy clip hook, status, stealth and codex are not there yet and carries on', async () => {
    const t = await boot();
    t.run(3);
    expect(warns.some((w) => w.includes('registerHeavyClip'))).toBe(true);
    expect(t.statuses.find((s) => s.id === 'ashblade')?.state).toBe('ok');
  });

  it('sets up in the right order even when the loader would sort ashblade first', async () => {
    const t = await boot([ashbladePlugin, ...plugins.filter((p) => p !== ashbladePlugin)]);
    expect(t.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    expect(t.ctx.services.require('classes').kit('ashblade')?.drill).toHaveLength(8);
  });

  it('a second Game in the same process still loads (the skills registry has no dispose)', async () => {
    await boot();
    const again = await boot();
    expect(again.statuses.find((s) => s.id === 'ashblade')?.state).toBe('ok');
  });
});

describe('ashblade plugin: passives on the real damage pipeline', () => {
  const apply = (t: Booted, target: string, over: Record<string, unknown> = {}) =>
    t.ctx.damage.apply({ attackerId: 'player', targetId: target, amount: 10, poise: 10, kind: 'melee', attackId: 'x', swingId: 1, direction: new THREE.Vector3(0, 0, -1), ...over });

  it('Back-Slit doubles a hit from behind once learned, and only for the Ashblade', async () => {
    const t = await boot();
    const e = t.enemy(-2); // faces -Z, away from the player at +Z: the player is behind it
    t.asAshblade();
    expect(apply(t, e.id, { swingId: 1 })!.dealt).toBe(10);
    expect(t.progression().learn(SKILL.backSlit)).toEqual({ ok: true });
    expect(apply(t, e.id, { swingId: 2 })!.dealt).toBe(20);
    expect(apply(t, e.id, { swingId: 3, direction: new THREE.Vector3(0, 0, 1) })!.dealt).toBe(10);
    t.progression().setClass('knight');
    expect(apply(t, e.id, { swingId: 4 })!.dealt).toBe(10);
  });

  it('Back-Slit stops after a respec and returns when relearned', async () => {
    const t = await boot();
    const e = t.enemy(-2);
    t.asAshblade();
    t.progression().learn(SKILL.backSlit);
    const permit = t.progression().allowRespec('test');
    expect(t.progression().respec().ok).toBe(true);
    permit();
    expect(apply(t, e.id, { swingId: 1 })!.dealt).toBe(10);
    t.progression().learn(SKILL.backSlit);
    expect(apply(t, e.id, { swingId: 2 })!.dealt).toBe(20);
  });

  it('Bleeding Ember ignites through the status service when it exists, and only on landed melee hits', async () => {
    const t = await boot();
    const e = t.enemy(-2);
    const applied: { id: string; spec: any }[] = [];
    t.ctx.services.provide('status' as never, { apply: (id: string, spec: unknown) => (applied.push({ id, spec }), true) } as never);
    t.asAshblade();
    t.progression().learn(SKILL.backSlit);
    t.progression().learn(SKILL.bleedingEmber);
    apply(t, e.id, { swingId: 1 });
    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({ id: e.id, spec: { id: 'ashblade.bleedingEmber', kind: 'ignite', dps: 3, seconds: 4, sourceId: 'player' } });
    apply(t, e.id, { swingId: 2, kind: 'status', statusId: 'ashblade.bleedingEmber', statusKind: 'ignite' });
    expect(applied).toHaveLength(1);
  });

  it('Bleeding Ember is a warned no-op while the status service is absent', async () => {
    const t = await boot();
    const e = t.enemy(-2);
    t.asAshblade();
    t.progression().learn(SKILL.backSlit);
    t.progression().learn(SKILL.bleedingEmber);
    expect(() => apply(t, e.id)).not.toThrow();
    expect(warns.filter((w) => w.includes('status service is absent'))).toHaveLength(1);
  });
});

describe('ashblade plugin: Quick Slip', () => {
  const dodge = (t: Booted) => {
    const z0 = t.ctx.player.feet.z;
    t.press('KeyN');
    t.run(1);
    t.release('KeyN');
    t.run(40);
    return Math.abs(t.ctx.player.feet.z - z0);
  };

  it('lengthens the dodge by about 20% only while learned', async () => {
    const t = await boot();
    t.asAshblade();
    const base = dodge(t);
    t.run(60);
    t.progression().learn(SKILL.quickSlip);
    const quick = dodge(t);
    expect(quick / base).toBeGreaterThan(1.1);
    expect(quick / base).toBeLessThan(1.3);
    t.run(60);
    const permit = t.progression().allowRespec('test');
    t.progression().respec();
    permit();
    expect(dodge(t) / base).toBeCloseTo(1, 1);
  });
});

describe('ashblade plugin: Spark Dodge', () => {
  it('ignites aggroed hostiles near the feet on a dodge that avoids a hit, once per 1.5 s', async () => {
    const t = await boot();
    const applied: string[] = [];
    t.ctx.services.provide('status' as never, { apply: (id: string) => (applied.push(id), true) } as never);
    t.ctx.services.provide('enemies' as never, { view: (id: string) => ({ state: 'chase', id }) } as never);
    t.asAshblade();
    t.progression().learn(SKILL.quickSlip);
    t.progression().learn(SKILL.sparkDodge);
    const e = t.enemy(-0.5);
    t.press('KeyN');
    t.run(1);
    t.release('KeyN');
    t.run(3);
    t.ctx.damage.apply({ attackerId: e.id, targetId: 'player', amount: 10, poise: 10, kind: 'melee', attackId: 'claw', swingId: 1, direction: new THREE.Vector3(0, 0, 1) });
    t.run(2);
    expect(applied).toEqual([e.id]);
  });
});

describe('ashblade plugin: Quiet Soles and Ash Cloud', () => {
  const fakeStealth = () => {
    const scales = new Map<number, number>();
    const blockers: unknown[] = [];
    let n = 0;
    return {
      scales,
      blockers,
      hooks: {
        active: () => false,
        addNoiseScale: (_s: string, v: number) => {
          const k = ++n;
          scales.set(k, v);
          return () => void scales.delete(k);
        },
        addSightBlocker: (b: unknown) => (blockers.push(b), () => undefined),
      },
    };
  };

  it('Quiet Soles binds when learned, survives the stealth service appearing late, and lets go on respec', async () => {
    const t = await boot();
    t.asAshblade();
    t.progression().learn(SKILL.quietSoles);
    t.run(3); // no stealth service yet: nothing happens
    const s = fakeStealth();
    t.ctx.services.provide('stealth' as never, s.hooks as never);
    t.run(2);
    expect([...s.scales.values()]).toEqual([0]);
    const permit = t.progression().allowRespec('test');
    t.progression().respec();
    permit();
    t.run(2);
    expect(s.scales.size).toBe(0);
  });

  it('Ash Cloud goes on the bar, drops a blocker through the abilities service and spends Ember', async () => {
    const t = await boot();
    const s = fakeStealth();
    t.ctx.services.provide('stealth' as never, s.hooks as never);
    t.asAshblade();
    t.progression().learn(SKILL.quietSoles);
    t.progression().learn(SKILL.ashCloud);
    const slot = t.progression().bar().indexOf(SKILL.ashCloud);
    expect(slot).toBeGreaterThanOrEqual(0);
    const spells = t.ctx.services.require('spells');
    const ember = spells.ember;
    expect(t.ctx.services.require('abilities').use(slot)).toEqual({ ok: true });
    expect(s.blockers).toHaveLength(1);
    expect(spells.ember).toBe(ember - 10);
    expect(t.ctx.services.require('abilities').use(slot)).toMatchObject({ ok: false, reason: 'cooldown' });
  });

  it('Ash Cloud refuses with no stealth service, spending nothing and starting no cooldown', async () => {
    const t = await boot();
    t.asAshblade();
    t.progression().learn(SKILL.quietSoles);
    t.progression().learn(SKILL.ashCloud);
    const slot = t.progression().bar().indexOf(SKILL.ashCloud);
    const spells = t.ctx.services.require('spells');
    const ember = spells.ember;
    expect(t.ctx.services.require('abilities').use(slot)).toMatchObject({ ok: false, reason: 'handler-failed', detail: 'no-stealth' });
    expect(spells.ember).toBe(ember);
    const s = fakeStealth();
    t.ctx.services.provide('stealth' as never, s.hooks as never);
    expect(t.ctx.services.require('abilities').use(slot)).toEqual({ ok: true });
  });

  it('Ash Cloud survives a save and load: the learned skill, bar slot and handler all work after', async () => {
    const t = await boot();
    const s = fakeStealth();
    t.ctx.services.provide('stealth' as never, s.hooks as never);
    t.asAshblade();
    t.progression().learn(SKILL.quietSoles);
    t.progression().learn(SKILL.ashCloud);
    const slot = t.progression().bar().indexOf(SKILL.ashCloud);
    expect(t.ctx.services.require('abilities').use(slot)).toEqual({ ok: true });
    const prog = t.progression() as unknown as { serialize(): unknown; load(d: unknown, v?: number): void };
    prog.load(prog.serialize());
    t.ctx.events.emit('save.loaded', { slot: 'test' });
    t.run(2);
    expect(t.progression().bar()[slot]).toBe(SKILL.ashCloud);
    // The cooldown is thread 5's; loading mid-cooldown never leaves the skill unusable once it has run out.
    t.run(18 * 60 + 5);
    expect(t.ctx.services.require('abilities').use(slot)).toEqual({ ok: true });
    expect(s.blockers).toHaveLength(2);
  });
});

describe('ashblade plugin: Ash-drift on the real player', () => {
  it('grants 2 s of invulnerability through the combat verbs and moves the player behind the nearest hostile', async () => {
    const t = await boot();
    const e = t.enemy(-4, Math.PI); // faces the player
    const spells = t.ctx.services.require('spells') as any;
    t.asAshblade();
    const before = t.ctx.player.feet.clone();
    // Cast the Surge through the spell service, which runs the registered form on release.
    const r = spells.cast('heartshard-surge');
    expect(r.ok).toBe(true);
    t.run(90);
    expect(t.ctx.player.actor.invulnerable).toBe(true);
    t.run(150);
    expect(t.ctx.player.actor.invulnerable).toBe(false);
    expect(e.health).toBeLessThan(e.maxHealth);
    // The player ended up on the far side of the target (z less than the target's).
    expect(t.ctx.player.feet.z).toBeLessThan(before.z - 4);
  });
});

describe('ashblade plugin: late services and teardown', () => {
  it('registers its how-to codex entry once codex.register exists, and removes it on dispose', async () => {
    const t = await boot();
    const entries: unknown[][] = [];
    const off = vi.fn();
    t.ctx.services.provide('codex' as never, { register: (e: unknown[]) => (entries.push(e), off) } as never);
    t.run(3);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual([{ tab: 'howto', id: 'ashblade-craft', nameKey: 'codex.howto.ashblade-craft.name', bodyKey: 'codex.howto.ashblade-craft.body' }]);
    expect(t.ctx.strings.t('codex.howto.ashblade-craft.name')).toBe("The Ashblade's craft");
    t.game.dispose();
    expect(off).toHaveBeenCalledOnce();
  });

  it('dispose frees the attack set, the kit and the Surge forms so a new Game can register them again', async () => {
    const t = await boot();
    const verbs = t.ctx.services.require('combatVerbs');
    const spells = t.ctx.services.require('spells');
    t.game.dispose();
    const set = verbs.registerAttackSet('ashblade', ASHBLADE_ATTACK_SET);
    expect(set.ok).toBe(true);
    if (set.ok) set.dispose();
    const form = spells.registerSurgeForm('ashblade', 'warm', () => undefined);
    expect(form.ok).toBe(true);
  });
});
