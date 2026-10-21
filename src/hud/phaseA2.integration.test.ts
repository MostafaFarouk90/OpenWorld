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

  it('Escape closes the Party screen opened by party.offered', async () => {
    const t = await setup();
    provideParty(t);
    t.game.events.emit('party.offered', { waystoneId: 'w' });
    expect(t.ctx.hud.modalOpen).toBe('party-screen');
    t.press('Escape');
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

  it('Act 2 ending card: the gate shows it once, it sets its own seen flag when shown, and dismissing emits the Act 2 id', async () => {
    const t = await setup();
    const closed: string[] = [];
    t.game.events.on('hud.actEnding.closed', (e) => closed.push(e.endingId));
    expect(t.ctx.services.get('actEndingCard')!.active()).toBe(false);
    t.ctx.state.setFlag('story.gate.a3', true);
    expect(t.ctx.services.get('actEndingCard')!.active()).toBe(true);
    t.ctx.hud.update(0.016);
    expect(t.ctx.state.getBool('codex.actEnding.a2.seen')).toBe(true);
    expect(t.ctx.state.getBool('codex.actEnding.a1.seen')).toBe(false);
    t.ctx.services.get('actEndingCard')!.dismiss();
    expect(closed).toEqual(['the-houses-stand']);
    expect(t.ctx.services.get('actEndingCard')!.active()).toBe(false);
    t.dispose();
  });

  it('Act 1 and Act 2 cards answer only their own act', async () => {
    const t = await setup();
    t.game.events.emit('act.ended', { act: 2, endingId: 'smoke-over-harrowmark' });
    expect(t.ctx.services.get('actEndingCard')!.active()).toBe(false);
    t.game.events.emit('act.ended', { act: 1, endingId: 'the-houses-stand' });
    expect(t.ctx.services.get('actEndingCard')!.active()).toBe(false);
    t.game.events.emit('act.ended', { act: 1, endingId: 'smoke-over-harrowmark' });
    expect(t.ctx.services.get('actEndingCard')!.active()).toBe(true);
    t.ctx.services.get('actEndingCard')!.dismiss();
    t.game.events.emit('act.ended', { act: 2, endingId: 'the-houses-stand' });
    expect(t.ctx.services.get('actEndingCard')!.active()).toBe(true);
    t.dispose();
  });

  it('an Act 1 complete save (gate a2, legacy seen key only) shows no card of either act', async () => {
    const t = await setup();
    t.ctx.state.setFlag('codex.actEndingSeen', true);
    t.ctx.state.setFlag('story.gate.a2', true);
    t.game.events.emit('save.loaded', { slot: 'x' });
    expect(t.ctx.services.get('actEndingCard')!.active()).toBe(false);
    t.dispose();
  });

  it('an Act 2 save with the card seen, or the camp seen, does not replay it on load', async () => {
    const t = await setup();
    t.ctx.state.setFlag('codex.actEnding.a2.seen', true);
    t.ctx.state.setFlag('story.gate.a3', true);
    t.game.events.emit('save.loaded', { slot: 'x' });
    expect(t.ctx.services.get('actEndingCard')!.active()).toBe(false);
    t.dispose();
    const u = await setup();
    u.ctx.state.setFlag('story.a2.campSeen', true);
    u.ctx.state.setFlag('story.gate.a3', true);
    u.game.events.emit('save.loaded', { slot: 'x' });
    expect(u.ctx.services.get('actEndingCard')!.active()).toBe(false);
    u.dispose();
  });

  it('swaps in the tempering screen once the gear service exists, and only once', async () => {
    const t = await setup();
    const calls: unknown[] = [];
    t.run(2);
    expect(calls).toEqual([]);
    (t.ctx.services as any).provide('gear', { setScreen: (f: unknown) => calls.push(f) });
    t.run(5);
    expect(calls).toHaveLength(1);
    expect(typeof calls[0]).toBe('function');
    t.dispose();
  });

  it('the pressure bar reads the puzzles service and survives puzzle events with none', async () => {
    const t = await setup();
    t.game.events.emit('puzzle.state', { id: 'weeping-bellows', phase: 'pressure' });
    t.game.events.emit('puzzle.failed', { id: 'weeping-bellows' });
    t.game.events.emit('puzzle.solved', { id: 'weeping-bellows' });
    t.ctx.hud.update(0.016);
    expect(t.ctx.hud.mounted('top-center')).toContain('pressure-bar');
    t.dispose();
  });
});
