// v0.6 ally rules (actors-and-damage.md section 11): ally hits on foes in a mercy state, the staggered floor,
// no revocation or Calm closing by an ally, the boss spare outcome and `allyMayEngage`.
import * as THREE from 'three';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import { GameEvents, type GameEventMap } from '../core/events';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { PluginModule } from '../core/plugins';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { WorldState } from '../state/WorldState';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import type { MercyState } from './Actor';
import { ActorRegistry } from './ActorRegistry';
import { AllyEngagement } from './allyEngage';
import { BossRegistry, type BossDef } from './BossRegistry';
import { ALLY_STAGGER_FLOOR_ID, DamageResolver, type DamageRequest } from './DamageResolver';
import { playerInit } from './teams';

function make() {
  const events = new GameEvents(() => {});
  const actors = new ActorRegistry(events);
  const dr = new DamageResolver(actors, events, () => {});
  const state = new WorldState(events, () => {});
  const bosses = new BossRegistry({ events, actors, damage: dr, state, report: () => {} });
  const player = actors.spawn(playerInit());
  const ally = actors.spawn({ kind: 'companion:hrolf', team: 'ally', maxHealth: 80 });
  const foe = actors.spawn({ kind: 'blighted-soldier', team: 'hostile', maxHealth: 30, maxPoise: 20 });
  let ms: MercyState = 'none';
  foe.mercyState = () => ms;
  const seen: { type: keyof GameEventMap; payload: unknown }[] = [];
  events.onAny((t, p) => seen.push({ type: t, payload: p }));
  const of = <K extends keyof GameEventMap>(t: K) => seen.filter((s) => s.type === t).map((s) => s.payload as GameEventMap[K]);
  const hitBy = (attackerId: string, amount: number, extra: Partial<DamageRequest> = {}) =>
    dr.apply({ attackerId, targetId: foe.id, amount, kind: 'melee', ...extra });
  return { events, actors, dr, state, bosses, player, ally, foe, of, seen, hitBy, set: (s: MercyState) => (ms = s) };
}

describe('ally hits on a foe in a mercy state', () => {
  it.each(['yielding', 'calming', 'releasing', 'leaving'] as const)('%s: an ally hit is dropped, no events', (s) => {
    const t = make();
    t.set(s);
    t.seen.length = 0;
    expect(t.hitBy(t.ally.id, 10)).toBeNull();
    expect(t.hitBy(t.ally.id, 5, { kind: 'status', statusId: 'bleed#1', statusKind: 'bleed' })).toBeNull();
    expect(t.foe.health).toBe(30);
    expect(t.seen).toEqual([]);
  });

  it("the player's hit on the same foe lands", () => {
    const t = make();
    t.set('yielding');
    expect(t.hitBy(t.player.id, 10)!.outcome).toBe('hit');
    expect(t.foe.health).toBe(20);
  });

  it('none: an ally hit lands and can kill', () => {
    const t = make();
    expect(t.hitBy(t.ally.id, 50)!.killed).toBe(true);
  });

  it('staggered: an ally hit lands but holds the foe at 1 HP (actor.saved by the core floor)', () => {
    const t = make();
    t.set('staggered');
    const r = t.hitBy(t.ally.id, 50)!;
    expect(r).toMatchObject({ outcome: 'hit', killed: false, saved: true, healthAfter: 1 });
    expect(t.foe.dead).toBe(false);
    expect(t.of('actor.saved')).toEqual([expect.objectContaining({ actorId: t.foe.id, handlerId: ALLY_STAGGER_FLOOR_ID })]);
    // An ally status tick at 1 HP holds too.
    expect(t.hitBy(t.ally.id, 5, { kind: 'status', statusId: 'ignite#1', statusKind: 'ignite' })!.killed).toBe(false);
    expect(t.foe.health).toBe(1);
    // The player decides: their hit kills.
    expect(t.hitBy(t.player.id, 5)!.killed).toBe(true);
  });

  it('a throwing mercyState reads as none', () => {
    const t = make();
    t.foe.mercyState = () => {
      throw new Error('boom');
    };
    expect(t.hitBy(t.ally.id, 5)!.outcome).toBe('hit');
  });
});

describe('boss spare (v0.6)', () => {
  const DEF: BossDef = { bossId: 'thrandil-redmane', nameKey: 'boss.thrandil-redmane', phases: [], breaksPerPhase: 1, mercyVerb: 'spare' };
  const windowOpen = (t: ReturnType<typeof make>, def: BossDef) => {
    t.bosses.register(t.foe.id, def);
    t.foe.restorePoise();
    t.dr.stagger(t.foe.id, t.player.id, 100);
    expect(t.bosses.state(def.bossId)!.releaseOpen).toBe(true);
  };

  it("a 'spare' boss: outcome 'spared', boss.released then boss.spared", () => {
    const t = make();
    t.foe.mercyState = undefined;
    windowOpen(t, DEF);
    t.seen.length = 0;
    expect(t.bosses.release('thrandil-redmane')).toBe(true);
    expect(t.state.getString('boss.thrandil-redmane.outcome')).toBe('spared');
    expect(t.bosses.state('thrandil-redmane')!.outcome).toBe('spared');
    expect(t.seen.filter((s) => s.type === 'boss.released' || s.type === 'boss.spared').map((s) => s.type)).toEqual([
      'boss.released',
      'boss.spared',
    ]);
    expect(t.of('boss.spared')).toEqual([{ bossId: 'thrandil-redmane', actorId: t.foe.id }]);
    expect(t.foe.mercyState!()).toBe('leaving');
  });

  it("the default verb stays 'released' with no boss.spared", () => {
    const t = make();
    t.foe.mercyState = undefined;
    windowOpen(t, { ...DEF, bossId: 'ashen-prior', mercyVerb: undefined });
    expect(t.bosses.release('ashen-prior')).toBe(true);
    expect(t.state.getString('boss.ashen-prior.outcome')).toBe('released');
    expect(t.of('boss.spared')).toEqual([]);
    expect(t.foe.mercyState!()).toBe('releasing');
  });

  it('the release window reads staggered: an ally cannot kill the boss in it', () => {
    const t = make();
    t.foe.mercyState = undefined;
    expect(t.bosses.mercyState('thrandil-redmane')).toBe('none');
    windowOpen(t, DEF);
    expect(t.foe.mercyState!()).toBe('staggered');
    expect(t.hitBy(t.ally.id, 999)!.killed).toBe(false);
    expect(t.foe.health).toBe(1);
  });

  it("the actor's own state shows through while the boss reads none", () => {
    const t = make();
    t.set('yielding');
    t.bosses.register(t.foe.id, DEF);
    expect(t.foe.mercyState!()).toBe('yielding');
  });
});

describe('allyMayEngage', () => {
  it('only targets aggroed on the player or an ally, alive, in no mercy state', () => {
    const t = make();
    const eng = new AllyEngagement(t.events, t.actors);
    const other = t.actors.spawn({ kind: 'hound', team: 'hostile', maxHealth: 10 });
    expect(eng.mayEngage(t.foe.id)).toBe(false); // not aggroed (a beast before its pounce)
    t.events.emit('ai.aggro', { actorId: t.foe.id, targetId: t.player.id });
    expect(eng.mayEngage(t.foe.id)).toBe(true);
    t.events.emit('ai.aggro', { actorId: other.id, targetId: t.ally.id });
    expect(eng.mayEngage(other.id)).toBe(true);
    t.set('yielding');
    expect(eng.mayEngage(t.foe.id)).toBe(false);
    t.set('none');
    t.events.emit('ai.calm', { actorId: t.foe.id });
    expect(eng.mayEngage(t.foe.id)).toBe(false);
    t.events.emit('ai.aggro', { actorId: other.id, targetId: t.foe.id }); // aggroed on a hostile: not ours
    expect(eng.mayEngage(other.id)).toBe(false);
    expect(eng.mayEngage('nobody')).toBe(false);
    eng.dispose();
  });
});

describe('the core plugin: an ally never revokes a mercy', () => {
  let physics: PhysicsWorld;
  beforeAll(() => {
    (globalThis as { self?: unknown }).self ??= globalThis;
  });
  beforeEach(async () => {
    physics = new PhysicsWorld();
    await physics.init();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  async function boot() {
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
    const modules: Record<string, PluginModule> = { '/src/test/core.plugin.ts': { default: corePlugin } };
    await game.loadPlugins(modules);
    return { game, ctx: game.ctx, done: () => (game.dispose(), world.dispose()) };
  }

  it('an ally hit on a spared soldier keeps the credit; the player hit revokes it', async () => {
    const { ctx, done } = await boot();
    const ally = ctx.actors.spawn({ kind: 'companion:hrolf', team: 'ally', maxHealth: 80 });
    const foe = ctx.actors.spawn({ kind: 'blighted-soldier', team: 'hostile', maxHealth: 30 });
    ctx.events.emit('mercy', { verb: 'spare', tier: 'normal', track: 'halvard', creature: 'blighted-soldier', actorId: foe.id });
    expect(ctx.state.isMercied(foe.id)).toBe(true);
    const revoked = vi.fn();
    ctx.events.on('mercy.revoked', revoked);
    ctx.events.emit('damage.dealt', { attackerId: ally.id, targetId: foe.id, amount: 1, poise: 0, kind: 'melee', outcome: 'hit', dealt: 1, poiseDealt: 0, healthAfter: 29, killed: false, saved: false, staggered: false });
    expect(ctx.state.isMercied(foe.id)).toBe(true);
    expect(revoked).not.toHaveBeenCalled();
    ctx.events.emit('damage.dealt', { attackerId: ctx.player.actor.id, targetId: foe.id, amount: 1, poise: 0, kind: 'melee', outcome: 'hit', dealt: 1, poiseDealt: 0, healthAfter: 28, killed: false, saved: false, staggered: false });
    expect(ctx.state.isMercied(foe.id)).toBe(false);
    expect(ctx.services.get('allyEngagement')).toBeDefined();
    done();
  });
});
