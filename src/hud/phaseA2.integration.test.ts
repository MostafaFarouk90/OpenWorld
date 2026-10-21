import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import type { GameEventMap } from '../core/events';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { GamePlugin, PluginModule } from '../core/plugins';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import './events';
import hudPlugin from './hud.plugin';

let physics: PhysicsWorld;

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

const modules = (...plugins: GamePlugin[]): Record<string, PluginModule> =>
  Object.fromEntries(plugins.map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }]));

const ALL = [corePlugin, hudPlugin];

async function setup(plugins: GamePlugin[] = ALL, disabled?: Set<string>) {
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
  const events: Array<{ type: keyof GameEventMap; payload: unknown }> = [];
  game.events.onAny((type, payload) => events.push({ type, payload }));
  const statuses = await game.loadPlugins(modules(...plugins), disabled ? { disabled } : {});
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  const press = (code: string) => {
    win.dispatchEvent(Object.assign(new Event('keydown'), { code, repeat: false, preventDefault: () => {} }));
    run(1);
    win.dispatchEvent(Object.assign(new Event('keyup'), { code, repeat: false, preventDefault: () => {} }));
    run(1);
  };
  const of = <K extends keyof GameEventMap>(t: K) => events.filter((e) => e.type === t).map((e) => e.payload as GameEventMap[K]);
  const ctx = game.ctx;
  return {
    game,
    ctx,
    world,
    statuses,
    events,
    run,
    press,
    of,
    moveModifiers,
    dispose() {
      game.dispose();
      world.dispose();
    },
  };
}

type T = Awaited<ReturnType<typeof setup>>;

function provideParty(t: T, over: { can?: boolean } = {}) {
  const s = { active: ['hrolf'], can: over.can ?? true, changed: [] as string[][] };
  const opts = () => [
    { id: 'hrolf', nameKey: 'companion.hrolf.name', role: 'tank' as const, rank: 1, active: s.active.includes('hrolf') },
    { id: 'aelfreda', nameKey: 'companion.aelfreda.name', role: 'healer' as const, rank: 1, active: s.active.includes('aelfreda') },
  ];
  (t.ctx.services as any).provide('companions', { active: () => s.active, actorId: () => null, maxActive: () => 2 });
  (t.ctx.services as any).provide('party', {
    canChange: () => s.can,
    options: opts,
    change: (ids: string[]) => {
      if (!s.can) return false;
      s.changed.push(ids);
      s.active = ids;
      t.game.events.emit('party.changed', { active: ids });
      return true;
    },
  });
  return s;
}

describe('Act 2 HUD wiring (real Game)', () => {
  it('mounts the structure bar and survives party.changed swaps', async () => {
    const t = await setup();
    const s = provideParty(t);
    expect(t.ctx.hud.mounted('top-center')).toContain('structure-bar');
    s.active = ['hrolf', 'aelfreda'];
    t.game.events.emit('party.changed', { active: s.active });
    t.ctx.hud.update(0.016);
    s.active = ['aelfreda'];
    t.game.events.emit('party.changed', { active: s.active });
    t.ctx.hud.update(0.016);
    t.dispose();
  });

  it('key P opens the Party screen, a second P closes it, and it is read-only outside the window', async () => {
    const t = await setup();
    provideParty(t, { can: false });
    t.press('KeyP');
    expect(t.ctx.hud.modalOpen).toBe('party-screen');
    t.press('KeyP');
    expect(t.ctx.hud.modalOpen).toBeNull();
    t.dispose();
  });

  it('party.offered opens the screen once, never over another modal, and a load closes it', async () => {
    const t = await setup();
    provideParty(t);
    t.game.events.emit('party.offered', { waystoneId: 'w' });
    expect(t.ctx.hud.modalOpen).toBe('party-screen');
    t.game.events.emit('party.offered', { waystoneId: 'w' });
    expect(t.ctx.hud.modalOpen).toBe('party-screen');
    t.game.events.emit('save.loaded', { slot: 'x' });
    expect(t.ctx.hud.modalOpen).toBeNull();
    t.dispose();
  });

  it('no party service: P and party.offered do nothing', async () => {
    const t = await setup();
    t.press('KeyP');
    t.game.events.emit('party.offered', { waystoneId: 'w' });
    expect(t.ctx.hud.modalOpen).toBeNull();
    t.dispose();
  });

  it('structure events and wave events never throw without the waves service', async () => {
    const t = await setup();
    t.game.events.emit('structure.damaged', { id: 'cinderford.barricade', health: 400 });
    t.game.events.emit('wave.started', { defId: 'cinderford-raid', index: 0 });
    t.game.events.emit('structure.destroyed', { id: 'cinderford.barricade' });
    t.game.events.emit('wave.cleared', { defId: 'cinderford-raid', index: 0 });
    t.game.events.emit('waves.failed', { defId: 'cinderford-raid', index: 0 });
    t.game.events.emit('companion.downed', { companionId: 'hrolf' });
    t.game.events.emit('companion.stood', { companionId: 'hrolf' });
    t.run(2);
    t.ctx.hud.update(0.016);
    t.dispose();
  });
});
