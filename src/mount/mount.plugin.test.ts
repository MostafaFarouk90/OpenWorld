import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { PluginModule } from '../core/plugins';
import { KnightAvatar } from '../characters/KnightAvatar';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import combatVerbsPlugin from '../player/combatVerbs.plugin';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import mountPlugin from './mount.plugin';
import { MOUNT_PERSIST_KEY, type MountController } from './MountController';
import { MOUNT_TUNING as T } from './tuning';

const modules: Record<string, PluginModule> = {
  '/src/test/core.plugin.ts': { default: corePlugin },
  '/src/test/combatVerbs.plugin.ts': { default: combatVerbsPlugin },
  '/src/test/mount.plugin.ts': { default: mountPlugin },
};

let knightGltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] } | null = null;
async function readKnight() {
  if (knightGltf) return knightGltf;
  const fsModule = 'node:fs';
  const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as {
    readFileSync: (p: string) => Uint8Array & { buffer: ArrayBuffer; byteOffset: number; byteLength: number };
  };
  const file = readFileSync('public/assets/kaykit-adventurers/characters/Knight.glb');
  const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  knightGltf = await new Promise<any>((resolve, reject) => new GLTFLoader().parse(buf, '', resolve, reject));
  return knightGltf!;
}
const assets = {
  load: async (id: string) => {
    if (id !== 'knight') throw new Error(`asset "${id}" failed`);
    return readKnight();
  },
  instantiate: () => cloneSkinned(knightGltf!.scene),
  animations: () => knightGltf!.animations,
};

let physics: PhysicsWorld;
const games: { game: Game; world: World }[] = [];

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  for (const { game, world } of games.splice(0)) {
    game.dispose();
    world.dispose();
  }
  vi.restoreAllMocks();
});

interface Fakes {
  waystones: { hostileAggro: boolean; travelling: boolean };
  interiors: { current: string | null; transitioning: boolean };
  stealth: { on: boolean };
  chase: { on: boolean };
}

async function boot(opts: { stables?: boolean; flag?: boolean } = {}) {
  (globalThis as any).self ??= globalThis;
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
  const game = new Game({ scene, physics, world, input, moveModifiers, report: () => {}, assets: assets as never });
  games.push({ game, world });
  const ctx = game.ctx;
  const fakes: Fakes = {
    waystones: { hostileAggro: false, travelling: false },
    interiors: { current: null, transitioning: false },
    stealth: { on: false },
    chase: { on: false },
  };
  const provide = (name: string, v: unknown) => ctx.services.provide(name as never, v as never);
  provide('waystones', fakes.waystones);
  provide('interiors', fakes.interiors);
  provide('stealth', { active: () => fakes.stealth.on, suspicion: () => 0 });
  provide('chase', { active: () => fakes.chase.on });
  ctx.state.setFlag('tutorial.complete', true);
  if (opts.flag) ctx.state.setFlag(T.flag, true);
  const statuses = await game.loadPlugins(modules);
  const knight = await KnightAvatar.load(assets as never);
  world.setAvatar(knight);
  game.attachAvatar(knight);
  const events: { type: string; payload: any }[] = [];
  for (const type of ['mount.mounted', 'mount.dismounted', 'mount.summoned', 'hud.toast']) {
    (ctx.events as any).on(type, (payload: unknown) => events.push({ type, payload }));
  }
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  const key = (type: 'keydown' | 'keyup', code: string) =>
    win.dispatchEvent(Object.assign(new Event(type), { code, repeat: false, preventDefault: () => {} }));
  const press = (code: string) => {
    key('keydown', code);
    run(1);
    key('keyup', code);
    run(1);
  };
  const hold = (codes: string[], ticks: number) => {
    for (const c of codes) key('keydown', c);
    run(ticks);
    for (const c of codes) key('keyup', c);
  };
  run(30);
  const feet = () => ctx.player.feet.clone();
  if (opts.stables) {
    const f = feet();
    ctx.anchors.define({ id: T.stablesAnchor, position: { x: f.x + 2.5, y: f.y, z: f.z }, yaw: 0 });
  }
  const mount = () => ctx.services.get('mount') as unknown as MountController;
  const of = (type: string) => events.filter((e) => e.type === type).map((e) => e.payload);
  const toasts = () => of('hud.toast').map((p) => p.textKey);
  const award = () => ctx.state.setFlag(T.flag, true);
  const persist = () => ctx.persist.all().find((p) => p.key === MOUNT_PERSIST_KEY)!;
  const load = (data: unknown) => {
    persist().load(data, 1);
    ctx.events.emit('save.loaded', { slot: 'test' });
  };
  /** Award with the horse at the stables, then mount. */
  const ride = () => {
    award();
    press('KeyH');
    expect(mount().mounted()).toBe(true);
  };
  return { game, ctx, world, statuses, fakes, run, press, hold, feet, mount, of, toasts, award, persist, load, ride, events };
}

type T0 = Awaited<ReturnType<typeof boot>>;
const reasons = (t: T0) => t.of('mount.dismounted').map((p) => p.reason);

describe('the Ashmare on the real game', () => {
  it('sets up cleanly; H does nothing but say so before M10 awards the horse', async () => {
    const t = await boot();
    expect(t.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    expect(t.mount().stamina()).toBeNull();
    t.press('KeyH');
    expect(t.mount().mounted()).toBe(false);
    expect(t.toasts()).toContain('mount.refused.unavailable');
    expect(t.of('mount.summoned')).toEqual([]);
  });

  it('the award places the horse at the stables; H mounts, locks the rider verbs and reports stamina', async () => {
    const t = await boot({ stables: true });
    t.award();
    expect(t.toasts()).toContain('mount.awarded');
    t.press('KeyH');
    expect(t.mount().mounted()).toBe(true);
    expect(t.of('mount.mounted')).toEqual([{ mountId: 'ashmare' }]);
    expect(t.mount().stamina()).toEqual({ value: T.staminaMax, max: T.staminaMax });
    expect(t.ctx.input.actions.pressed('attack1')).toBe(false);
    expect(t.world.player.seated).toBe(true);
    // The rider sits on the saddle and a hit on the horse's body reaches the player.
    t.run(2);
    expect(t.ctx.player.avatar!.root.position.y).toBeGreaterThan(1.2);
    t.press('KeyH');
    expect(t.mount().mounted()).toBe(false);
    expect(reasons(t)).toEqual(['player']);
    expect(t.ctx.player.avatar!.root.position.y).toBe(0);
    expect(t.mount().stamina()).toBeNull();
    expect(t.world.player.seated).toBe(false);
  });

  it('gallops far faster than a sprint on the horse stamina, leaving the player stamina alone', async () => {
    const t = await boot({ stables: true });
    t.ride();
    const actor = t.ctx.player.actor;
    const before = actor.stamina;
    const f0 = t.feet();
    t.hold(['KeyW', 'ShiftLeft'], 240);
    const moved = Math.hypot(t.feet().x - f0.x, t.feet().z - f0.z);
    expect(moved).toBeGreaterThan(4 * 7.5);
    expect(actor.stamina).toBe(before);
    expect(t.mount().stamina()!.value).toBeLessThan(T.staminaMax - 20);
    expect(t.mount().mounted()).toBe(true);
  });

  it('whistles a horse 30 m away to the player, then H mounts', async () => {
    const t = await boot({ stables: true });
    t.ride();
    t.press('KeyH');
    const f = t.feet();
    t.ctx.player.teleport({ x: f.x + 30, y: f.y, z: f.z });
    t.run(30);
    t.press('KeyH');
    expect(t.of('mount.summoned').length).toBe(1);
    t.run(300);
    const spot = t.mount().serialize().placed!;
    expect(Math.hypot(spot.x - t.feet().x, spot.y - t.feet().y, spot.z - t.feet().z)).toBeLessThan(T.mountRadius);
    t.press('KeyH');
    expect(t.mount().mounted()).toBe(true);
  });

  it('refuses mounting in combat, indoors, in stealth, in a chase and while travelling', async () => {
    const t = await boot({ stables: true });
    t.award();
    const cases: [() => void, () => void, string][] = [
      [() => (t.fakes.waystones.hostileAggro = true), () => (t.fakes.waystones.hostileAggro = false), 'combat'],
      [() => (t.fakes.interiors.current = 'tilted-anvil'), () => (t.fakes.interiors.current = null), 'interior'],
      [() => (t.fakes.stealth.on = true), () => (t.fakes.stealth.on = false), 'stealth'],
      [() => (t.fakes.chase.on = true), () => (t.fakes.chase.on = false), 'chase'],
      [() => (t.fakes.waystones.travelling = true), () => (t.fakes.waystones.travelling = false), 'travel'],
    ];
    for (const [on, off, reason] of cases) {
      on();
      t.press('KeyH');
      expect(t.mount().mounted()).toBe(false);
      expect(t.toasts()).toContain(`mount.refused.${reason}`);
      off();
    }
    expect(t.of('mount.summoned')).toEqual([]);
    t.press('KeyH');
    expect(t.mount().mounted()).toBe(true);
  });

  it('a door transition dismounts with the horse left outside; riding past a door does not', async () => {
    const t = await boot({ stables: true });
    t.ride();
    const f = t.feet();
    t.ctx.interaction.register({ id: 'door:keep', kind: 'door', position: (o) => o.set(f.x, f.y, f.z - 1), coneDegrees: 360, onInteract: () => {} });
    t.run(2);
    expect(t.ctx.interaction.focus?.id).toBe('door:keep');
    t.press('KeyF');
    expect(t.mount().mounted()).toBe(true);
    t.fakes.interiors.transitioning = true;
    t.run(1);
    expect(reasons(t)).toEqual(['interior']);
    const spot = t.mount().serialize().placed!;
    expect(Math.hypot(spot.x - f.x, spot.z - f.z)).toBeLessThan(1);
  });

  it('kneeling, resting and hiding dismount first; a rest refills the horse', async () => {
    const t = await boot({ stables: true });
    t.ride();
    const f = t.feet();
    t.ctx.interaction.register({ id: 'waystone:test', kind: 'waystone', position: (o) => o.set(f.x, f.y, f.z - 1), coneDegrees: 360, holdSeconds: 1, onInteract: () => {} });
    t.run(2);
    expect(t.ctx.interaction.focus?.id).toBe('waystone:test');
    t.press('KeyF');
    expect(reasons(t)).toEqual(['script']);
    (t.mount() as any).model.setStamina(10);
    t.ctx.events.emit('rest', { waystoneId: 'test' });
    expect((t.mount() as any).model.stamina).toBe(T.staminaMax);
  });

  it('a melee hit throws the rider; a status tick does not', async () => {
    const t = await boot({ stables: true });
    t.ride();
    const id = t.ctx.player.actor.id;
    t.ctx.damage.apply({ attackerId: null, targetId: id, amount: 2, kind: 'status', statusKind: 'ignite', statusId: 'x' } as never);
    t.run(1);
    expect(t.mount().mounted()).toBe(true);
    t.ctx.damage.apply({ attackerId: null, targetId: id, amount: 5, kind: 'melee' });
    t.run(1);
    expect(reasons(t)).toEqual(['combat']);
    // Thrown: no remount for a moment.
    t.press('KeyH');
    expect(t.mount().mounted()).toBe(false);
    t.run(40);
    t.press('KeyH');
    expect(t.mount().mounted()).toBe(true);
  });

  it('the horse carries hurtboxes for the rider only while mounted', async () => {
    const t = await boot({ stables: true });
    t.award();
    const owner = (t.mount() as any).hurtOwner;
    expect(t.ctx.actors.byOwner(owner)).toBeUndefined();
    t.press('KeyH');
    expect(t.ctx.actors.byOwner(owner)).toBe(t.ctx.player.actor);
    t.press('KeyH');
    expect(t.ctx.actors.byOwner(owner)).toBeUndefined();
  });

  it('a teleport, death, stealth starting, fast travel and the gate closing each end the ride', async () => {
    const t = await boot({ stables: true });
    const cases: [() => void, () => void][] = [
      [() => t.ctx.player.teleport({ x: t.feet().x + 40, y: t.feet().y, z: t.feet().z }), () => {}],
      [() => (t.fakes.stealth.on = true), () => (t.fakes.stealth.on = false)],
      [() => (t.fakes.waystones.travelling = true), () => (t.fakes.waystones.travelling = false)],
      [() => t.ctx.events.emit('actor.died', { actorId: t.ctx.player.actor.id } as never), () => {}],
    ];
    t.award();
    for (const [on, off] of cases) {
      t.run(10);
      t.press('KeyH');
      if (!t.mount().mounted()) {
        // The horse may be farther than 3.5 m after a teleport: whistle and wait, then mount.
        t.run(300);
        t.press('KeyH');
      }
      expect(t.mount().mounted()).toBe(true);
      on();
      t.run(3);
      expect(t.mount().mounted()).toBe(false);
      off();
      t.run(3);
    }
    expect(reasons(t)).toEqual(['script', 'script', 'script', 'script']);
    t.run(300);
    t.press('KeyH');
    if (!t.mount().mounted()) {
      t.run(300);
      t.press('KeyH');
    }
    expect(t.mount().mounted()).toBe(true);
    t.ctx.state.clearFlag(T.flag);
    expect(t.mount().mounted()).toBe(false);
    expect(reasons(t).at(-1)).toBe('script');
    expect(t.mount().serialize().placed).toBeNull();
  });

  it('a save taken mid-gallop loads dismounted on the ground beside the player, stamina kept', async () => {
    const t = await boot({ stables: true });
    t.ride();
    t.hold(['KeyW', 'ShiftLeft'], 300);
    const save = t.persist().serialize() as { placed: { x: number; y: number; z: number }; stamina: number };
    expect(save.stamina).toBeLessThan(T.staminaMax);
    const f = t.feet();
    expect(Math.hypot(save.placed.x - f.x, save.placed.z - f.z)).toBeCloseTo(T.saveSideOffset, 1);
    expect(JSON.stringify(save)).not.toMatch(/mounted/);
    t.load(JSON.parse(JSON.stringify(save)));
    expect(t.mount().mounted()).toBe(false);
    expect(reasons(t)).toEqual(['load']);
    expect(t.of('mount.mounted').length).toBe(1);
    expect(t.world.player.seated).toBe(false);
    expect(t.ctx.player.avatar!.root.position.y).toBe(0);
    t.run(5);
    t.press('KeyH');
    expect(t.mount().mounted()).toBe(true);
    expect(t.mount().stamina()!.value).toBeGreaterThanOrEqual(save.stamina);
  });

  it('a load with the flag unset places nothing and H stays refused', async () => {
    const t = await boot({ stables: true });
    t.load({ placed: { x: 1, y: 0, z: 1, yaw: 0 }, stamina: 50 });
    expect(t.mount().serialize().placed).toBeNull();
    t.press('KeyH');
    expect(t.toasts()).toContain('mount.refused.unavailable');
  });

  it('a saved horse far off the ground is dropped back to the stables; a bad save keeps defaults', async () => {
    const t = await boot({ stables: true, flag: true });
    const f = t.feet();
    t.load({ placed: { x: f.x, y: f.y + 500, z: f.z, yaw: 0 }, stamina: 30 });
    const placed = t.mount().serialize().placed!;
    expect(placed.y).toBeLessThan(f.y + 5);
    t.load('garbage');
    expect(t.mount().serialize().stamina).toBe(T.staminaMax);
  });

  it('a horse saved while arriving is saved where it is, and the gate closing mid-whistle cancels it', async () => {
    const t = await boot();
    t.award();
    t.press('KeyH');
    expect(t.of('mount.summoned').length).toBe(1);
    t.run(20);
    const mid = t.mount().serialize().placed!;
    const f = t.feet();
    expect(Math.hypot(mid.x - f.x, mid.z - f.z)).toBeGreaterThan(T.arriveBeside + 0.5);
    t.ctx.state.clearFlag(T.flag);
    t.run(60);
    expect(t.mount().serialize().placed).toBeNull();
  });

  it('a class kit swap mid-ride puts the new avatar on the saddle', async () => {
    const t = await boot({ stables: true });
    t.ride();
    t.run(2);
    const old = t.ctx.player.avatar!;
    const next = await KnightAvatar.load(assets as never);
    expect(t.ctx.player.swapAvatar(next)).toBe(true);
    t.run(2);
    expect(t.ctx.player.avatar).toBe(next);
    expect(next.root.position.y).toBeGreaterThan(1.2);
    expect(old).not.toBe(next);
    t.press('KeyH');
    expect(next.root.position.y).toBe(0);
  });

  it('a save with no mount entry still loads dismounted', async () => {
    const t = await boot({ stables: true });
    t.ride();
    t.ctx.events.emit('save.loaded', { slot: 'test' });
    expect(t.mount().mounted()).toBe(false);
    expect(reasons(t)).toEqual(['load']);
  });

  it('slides along a wall at the gallop instead of stopping dead, and a move lock stops the horse model too', async () => {
    const t = await boot({ stables: true });
    t.ride();
    const f = t.feet();
    // A wall along the heading (-Z), just touching the capsule's right side.
    t.ctx.physics.addStaticCollider(
      t.ctx.physics.rapier.ColliderDesc.cuboid(0.5, 3, 60).setTranslation(f.x + 0.35 + 0.5 + 0.02, f.y + 3, f.z - 60),
    );
    t.run(2);
    t.hold(['KeyW', 'ShiftLeft'], 180);
    expect(f.z - t.feet().z).toBeGreaterThan(15);
    expect(t.mount().model.speed).toBeGreaterThan(8);
    const off = t.ctx.player.addMoveModifier('test', { lockMove: true });
    t.hold(['KeyW', 'ShiftLeft'], 30);
    expect(t.mount().model.speed).toBeLessThan(1);
    off();
  });
});

