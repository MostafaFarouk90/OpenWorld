import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { PluginModule } from '../core/plugins';
import { PLUGIN_MODULES } from '../core/pluginManifest';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { FakeIndexedDb } from '../save/__fixtures__/fakeIndexedDb';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import slice1Complete from '../save/__fixtures__/slice1-complete.json';
import { tutorialFromQuery } from '../tutorial/tutorial.plugin';
import { ACT1_JUMP_IDS, ACT1_NODE_EFFECTS, ACT1_PREREQS, Act1Jump, type Act1JumpId, nodeEffects, parseAct1 } from './act1Jump';

describe('parseAct1', () => {
  it('accepts the six quests with &new', () => {
    for (const id of ACT1_JUMP_IDS) expect(parseAct1(`?act1=${id}&new`)).toEqual({ id, fresh: true });
  });
  it('is null without the parameter and refuses unknown ids or a missing &new', () => {
    expect(parseAct1('?tutorial=t05')).toBeNull();
    expect(parseAct1('?act1=m09&new')).toMatchObject({ error: expect.stringContaining('unknown') });
    expect(parseAct1('?act1=m03')).toMatchObject({ error: expect.stringContaining('&new') });
  });
  it('a valid jump starts the tutorial from Kettlewick (no start screen); a refused one does not', () => {
    expect(tutorialFromQuery('?act1=m04&new')).toEqual({ mode: 'kettlewick' });
    expect(tutorialFromQuery('?act1=m04')).toBeNull();
    expect(tutorialFromQuery('?tutorial=t05&act1=m04&new')).toEqual({ mode: 'full', at: 't05' });
  });
});

describe('node effects are read from the dialogue content', () => {
  it('every referenced node exists and carries effects', () => {
    for (const refs of Object.values(ACT1_NODE_EFFECTS)) {
      for (const r of refs) expect(nodeEffects(r.dialogueId, r.nodeId)?.length, `${r.dialogueId}:${r.nodeId}`).toBeGreaterThan(0);
    }
    expect(nodeEffects('npc-aelfreda', 'leap')).toEqual([{ grantAbility: 'surge-leap' }]);
    expect(nodeEffects('npc-nobody', 'x')).toBeNull();
  });
});

describe('Act1Jump (fakes)', () => {
  function rig(id: Act1JumpId, opts: { startFails?: boolean; teleportRefusals?: number } = {}) {
    let refusals = opts.teleportRefusals ?? 0;
    const states = new Map<string, string>();
    const log: string[] = [];
    const tut = { begun: false, complete: false, beat: null as string | null, restartInFlight: false,
      begin() { this.begun = true; this.beat = 't15'; log.push('begin'); },
      skipCurrent() { this.beat = null; this.complete = true; log.push('skip'); } };
    let ready = false;
    const warn = vi.fn();
    const jump = new Act1Jump(id, {
      tutorial: () => tut,
      quests: {
        state: (q) => states.get(q) ?? 'inactive',
        start: (q) => { if (opts.startFails && q === id) return false; states.set(q, 'active'); log.push(`start:${q}`); return true; },
        complete: (q) => { states.set(q, 'completed'); log.push(`complete:${q}`); return true; },
      },
      runEffects: (e) => log.push(`effects:${JSON.stringify(e)}`),
      setFlag: (f) => log.push(`flag:${f}`),
      rekindle: (w) => log.push(`rekindle:${w}`),
      teleportTo: (a) => { log.push(`tp:${a}`); return refusals-- <= 0; },
      ready: () => ready,
      warn,
    });
    const run = (n: number) => { for (let i = 0; i < n; i++) jump.tick(); };
    return { jump, log, states, run, setReady: () => { ready = true; }, warn };
  }

  it('waits for the save boot, finishes the tutorial, completes prerequisites in order, starts the quest, places the player', () => {
    const r = rig('m05');
    r.run(5);
    expect(r.log).toEqual([]);
    r.setReady();
    r.run(20);
    expect(r.jump.phase).toBe('done');
    const order = r.log.filter((l) => l.startsWith('complete:'));
    expect(order).toEqual(ACT1_PREREQS.m05.map((q) => `complete:${q}`));
    expect(r.log.indexOf('skip')).toBeLessThan(r.log.indexOf('start:m01'));
    expect(r.log).toContain('effects:[{"grantAbility":"surge-leap"}]');
    expect(r.log).toContain('effects:[{"unlockMercy":"spare"}]');
    expect(r.log).toContain('flag:world.brightwater.tollPost');
    expect(r.log.indexOf('effects:[{"unlockMercy":"spare"}]')).toBeLessThan(r.log.indexOf('complete:m04'));
    expect(r.states.get('m05')).toBe('active');
    expect(r.log.at(-1)).toBe('tp:npc-post.tobb');
  });

  it('a jump to M03 unlocks neither the Leap nor any mercy', () => {
    const r = rig('m03');
    r.setReady();
    r.run(20);
    expect(r.log.some((l) => l.includes('surge-leap') || l.includes('unlockMercy'))).toBe(false);
    expect(r.states.get('m03')).toBe('active');
  });

  it('keeps placing while the teleport is refused (busy, terrain loading) and finishes once it lands', () => {
    const r = rig('d01', { teleportRefusals: 3 });
    r.setReady();
    r.run(20);
    expect(r.jump.phase).toBe('done');
    expect(r.log.filter((l) => l.startsWith('tp:'))).toHaveLength(4);
  });

  it('fails cleanly when the quest refuses to start', () => {
    const r = rig('r02', { startFails: true });
    r.setReady();
    r.run(20);
    expect(r.jump.phase).toBe('failed');
    expect(r.warn).toHaveBeenCalledWith(expect.stringContaining('could not start r02'));
  });
});

// ---- the real plugin on every real plugin ----

let physics: PhysicsWorld;
let fake: FakeIndexedDb;
const cleanups: Array<() => void> = [];
beforeEach(async () => {
  (globalThis as { self?: unknown }).self ??= globalThis;
  physics = new PhysicsWorld();
  await physics.init();
  fake = new FakeIndexedDb();
  (globalThis as { indexedDB?: unknown }).indexedDB = fake.factory;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
  delete (globalThis as { indexedDB?: unknown }).indexedDB;
  delete (globalThis as { location?: unknown }).location;
  delete (globalThis as { window?: unknown }).window;
  vi.restoreAllMocks();
});

async function jumpTo(search: string) {
  (globalThis as { location?: unknown }).location = { search };
  const scene = new THREE.Scene();
  const moveModifiers = new MoveModifiers();
  const world = new World(scene, physics, {
    colliders: new TerrainColliders(physics, { patchSize: 50, cells: 16 }),
    moveModifier: () => moveModifiers.state(),
  });
  const element = Object.assign(new EventTarget(), { requestPointerLock: () => {} }) as unknown as HTMLElement;
  const input = new InputManager(element, new EventTarget(), Object.assign(new EventTarget(), { pointerLockElement: null }), { storage: null });
  const game = new Game({ scene, physics, world, input, moveModifiers, report: () => {} });
  cleanups.push(() => { game.dispose(); world.dispose(); });
  await game.loadPlugins(PLUGIN_MODULES as Record<string, PluginModule>);
  const jump = (globalThis as { __act1?: Act1Jump }).__act1;
  for (let i = 0; i < 600 && jump && !jump.finished; i++) {
    game.fixedUpdate();
    if (i % 20 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  for (let i = 0; i < 30; i++) game.fixedUpdate();
  return { ctx: game.ctx, jump, quests: game.ctx.services.require('quests') };
}

describe('?act1= on the real game', () => {
  it('d01: every prerequisite done the real way, D01 active, Tobb joined, fog standing, nothing saved', async () => {
    const t = await jumpTo('?act1=d01&new');
    expect(t.jump?.phase).toBe('done');
    for (const q of ACT1_PREREQS.d01) expect(t.quests.state(q), q).toBe('completed');
    expect(t.quests.state('d01')).toBe('active');
    const s = t.ctx.state;
    expect(s.getBool('tutorial.complete')).toBe(true);
    expect(s.getBool('ability.surge-leap.learned')).toBe(true);
    expect(s.getBool('enemies.mercy.release')).toBe(true);
    expect(s.getBool('enemies.mercy.spare')).toBe(true);
    expect(s.getBool('story.m05.tobbJoined')).toBe(true);
    expect(s.getBool('story.m05.complete')).toBe(true);
    expect(s.getBool('world.deadroad.wardstones.done')).toBe(true);
    expect(s.getBool('shrine.quenchstone.lit')).toBe(true);
    expect(t.ctx.services.require('companions').active()).toContain('tobb');
    // The session hold keeps every save request away from the store.
    const r = await t.ctx.services.require('save').saveNow('manual');
    expect(r.ok).toBe(false);
    expect(fake.keys().filter((k) => k !== 'slot-0.backup')).toEqual([]);
  }, 60000);

  it('r02: only M01 and M02 done, R02 active, mercy still locked, the blocking dummies stand', async () => {
    const t = await jumpTo('?act1=r02&new');
    expect(t.jump?.phase).toBe('done');
    expect(t.quests.state('m03')).toBe('inactive');
    expect(t.quests.state('r02')).toBe('active');
    expect(t.ctx.state.getBool('enemies.mercy.release')).toBe(false);
    expect([...t.ctx.actors.all()].some((a) => a.kind === 'blocking-dummy') || !t.ctx.services.get('dummies')).toBe(true);
  }, 60000);

  it('leaves a real save on the same origin untouched (the &new boot skips the slot clear)', async () => {
    fake.seed('slot-0', slice1Complete);
    fake.seed('autosave', slice1Complete);
    // The save plugin reads its boot parameters from window.location.
    (globalThis as { window?: unknown }).window = { location: { search: '?act1=m03&new' } };
    const t = await jumpTo('?act1=m03&new');
    expect(t.jump?.phase).toBe('done');
    expect(fake.peek('slot-0')).toEqual(slice1Complete);
    expect(fake.peek('autosave')).toEqual(slice1Complete);
  }, 60000);

  it('without &new nothing happens', async () => {
    const t = await jumpTo('?act1=m04');
    expect(t.jump).toBeUndefined();
    expect(t.quests.state('m04')).toBe('inactive');
  }, 60000);
});
