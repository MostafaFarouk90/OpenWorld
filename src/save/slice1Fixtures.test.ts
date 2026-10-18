// Slice 1 saves (written by the real save plugin at the slice 1 tip 5a09676, see __fixtures__/README.md) load
// into slice 2 through the real save plugin and every real plugin.
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { PluginModule } from '../core/plugins';
import { PLUGIN_MODULES } from '../core/pluginManifest';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import { createLeadSource } from '../quests/leads';
import { FakeIndexedDb } from './__fixtures__/fakeIndexedDb';

const FIXTURES = import.meta.glob<unknown>('./__fixtures__/slice1-*.json', { eager: true, import: 'default' });
const fixture = (name: string): unknown => structuredClone(FIXTURES[`./__fixtures__/${name}.json`]);

let physics: PhysicsWorld;
let fake: FakeIndexedDb;
let warn: ReturnType<typeof vi.spyOn>;
const cleanups: Array<() => void> = [];
beforeEach(async () => {
  (globalThis as { self?: unknown }).self ??= globalThis;
  physics = new PhysicsWorld();
  await physics.init();
  fake = new FakeIndexedDb();
  (globalThis as { indexedDB?: unknown }).indexedDB = fake.factory;
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
  delete (globalThis as { indexedDB?: unknown }).indexedDB;
  vi.restoreAllMocks();
});

async function bootWith(name: string | null, raw?: unknown) {
  const file = raw ?? (name ? fixture(name) : undefined);
  if (file !== undefined) {
    fake.seed('slot-0', file);
    fake.seed('autosave', file);
  }
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
  const statuses = await game.loadPlugins(PLUGIN_MODULES as Record<string, PluginModule>);
  const run = async (n: number) => {
    for (let i = 0; i < n; i++) {
      game.fixedUpdate();
      if (i % 20 === 0) await new Promise((r) => setTimeout(r, 0));
    }
  };
  await run(5);
  const ctx = game.ctx;
  const save = ctx.services.require('save');
  // The load teleports through the waystones service, which waits on ticks: keep the game stepping meanwhile.
  let loaded: boolean | null = null;
  void save.continueNow().then((ok) => { loaded = ok; });
  for (let i = 0; i < 1200 && loaded === null; i++) await run(1);
  await run(30);
  const quests = ctx.services.require('quests');
  const leads = () =>
    createLeadSource({
      env: () => ({ state: ctx.state, quests }),
      npcPosition: () => ({ x: 0, z: 0 }),
      anchor: () => undefined,
      warn: () => {},
    }).markers().map((m) => m.id);
  const tutorial = () => (globalThis as { __tutorial?: { beat: string | null; complete: boolean } }).__tutorial!;
  return { game, ctx, statuses, loaded, run, quests, leads, tutorial };
}

const saveWarnings = () => warn.mock.calls.map((c) => String(c[0])).filter((m) => m.startsWith('save:') && !m.includes('request dropped'));
// (a zone save asked for during the load is dropped by design; only entry problems count here)

describe('slice 1 saves load into slice 2', () => {
  it('a completed tutorial (M01 active) keeps M01 and offers nothing new; mercy stays locked', async () => {
    const t = await bootWith('slice1-tutorial-complete');
    expect(t.statuses.filter((s) => s.state === 'failed')).toEqual([]);
    expect(t.loaded).toBe(true);
    expect(t.tutorial().complete).toBe(true);
    expect(t.quests.state('m01')).toBe('active');
    expect(t.quests.state('m03')).toBe('inactive');
    expect(t.leads()).not.toContain('lead.m03');
    expect(t.ctx.state.getBool('enemies.mercy.release')).toBe(false);
    expect(t.ctx.state.getBool('enemies.mercy.spare')).toBe(false);
  }, 60000);

  it('a slice 1 save with M02 done leads to Aelfreda and M03; mercy stays locked until M03', async () => {
    const t = await bootWith('slice1-complete');
    expect(t.loaded).toBe(true);
    expect(t.quests.state('m02')).toBe('completed');
    expect(t.leads()).toEqual(expect.arrayContaining(['lead.m03', 'lead.r01', 'lead.r02']));
    expect(t.leads()).not.toContain('lead.m04');
    expect(t.ctx.state.getBool('enemies.mercy.release')).toBe(false);
    expect(t.ctx.state.getBool('enemies.mercy.spare')).toBe(false);
    // M03 starts from Aelfreda's offer.
    expect(t.quests.start('m03')).toBe(true);
  }, 60000);

  it('migrates progression v1 to v2: no class chosen, knight skills kept', async () => {
    const t = await bootWith('slice1-complete');
    const p = t.ctx.services.require('progression') as unknown as { classId: string | null; learned(id: string): boolean; level: number };
    expect(p.classId).toBeNull();
    expect(p.learned('knight.rallyCry')).toBe(true);
    expect(p.level).toBeGreaterThanOrEqual(2);
  }, 60000);

  it('keys absent from slice 1 (codex, companions, interior, shrine) start at defaults without save warnings', async () => {
    const raw = fixture('slice1-complete') as { entries: Record<string, unknown> };
    for (const k of ['codex', 'companions', 'interior', 'shrine']) expect(raw.entries[k]).toBeUndefined();
    const t = await bootWith('slice1-complete');
    expect(saveWarnings()).toEqual([]);
    expect(t.ctx.services.require('companions').active()).toEqual([]);
    expect(t.ctx.services.require('interiors').current).toBeNull();
    expect(t.ctx.state.getBool('story.m05.tobbJoined')).toBe(false);
  }, 60000);

  it('a save mid-M02 keeps M02 active and shows no M03 lead', async () => {
    const t = await bootWith('slice1-mid-m02');
    expect(t.quests.state('m02')).toBe('active');
    expect(t.leads()).not.toContain('lead.m03');
  }, 60000);

  it('a mid-tutorial save resumes its beat (t09)', async () => {
    const t = await bootWith('slice1-mid-tutorial-t09');
    expect(t.loaded).toBe(true);
    await t.run(30);
    expect(t.tutorial().complete).toBe(false);
    expect(t.tutorial().beat).toBe('t09');
  }, 60000);

  it('a corrupt or newer-format save is still refused', async () => {
    const good = fixture('slice1-complete') as Record<string, unknown>;
    const newer = await bootWith(null, { ...good, format: 99 });
    expect(newer.loaded).toBe(false);
    expect(newer.quests.state('m02')).toBe('inactive');
    for (const c of cleanups.splice(0)) c();
    const corrupt = await bootWith(null, { ...good, entries: 'nope' });
    expect(corrupt.loaded).toBe(false);
  }, 60000);
});
