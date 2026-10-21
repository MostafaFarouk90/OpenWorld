import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActorRegistry } from '../../actors/ActorRegistry';
import { DamageResolver } from '../../actors/DamageResolver';
import { playerInit } from '../../actors/teams';
import type { Actor } from '../../actors/Actor';
import { COMBAT } from '../../config/constants';
import { GameEvents } from '../../core/events';
import { Abilities } from '../../progression/abilities';
import { Progression } from '../../progression/Progression';
import { getSkill, resetClassSkills } from '../../progression/skills';
import { xpForLevel } from '../../progression/tuning';
import knightTier3Plugin from './knight.tier3.plugin';
import { HALVARD, OATHWARD, SKILL_IDS, SQUIRE } from './tuning';

function rig(opts: { without?: string[]; classId?: string | null } = {}) {
  const events = new GameEvents(() => {});
  const actors = new ActorRegistry(events);
  const damage = new DamageResolver(actors, events, () => {});
  const player = actors.spawn(playerInit());
  player.root = new THREE.Object3D();
  const clock = { seconds: 0, tick: 0 };
  const playerObj = {
    actor: player,
    feet: new THREE.Vector3(),
    facingYaw: 0,
    avatar: { root: new THREE.Object3D(), controller: { playOneShot: vi.fn(() => true), currentAction: null as string | null } },
  };
  const systems: Array<{ id: string; order?: number; fixedUpdate?: (dt: number) => void }> = [];
  const services: Record<string, unknown> = {};
  const ctx = {
    events,
    actors,
    damage,
    clock,
    player: playerObj,
    strings: { register: vi.fn(() => () => undefined) },
    services: { get: (n: string) => services[n], provide: () => () => undefined },
    systems: { add: (s: (typeof systems)[number]) => (systems.push(s), () => void systems.splice(systems.indexOf(s), 1)) },
  };
  const progression = new Progression({
    emit: (type, payload) => events.emit(type as never, payload as never),
    actor: () => player as never,
  });
  if (opts.classId !== undefined) progression.setClass(opts.classId);
  const ember = { value: 100 };
  const abilities = new Abilities({
    progression,
    spells: () => ({ burn: 0, ember: ember.value, maxEmber: 100, spendEmber: (n: number) => ((ember.value -= n), true) }),
    caster: () => player as never,
    ctx: () => ctx as never,
    emit: (type, payload) => events.emit(type as never, payload as never),
  });
  const holds: Array<{ owner: string; move: unknown }> = [];
  const verbs = { busy: false, staggered: false, holdForcedMove: (owner: string, move: unknown) => void holds.push({ owner, move }) };
  const spawned: Array<{ id: string; t: any }> = [];
  const stops: string[] = [];
  const all: Record<string, unknown> = {
    progression,
    abilities,
    combatVerbs: verbs,
    vfx: { spawnEffect: (id: string, t: unknown) => (spawned.push({ id, t }), { stop: () => void stops.push(id) }) },
  };
  for (const [k, v] of Object.entries(all)) if (!opts.without?.includes(k)) services[k] = v;
  const tick = (n = 1, dt = 1 / 60) => {
    for (let i = 0; i < n; i++) {
      for (const s of [...systems].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) s.fixedUpdate?.(dt);
      clock.seconds += dt;
      clock.tick++;
    }
  };
  const spawn = (team: 'hostile' | 'ally', x: number, z: number, extra: Record<string, unknown> = {}): Actor => {
    const a = actors.spawn({ kind: 'thing', team, maxHealth: 50, maxPoise: 20, ...extra });
    a.root = new THREE.Object3D();
    a.root.position.set(x, 0, z);
    a.root.updateMatrixWorld(true);
    return a;
  };
  return { events, actors, damage, player, playerObj, clock, ctx, progression, abilities, ember, holds, verbs, spawned, stops, systems, tick, spawn, services };
}
type Rig = ReturnType<typeof rig>;

const learnAll = (r: Rig) => {
  r.progression.grantXp(xpForLevel(30), 'test');
  for (const id of [
    'knight.rimBash', SKILL_IDS.ironStance, SKILL_IDS.oathward,
    'knight.riposteEdge', SKILL_IDS.flowingCuts, SKILL_IDS.chargeOfTheHalvard,
    'knight.rallyCry', SKILL_IDS.bannerPlant, SKILL_IDS.squiresResolve,
  ]) {
    expect(r.progression.learn(id), id).toEqual({ ok: true });
  }
};

const hostileHit = (r: Rig, target: Actor, amount: number, extra: Record<string, unknown> = {}) => {
  const foe = r.spawn('hostile', 30, 30);
  return r.damage.apply({ attackerId: foe.id, targetId: target.id, amount, kind: 'melee', ...extra } as never);
};

beforeEach(() => {
  resetClassSkills();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  knightTier3Plugin.dispose?.();
  resetClassSkills();
  vi.restoreAllMocks();
});

describe('knight tier 3: skill rows', () => {
  it.each([
    ['knight.oathward', 'knight.ironStance', 'active'],
    ['knight.chargeOfTheHalvard', 'knight.flowingCuts', 'active'],
    ['knight.squiresResolve', 'knight.bannerPlant', 'passive'],
  ])('%s costs 2, requires %s and is available', (id, requires, kind) => {
    expect(getSkill(id)).toMatchObject({ tier: 3, cost: 2, requires, kind, available: true });
  });

  it.each(['knight.bastionWall', 'knight.executionersArc', 'knight.hearthfireWard'])('tier 4 %s is still refused as unavailable', (id) => {
    const r = rig();
    r.progression.grantXp(xpForLevel(30), 'test');
    expect(r.progression.learn(id)).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('tier 3 needs tier 2 of its branch', () => {
    const r = rig();
    r.progression.grantXp(xpForLevel(30), 'test');
    expect(r.progression.learn(SKILL_IDS.oathward)).toEqual({ ok: false, reason: 'missing-prereq' });
  });
});

describe('knight tier 3 plugin: registration', () => {
  it('registers the modifier, lethal handler, two ability handlers, one system and the strings', () => {
    const r = rig();
    knightTier3Plugin.setup(r.ctx as never);
    expect(console.warn).not.toHaveBeenCalled();
    expect(r.systems.map((s) => s.id)).toEqual(['knight.tier3.fixed']);
    expect(r.ctx.strings.register).toHaveBeenCalledTimes(1);
    expect(knightTier3Plugin.dependsOn).toEqual(expect.arrayContaining(['core', 'progression', 'combat-verbs']));
  });

  it('a second setup replaces the first; dispose releases every handler so setup runs again', () => {
    const r = rig();
    knightTier3Plugin.setup(r.ctx as never);
    expect(() => knightTier3Plugin.setup(r.ctx as never)).not.toThrow();
    expect(r.systems).toHaveLength(1);
    knightTier3Plugin.dispose?.();
    expect(r.systems).toEqual([]);
    expect(() => knightTier3Plugin.setup(r.ctx as never)).not.toThrow();
    knightTier3Plugin.dispose?.();
    // Nothing of ours is left in the resolver: the same ids can be added again.
    const offA = r.damage.addModifier(OATHWARD.modifierId, () => undefined);
    const offB = r.damage.addLethalHandler(SQUIRE.handlerId, () => false);
    offA();
    offB();
  });

  it('loads without the optional services and warns about the missing abilities service', () => {
    const r = rig({ without: ['abilities', 'combatVerbs', 'vfx'] });
    expect(() => knightTier3Plugin.setup(r.ctx as never)).not.toThrow();
    expect(console.warn).toHaveBeenCalled();
    expect(() => r.tick(3)).not.toThrow();
  });
});

describe('Oathward in play', () => {
  const setup = (opts: Parameters<typeof rig>[0] = {}) => {
    const r = rig(opts);
    knightTier3Plugin.setup(r.ctx as never);
    learnAll(r);
    r.progression.assign(0, SKILL_IDS.oathward);
    return r;
  };

  it('absorbs 100, lets the overflow through, bursts when empty and ends the bubble effect', () => {
    const r = setup();
    expect(r.abilities.use(0)).toEqual({ ok: true });
    expect(r.spawned.map((s) => s.id)).toEqual([OATHWARD.bubbleFx]);
    expect(r.spawned[0].t.attach).toBe(r.playerObj.avatar.root);
    r.player.maxHealth = 500;
    r.player.health = 500;
    const res = hostileHit(r, r.player, 60, { poise: 0 })!;
    expect(res.dealt).toBe(0);
    expect(r.player.health).toBe(500);
    const res2 = hostileHit(r, r.player, 60, { poise: 0 })!;
    expect(res2.dealt).toBe(20);
    expect(r.player.health).toBe(480);
    expect(r.spawned.map((s) => s.id)).toEqual([OATHWARD.bubbleFx, OATHWARD.burstFx]);
    expect(r.stops).toEqual([OATHWARD.bubbleFx]);
    expect(hostileHit(r, r.player, 10, { poise: 0 })!.dealt).toBe(10);
  });

  it('sits after the guard: a hit the guard parried costs the bubble nothing', () => {
    expect(OATHWARD.modifierOrder).toBeGreaterThan(-50);
    expect(OATHWARD.modifierOrder).toBeLessThan(0);
    const r = setup();
    r.abilities.use(0);
    const offGuard = r.damage.addModifier('test-guard', (req) => void (req.outcome = 'parried'), -50);
    hostileHit(r, r.player, 80);
    offGuard();
    expect(hostileHit(r, r.player, 100, { poise: 0 })!.dealt).toBe(0);
    expect(r.spawned.map((s) => s.id)).toEqual([OATHWARD.bubbleFx, OATHWARD.burstFx]);
  });

  it('expires after 20 s without a burst', () => {
    const r = setup();
    r.abilities.use(0);
    r.tick(60 * 19);
    expect(r.stops).toEqual([]);
    r.tick(70);
    expect(r.stops).toEqual([OATHWARD.bubbleFx]);
    expect(r.spawned.map((s) => s.id)).toEqual([OATHWARD.bubbleFx]);
    expect(hostileHit(r, r.player, 10, { poise: 0 })!.dealt).toBe(10);
  });

  it('a recast replaces the bubble with a full one', () => {
    const r = setup();
    r.player.maxHealth = 500;
    r.player.health = 500;
    r.abilities.use(0);
    hostileHit(r, r.player, 90, { poise: 0 });
    const spawnedBefore = r.spawned.length;
    // The abilities service owns the cooldown; let it run out.
    for (let i = 0; i < 60 * 40; i++) r.abilities.tick();
    expect(r.abilities.use(0)).toEqual({ ok: true });
    expect(r.stops).toEqual([OATHWARD.bubbleFx]);
    expect(r.spawned.length).toBe(spawnedBefore + 1);
    expect(hostileHit(r, r.player, 100, { poise: 0 })!.dealt).toBe(0);
  });

  it('only the player is protected', () => {
    const r = setup();
    r.abilities.use(0);
    const ally = r.spawn('ally', 1, 1);
    expect(hostileHit(r, ally, 10, { poise: 0 })!.dealt).toBe(10);
  });

  it('goes on save.loaded, class change and death, with no burst', () => {
    for (const drop of [
      (r: Rig) => r.events.emit('save.loaded', { slot: 'a' }),
      (r: Rig) => r.events.emit('class.changed', { classId: 'warden', previous: 'knight', free: true, cost: 0 } as never),
      (r: Rig) => r.events.emit('actor.died', { actorId: 'player', killerId: null, kind: 'player', team: 'player', level: 1, spawnTag: undefined }),
    ]) {
      const r = setup();
      r.abilities.use(0);
      drop(r);
      expect(r.stops).toEqual([OATHWARD.bubbleFx]);
      expect(r.spawned.map((s) => s.id)).toEqual([OATHWARD.bubbleFx]);
      expect(hostileHit(r, r.player, 10, { poise: 0 })!.dealt).toBe(10);
      knightTier3Plugin.dispose?.();
      resetClassSkills();
    }
  });

  it('works with a null class (before M07) and with the knight, refuses another class', () => {
    expect(setup({ classId: null }).abilities.use(0)).toEqual({ ok: true });
    knightTier3Plugin.dispose?.();
    expect(setup({ classId: 'knight' }).abilities.use(0)).toEqual({ ok: true });
  });

  it('not learned: the handler refuses', () => {
    const r = rig();
    knightTier3Plugin.setup(r.ctx as never);
    r.progression.assign(0, SKILL_IDS.oathward);
    expect(r.abilities.use(0)).toMatchObject({ ok: false });
    expect(r.spawned).toEqual([]);
  });

  it('dispose drops a live bubble', () => {
    const r = setup();
    r.abilities.use(0);
    knightTier3Plugin.dispose?.();
    expect(r.stops).toEqual([OATHWARD.bubbleFx]);
  });
});

describe('Charge of the Halvard in play', () => {
  const setup = () => {
    const r = rig();
    knightTier3Plugin.setup(r.ctx as never);
    learnAll(r);
    r.progression.assign(0, SKILL_IDS.chargeOfTheHalvard);
    return r;
  };
  /** Moves the player along the held move the way the verbs would, then ticks. */
  const run = (r: Rig, ticks: number) => {
    for (let i = 0; i < ticks; i++) {
      const h = [...r.holds].reverse().find((m) => m.move !== undefined)?.move as { x: number; z: number; speed: number } | null | undefined;
      if (h && r.holds.at(-1)!.move) {
        r.playerObj.feet.x += (h.x * h.speed) / 60;
        r.playerObj.feet.z += (h.z * h.speed) / 60;
      }
      r.tick();
    }
  };

  it('lunges 5 m in 0.25 s along the facing with the knight.charge hold, then releases', () => {
    const r = setup();
    expect(r.abilities.use(0)).toEqual({ ok: true });
    expect(r.holds[0].owner).toBe('knight.charge');
    const m = r.holds[0].move as { x: number; z: number; speed: number };
    expect(m.z).toBeCloseTo(-1);
    expect(m.speed).toBeCloseTo(20, 5);
    expect(r.playerObj.avatar.controller.playOneShot).toHaveBeenCalledWith(HALVARD.clip, { lockMove: true });
    run(r, HALVARD.ticks + 1);
    expect(r.holds.at(-1)!.move).toBeNull();
    expect(r.playerObj.feet.z).toBeCloseTo(-5, 1);
  });

  it('hits each hostile on the path once for twice the stab damage; the stab base is the combat base damage', () => {
    expect(HALVARD.damage).toBe(2 * COMBAT.baseDamage);
    const r = setup();
    const a = r.spawn('hostile', 0, -2.5);
    const b = r.spawn('hostile', 0, -4.5);
    const behind = r.spawn('hostile', 0, 2);
    const ally = r.spawn('ally', 0, -3);
    r.abilities.use(0);
    run(r, HALVARD.ticks + 2);
    expect(a.health).toBe(50 - HALVARD.damage);
    expect(b.health).toBe(50 - HALVARD.damage);
    expect(behind.health).toBe(50);
    expect(ally.health).toBe(50);
  });

  it('a dodge, stagger or death ends the lunge early', () => {
    for (const interrupt of [
      (r: Rig) => (r.playerObj.avatar.controller.currentAction = 'dodge'),
      (r: Rig) => (r.verbs.staggered = true),
      (r: Rig) => r.damage.kill('player'),
    ]) {
      const r = setup();
      const far = r.spawn('hostile', 0, -4.5);
      r.abilities.use(0);
      run(r, 3);
      interrupt(r);
      run(r, HALVARD.ticks);
      expect(r.holds.at(-1)!.move).toBeNull();
      expect(far.health).toBe(50);
      knightTier3Plugin.dispose?.();
      resetClassSkills();
    }
  });

  it('refuses when busy, staggered or without a clip, charging no hold', () => {
    const r = setup();
    r.verbs.staggered = true;
    expect(r.abilities.use(0)).toMatchObject({ ok: false });
    r.verbs.staggered = false;
    r.playerObj.avatar.controller.playOneShot.mockReturnValueOnce(false);
    expect(r.abilities.use(0)).toMatchObject({ ok: false });
    expect(r.holds).toEqual([]);
  });

  it('save.loaded cancels a lunge in progress', () => {
    const r = setup();
    r.abilities.use(0);
    r.events.emit('save.loaded', { slot: 'a' });
    expect(r.holds.at(-1)!.move).toBeNull();
  });
});

describe("Squire's Resolve in play", () => {
  const setup = (opts: Parameters<typeof rig>[0] = {}) => {
    const r = rig(opts);
    knightTier3Plugin.setup(r.ctx as never);
    learnAll(r);
    return r;
  };
  const fatal = (r: Rig, ally: Actor) => {
    const foe = r.spawn('hostile', 40, 40);
    return r.damage.apply({ attackerId: foe.id, targetId: ally.id, amount: 999, kind: 'melee' });
  };
  const aggro = (r: Rig, foe: Actor) => r.events.emit('ai.aggro', { actorId: foe.id, targetId: 'player' });

  it('saves a nearby ally once per fight, leaving 1 health', () => {
    const r = setup();
    const foe = r.spawn('hostile', 5, 0);
    aggro(r, foe);
    const ally = r.spawn('ally', 3, 0);
    const res = fatal(r, ally)!;
    expect(res.saved).toBe(true);
    expect(ally.health).toBe(1);
    expect(ally.dead).toBe(false);
    expect(r.spawned.map((s) => s.id)).toContain(SQUIRE.fx);
    expect(fatal(r, ally)!.killed).toBe(true);
    expect(ally.dead).toBe(true);
  });

  it('each ally has its own save', () => {
    const r = setup();
    aggro(r, r.spawn('hostile', 5, 0));
    const a = r.spawn('ally', 3, 0);
    const b = r.spawn('ally', -3, 0);
    expect(fatal(r, a)!.saved).toBe(true);
    expect(fatal(r, b)!.saved).toBe(true);
  });

  it('re-arms when the fight closes: last aggroed foe dies, or 6 s without aggro', () => {
    const r = setup();
    const foe = r.spawn('hostile', 5, 0);
    aggro(r, foe);
    const ally = r.spawn('ally', 3, 0);
    expect(fatal(r, ally)!.saved).toBe(true);
    // The last foe dies: the fight closes at once.
    r.damage.kill(foe.id);
    ally.health = 50;
    expect(fatal(r, ally)!.saved).toBe(true);
    // ... which opened a fight of its own; calm foes and 6 s later it is closed and the ally is armed again.
    r.tick(60 * 6 + 5);
    ally.health = 50;
    expect(fatal(r, ally)!.saved).toBe(true);

    const r2 = setup();
    const foe2 = r2.spawn('hostile', 5, 0);
    aggro(r2, foe2);
    const ally2 = r2.spawn('ally', 3, 0);
    expect(fatal(r2, ally2)!.saved).toBe(true);
    r2.events.emit('ai.calm', { actorId: foe2.id });
    r2.tick(60 * 5);
    ally2.health = 50;
    expect(fatal(r2, ally2)!.saved).toBe(false);
  });

  it('a calmed foe re-arms after the 6 s grace, not before', () => {
    const r = setup();
    const foe = r.spawn('hostile', 5, 0);
    aggro(r, foe);
    const ally = r.spawn('ally', 3, 0);
    expect(fatal(r, ally)!.saved).toBe(true);
    r.events.emit('ai.calm', { actorId: foe.id });
    r.tick(60 * 5);
    expect(r.systems.length).toBe(1);
    ally.health = 50;
    expect(fatal(r, ally)!.killed).toBe(true);

    const r2 = setup();
    const foe2 = r2.spawn('hostile', 5, 0);
    aggro(r2, foe2);
    const ally2 = r2.spawn('ally', 3, 0);
    expect(fatal(r2, ally2)!.saved).toBe(true);
    r2.events.emit('ai.calm', { actorId: foe2.id });
    r2.tick(60 * 6 + 5);
    ally2.health = 50;
    expect(fatal(r2, ally2)!.saved).toBe(true);
  });

  it('a boss that never emits ai.aggro keeps the fight open through its hits on the ally', () => {
    const r = setup();
    const boss = r.spawn('hostile', 5, 0, { maxHealth: 500 });
    const ally = r.spawn('ally', 3, 0, { maxHealth: 500 });
    r.damage.apply({ attackerId: boss.id, targetId: ally.id, amount: 1, kind: 'melee' });
    ally.health = 1;
    expect(fatal(r, ally)!.saved).toBe(true);
    for (let i = 0; i < 4; i++) {
      r.tick(60 * 4);
      ally.health = 400;
      r.damage.apply({ attackerId: boss.id, targetId: ally.id, amount: 1, kind: 'melee' });
    }
    // 16 s later the fight is still the same one: the ally is not saved a second time.
    expect(fatal(r, ally)!.killed).toBe(true);
  });

  it('save.loaded closes the fight and re-arms', () => {
    const r = setup();
    aggro(r, r.spawn('hostile', 5, 0));
    const ally = r.spawn('ally', 3, 0);
    expect(fatal(r, ally)!.saved).toBe(true);
    r.events.emit('save.loaded', { slot: 'a' });
    ally.health = 50;
    expect(fatal(r, ally)!.saved).toBe(true);
  });

  it('ignores allies beyond 10 m, non-allies and the player', () => {
    const r = setup();
    aggro(r, r.spawn('hostile', 5, 0));
    const far = r.spawn('ally', 11, 0);
    expect(fatal(r, far)!.killed).toBe(true);
    const foe = r.spawn('hostile', 3, 0);
    r.damage.apply({ attackerId: 'player', targetId: foe.id, amount: 999, kind: 'melee' });
    expect(foe.dead).toBe(true);
    const neutral = r.actors.spawn({ kind: 'npc', team: 'neutral', maxHealth: 10 });
    neutral.root = new THREE.Object3D();
    const f2 = r.spawn('hostile', 9, 9);
    expect(r.damage.apply({ attackerId: f2.id, targetId: neutral.id, amount: 999, kind: 'melee' })!.killed).toBe(true);
    expect(fatal(r, r.player)!.killed).toBe(true);
  });

  it('a non-hostile aggro does not open a fight', () => {
    const r = setup();
    const ally = r.spawn('ally', 3, 0);
    const other = r.spawn('ally', 4, 0);
    r.events.emit('ai.aggro', { actorId: other.id, targetId: 'x' });
    expect(fatal(r, ally)!.saved).toBe(true); // saved by the lethal handler regardless of an open fight
  });

  it('works with a null class and with the knight; not learned or another class does nothing', () => {
    for (const classId of [null, 'knight']) {
      const r = setup({ classId });
      const ally = r.spawn('ally', 3, 0);
      expect(fatal(r, ally)!.saved, String(classId)).toBe(true);
      knightTier3Plugin.dispose?.();
      resetClassSkills();
    }
    const r = rig();
    knightTier3Plugin.setup(r.ctx as never);
    expect(fatal(r, r.spawn('ally', 3, 0))!.killed).toBe(true);
    knightTier3Plugin.dispose?.();
    const w = rig({ classId: 'warden' });
    knightTier3Plugin.setup(w.ctx as never);
    expect(fatal(w, w.spawn('ally', 3, 0))!.killed).toBe(true);
  });

  it('dispose removes the lethal handler', () => {
    const r = setup();
    knightTier3Plugin.dispose?.();
    expect(fatal(r, r.spawn('ally', 3, 0))!.killed).toBe(true);
  });
});
