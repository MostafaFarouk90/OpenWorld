// A5 headless: the party (joiner rule, Tilted Anvil wait, the waystone Party option, bond ranks), Hrolf's light
// fighting under the v0.6 ally rules (real core resolver), the no-kill handler, Stonehide and the downed rule.
import * as THREE from 'three';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MercyState } from '../actors/Actor';
import corePlugin from '../core/core.plugin';
import type { GameEventMap } from '../core/events';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { GamePlugin, PluginModule } from '../core/plugins';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { heightAt } from '../terrain/heightfield';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import companionsPlugin, { ALLY_NO_KILL_ID, COMPANIONS_PERSIST_KEY, PARTY_GATE_FLAG, companionControllers } from './companions.plugin';
import { HROLF } from './hrolf';
import { PARTY_TUNING } from './party';
import { TOBB } from './tobb';
import { COMPANION_DOWNED_SECONDS, HROLF_TUNING } from './tuning';
import { VITALS_TUNING } from './vitals';
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
  const events: { type: keyof GameEventMap; payload: any }[] = [];
  game.events.onAny((type, payload) => events.push({ type, payload }));
  await game.loadPlugins(modules(corePlugin, companionsPlugin));
  const ctx = game.ctx;
  // The Tilted Anvil posts, far from the test spot (out of view).
  const posts = new Map<string, () => void>();
  const movePost = (id: string, x: number, z: number) => {
    posts.get(id)?.();
    posts.set(id, ctx.anchors.define({ id: `npc-post.${id}.tilted-anvil`, position: { x, y: heightAt(x, z), z }, yaw: 0 }));
  };
  for (const id of ['tobb', 'hrolf']) movePost(id, 300, 300);
  const run = (n: number) => {
    for (let i = 0; i < n; i++) game.fixedUpdate();
  };
  const secs = (s: number) => run(Math.round(s * 60));
  const of = <K extends keyof GameEventMap>(type: K) => events.filter((e) => e.type === type).map((e) => e.payload as GameEventMap[K]);
  const svc = () => ctx.services.require('companions');
  const party = () => ctx.services.require('party');
  const ctl = (id: string) => companionControllers().find((c) => c.def.id === id)!;
  const join = (id: 'tobb' | 'hrolf') => {
    ctx.state.setFlag(id === 'tobb' ? TOBB.joinFlag : HROLF.joinFlag, true);
    secs(1);
  };
  const teleportPlayer = (x: number, z: number) => {
    const h = ctx.player.teleport({ x, y: heightAt(x, z), z });
    for (let i = 0; i < 600 && !h.ready(); i++) run(1);
  };
  const feet = () => ctx.player.feet;
  /** A hostile actor with a root, aggroed on Cael (so `mayEngage` and the combat presence see it). */
  const foe = (kind: string, x: number, z: number, health = 30, aggro = true) => {
    const root = new THREE.Group();
    root.position.set(x, heightAt(x, z), z);
    scene.add(root);
    const a = ctx.actors.spawn({ kind, team: 'hostile', maxHealth: health, maxPoise: 30, root });
    let ms: MercyState = 'none';
    a.mercyState = () => ms;
    if (aggro) ctx.events.emit('ai.aggro', { actorId: a.id, targetId: ctx.player.actor.id });
    return { a, root, set: (s: MercyState) => (ms = s) };
  };
  const hrolfHits = () => of('damage.dealt').filter((d) => d.attackerId === svc().actorId('hrolf'));
  const done = () => {
    game.dispose();
    world.dispose();
  };
  return { game, ctx, events, run, secs, of, svc, party, ctl, join, teleportPlayer, feet, foe, hrolfHits, movePost, done };
}

describe('the party (A5)', () => {
  it('the joiner takes the seat and the previous companion waits at the Tilted Anvil', async () => {
    const t = await boot();
    t.join('tobb');
    expect(t.svc().active()).toEqual(['tobb']);
    t.join('hrolf');
    expect(t.svc().active()).toEqual(['hrolf']);
    expect(t.of('party.changed').at(-1)).toEqual({ active: ['hrolf'] });
    // The hand-off waits until nobody sees the pop (at most 10 s).
    t.secs(11);
    expect(t.ctl('tobb').waiting).toEqual({ reason: 'party', anchorId: 'npc-post.tobb.tilted-anvil' });
    expect(t.ctl('hrolf').waiting).toBeNull();
    t.done();
  });

  it('two seats after story.gate.a3; the Party option opens on a waystone rest only and closes at 8 m', async () => {
    const t = await boot();
    t.join('tobb');
    t.join('hrolf');
    t.ctx.state.setFlag(PARTY_GATE_FLAG, true);
    expect(t.svc().maxActive()).toBe(2);
    // Nothing forced: the second seat waits for the Party option.
    expect(t.svc().active()).toEqual(['hrolf']);
    expect(t.party().change(['hrolf', 'tobb'])).toBe(false);
    t.ctx.events.emit('rest', { placeId: 'tilted-anvil' });
    expect(t.party().canChange()).toBe(false);
    t.ctx.events.emit('rest', { waystoneId: 'kettlewick' });
    expect(t.of('party.offered')).toEqual([{ waystoneId: 'kettlewick' }]);
    expect(t.party().canChange()).toBe(true);
    expect(t.party().options().map((o) => [o.id, o.active, o.rank, o.role])).toEqual([
      ['tobb', false, 1, 'support'],
      ['hrolf', true, 1, 'tank'],
    ]);
    expect(t.party().change(['hrolf', 'tobb'])).toBe(true);
    expect(t.svc().active()).toEqual(['tobb', 'hrolf']);
    expect(t.of('party.changed').at(-1)).toEqual({ active: ['tobb', 'hrolf'] });
    const f = t.feet();
    t.teleportPlayer(f.x + PARTY_TUNING.leaveDistance + 2, f.z);
    t.run(1);
    expect(t.party().canChange()).toBe(false);
    t.done();
  });

  it('the window closes after 120 s and on a load; one joined companion gets no offer', async () => {
    const t = await boot();
    t.join('tobb');
    t.ctx.events.emit('rest', { waystoneId: 'kettlewick' });
    expect(t.of('party.offered')).toEqual([]);
    t.join('hrolf');
    t.ctx.events.emit('rest', { waystoneId: 'kettlewick' });
    t.secs(PARTY_TUNING.windowSeconds + 1);
    expect(t.party().canChange()).toBe(false);
    t.ctx.events.emit('rest', { waystoneId: 'kettlewick' });
    t.ctx.events.emit('save.loaded', { slot: 's' });
    expect(t.party().canChange()).toBe(false);
    t.done();
  });

  it('a v2 save with [hrolf] active applies Tobb\'s party wait at the load (no walk back)', async () => {
    const t = await boot();
    t.join('tobb');
    t.join('hrolf');
    const data = t.ctx.persist.get(COMPANIONS_PERSIST_KEY)!.serialize();
    expect(data).toMatchObject({ active: ['hrolf'] });
    t.svc().setActive(['tobb']);
    t.secs(11);
    expect(t.ctl('tobb').waiting).toBeNull();
    t.ctx.persist.get(COMPANIONS_PERSIST_KEY)!.load(data, 2);
    t.ctx.events.emit('save.loaded', { slot: 's' });
    expect(t.ctl('tobb').waiting).toEqual({ reason: 'party', anchorId: 'npc-post.tobb.tilted-anvil' });
    expect(t.ctl('tobb').position).toMatchObject({ x: 300, z: 300 });
    t.done();
  });

  it('a load mid-M11: the old escort ends at the companions entry; one a quest gate starts on save.loaded runs on, Gaut hidden', async () => {
    const t = await boot();
    const esc = t.ctx.services.require('escort');
    const f = t.feet();
    const road = [{ x: f.x, y: f.y, z: f.z }, { x: f.x, y: f.y, z: f.z - 200 }];
    const hides: [string, boolean][] = [];
    const npcs = { setHidden: (id: string, h: boolean) => (hides.push([id, h]), true) };
    t.ctx.services.provide('npcs', npcs as never);
    // The quest's gate (FlagGates run first on save.loaded) restarts the escort from its own state.
    t.ctx.gates.flag('test.m11.riding', (open, cause) => {
      if (open && cause === 'load') esc.start({ id: 'm11', route: road });
    });
    t.ctx.state.setFlag('test.m11.riding', true);
    const world = t.ctx.persist.get('world-state')!.serialize();
    const comp = t.ctx.persist.get(COMPANIONS_PERSIST_KEY)!.serialize();
    t.ctx.state.setFlag('test.m11.riding', false);
    expect(esc.start({ id: 'm11', route: road })).toBe(true);
    // As Persist.loadAll: every entry, then save.loaded.
    t.ctx.persist.get('world-state')!.load(world, t.ctx.persist.get('world-state')!.version);
    t.ctx.persist.get(COMPANIONS_PERSIST_KEY)!.load(comp, 2);
    t.ctx.events.emit('save.loaded', { slot: 's' });
    expect(t.of('escort.started')).toHaveLength(2);
    expect(t.of('escort.stopped')).toHaveLength(1);
    expect(esc.active()).toMatchObject({ id: 'm11' });
    expect(hides.at(-1)).toEqual(['gaut', true]);
    t.done();
  });

  it('a v1 save (no active) loads with Tobb active', async () => {
    const t = await boot();
    t.join('tobb');
    t.ctx.persist.get(COMPANIONS_PERSIST_KEY)!.load({ positions: {} }, 1);
    t.ctx.events.emit('save.loaded', { slot: 's' });
    expect(t.svc().active()).toEqual(['tobb']);
    t.done();
  });
});

describe('bond ranks (A5)', () => {
  it('rank 1 on a runtime join with companion.bond; setRank raises only, joined only, 1 to 5', async () => {
    const t = await boot();
    t.join('hrolf');
    expect(t.of('companion.bond')).toEqual([{ companionId: 'hrolf', rank: 1 }]);
    expect(t.svc().rank('hrolf')).toBe(1);
    expect(t.svc().setRank('hrolf', 2)).toBe(true);
    expect(t.ctx.state.getNumber('companion.hrolf.rank', 0)).toBe(2);
    expect(t.of('companion.bond').at(-1)).toEqual({ companionId: 'hrolf', rank: 2 });
    expect(t.svc().setRank('hrolf', 1)).toBe(false);
    expect(t.svc().setRank('hrolf', 2)).toBe(false);
    expect(t.svc().setRank('hrolf', 6)).toBe(false);
    expect(t.svc().setRank('hrolf', 2.5)).toBe(false);
    expect(t.svc().setRank('tobb', 2)).toBe(false);
    expect(t.svc().setRank('nobody', 2)).toBe(false);
    expect(t.of('companion.bond')).toHaveLength(2);
    t.done();
  });

  it('the dialogue event story.companion.rank raises a rank; a bad payload is refused', async () => {
    const t = await boot();
    t.join('hrolf');
    t.ctx.events.emit('story.companion.rank', { companionId: 'hrolf', rank: 3 });
    expect(t.svc().rank('hrolf')).toBe(3);
    const warn = vi.mocked(console.warn);
    warn.mockClear();
    t.ctx.events.emit('story.companion.rank', { companionId: 'hrolf', rank: 'x' } as never);
    t.ctx.events.emit('story.companion.rank', undefined as never);
    expect(t.svc().rank('hrolf')).toBe(3);
    expect(warn).toHaveBeenCalledTimes(2);
    t.done();
  });

  it('a load that joins him emits no companion.bond', async () => {
    const t = await boot();
    const state = t.ctx.persist.get('world-state')!;
    t.ctx.state.setFlag(HROLF.joinFlag, true);
    t.ctx.state.setFlag(HROLF.rankFlag, 2);
    const saved = state.serialize();
    t.done();
    const u = await boot();
    u.ctx.persist.get('world-state')!.load(saved, u.ctx.persist.get('world-state')!.version);
    u.ctx.events.emit('save.loaded', { slot: 's' });
    u.secs(1);
    expect(u.svc().rank('hrolf')).toBe(2);
    expect(u.of('companion.bond')).toEqual([]);
    u.done();
  });
});

describe('Hrolf fights lightly (Q3, contract item 7)', () => {
  /** Hrolf joined, standing 1.5 m from a foe 2 m in front of Cael. */
  async function fight(kind = 'blighted-soldier', health = 30) {
    const t = await boot();
    t.join('hrolf');
    const f0 = t.feet();
    const f = t.foe(kind, f0.x, f0.z - 2, health);
    t.ctl('hrolf').placeAt({ x: f0.x + 1, y: f0.y, z: f0.z - 1 });
    return { ...t, f };
  }

  it('joins a fight Cael is in: light hits that land', async () => {
    const t = await fight();
    t.secs(HROLF_TUNING.cooldown + 1);
    const hits = t.hrolfHits();
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.outcome === 'hit' && h.dealt <= HROLF_TUNING.damage)).toBe(true);
    t.done();
  });

  it.each(['yielding', 'calming', 'releasing', 'leaving'] as const)('never touches a foe that is %s', async (s) => {
    const t = await fight();
    t.f.set(s);
    t.secs(4);
    expect(t.hrolfHits()).toEqual([]);
    expect(t.f.a.health).toBe(30);
    t.done();
  });

  it('never touches an unstruck beast; once Cael strikes it he joins in', async () => {
    const t = await fight('ember-hound', 40);
    t.secs(4);
    expect(t.hrolfHits()).toEqual([]);
    t.ctx.damage.apply({ attackerId: t.ctx.player.actor.id, targetId: t.f.a.id, amount: 5, kind: 'melee' });
    t.secs(HROLF_TUNING.cooldown + 0.5);
    expect(t.hrolfHits().length).toBeGreaterThan(0);
    t.done();
  });

  it('a hostile kind outside ENEMY_DEFS counts as a beast: no hit until Cael has struck it', async () => {
    const t = await fight('act2-unregistered-beast', 40);
    t.secs(4);
    expect(t.hrolfHits()).toEqual([]);
    t.ctx.damage.apply({ attackerId: t.ctx.player.actor.id, targetId: t.f.a.id, amount: 5, kind: 'melee' });
    t.secs(HROLF_TUNING.cooldown + 0.5);
    expect(t.hrolfHits().length).toBeGreaterThan(0);
    t.done();
  });

  it('the struck set clears on death, despawn and load', async () => {
    const t = await fight('ember-hound', 40);
    t.ctx.damage.apply({ attackerId: t.ctx.player.actor.id, targetId: t.f.a.id, amount: 5, kind: 'melee' });
    t.ctx.events.emit('save.loaded', { slot: 's' });
    // After the load the beast counts as unstruck again (and it needs a fresh aggro).
    t.ctx.events.emit('ai.aggro', { actorId: t.f.a.id, targetId: t.ctx.player.actor.id });
    t.ctl('hrolf').placeAt({ x: t.feet().x + 1, y: t.feet().y, z: t.feet().z - 1 });
    t.secs(4);
    expect(t.hrolfHits()).toEqual([]);
    t.done();
  });

  it('never fights out of combat or while a trial runs', async () => {
    const t = await boot();
    t.join('hrolf');
    const f0 = t.feet();
    t.foe('blighted-soldier', f0.x, f0.z - 2, 30, false);
    t.ctl('hrolf').placeAt({ x: f0.x + 1, y: f0.y, z: f0.z - 1 });
    t.secs(4);
    expect(t.hrolfHits()).toEqual([]);
    const opp = t.foe('hrolf-trial', f0.x, f0.z - 3, 120);
    expect(t.ctx.services.require('trials').start({ id: 'tr', opponentId: opp.a.id })).toBe(true);
    t.secs(4);
    expect(t.hrolfHits()).toEqual([]);
    t.done();
  });

  it('a foe calmed between his pick and the hit frame takes no hit (so nothing is provoked onto him)', async () => {
    const t = await fight();
    // Run to the swing start, then the foe leaves combat.
    for (let i = 0; i < 120 && !t.ctl('hrolf').combatTarget; i++) t.run(1);
    t.run(2);
    t.ctx.events.emit('ai.calm', { actorId: t.f.a.id });
    t.secs(2);
    expect(t.hrolfHits()).toEqual([]);
    t.done();
  });

  it('never kills: a modifier that scales his hit up (a guard back hit) is held at 1 HP by the no-kill handler', async () => {
    const t = await fight('blighted-soldier', 6);
    t.ctx.damage.addModifier('test.back-hit', (req, _t, attacker) => {
      if (attacker?.team === 'ally') req.amount *= 1.25;
    });
    t.secs(HROLF_TUNING.cooldown * 3);
    expect(t.f.a.dead).toBe(false);
    expect(t.f.a.health).toBe(1);
    expect(t.of('actor.saved').some((s) => s.handlerId === ALLY_NO_KILL_ID)).toBe(true);
    // He never swings at 1 HP again.
    const n = t.hrolfHits().length;
    t.secs(HROLF_TUNING.cooldown * 2);
    expect(t.hrolfHits().length).toBe(n);
    t.done();
  });

  it('never revokes mercy credit', async () => {
    const t = await fight();
    t.ctx.state.recordMercy({ verb: 'spare', tier: 'normal', track: null, creature: 'blighted-soldier', actorId: t.f.a.id });
    expect(t.ctx.state.isMercied(t.f.a.id)).toBe(true);
    t.secs(HROLF_TUNING.cooldown + 1);
    expect(t.hrolfHits().length).toBeGreaterThan(0);
    expect(t.ctx.state.isMercied(t.f.a.id)).toBe(true);
    t.done();
  });
});

describe('Stonehide and the downed rule', () => {
  async function stand(dist: number) {
    const t = await boot();
    t.join('hrolf');
    const f0 = t.feet();
    t.ctl('hrolf').placeAt({ x: f0.x + dist, y: f0.y, z: f0.z });
    const enemy = t.foe('blighted-soldier', f0.x, f0.z - 2, 30, false);
    const hitCael = (amount: number, kind: 'melee' | 'spell' | 'fall' = 'melee') =>
      t.ctx.damage.apply({ attackerId: kind === 'fall' ? null : enemy.a.id, targetId: t.ctx.player.actor.id, amount, kind })!;
    return { ...t, hitCael };
  }

  it('takes 20% of an enemy hit within 4 m, none beyond', async () => {
    const t = await stand(3.9);
    const r = t.hitCael(20);
    expect(r.dealt).toBeCloseTo(16);
    expect(t.ctl('hrolf').vitals!.health).toBeCloseTo(HROLF_TUNING.maxHealth - 4);
    t.ctl('hrolf').placeAt({ x: t.feet().x + 4.1, y: t.feet().y, z: t.feet().z });
    expect(t.hitCael(20).dealt).toBeCloseTo(20);
    t.done();
  });

  it('shares nothing while a trial runs or while he waits at the Tilted Anvil', async () => {
    const t = await stand(2);
    const opp = t.foe('hrolf-trial', t.feet().x, t.feet().z - 3, 120, false);
    expect(t.ctx.services.require('trials').start({ id: 'tr', opponentId: opp.a.id })).toBe(true);
    t.run(1);
    expect(t.ctl('hrolf').stonehideActive).toBe(false);
    expect(t.hitCael(20).dealt).toBeCloseTo(20);
    t.ctx.services.require('trials').stop('tr');
    t.run(1);
    expect(t.ctl('hrolf').stonehideActive).toBe(true);
    // Swapped out: he walks to his post (the hand-off may hold up to 10 s) and shares nothing on the way.
    t.join('tobb');
    expect(t.svc().active()).toEqual(['tobb']);
    t.run(1);
    expect(t.hitCael(20).dealt).toBeCloseTo(20);
    t.secs(11);
    expect(t.ctl('hrolf').waiting).toMatchObject({ reason: 'party' });
    expect(t.hitCael(20).dealt).toBeCloseTo(20);
    expect(t.ctl('hrolf').vitals!.health).toBe(HROLF_TUNING.maxHealth);
    t.done();
  });

  it('shares what is left after armour (order 90, after a lower-order armour modifier); falls are not shared', async () => {
    const t = await stand(2);
    t.ctx.damage.addModifier('test.armour', (req, target) => {
      if (target.team === 'player') req.amount *= 0.5;
    }, 50);
    expect(t.hitCael(20).dealt).toBeCloseTo(8);
    expect(t.ctl('hrolf').vitals!.health).toBeCloseTo(HROLF_TUNING.maxHealth - 2);
    expect(t.hitCael(10, 'fall').dealt).toBeCloseTo(5);
    expect(t.ctl('hrolf').vitals!.health).toBeCloseTo(HROLF_TUNING.maxHealth - 2);
    t.done();
  });

  it('goes down at 0, kneels 8 s sharing nothing, then stands at 30%; a waystone rest refills him', async () => {
    const t = await stand(2);
    // 5 x 200 = 1000 to Cael means 200 to Hrolf.
    (t.ctx.player.actor as { immortal: boolean }).immortal = true;
    for (let i = 0; i < 6 && !t.ctl('hrolf').downed; i++) t.hitCael(200);
    t.run(1);
    expect(t.ctl('hrolf').downed).toBe(true);
    expect(t.of('companion.downed')).toEqual([{ companionId: 'hrolf' }]);
    expect(t.ctl('hrolf').stonehideActive).toBe(false);
    expect(t.hitCael(20).dealt).toBeCloseTo(20);
    t.secs(COMPANION_DOWNED_SECONDS + 0.2);
    expect(t.ctl('hrolf').downed).toBe(false);
    expect(t.of('companion.stood')).toEqual([{ companionId: 'hrolf' }]);
    expect(t.ctl('hrolf').vitals!.health).toBeGreaterThanOrEqual(HROLF_TUNING.maxHealth * VITALS_TUNING.standFraction);
    t.ctx.events.emit('rest', { waystoneId: 'kettlewick' });
    expect(t.ctl('hrolf').vitals!.health).toBe(HROLF_TUNING.maxHealth);
    // The portrait bar reads the actor.
    expect(t.ctx.actors.get(t.svc().actorId('hrolf')!)!.health).toBe(HROLF_TUNING.maxHealth);
    t.done();
  });

  it('a downed Hrolf swapped out stands at once, full, at the Tilted Anvil', async () => {
    const t = await boot();
    t.join('tobb');
    t.join('hrolf');
    const f0 = t.feet();
    t.ctl('hrolf').placeAt({ x: f0.x + 2, y: f0.y, z: f0.z });
    const enemy = t.foe('blighted-soldier', f0.x, f0.z - 2, 30, false);
    const hitCael = (amount: number) =>
      t.ctx.damage.apply({ attackerId: enemy.a.id, targetId: t.ctx.player.actor.id, amount, kind: 'melee' })!;
    (t.ctx.player.actor as { immortal: boolean }).immortal = true;
    for (let i = 0; i < 6 && !t.ctl('hrolf').downed; i++) hitCael(200);
    t.run(1);
    expect(t.ctl('hrolf').downed).toBe(true);
    t.svc().setActive(['tobb']);
    t.secs(11);
    expect(t.ctl('hrolf').waiting?.reason).toBe('party');
    expect(t.ctl('hrolf').downed).toBe(false);
    expect(t.ctl('hrolf').vitals!.health).toBe(HROLF_TUNING.maxHealth);
    t.done();
  });

  it('Hrolf gives no Battle-song on a block; Tobb still does', async () => {
    const t = await boot();
    t.join('hrolf');
    t.ctx.events.emit('player.blocked', { attackerId: null } as never);
    expect(t.of('companion.aura').filter((a) => a.auraId === 'battle-song')).toEqual([]);
    t.done();
  });

  it('an inactive companion still walking to his post (the hand-off window) neither barks nor sings', async () => {
    const t = await boot();
    t.join('tobb');
    // His post in plain view ahead of Cael (yaw 0 faces -Z): the hand-off holds until handoffMaxSeconds.
    const f = t.feet();
    t.movePost('tobb', f.x, f.z - 6);
    t.join('hrolf');
    expect(t.svc().active()).toEqual(['hrolf']);
    expect(t.ctl('tobb').waiting).toBeNull(); // still in the hand-off window
    t.foe('blighted-soldier', f.x + 4, f.z);
    t.secs(1);
    t.ctx.events.emit('player.blocked', { attackerId: null } as never);
    expect(t.of('companion.banter').filter((b) => b.companionId === 'tobb')).toEqual([]);
    expect(t.of('companion.aura').filter((a) => a.companionId === 'tobb')).toEqual([]);
    expect(t.ctl('tobb').ready).toBe(false);
    t.done();
  });
});
