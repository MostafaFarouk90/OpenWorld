import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActorRegistry } from '../../actors/ActorRegistry';
import type { Actor } from '../../actors/Actor';
import { DamageResolver } from '../../actors/DamageResolver';
import { playerInit } from '../../actors/teams';
import { COMBAT } from '../../config/constants';
import { GameEvents } from '../../core/events';
import { getSkill, resetClassSkills } from '../../progression/skills';
import knightAct3Plugin from './act3.plugin';
import { BASTION_WALL, EXECUTIONERS_ARC, SKILL_IDS } from './tuning';

type Handler = () => { ok: true } | { ok: false; reason: string };

function rig(opts: { learned?: string[]; classId?: string | null } = {}) {
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
  const learned = new Set(opts.learned ?? [SKILL_IDS.bastionWall, SKILL_IDS.executionersArc, SKILL_IDS.hearthfireWard]);
  const prog = { classId: opts.classId === undefined ? null : opts.classId, learned: (id: string) => learned.has(id) };
  const handlers = new Map<string, Handler>();
  const disposed: string[] = [];
  const abilities = {
    registerHandler: (id: string, fn: Handler) => (handlers.set(id, fn), { ok: true, dispose: () => void disposed.push(id) }),
    reportTrigger: vi.fn(),
  };
  const verbs = { busy: false, staggered: false };
  const spawned: Array<{ id: string; t: any; p: any }> = [];
  const shakes: Array<[number, number]> = [];
  const stops: string[] = [];
  const services: Record<string, unknown> = {
    progression: prog,
    abilities,
    combatVerbs: verbs,
    vfx: {
      spawnEffect: (id: string, t: unknown, p: unknown) => (spawned.push({ id, t, p }), { stop: () => void stops.push(id) }),
      shake: (a: number, s: number) => void shakes.push([a, s]),
    },
  };
  const block = { held: true };
  const ctx = {
    events,
    actors,
    damage,
    clock,
    player: playerObj,
    input: { actions: { down: (a: string) => a === 'block' && block.held } },
    strings: { register: vi.fn(() => () => undefined) },
    services: { get: (n: string) => services[n], provide: () => () => undefined },
    systems: { add: (s: (typeof systems)[number]) => (systems.push(s), () => void systems.splice(systems.indexOf(s), 1)) },
  };
  const tick = (n = 1, dt = 1 / 60) => {
    for (let i = 0; i < n; i++) {
      for (const s of [...systems].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) s.fixedUpdate?.(dt);
      clock.seconds += dt;
      clock.tick++;
    }
  };
  const spawn = (team: 'hostile' | 'ally', x: number, z: number, extra: Record<string, unknown> = {}): Actor => {
    const a = actors.spawn({ kind: 'thing', team, maxHealth: 100, maxPoise: 20, ...extra });
    a.root = new THREE.Object3D();
    a.root.position.set(x, 0, z);
    a.root.updateMatrixWorld(true);
    return a;
  };
  return { events, actors, damage, player, playerObj, clock, ctx, prog, learned, handlers, disposed, abilities, verbs, spawned, shakes, stops, systems, tick, spawn, block };
}
type Rig = ReturnType<typeof rig>;

/** A hit from the front (the attacker is at -z of a knight at yaw 0, so the hit travels +z). */
const frontHit = (r: Rig, target: Actor, amount = 50, extra: Record<string, unknown> = {}) => {
  const foe = r.spawn('hostile', 0, -5);
  return r.damage.apply({ attackerId: foe.id, targetId: target.id, amount, kind: 'melee', direction: new THREE.Vector3(0, 0, 1), ...extra } as never);
};

beforeEach(() => {
  resetClassSkills();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  knightAct3Plugin.dispose?.();
  resetClassSkills();
  vi.restoreAllMocks();
});

describe('knight act3: skill rows', () => {
  it('Bastion Wall and the Arc carry their cooldown and Ember cost', () => {
    expect(getSkill(SKILL_IDS.bastionWall)).toMatchObject({ cooldown: 20, emberCost: 20, kind: 'active', tier: 4 });
    expect(getSkill(SKILL_IDS.executionersArc)).toMatchObject({ cooldown: 10, emberCost: 20, kind: 'active', tier: 4 });
    expect(getSkill(SKILL_IDS.hearthfireWard)).toMatchObject({ kind: 'passive', tier: 4 });
  });
});

describe('knight act3 plugin: registration', () => {
  it('registers the modifier, two handlers, one system and the strings, and removes them on dispose', () => {
    const r = rig();
    knightAct3Plugin.setup(r.ctx as never);
    expect(console.warn).not.toHaveBeenCalled();
    expect([...r.handlers.keys()].sort()).toEqual([SKILL_IDS.bastionWall, SKILL_IDS.executionersArc].sort());
    expect(r.systems.map((s) => s.id)).toEqual(['knight.act3.fixed']);
    expect(r.ctx.strings.register).toHaveBeenCalledTimes(1);
    expect(knightAct3Plugin.id).toBe('knight-act3');
    knightAct3Plugin.dispose?.();
    expect(r.systems).toHaveLength(0);
    expect(r.disposed).toHaveLength(2);
    // The wall's modifier is gone: setting the plugin up again must not throw a duplicate-modifier error.
    expect(() => knightAct3Plugin.setup(r.ctx as never)).not.toThrow();
  });

  it('warns, not throws, with no abilities service', () => {
    const r = rig();
    (r.ctx.services as any).get = (n: string) => (n === 'abilities' ? undefined : n === 'progression' ? r.prog : undefined);
    knightAct3Plugin.setup(r.ctx as never);
    expect(console.warn).toHaveBeenCalled();
  });
});

describe('knight act3 plugin: Bastion Wall', () => {
  it('blocks a front hit on the Knight and on an ally within 6 m, through the real resolver', () => {
    const r = rig();
    knightAct3Plugin.setup(r.ctx as never);
    const near = r.spawn('ally', 3, -2);
    const far = r.spawn('ally', 0, -6.1);
    expect(r.handlers.get(SKILL_IDS.bastionWall)!()).toEqual({ ok: true });
    const onKnight = frontHit(r, r.player);
    expect(onKnight?.outcome).toBe('blocked');
    expect(onKnight?.dealt).toBeCloseTo(10);
    expect(frontHit(r, near)?.outcome).toBe('blocked');
    expect(frontHit(r, far)?.outcome).toBe('hit');
    expect(r.spawned.some((s) => s.id === BASTION_WALL.fx && s.p?.flicker === 1)).toBe(true);
  });

  it('the cone is spawned with attach and a zero offset (the preset adds the root position itself); the flicker is not attached', () => {
    const r = rig();
    r.playerObj.feet.set(15000, 0, 15000);
    r.playerObj.avatar.root.position.set(15000, 0, 15000);
    knightAct3Plugin.setup(r.ctx as never);
    r.handlers.get(SKILL_IDS.bastionWall)!();
    const cone = r.spawned.find((s) => s.id === BASTION_WALL.fx && s.p?.seconds === BASTION_WALL.seconds)!;
    expect(cone.t.attach).toBe(r.playerObj.avatar.root);
    expect(cone.t.position).toEqual({ x: 0, y: 0, z: 0 });
    frontHit(r, r.player);
    const flicker = r.spawned.find((s) => s.p?.flicker === 1)!;
    expect(flicker.t.attach).toBeUndefined();
  });

  it('a guard that breaks on the hit (player.guardBroken, outcome stays hit) is not turned into a block; the next hit is', () => {
    const r = rig();
    knightAct3Plugin.setup(r.ctx as never);
    let breakNext = true;
    r.damage.addModifier(
      'test.guard',
      (req, target) => {
        if (target.id !== r.player.id || !breakNext) return;
        r.events.emit('player.guardBroken', { attackerId: req.attackerId });
      },
      -50,
    );
    r.handlers.get(SKILL_IDS.bastionWall)!();
    const broken = frontHit(r, r.player, 50);
    expect(broken?.outcome).toBe('hit');
    expect(broken?.dealt).toBeCloseTo(50);
    // An ally is still covered on a tick in which the Knight's guard broke.
    const near = r.spawn('ally', 1, -2);
    expect(frontHit(r, near)?.outcome).toBe('blocked');
    breakNext = false;
    r.tick(1);
    expect(frontHit(r, r.player, 50)?.outcome).toBe('blocked');
  });

  it('an ally is covered by where the attacker stands: a foe behind the Knight striking an ally further behind is not, a foe in front beside the ally is', () => {
    const r = rig();
    knightAct3Plugin.setup(r.ctx as never);
    r.handlers.get(SKILL_IDS.bastionWall)!();
    const behindAlly = r.spawn('ally', 0, 5);
    const behindFoe = r.spawn('hostile', 0, 3);
    // The hit travels +z, which read as "from ahead" under the old direction test.
    const res = r.damage.apply({ attackerId: behindFoe.id, targetId: behindAlly.id, amount: 50, kind: 'melee', direction: new THREE.Vector3(0, 0, 1) } as never);
    expect(res?.outcome).toBe('hit');
    const sideAlly = r.spawn('ally', 4, -3);
    const frontFoe = r.spawn('hostile', 2, -3);
    const res2 = r.damage.apply({ attackerId: frontFoe.id, targetId: sideAlly.id, amount: 50, kind: 'melee', direction: new THREE.Vector3(1, 0, 0) } as never);
    expect(res2?.outcome).toBe('blocked');
    // No attacker at all (no position): the ally is not covered.
    const res3 = r.damage.apply({ attackerId: null, targetId: sideAlly.id, amount: 50, kind: 'melee', direction: new THREE.Vector3(0, 0, 1) } as never);
    expect(res3?.outcome).toBe('hit');
  });

  it('does not scale twice a hit the Knight guard (order -50) already blocked, and a parry stays a parry', () => {
    const r = rig();
    knightAct3Plugin.setup(r.ctx as never);
    const guard = vi.fn((req: any) => {
      req.outcome = guard.mode;
      req.amount *= 0.2;
      req.poise *= 0.2;
    }) as any;
    guard.mode = 'blocked';
    r.damage.addModifier('test.guard', (req, target) => (target.id === r.player.id ? guard(req) : undefined), -50);
    r.handlers.get(SKILL_IDS.bastionWall)!();
    const blocked = frontHit(r, r.player, 50);
    expect(blocked?.outcome).toBe('blocked');
    expect(blocked?.dealt).toBeCloseTo(10);
    guard.mode = 'parried';
    expect(frontHit(r, r.player, 50)?.outcome).toBe('parried');
  });

  it('refuses without learning, with the wrong class, dead and staggered; the cooldown is the bar and not charged here', () => {
    const r = rig({ learned: [] });
    knightAct3Plugin.setup(r.ctx as never);
    expect(r.handlers.get(SKILL_IDS.bastionWall)!()).toEqual({ ok: false, reason: 'not-learned' });
    r.learned.add(SKILL_IDS.bastionWall);
    r.prog.classId = 'warden';
    expect(r.handlers.get(SKILL_IDS.bastionWall)!()).toEqual({ ok: false, reason: 'wrong-class' });
    r.prog.classId = 'knight';
    r.verbs.staggered = true;
    expect(r.handlers.get(SKILL_IDS.bastionWall)!()).toEqual({ ok: false, reason: 'staggered' });
    r.verbs.staggered = false;
    r.player.health = 0;
    (r.player as any)._dead = true;
    expect(r.handlers.get(SKILL_IDS.bastionWall)!()).toEqual({ ok: false, reason: 'dead' });
  });

  it('covers only while block is held; ends after 8 s, on a class change, on load and on death', () => {
    const r = rig();
    knightAct3Plugin.setup(r.ctx as never);
    const covered = () => frontHit(r, r.player, 5)?.outcome === 'blocked';
    const cast = () => r.handlers.get(SKILL_IDS.bastionWall)!();

    cast();
    expect(covered()).toBe(true);
    r.block.held = false;
    r.tick();
    expect(covered()).toBe(false);
    r.block.held = true;
    r.tick();
    expect(covered()).toBe(true);

    cast();
    r.tick(Math.ceil(BASTION_WALL.seconds * 60) + 2);
    expect(covered()).toBe(false);

    cast();
    expect(covered()).toBe(true);
    r.events.emit('class.changed', { classId: 'warden' } as never);
    expect(covered()).toBe(false);

    cast();
    r.events.emit('save.loaded', {} as never);
    expect(covered()).toBe(false);

    cast();
    r.events.emit('actor.died', { actorId: r.player.id } as never);
    expect(covered()).toBe(false);
    expect(r.stops.filter((s) => s === BASTION_WALL.fx).length).toBeGreaterThanOrEqual(4);
  });
});

describe("knight act3 plugin: Executioner's Arc", () => {
  it('plays the chop clip with lockMove, hits the foes in the arc once in the window, shakes the camera and reports the trigger', () => {
    const r = rig();
    knightAct3Plugin.setup(r.ctx as never);
    const a = r.spawn('hostile', 0, -2);
    const b = r.spawn('hostile', 1, -1.5);
    const behind = r.spawn('hostile', 0, 2);
    const far = r.spawn('hostile', 0, -3.5);
    expect(r.handlers.get(SKILL_IDS.executionersArc)!()).toEqual({ ok: true });
    expect(r.playerObj.avatar.controller.playOneShot).toHaveBeenCalledWith('1H_Melee_Attack_Chop', { lockMove: true });
    expect(r.abilities.reportTrigger).toHaveBeenCalledWith(SKILL_IDS.executionersArc);
    expect(r.shakes).toEqual([[EXECUTIONERS_ARC.shakeAmplitude, EXECUTIONERS_ARC.shakeSeconds]]);
    expect(r.spawned.some((s) => s.id === EXECUTIONERS_ARC.fx)).toBe(true);
    r.tick(EXECUTIONERS_ARC.ticks + 2);
    const dealt = COMBAT.baseDamage * 1.8;
    expect(a.health).toBeCloseTo(100 - dealt);
    expect(b.health).toBeCloseTo(100 - dealt);
    expect(behind.health).toBe(100);
    expect(far.health).toBe(100);
    expect(a.poise).toBeLessThan(a.maxPoise);
  });

  it('skips a foe in a mercy state', () => {
    const r = rig();
    knightAct3Plugin.setup(r.ctx as never);
    const yielding = r.spawn('hostile', 0, -1);
    (yielding as any).mercyState = () => 'yielding';
    r.handlers.get(SKILL_IDS.executionersArc)!();
    r.tick(EXECUTIONERS_ARC.ticks);
    expect(yielding.health).toBe(100);
  });

  it('refuses unlearned, busy and staggered, and a dodge cancels it before the window', () => {
    const r = rig({ learned: [] });
    knightAct3Plugin.setup(r.ctx as never);
    const h = () => r.handlers.get(SKILL_IDS.executionersArc)!();
    expect(h()).toEqual({ ok: false, reason: 'not-learned' });
    r.learned.add(SKILL_IDS.executionersArc);
    r.verbs.busy = true;
    expect(h()).toEqual({ ok: false, reason: 'busy' });
    r.verbs.busy = false;
    r.verbs.staggered = true;
    expect(h()).toEqual({ ok: false, reason: 'staggered' });
    r.verbs.staggered = false;
    const foe = r.spawn('hostile', 0, -1);
    expect(h()).toEqual({ ok: true });
    r.tick(3);
    r.playerObj.avatar.controller.currentAction = 'dodge';
    r.tick(EXECUTIONERS_ARC.ticks);
    expect(foe.health).toBe(100);
  });

  it('a flinch that replaces the chop clip ends the chop with no damage', () => {
    const r = rig();
    knightAct3Plugin.setup(r.ctx as never);
    const foe = r.spawn('hostile', 0, -1);
    expect(r.handlers.get(SKILL_IDS.executionersArc)!()).toEqual({ ok: true });
    r.tick(2);
    r.playerObj.avatar.controller.currentAction = 'flinch';
    r.tick(EXECUTIONERS_ARC.ticks);
    expect(foe.health).toBe(100);
  });

  it('a class change or load mid-chop cancels it', () => {
    for (const ev of ['class.changed', 'save.loaded'] as const) {
      const r = rig();
      knightAct3Plugin.setup(r.ctx as never);
      const foe = r.spawn('hostile', 0, -1);
      r.handlers.get(SKILL_IDS.executionersArc)!();
      r.tick(5);
      r.events.emit(ev, {} as never);
      r.tick(EXECUTIONERS_ARC.ticks);
      expect(foe.health, ev).toBe(100);
      knightAct3Plugin.dispose?.();
    }
  });
});

describe('knight act3 plugin: Hearthfire Ward', () => {
  const pulse = (r: Rig, x = 0, z = 0) => r.events.emit('banner.pulse', { position: { x, y: 0, z }, radius: 8 });

  it('heals the player and the live allies in range by 3% of max health on banner.pulse', () => {
    const r = rig();
    knightAct3Plugin.setup(r.ctx as never);
    const edge = r.spawn('ally', 8, 0, { maxHealth: 200 });
    const out = r.spawn('ally', 8.01, 0, { maxHealth: 200 });
    const dead = r.spawn('ally', 1, 0, { maxHealth: 200 });
    edge.health = 100;
    out.health = 100;
    r.player.health = r.player.maxHealth - 50;
    const before = r.player.health;
    r.damage.apply({ attackerId: null, targetId: dead.id, amount: 1000, kind: 'script' } as never);
    expect(dead.dead).toBe(true);
    pulse(r);
    expect(edge.health).toBeCloseTo(106);
    expect(out.health).toBe(100);
    expect(dead.health).toBeLessThanOrEqual(0);
    expect(r.player.health).toBeCloseTo(before + r.player.maxHealth * 0.03);
    expect(r.spawned.filter((s) => s.id === 'hearthfire-motes')).toHaveLength(3);
  });

  it('does nothing when not learned or for another class', () => {
    const r = rig({ learned: [] });
    knightAct3Plugin.setup(r.ctx as never);
    const ally = r.spawn('ally', 1, 0);
    ally.health = 50;
    pulse(r);
    expect(ally.health).toBe(50);
    r.learned.add(SKILL_IDS.hearthfireWard);
    r.prog.classId = 'warden';
    pulse(r);
    expect(ally.health).toBe(50);
    r.prog.classId = null;
    pulse(r);
    expect(ally.health).toBeCloseTo(53);
  });

  it('stops listening after dispose', () => {
    const r = rig();
    knightAct3Plugin.setup(r.ctx as never);
    const ally = r.spawn('ally', 1, 0);
    ally.health = 50;
    knightAct3Plugin.dispose?.();
    pulse(r);
    expect(ally.health).toBe(50);
  });
});
