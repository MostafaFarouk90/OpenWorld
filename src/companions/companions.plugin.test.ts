import * as THREE from 'three';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import type { GameEventMap } from '../core/events';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import { PLUGIN_MODULES } from '../core/pluginManifest';
import type { GamePlugin, PluginModule } from '../core/plugins';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import questsPlugin from '../quests/quests.plugin';
import { heightAt } from '../terrain/heightfield';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import companionsPlugin from './companions.plugin';
import { TOBB } from './tobb';
import './types';

let physics: PhysicsWorld;
beforeAll(() => {
  (globalThis as any).self ??= globalThis;
});
beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const modules = (...plugins: GamePlugin[]): Record<string, PluginModule> =>
  Object.fromEntries(plugins.map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }]));

const JOIN = TOBB.joinFlag;
const DT = 1 / 60;

/** A stand-in for thread 2's attack-speed hook. */
function hookPlugin() {
  const calls: { id: string; mult: number }[] = [];
  const undos = { count: 0 };
  const plugin: GamePlugin = {
    id: 'fake-verbs',
    dependsOn: ['core'],
    setup(ctx) {
      ctx.services.provide('combatVerbs' as never, {
        reArm() {},
        secondWindCharges: 0,
        busy: false,
        staggered: false,
        addAttackSpeedMultiplier(id: string, mult: number) {
          calls.push({ id, mult });
          return () => undos.count++;
        },
      } as never);
    },
  };
  return { plugin, calls, undos };
}

/** A stand-in dialogue service that emits started/ended like thread 3's. */
function dialogueStub() {
  const starts: [string, string][] = [];
  let open: { dialogueId: string; npcId: string } | null = null;
  let emit: ((t: 'dialogue.started' | 'dialogue.ended', p: { dialogueId: string; npcId: string }) => void) | null = null;
  const plugin: GamePlugin = {
    id: 'fake-dialogue',
    dependsOn: ['core'],
    setup(ctx) {
      emit = (t, p) => ctx.events.emit(t, p);
      ctx.services.provide('dialogue', {
        start(dialogueId: string, npcId: string) {
          if (open) return false;
          starts.push([dialogueId, npcId]);
          open = { dialogueId, npcId };
          emit!('dialogue.started', open);
          return true;
        },
        get active() {
          return open !== null;
        },
        close() {
          if (!open) return;
          const o = open;
          open = null;
          emit!('dialogue.ended', o);
        },
        hasSeen: () => false,
      });
    },
  };
  return { plugin, starts };
}

async function boot(plugins: GamePlugin[] = [corePlugin, companionsPlugin], before?: (g: Game) => void) {
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
  before?.(game);
  const events: { type: keyof GameEventMap; payload: any }[] = [];
  game.events.onAny((type, payload) => events.push({ type, payload }));
  const statuses = await game.loadPlugins(modules(...plugins));
  const ctx = game.ctx;
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  const of = <K extends keyof GameEventMap>(type: K) => events.filter((e) => e.type === type).map((e) => e.payload as GameEventMap[K]);
  const svc = () => ctx.services.require('companions');
  const tobb = () => {
    const id = svc().actorId('tobb');
    return id ? ctx.actors.get(id) : undefined;
  };
  const tobbPos = () => {
    const root = tobb()?.root;
    return root ? root.position.clone() : null;
  };
  const distToPlayer = () => {
    const p = tobbPos();
    const f = ctx.player.feet;
    return p ? Math.hypot(p.x - f.x, p.z - f.z) : Infinity;
  };
  const key = (type: 'keydown' | 'keyup', code: string) =>
    win.dispatchEvent(Object.assign(new Event(type), { code, repeat: false, preventDefault: () => {} }));
  const teleportPlayer = (x: number, z: number) => {
    const h = ctx.player.teleport({ x, y: heightAt(x, z), z });
    for (let i = 0; i < 600 && !h.ready(); i++) run(1);
  };
  const done = () => {
    game.dispose();
    world.dispose();
  };
  return { game, ctx, world, statuses, events, run, of, svc, tobb, tobbPos, distToPlayer, key, teleportPlayer, done };
}

describe('companions plugin: joining', () => {
  it('sets up with only core; nobody is joined and nothing is spawned', async () => {
    const t = await boot();
    expect(t.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    expect(t.svc().active()).toEqual([]);
    expect(t.svc().rank('tobb')).toBe(0);
    expect(t.svc().actorId('tobb')).toBeNull();
    expect([...t.ctx.actors.all()].some((a) => a.kind === 'companion:tobb')).toBe(false);
    t.done();
  });

  it('a runtime flag spawns him once as an untargetable, unhittable ally, emits companion.joined and sets rank 1', async () => {
    const t = await boot();
    t.ctx.state.setFlag(JOIN, true);
    t.ctx.state.setFlag(JOIN, true);
    expect(t.of('companion.joined')).toHaveLength(1);
    const a = t.tobb()!;
    expect(a.kind).toBe('companion:tobb');
    expect(a.team).toBe('ally');
    expect(a.untargetable).toBe(true);
    expect(t.of('companion.joined')[0]).toEqual({ companionId: 'tobb', actorId: a.id });
    expect(t.ctx.state.getNumber('companion.tobb.rank')).toBe(1);
    expect(t.svc().rank('tobb')).toBe(1);
    expect(t.svc().active()).toEqual(['tobb']);
    // No damage reaches him, from anyone.
    expect(t.ctx.damage.apply({ attackerId: t.ctx.player.actor.id, targetId: a.id, amount: 50, kind: 'melee' })).toBeNull();
    expect(t.ctx.actors.nearest({ x: a.root!.position.x, y: 0, z: a.root!.position.z } as never, { targetable: true } as never)?.id).not.toBe(a.id);
    t.done();
  });

  it('never lowers an existing rank', async () => {
    const t = await boot();
    t.ctx.state.setFlag('companion.tobb.rank', 3);
    t.ctx.state.setFlag(JOIN, true);
    expect(t.svc().rank('tobb')).toBe(3);
    t.done();
  });

  it('join() writes the flag and leave() clears it; leave despawns and emits companion.left', async () => {
    const t = await boot();
    t.svc().join('tobb');
    expect(t.ctx.state.getBool(JOIN)).toBe(true);
    const id = t.svc().actorId('tobb');
    t.svc().join('unknown');
    t.svc().leave('tobb');
    expect(t.of('companion.left')).toEqual([{ companionId: 'tobb', actorId: id }]);
    expect(t.svc().actorId('tobb')).toBeNull();
    expect(t.ctx.actors.get(id!)).toBeUndefined();
    t.done();
  });

  it('a flag already set at setup spawns him silently (a load joins him without an event)', async () => {
    const t = await boot(undefined, (g) => g.ctx.state.setFlag(JOIN, true));
    expect(t.tobb()).toBeDefined();
    expect(t.of('companion.joined')).toEqual([]);
    t.run(5);
    expect(t.distToPlayer()).toBeLessThan(5);
    t.done();
  });

  it('spawns at the pre-join post anchor at the handover, then walks to the player', async () => {
    const t = await boot(undefined, (g) => {
      const f = g.ctx.player.feet;
      g.ctx.anchors.define({ id: 'npc-post.tobb', position: { x: f.x + 15, y: heightAt(f.x + 15, f.z), z: f.z }, yaw: 0 });
    });
    t.ctx.state.setFlag(JOIN, true);
    expect(t.distToPlayer()).toBeGreaterThan(14);
    t.run(5 * 60);
    expect(t.distToPlayer()).toBeLessThan(4.5);
    t.done();
  });

  it('dispose removes the actor, the figure and the talk interactable', async () => {
    const t = await boot();
    t.ctx.state.setFlag(JOIN, true);
    const before = t.ctx.scene.children.length;
    t.game.dispose();
    expect([...t.ctx.actors.all()].some((a) => a.kind === 'companion:tobb')).toBe(false);
    expect(t.ctx.scene.children.length).toBeLessThan(before);
    t.world.dispose();
  });
});

describe('companions plugin: follow and teleport-behind', () => {
  it('fast travel without a fastTravel event (a failed-over teleport) still brings him along', async () => {
    const t = await boot();
    t.ctx.state.setFlag(JOIN, true);
    t.run(30);
    t.teleportPlayer(t.ctx.player.feet.x + 300, t.ctx.player.feet.z + 40);
    t.run(30);
    expect(t.distToPlayer()).toBeLessThan(5);
    expect(t.tobb()!.root!.visible).toBe(true);
    t.done();
  });

  it('follows through a door and its 2 s rollback (two jumps of 8 m or more)', async () => {
    const t = await boot();
    t.ctx.state.setFlag(JOIN, true);
    t.run(30);
    const home = { x: t.ctx.player.feet.x, z: t.ctx.player.feet.z };
    t.teleportPlayer(home.x + 60, home.z);
    t.ctx.events.emit('interior.entered', { interiorId: 'chapel-vault', doorId: 'door:vault' });
    t.run(10);
    expect(t.distToPlayer()).toBeLessThan(5);
    t.teleportPlayer(home.x, home.z);
    t.run(10);
    expect(t.distToPlayer()).toBeLessThan(5);
    t.done();
  });

  it('an asynchronous respawn (event first, teleport later) ends with him beside the player', async () => {
    const t = await boot();
    t.ctx.state.setFlag(JOIN, true);
    t.run(30);
    t.ctx.events.emit('player.respawned', { source: 'test' });
    t.run(2);
    t.teleportPlayer(t.ctx.player.feet.x - 200, t.ctx.player.feet.z);
    t.run(30);
    expect(t.distToPlayer()).toBeLessThan(5);
    t.done();
  });

  it('keeps up with a sprinting player along a path and never falls 40 m behind', async () => {
    const t = await boot();
    t.ctx.state.setFlag(JOIN, true);
    t.run(30);
    let worst = 0;
    for (let i = 0; i < 4 * 60; i++) {
      const f = t.ctx.player.feet;
      t.ctx.player.teleport({ x: f.x + 7.5 * DT, y: heightAt(f.x + 7.5 * DT, f.z), z: f.z });
      t.run(1);
      worst = Math.max(worst, t.distToPlayer());
    }
    expect(worst).toBeLessThan(12);
    t.done();
  });
});

describe('companions plugin: Battle-song', () => {
  it('a block applies +5% for 4 s through the hook with buff and aura events; a new block refreshes it', async () => {
    const h = hookPlugin();
    const t = await boot([corePlugin, h.plugin, companionsPlugin]);
    t.ctx.state.setFlag(JOIN, true);
    t.run(5);
    t.ctx.events.emit('player.blocked', { attackerId: null });
    expect(h.calls).toEqual([{ id: 'companion.tobb.battle-song', mult: 1.05 }]);
    expect(t.of('companion.aura')).toEqual([{ companionId: 'tobb', auraId: 'battle-song', active: true }]);
    expect(t.of('buff.applied')).toEqual([{ id: 'companion.tobb.battle-song', nameKey: 'companion.tobb.aura.name', seconds: 4 }]);
    t.run(3 * 60);
    t.ctx.events.emit('player.parried', { attackerId: null });
    expect(h.calls).toHaveLength(1);
    expect(t.of('buff.applied')).toHaveLength(2);
    t.run(3 * 60);
    expect(h.undos.count).toBe(0);
    t.run(61);
    expect(h.undos.count).toBe(1);
    expect(t.of('buff.removed')).toEqual([{ id: 'companion.tobb.battle-song' }]);
    expect(t.of('companion.aura').at(-1)).toEqual({ companionId: 'tobb', auraId: 'battle-song', active: false });
    expect(t.svc().integration().attackSpeedHook).toBe(true);
    t.done();
  });

  it('player death cancels it, and blocks are refused while Cael is dead', async () => {
    const h = hookPlugin();
    const t = await boot([corePlugin, h.plugin, companionsPlugin]);
    t.ctx.state.setFlag(JOIN, true);
    t.run(5);
    t.ctx.events.emit('player.blocked', { attackerId: null });
    t.ctx.events.emit('player.died', {});
    expect(h.undos.count).toBe(1);
    t.ctx.events.emit('player.blocked', { attackerId: null });
    expect(h.calls).toHaveLength(1);
    t.ctx.events.emit('player.respawned', { source: 'test' });
    t.ctx.events.emit('player.blocked', { attackerId: null });
    expect(h.calls).toHaveLength(2);
    t.done();
  });

  it('is refused while he is hidden (the player teleported onto ground that is not loaded yet)', async () => {
    const h = hookPlugin();
    const t = await boot([corePlugin, h.plugin, companionsPlugin]);
    t.ctx.state.setFlag(JOIN, true);
    t.run(5);
    const f = t.ctx.player.feet;
    // The ground under the destination is not loaded yet.
    vi.spyOn(t.game.ctx.terrain, 'isResident').mockReturnValue(false);
    t.ctx.player.teleport({ x: f.x + 30, y: heightAt(f.x + 30, f.z), z: f.z });
    t.run(2);
    expect(t.tobb()!.root!.visible).toBe(false);
    t.ctx.events.emit('player.blocked', { attackerId: null });
    expect(h.calls).toHaveLength(0);
    // Once the ground loads he reappears behind the player.
    vi.mocked(t.game.ctx.terrain.isResident).mockRestore();
    t.run(2);
    expect(t.tobb()!.root!.visible).toBe(true);
    expect(t.distToPlayer()).toBeLessThan(5);
    t.done();
  });

  it('without the hook: no multiplier, no buff or aura event, one warning', async () => {
    const t = await boot();
    t.ctx.state.setFlag(JOIN, true);
    t.run(5);
    t.ctx.events.emit('player.blocked', { attackerId: null });
    t.ctx.events.emit('player.blocked', { attackerId: null });
    expect(t.of('buff.applied')).toEqual([]);
    expect(t.of('companion.aura')).toEqual([]);
    const warns = (console.warn as any).mock.calls.filter((c: unknown[]) => String(c[0]).includes('addAttackSpeedMultiplier'));
    expect(warns).toHaveLength(1);
    t.done();
  });

  it('does nothing before he joins', async () => {
    const h = hookPlugin();
    const t = await boot([corePlugin, h.plugin, companionsPlugin]);
    t.ctx.events.emit('player.blocked', { attackerId: null });
    expect(h.calls).toEqual([]);
    t.done();
  });
});

describe('companions plugin: banter', () => {
  it('an area trigger by the player barks once (event and toast); by another actor it does not', async () => {
    const t = await boot();
    t.ctx.state.setFlag(JOIN, true);
    t.run(5);
    t.ctx.events.emit('trigger.enter', { triggerId: 'trg.ford.toll-post', actorId: 'someone' });
    expect(t.of('companion.banter')).toEqual([]);
    t.ctx.events.emit('trigger.enter', { triggerId: 'trg.ford.toll-post', actorId: t.ctx.player.actor.id });
    const b = t.of('companion.banter');
    expect(b).toHaveLength(1);
    expect(b[0].trigger).toBe('area');
    expect(b[0].lineKey).toMatch(/^companion\.tobb\.bark\.area\.hollinFord\./);
    expect(t.of('hud.toast').at(-1)?.textKey).toBe('companion.say');
    t.done();
  });

  it('stays quiet during dialogue and a boss intro; the area bark is dropped after 8 s of waiting', async () => {
    const t = await boot();
    t.ctx.state.setFlag(JOIN, true);
    t.run(5);
    t.ctx.events.emit('boss.started', { bossId: 'ashen-prior', actorId: 'x' });
    t.ctx.events.emit('trigger.enter', { triggerId: 'trg.shrine.basin', actorId: t.ctx.player.actor.id });
    t.run(9 * 60);
    t.ctx.events.emit('boss.ended', { bossId: 'ashen-prior', actorId: 'x', reason: 'despawned' });
    t.run(4 * 60);
    expect(t.of('companion.banter')).toEqual([]);
    t.ctx.events.emit('dialogue.started', { dialogueId: 'npc-gaut', npcId: 'gaut' });
    t.ctx.events.emit('trigger.enter', { triggerId: 'trg.wardstones.road', actorId: t.ctx.player.actor.id });
    expect(t.of('companion.banter')).toEqual([]);
    t.ctx.events.emit('dialogue.ended', { dialogueId: 'npc-gaut', npcId: 'gaut' });
    t.run(2);
    expect(t.of('companion.banter')).toHaveLength(1);
    t.done();
  });

  it('an interior.entered right after a load is a re-emit and gives no area bark; a later one does', async () => {
    const t = await boot();
    t.ctx.state.setFlag(JOIN, true);
    t.run(5);
    t.ctx.persist.loadAll([], t.ctx.events, 'test');
    t.ctx.events.emit('interior.entered', { interiorId: 'chapel-vault', doorId: 'door:vault' });
    expect(t.of('companion.banter')).toEqual([]);
    t.run(3 * 60);
    t.ctx.events.emit('interior.exited', { interiorId: 'chapel-vault', doorId: 'door:vault' });
    t.ctx.events.emit('interior.entered', { interiorId: 'chapel-vault', doorId: 'door:vault' });
    expect(t.of('companion.banter').map((b) => b.trigger)).toEqual(['area']);
    t.done();
  });

  it('a fight of 3 s or more barks at its start and end; aggro on someone else is ignored', async () => {
    const t = await boot();
    t.ctx.state.setFlag(JOIN, true);
    t.run(5);
    t.ctx.events.emit('ai.aggro', { actorId: 'wraith#1', targetId: 'villager' });
    expect(t.of('companion.banter')).toEqual([]);
    t.ctx.events.emit('ai.aggro', { actorId: 'wraith#1', targetId: t.ctx.player.actor.id });
    expect(t.of('companion.banter').map((b) => b.trigger)).toEqual(['combatStart']);
    t.run(50 * 60);
    t.ctx.events.emit('ai.calm', { actorId: 'wraith#1' });
    t.run(3 * 60);
    expect(t.of('companion.banter').map((b) => b.trigger)).toEqual(['combatStart', 'combatEnd']);
    t.done();
  });
});

describe('companions plugin: talking to him', () => {
  it('the talk interactable exists only while he is joined and starts npc-tobb; a quest talk objective on tobb completes', async () => {
    const d = dialogueStub();
    const t = await boot([corePlugin, questsPlugin, d.plugin, companionsPlugin]);
    const quests = t.ctx.services.require('quests');
    t.ctx.strings.register('en', { 'quest.test.title': 'T', 'quest.test.summary': 'S', 'quest.test.o4': 'Talk to Tobb' });
    quests.register({
      id: 'test-m05',
      titleKey: 'quest.test.title',
      summaryKey: 'quest.test.summary',
      objectives: [{ id: 'o4', type: 'talk', textKey: 'quest.test.o4', target: 'tobb' }],
    });
    expect(quests.start('test-m05')).toBe(true);
    t.key('keydown', 'KeyF');
    t.run(2);
    t.key('keyup', 'KeyF');
    expect(d.starts).toEqual([]);

    t.ctx.state.setFlag(JOIN, true);
    t.run(60);
    // Cael has to face him (the talk prompt keeps the default facing cone).
    const tp = t.tobbPos()!;
    const f = t.ctx.player.feet;
    t.world.player.setFacingYaw(Math.atan2(-(tp.x - f.x), -(tp.z - f.z)));
    t.run(1);
    t.key('keydown', 'KeyF');
    t.run(2);
    t.key('keyup', 'KeyF');
    t.run(1);
    expect(d.starts).toEqual([['npc-tobb', 'tobb']]);
    // He stops and faces Cael while they talk.
    const before = t.tobbPos()!;
    t.run(30);
    expect(t.tobbPos()!.distanceTo(before)).toBeLessThan(0.05);
    t.ctx.services.require('dialogue').close();
    expect(quests.state('test-m05')).toBe('completed');
    t.done();
  });
});

describe('companions plugin: saves', () => {
  it('serialises only position and facing; a near saved spot is restored on load', async () => {
    const t = await boot();
    t.ctx.state.setFlag(JOIN, true);
    t.run(60);
    const p = t.ctx.persist.get('companions')!;
    const data = p.serialize() as { positions: Record<string, { x: number; y: number; z: number; yaw: number }> };
    expect(Object.keys(data.positions)).toEqual(['tobb']);
    expect(Object.keys(data.positions.tobb).sort()).toEqual(['x', 'y', 'yaw', 'z']);
    const f = t.ctx.player.feet;
    const spot = { x: f.x + 2, y: heightAt(f.x + 2, f.z + 2), z: f.z + 2, yaw: 1 };
    t.ctx.persist.loadAll([{ key: 'companions', version: 1, data: { positions: { tobb: spot } } }], t.ctx.events, 'test');
    t.run(1);
    const pos = t.tobbPos()!;
    expect(Math.hypot(pos.x - spot.x, pos.z - spot.z)).toBeLessThan(0.2);
    t.done();
  });

  it('a saved spot too far away, or bad data, places him behind the player instead', async () => {
    const t = await boot();
    t.ctx.state.setFlag(JOIN, true);
    t.run(30);
    const f = t.ctx.player.feet;
    t.ctx.persist.loadAll([{ key: 'companions', version: 1, data: { positions: { tobb: { x: f.x + 500, y: 0, z: f.z, yaw: 0 } } } }], t.ctx.events, 'a');
    t.run(2);
    expect(t.distToPlayer()).toBeLessThan(5);
    t.ctx.persist.loadAll([{ key: 'companions', version: 1, data: { positions: { tobb: { x: 'no' } } } }], t.ctx.events, 'b');
    t.ctx.persist.loadAll([{ key: 'companions', version: 1, data: null }], t.ctx.events, 'c');
    t.run(2);
    expect(t.distToPlayer()).toBeLessThan(5);
    t.done();
  });

  it('a load with tobbJoined true and no companions entry joins him silently behind the player', async () => {
    const t = await boot();
    const state = t.ctx.state.serialize();
    t.ctx.state.load({ ...state, flags: { ...(state as any).flags, [JOIN]: true } });
    t.ctx.persist.loadAll([], t.ctx.events, 'slot');
    expect(t.tobb()).toBeDefined();
    expect(t.of('companion.joined')).toEqual([]);
    t.run(3);
    expect(t.distToPlayer()).toBeLessThan(5);
    t.done();
  });

  it('a load of an earlier save without the flag despawns him without companion.left', async () => {
    const t = await boot();
    t.ctx.state.setFlag(JOIN, true);
    const state = t.ctx.state.serialize() as any;
    const flags = { ...state.flags };
    delete flags[JOIN];
    t.ctx.state.load({ ...state, flags });
    t.ctx.persist.loadAll([], t.ctx.events, 'slot');
    expect(t.tobb()).toBeUndefined();
    expect(t.of('companion.left')).toEqual([]);
    t.done();
  });
});

describe('companions plugin: with every real plugin', () => {
  it('sets up and reports which integrations resolved; the hook must resolve once thread 2 ships it', async () => {
    const t = await boot(Object.values(PLUGIN_MODULES).map((m) => m.default as GamePlugin));
    const ok = (id: string) => t.statuses.find((s) => s.id === id)?.state === 'ok';
    expect(ok('companions')).toBe(true);
    const i = t.svc().integration();
    expect(i.npcs).toBe(ok('npcs'));
    expect(i.nav).toBe(ok('nav'));
    const fsModule = 'node:fs';
    const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as any;
    const verbsSource: string = readFileSync('src/player/CombatVerbs.ts', 'utf8');
    if (verbsSource.includes('addAttackSpeedMultiplier') && ok('combat-verbs')) expect(i.attackSpeedHook).toBe(true);
    // Thread 3a's inn: once the inn's interior anchors exist, Tobb's hearth post must too; likewise each entry fallback.
    if (t.ctx.anchors.find('harrowmark.tilted-anvil.entry')) expect(t.ctx.anchors.find('npc-post.tobb.tilted-anvil')).toBeDefined();
    for (const [interior, anchorId] of Object.entries(TOBB.interiorEntry)) {
      if (t.ctx.anchors.find(`harrowmark.${interior}.exit`)) expect(t.ctx.anchors.find(anchorId), anchorId).toBeDefined();
    }
    t.done();
  });
});

describe('companions plugin: review additions', () => {
  it('a disabled plugin leaves no service, persistable, system or actor', async () => {
    const scene = new THREE.Scene();
    const moveModifiers = new MoveModifiers();
    const world = new World(scene, physics, {
      colliders: new TerrainColliders(physics, { patchSize: 50, cells: 16 }),
      moveModifier: () => moveModifiers.state(),
    });
    const element = Object.assign(new EventTarget(), { requestPointerLock: () => {} }) as unknown as HTMLElement;
    const input = new InputManager(element, new EventTarget(), Object.assign(new EventTarget(), { pointerLockElement: null }), { storage: null });
    const game = new Game({ scene, physics, world, input, moveModifiers, report: () => {} });
    game.ctx.state.setFlag(JOIN, true);
    const statuses = await game.loadPlugins(modules(corePlugin, companionsPlugin), { disabled: new Set(['companions']) });
    expect(statuses.find((s) => s.id === 'companions')?.state).toBe('skipped');
    expect(game.ctx.services.get('companions')).toBeUndefined();
    expect(game.ctx.persist.get('companions')).toBeUndefined();
    expect([...game.ctx.actors.all()].some((a) => a.kind === 'companion:tobb')).toBe(false);
    game.dispose();
    world.dispose();
  });

  it('a save entry with a newer version is refused and he keeps his place (core keeps the entry verbatim)', async () => {
    const t = await boot();
    t.ctx.state.setFlag(JOIN, true);
    t.run(60);
    const before = t.tobbPos()!;
    const f = t.ctx.player.feet;
    const unknown = t.ctx.persist.loadAll(
      [{ key: 'companions', version: 2, data: { positions: { tobb: { x: f.x + 1, y: f.y, z: f.z + 1, yaw: 0 } } } }],
      t.ctx.events,
      'slot',
    );
    expect(unknown.map((e) => e.key)).toEqual(['companions']);
    t.run(1);
    expect(t.tobbPos()!.distanceTo(before)).toBeLessThan(5);
    expect(Math.hypot(t.tobbPos()!.x - (f.x + 1), t.tobbPos()!.z - (f.z + 1))).toBeGreaterThan(0.2);
    t.done();
  });

  it('the handover takes the NPC position from the npcs service', async () => {
    let feet = { x: 0, y: 0, z: 0 };
    const npcs: GamePlugin = {
      id: 'fake-npcs',
      dependsOn: ['core'],
      setup(ctx) {
        feet = { x: ctx.player.feet.x + 12, y: heightAt(ctx.player.feet.x + 12, ctx.player.feet.z), z: ctx.player.feet.z };
        ctx.services.provide('npcs', { place: () => true, get: () => undefined, position: (id: string) => (id === 'tobb' ? { ...feet } : undefined) } as never);
      },
    };
    const t = await boot([corePlugin, npcs, companionsPlugin]);
    t.ctx.state.setFlag(JOIN, true);
    t.run(1);
    const p = t.tobbPos()!;
    expect(Math.hypot(p.x - feet.x, p.z - feet.z)).toBeLessThan(0.3);
    expect(t.svc().integration().npcs).toBe(true);
    t.done();
  });

  it('the talk interactable goes with leave and with dispose, and is disabled in a fight', async () => {
    const d = dialogueStub();
    const t = await boot([corePlugin, d.plugin, companionsPlugin]);
    t.ctx.state.setFlag(JOIN, true);
    t.run(60);
    const face = () => {
      const tp = t.tobbPos()!;
      const f = t.ctx.player.feet;
      t.world.player.setFacingYaw(Math.atan2(-(tp.x - f.x), -(tp.z - f.z)));
      t.run(1);
    };
    const press = () => {
      t.key('keydown', 'KeyF');
      t.run(2);
      t.key('keyup', 'KeyF');
      t.run(1);
    };
    face();
    t.ctx.events.emit('ai.aggro', { actorId: 'wraith#1', targetId: t.ctx.player.actor.id });
    press();
    expect(d.starts).toEqual([]);
    t.ctx.events.emit('ai.calm', { actorId: 'wraith#1' });
    t.run(3 * 60);
    face();
    press();
    expect(d.starts).toHaveLength(1);
    t.ctx.services.require('dialogue').close();
    t.svc().leave('tobb');
    t.run(2);
    press();
    expect(d.starts).toHaveLength(1);
    expect(t.ctx.interaction.focusFor('interact')?.id).not.toBe('companion:tobb');
    t.done();
  });

  it('indoors on a floating floor he stands on that floor, never on the terrain 150 m below', async () => {
    const box = { x: 0, z: 0, half: 20, top: 0 };
    const interiors = { current: null as string | null };
    const env: GamePlugin = {
      id: 'fake-interiors',
      dependsOn: ['core'],
      setup(ctx) {
        box.x = ctx.player.feet.x + 400;
        box.z = ctx.player.feet.z;
        box.top = heightAt(box.x, box.z) + 150;
        const inBox = (p: { x: number; y: number; z: number }) =>
          Math.abs(p.x - box.x) < box.half && Math.abs(p.z - box.z) < box.half && p.y > box.top - 5;
        ctx.services.provide('interiors' as never, interiors as never);
        ctx.services.provide('nav' as never, {
          hasGrid: inBox,
          floorAt: (p: { x: number; y: number; z: number }) => (inBox(p) ? box.top : null),
          path: (_from: unknown, to: { x: number; y: number; z: number }) => [to],
        } as never);
      },
    };
    const t = await boot([corePlugin, env, companionsPlugin]);
    const slab = physics.addStaticCollider(
      physics.rapier.ColliderDesc.cuboid(box.half, 0.25, box.half).setTranslation(box.x, box.top - 0.25, box.z),
    );
    t.ctx.state.setFlag(JOIN, true);
    t.run(30);
    t.ctx.player.teleport({ x: box.x, y: box.top, z: box.z });
    interiors.current = 'chapel-vault';
    t.ctx.events.emit('interior.entered', { interiorId: 'chapel-vault', doorId: 'door:vault' });
    let lowest = Infinity;
    for (let i = 0; i < 120; i++) {
      t.run(1);
      const p = t.tobbPos()!;
      if (t.tobb()!.root!.visible) lowest = Math.min(lowest, p.y);
    }
    expect(t.distToPlayer()).toBeLessThan(5);
    expect(lowest).toBeGreaterThan(box.top - 1);
    expect(t.svc().integration().nav).toBe(true);
    physics.removeCollider(slab);
    t.done();
  });
});

describe('companions plugin: outdoor nav grids', () => {
  it("a street nav grid outdoors (Harrowmark's blocks) is not an interior: he keeps his slot on the terrain", async () => {
    const street: GamePlugin = {
      id: 'fake-streets',
      dependsOn: ['core'],
      setup(ctx) {
        ctx.services.provide('interiors' as never, { current: null } as never);
        ctx.services.provide('nav' as never, {
          hasGrid: () => true,
          floorAt: () => null,
          path: (_from: unknown, to: { x: number; y: number; z: number }) => [to],
        } as never);
      },
    };
    const t = await boot([corePlugin, street, companionsPlugin]);
    // No ray ever hits, so ground comes from the terrain height (outdoors) and never from an interior fallback.
    vi.spyOn(t.ctx.physics, 'raycast').mockReturnValue(null as never);
    t.ctx.state.setFlag(JOIN, true);
    t.run(240);
    const p = t.tobbPos()!;
    expect(t.tobb()!.root!.visible).toBe(true);
    expect(t.distToPlayer()).toBeGreaterThan(1.5);
    expect(t.distToPlayer()).toBeLessThan(5);
    expect(Math.abs(p.y - heightAt(p.x, p.z))).toBeLessThan(0.05);
    t.done();
  });
});
