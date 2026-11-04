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
import { getSkill, resetClassSkills, SKILLS } from '../../progression/skills';
import spellsPlugin from '../../spells/spells.plugin';
import statusPlugin from '../../status/status.plugin';
import { TerrainColliders } from '../../world/TerrainColliders';
import { World } from '../../world/World';
import knightAct3Plugin from './act3.plugin';
import knightCapstonesPlugin from './capstones.plugin';
import knightTier3Plugin from './knight.tier3.plugin';
import { TRIAL_FLOOR_ID, TRIAL_TUNING } from '../../companions/trials';
import { HEARTSHARD_SMITE, SKILL_IDS, SUNFORGE, UNBROKEN_OATH } from './tuning';

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

const plugins = [corePlugin, statusPlugin, progressionPlugin, inventoryPlugin, combatVerbsPlugin, spellsPlugin, knightTier3Plugin, knightAct3Plugin, knightCapstonesPlugin];
const modules = (list = plugins): Record<string, PluginModule> => Object.fromEntries(list.map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }]));

async function boot(opts: { tutorialDone?: boolean } = {}) {
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
  // With the tutorial open the player's Second Wind is armed, which is what the Oath is tested against.
  ctx.state.setFlag('tutorial.complete', opts.tutorialDone ?? false);
  const statuses = await game.loadPlugins(modules());
  const avatar = new KnightAvatar({ model: cloneSkinned(gltf.scene), clips: gltf.animations, sword: null, shield: null }, { warn: () => {} });
  world.setAvatar(avatar);
  game.attachAvatar(avatar);
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  run(2);
  const progression = () => ctx.services.require('progression');
  /** The Knight with Act 3 begun, the master's book given, tiers 1 to 4 learned and ONE capstone (one per character). */
  const asMaster = (capstone: string = 'knight.unbrokenOath') => {
    ctx.state.setFlag('story.gate.a3', true);
    ctx.state.setFlag('trainer.knight.masterBook', true);
    progression().setClass('knight');
    progression().grantSkillPoint(60, 'test');
    for (const s of SKILLS.filter((d) => d.id.startsWith('knight.') && d.tier < 5).sort((a, b) => a.tier - b.tier)) progression().learn(s.id);
    progression().learn(capstone);
  };
  const slotOf = (id: string) => progression().bar().indexOf(id);
  const use = (id: string) => {
    if (slotOf(id) < 0) progression().assign(0, id);
    return ctx.services.require('abilities').use(slotOf(id));
  };
  const foe = (x: number, z: number, extra: Record<string, unknown> = {}) => {
    const root = new THREE.Object3D();
    root.position.set(world.spawn.x + x, world.spawn.y, world.spawn.z + z);
    scene.add(root);
    root.updateMatrixWorld(true);
    return ctx.actors.spawn({ kind: 'blighted-soldier', team: 'hostile', maxHealth: 200, maxPoise: 20, root, ...extra });
  };
  return { game, ctx, world, avatar, statuses, run, progression, asMaster, slotOf, use, foe };
}
type Booted = Awaited<ReturnType<typeof boot>>;

const lethal = (t: Booted, kind: 'melee' | 'script' | 'fall' = 'melee') => {
  const f = t.foe(8, 8);
  return t.ctx.damage.apply({ attackerId: kind === 'script' ? null : f.id, targetId: t.ctx.actors.player.id, amount: 9999, kind });
};
const saves = (t: Booted): string[] => {
  const ids: string[] = [];
  t.ctx.events.on('actor.saved', (e) => ids.push(e.handlerId));
  return ids;
};

describe('knight capstones plugin: boot, rows and bar', () => {
  it('boots clean, registers its id and puts the capstones on the bar with their cooldown and cost', async () => {
    const t = await boot();
    expect(knightCapstonesPlugin.id).toBe('knight-capstones');
    expect(knightCapstonesPlugin.dependsOn).toContain('knight-act3');
    expect(t.statuses.find((s) => s.id === 'knight-capstones')?.state).toBe('ok');
    t.asMaster();
    expect(t.progression().learned(SKILL_IDS.unbrokenOath)).toBe(true);
    expect(t.progression().assign(0, SKILL_IDS.unbrokenOath)).toBe(true);
    // one capstone per character: a second is refused
    expect(t.progression().learn(SKILL_IDS.bannerOfTheSunforge).ok).toBe(false);
    expect(getSkill(SKILL_IDS.unbrokenOath)).toMatchObject({ kind: 'active', tier: 5, cooldown: 60, emberCost: 30, cost: 5 });
    expect(getSkill(SKILL_IDS.bannerOfTheSunforge)).toMatchObject({ kind: 'active', tier: 5, cooldown: 60, emberCost: 30, cost: 5 });
    expect(getSkill(SKILL_IDS.heartshardSmite)).toMatchObject({ kind: 'passive', tier: 5, cost: 5 });
    expect(warns.filter((w) => w.includes('knight'))).toEqual([]);
  });

  it('a second setup disposes the first: nothing doubled, no duplicate-id error', async () => {
    const t = await boot();
    t.asMaster();
    expect(() => knightCapstonesPlugin.setup(t.ctx)).not.toThrow();
    expect(() => knightCapstonesPlugin.setup(t.ctx)).not.toThrow();
    t.ctx.services.require('spells').restoreEmber(100);
    t.progression().assign(0, SKILL_IDS.unbrokenOath);
    expect(t.use(SKILL_IDS.unbrokenOath)).toEqual({ ok: true });
  });
});

describe('knight capstones plugin: Unbroken Oath', () => {
  it('spends 30 Ember and starts the 60 s cooldown on ok only; a refusal costs nothing', async () => {
    const t = await boot();
    const spells = t.ctx.services.require('spells');
    t.asMaster();
    spells.restoreEmber(100);
    const e0 = spells.ember;
    expect(t.use(SKILL_IDS.unbrokenOath)).toEqual({ ok: true });
    expect(spells.ember).toBe(e0 - 30);
    const again = t.use(SKILL_IDS.unbrokenOath);
    expect(again.ok).toBe(false);
    expect(spells.ember).toBe(e0 - 30);
  });

  it('a lethal hit leaves 1 HP and the Oath, not Second Wind, saves it; when it ends Second Wind is still there', async () => {
    const t = await boot();
    t.asMaster();
    t.ctx.services.require('spells').restoreEmber(100);
    const ids = saves(t);
    expect(t.use(SKILL_IDS.unbrokenOath)).toEqual({ ok: true });
    const p = t.ctx.actors.player;
    const res = lethal(t);
    expect(res?.killed).toBe(false);
    expect(p.dead).toBe(false);
    expect(p.health).toBe(1);
    expect(ids).toEqual([UNBROKEN_OATH.handlerId]);
    // 8 s later the Oath is down; a lethal hit is now Second Wind's to answer, which was not spent.
    t.run(Math.ceil((UNBROKEN_OATH.seconds + 0.5) * 60));
    p.health = p.maxHealth;
    const res2 = lethal(t);
    expect(res2?.killed).toBe(false);
    expect(ids).toEqual([UNBROKEN_OATH.handlerId, 'second-wind']);
  });

  it('the Oath sits after the trial duel floor (-150): a running trial floor answers first, so its break still scores; Second Wind (-100) stays behind', async () => {
    expect(UNBROKEN_OATH.handlerOrder).toBeGreaterThan(TRIAL_TUNING.floorOrder);
    expect(UNBROKEN_OATH.handlerOrder).toBeLessThan(-100);
    const t = await boot();
    t.asMaster();
    t.ctx.services.require('spells').restoreEmber(100);
    const floor = vi.fn((target: { health: number }) => ((target.health = 1), true));
    const off = t.ctx.damage.addLethalHandler(TRIAL_FLOOR_ID, floor as never, TRIAL_TUNING.floorOrder);
    const ids = saves(t);
    expect(t.use(SKILL_IDS.unbrokenOath)).toEqual({ ok: true });
    lethal(t);
    expect(floor).toHaveBeenCalledTimes(1);
    expect(ids).toEqual([TRIAL_FLOOR_ID]);
    off();
    lethal(t);
    expect(ids).toEqual([TRIAL_FLOOR_ID, UNBROKEN_OATH.handlerId]);
  });

  it('is not refused while blocking or flinching (no busy gate), only when dead or staggered', async () => {
    const t = await boot();
    t.asMaster();
    t.ctx.services.require('spells').restoreEmber(100);
    const verbs = t.ctx.services.require('combatVerbs') as unknown as { busy: boolean };
    const spy = vi.spyOn(verbs, 'busy', 'get').mockReturnValue(true);
    const action = vi.spyOn(t.ctx.player.avatar!.controller as unknown as { currentAction: string | null }, 'currentAction', 'get').mockReturnValue('block');
    expect(t.use(SKILL_IDS.unbrokenOath)).toEqual({ ok: true });
    spy.mockRestore();
    action.mockRestore();
  });

  it('a script death kills through the Oath (Second Wind is off in this boot)', async () => {
    const t = await boot({ tutorialDone: true });
    t.asMaster();
    t.ctx.services.require('spells').restoreEmber(100);
    t.use(SKILL_IDS.unbrokenOath);
    const res = lethal(t, 'script');
    expect(res?.killed).toBe(true);
    expect(t.ctx.actors.player.dead).toBe(true);
  });

  it('a bleed tick at 1 HP stays at 1 while the Oath holds', async () => {
    const t = await boot({ tutorialDone: true });
    t.asMaster();
    t.ctx.services.require('spells').restoreEmber(100);
    t.use(SKILL_IDS.unbrokenOath);
    const p = t.ctx.actors.player;
    p.health = 1;
    t.ctx.services.require('status').apply(p.id, { id: 't.bleed', kind: 'bleed', dps: 20, seconds: 2, sourceId: null });
    t.run(90);
    expect(p.dead).toBe(false);
    expect(p.health).toBe(1);
  });

  it('death, a class change and a load each end it', async () => {
    for (const end of [
      (t: Booted) => t.ctx.events.emit('class.changed', { classId: 'warden', previous: 'knight' } as never),
      (t: Booted) => t.ctx.events.emit('save.loaded', {} as never),
    ]) {
      const t = await boot({ tutorialDone: true });
      t.asMaster();
      t.ctx.services.require('spells').restoreEmber(100);
      t.use(SKILL_IDS.unbrokenOath);
      end(t);
      const res = lethal(t);
      expect(res?.killed).toBe(true);
    }
  });
});

describe('knight capstones plugin: Heartshard Smite', () => {
  const reach = (t: Booted): number => {
    const a = t.avatar;
    a.weapon.updateWorldMatrix(true, true);
    return new THREE.Vector3().setFromMatrixPosition(a.weaponHilt.matrixWorld).distanceTo(new THREE.Vector3().setFromMatrixPosition(a.weaponTip.matrixWorld));
  };

  it('the Knight\'s real sword is 5 m long for 8 s after the Surge is released, then back', async () => {
    const t = await boot();
    t.asMaster(SKILL_IDS.heartshardSmite);
    const before = reach(t);
    expect(before).toBeGreaterThan(0.3);
    expect(before).toBeLessThan(2);
    const scale = t.avatar.weapon.scale.clone();
    t.ctx.events.emit('spell.released', { casterId: t.ctx.actors.player.id, spellId: HEARTSHARD_SMITE.surgeSpellId });
    expect(reach(t)).toBeCloseTo(5, 4);
    t.run(Math.floor(7.5 * 60));
    expect(reach(t)).toBeCloseTo(5, 4);
    t.run(Math.ceil(1 * 60));
    expect(reach(t)).toBeCloseTo(before, 4);
    expect(t.avatar.weapon.scale.toArray()).toEqual(scale.toArray());
  });

  it('a second Surge restarts the 8 s and never scales twice', async () => {
    const t = await boot();
    t.asMaster(SKILL_IDS.heartshardSmite);
    const emit = () => t.ctx.events.emit('spell.released', { casterId: t.ctx.actors.player.id, spellId: HEARTSHARD_SMITE.surgeSpellId });
    emit();
    t.run(6 * 60);
    emit();
    expect(reach(t)).toBeCloseTo(5, 4);
    t.run(6 * 60);
    expect(reach(t)).toBeCloseTo(5, 4);
    t.run(3 * 60);
    expect(reach(t)).toBeLessThan(2);
  });

  it('a melee hit deals 1.5x as fire during the Smite and ignites; the same hit later is plain', async () => {
    const t = await boot();
    t.asMaster(SKILL_IDS.heartshardSmite);
    const f = t.foe(3, 0);
    const hit = () => t.ctx.damage.apply({ attackerId: t.ctx.actors.player.id, targetId: f.id, amount: 10, poise: 0, kind: 'melee' });
    expect(hit()?.dealt).toBe(10);
    t.ctx.events.emit('spell.released', { casterId: t.ctx.actors.player.id, spellId: HEARTSHARD_SMITE.surgeSpellId });
    const r = hit();
    expect(r?.dealt).toBeCloseTo(15);
    expect(r?.element).toBe('fire');
    t.run(2);
    expect(t.ctx.services.require('status').list(f.id).some((s) => s.id === HEARTSHARD_SMITE.igniteId && s.kind === 'ignite')).toBe(true);
    t.run(9 * 60);
    expect(hit()?.dealt).toBe(10);
  });

  it('a foe in a mercy state is not ignited', async () => {
    const t = await boot();
    t.asMaster(SKILL_IDS.heartshardSmite);
    const f = t.foe(3, 0);
    t.ctx.events.emit('spell.released', { casterId: t.ctx.actors.player.id, spellId: HEARTSHARD_SMITE.surgeSpellId });
    (f as any).mercyState = () => 'yielding';
    t.ctx.damage.apply({ attackerId: t.ctx.actors.player.id, targetId: f.id, amount: 10, poise: 0, kind: 'melee' });
    t.run(2);
    expect(t.ctx.services.require('status').list(f.id)).toEqual([]);
  });

  it('death, a class change, a load and an avatar swap restore the blade', async () => {
    for (const end of [
      (t: Booted) => { t.ctx.actors.player.health = 0; t.ctx.damage.kill(t.ctx.actors.player.id, null); },
      (t: Booted) => t.ctx.events.emit('class.changed', { classId: 'warden', previous: 'knight' } as never),
      (t: Booted) => t.ctx.events.emit('save.loaded', {} as never),
      (t: Booted) => t.ctx.events.emit('player.avatar', { classId: 'warden', previous: 'knight' } as never),
    ]) {
      const t = await boot({ tutorialDone: true });
      t.asMaster(SKILL_IDS.heartshardSmite);
      const before = reach(t);
      t.ctx.events.emit('spell.released', { casterId: t.ctx.actors.player.id, spellId: HEARTSHARD_SMITE.surgeSpellId });
      expect(reach(t)).toBeCloseTo(5, 4);
      end(t);
      expect(reach(t)).toBeCloseTo(before, 4);
    }
  });

  it('another class\'s Surge does nothing, and so does a Knight who has not learned it', async () => {
    const t = await boot();
    const before = reach(t);
    t.ctx.events.emit('spell.released', { casterId: t.ctx.actors.player.id, spellId: HEARTSHARD_SMITE.surgeSpellId });
    expect(reach(t)).toBeCloseTo(before, 6);
    t.asMaster(SKILL_IDS.heartshardSmite);
    t.ctx.events.emit('spell.released', { casterId: 'someone-else', spellId: HEARTSHARD_SMITE.surgeSpellId });
    t.ctx.events.emit('spell.released', { casterId: t.ctx.actors.player.id, spellId: 'rally-cry' });
    expect(reach(t)).toBeCloseTo(before, 6);
  });

  it('the blade effect is attached to the weapon with a zero offset', async () => {
    const t = await boot();
    t.asMaster(SKILL_IDS.heartshardSmite);
    const vfx = t.ctx.services.get('vfx') as any;
    const spy = vfx ? vi.spyOn(vfx, 'spawnEffect') : null;
    t.ctx.events.emit('spell.released', { casterId: t.ctx.actors.player.id, spellId: HEARTSHARD_SMITE.surgeSpellId });
    if (spy) {
      const call = spy.mock.calls.find((c) => c[0] === HEARTSHARD_SMITE.fx);
      expect(call?.[1]).toMatchObject({ position: { x: 0, y: 0, z: 0 }, attach: t.avatar.weapon });
    }
  });
});

describe('knight capstones plugin: Banner of the Sunforge', () => {
  it('plants a 20 m banner for 30 Ember, replacing any banner; a normal Banner Plant afterwards is 8 m again', async () => {
    const t = await boot();
    t.asMaster(SKILL_IDS.bannerOfTheSunforge);
    const spells = t.ctx.services.require('spells');
    spells.restoreEmber(100);
    expect(t.use('knight.bannerPlant')).toEqual({ ok: true });
    expect(spells.bannerInfo()?.radius).toBe(8);
    const e0 = spells.ember;
    expect(t.use(SKILL_IDS.bannerOfTheSunforge)).toEqual({ ok: true });
    expect(spells.ember).toBe(e0 - SUNFORGE.emberCost);
    expect(spells.bannerInfo()?.radius).toBe(20);
    // the pulse carries the 20 m radius (Hearthfire Ward heals on it)
    const radii: number[] = [];
    t.ctx.events.on('banner.pulse', (e) => radii.push(e.radius));
    t.run(3 * 60 + 5);
    expect(radii[0]).toBe(20);
    spells.plantBanner();
    expect(spells.bannerInfo()?.radius).toBe(8);
  });

  it('doubles Ember regeneration only while the feet are within 20 m of the great banner', async () => {
    const t = await boot();
    t.asMaster(SKILL_IDS.bannerOfTheSunforge);
    const spells = t.ctx.services.require('spells');
    spells.restoreEmber(100);
    t.use(SKILL_IDS.bannerOfTheSunforge);
    const regenOver = (seconds: number): number => {
      spells.spendEmber(spells.ember); // empty, delay restarts
      t.run(2 * 60 + 5); // wait out the 2 s delay
      const a = spells.ember;
      t.run(seconds * 60);
      return spells.ember - a;
    };
    const inside = regenOver(5);
    const f = t.ctx.player.feet;
    const banner = spells.bannerInfo()!;
    // walk out: stand 20.5 m from the banner (a margin past the edge)
    t.ctx.player.teleport({ x: banner.position.x + 20.5 + 0.5, y: f.y, z: banner.position.z }, 0);
    t.run(5);
    expect(Math.hypot(t.ctx.player.feet.x - banner.position.x, t.ctx.player.feet.z - banner.position.z)).toBeGreaterThan(20.4);
    const outside = regenOver(5);
    expect(inside).toBeGreaterThan(outside * 1.8);
    expect(inside).toBeLessThan(outside * 2.2);
  });

  it('regeneration is not doubled by a normal 8 m banner', async () => {
    const t = await boot();
    t.asMaster(SKILL_IDS.bannerOfTheSunforge);
    const spells = t.ctx.services.require('spells');
    spells.restoreEmber(100);
    t.use('knight.bannerPlant');
    const measure = () => {
      spells.spendEmber(spells.ember);
      t.run(125);
      const a = spells.ember;
      t.run(5 * 60);
      return spells.ember - a;
    };
    const plain = measure();
    spells.plantBanner({ radius: 20 });
    const great = measure();
    expect(great).toBeGreaterThan(plain * 1.8);
    spells.plantBanner();
    expect(measure()).toBeCloseTo(plain, 1);
  });

  it('refuses when dead, spending nothing and planting nothing', async () => {
    const t = await boot({ tutorialDone: true });
    t.asMaster(SKILL_IDS.bannerOfTheSunforge);
    const spells = t.ctx.services.require('spells');
    spells.restoreEmber(100);
    t.ctx.damage.kill(t.ctx.actors.player.id, null);
    const e0 = spells.ember;
    const r = t.use(SKILL_IDS.bannerOfTheSunforge);
    expect(r.ok).toBe(false);
    expect(spells.ember).toBe(e0);
    expect(spells.bannerInfo()).toBeNull();
  });

  it('refuses when not learned (the Knight has no capstone), spending nothing', async () => {
    const t = await boot();
    const spells = t.ctx.services.require('spells');
    const e0 = spells.ember;
    t.progression().setClass('knight');
    const r = t.ctx.services.require('abilities').use(0);
    expect(r.ok).toBe(false);
    expect(spells.ember).toBe(e0);
    expect(spells.bannerInfo()).toBeNull();
  });
});

describe('knight capstones plugin: dispose', () => {
  it('dispose removes the lethal handler, the modifier and the regen multiplier', async () => {
    const t = await boot({ tutorialDone: true });
    t.asMaster();
    t.ctx.services.require('spells').restoreEmber(100);
    t.use(SKILL_IDS.unbrokenOath);
    knightCapstonesPlugin.dispose?.();
    const res = lethal(t);
    expect(res?.killed).toBe(true);
  });
});
