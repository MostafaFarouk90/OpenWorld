import * as THREE from 'three';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXED_TIMESTEP } from '../../config/constants';
import { EnemyManager } from '../../enemies/EnemyManager';
import { FakeActor as EnemyFakeActor, FakeHost, loadKnight } from '../../enemies/testing/fakeHost';
import { AI } from '../../enemies/tuning';
import type { PerceptionProvider } from '../../enemies/perceptionHook';
import { getSkill, registerClassSkills, resetClassSkills } from '../../progression/skills';
import { makeProgression } from '../../progression/testkit';
import { FakeActor, makeWorld } from '../../spells/testHost';
import { buildEmberwrightSkills } from './skills';
import {
  EmberwrightTier3, FireWall, IronFamiliar, SmokeScreen,
  type FamiliarBody, type FireWallPorts, type IronFamiliarPorts, type SmokeScreenPorts,
} from './tier3';
import { FIRE_WALL, IRON_FAMILIAR, SMOKE_SCREEN } from './tuning';
import { SKILL } from './skills';

const DT = 1 / 60;
afterEach(() => resetClassSkills());

describe('Emberwright tier 3 skill rows', () => {
  it('cost 2, require their tier 2 skill, are active and available; tier 4 is refused', () => {
    const rows = buildEmberwrightSkills();
    for (const [id, req] of [[SKILL.fireWall, SKILL.flameLash], [SKILL.ironFamiliar, SKILL.anvilDrop], [SKILL.smokeScreen, SKILL.warmBreath]] as const) {
      const row = rows.find((s) => s.id === id)!;
      expect([row.tier, row.cost, row.kind, row.available, row.requires]).toEqual([3, 2, 'active', true, req]);
    }
    expect(rows.find((s) => s.id === SKILL.fireWall)).toMatchObject({ emberCost: 25, cooldown: 20 });
    expect(rows.find((s) => s.id === SKILL.ironFamiliar)).toMatchObject({ emberCost: 30, cooldown: 40 });
    expect(rows.find((s) => s.id === SKILL.smokeScreen)).toMatchObject({ emberCost: 20, cooldown: 25 });
    registerClassSkills('emberwright', rows);
    const { p } = makeProgression();
    p.setClass('emberwright');
    p.grantSkillPoint(30, 'test');
    for (const id of ['cinderRain', 'temperWeapon', 'updraft']) expect(p.learn(`emberwright.${id}`)).toEqual({ ok: false, reason: 'unavailable' });
    expect(p.learn(SKILL.fireWall)).toEqual({ ok: false, reason: 'missing-prereq' });
    for (const id of [SKILL.emberBolt, SKILL.flameLash, SKILL.fireWall]) expect(p.learn(id)).toEqual({ ok: true });
    expect(getSkill(SKILL.fireWall)?.cost).toBe(2);
  });
});

function base() {
  const w = makeWorld();
  const s = { ember: true, learned: true, canAct: true, yaw: 0, effects: [] as string[], stops: 0 };
  const ports = {
    isEmberwright: () => s.ember,
    learned: () => s.learned,
    canAct: () => s.canAct,
    playerId: () => 'player',
    feet: () => w.player.feet,
    facingYaw: () => s.yaw,
    actors: () => w.actors,
    apply: (req: Parameters<typeof w.damage.apply>[0]) => (w.damage.apply(req), { outcome: 'hit', killed: false, staggered: false, dealt: req.amount } as never),
    effect: (id: string) => { s.effects.push(id); return () => void s.stops++; },
  };
  return { w, s, ports };
}
const hostile = (w: ReturnType<typeof makeWorld>, id: string, x: number, z: number) => w.actors.add(new FakeActor(id, 'hostile', x, z));
const run = (u: { update(dt: number): void }, seconds: number) => { for (let i = 0; i < Math.round(seconds / DT); i++) u.update(DT); };

describe('Fire Wall', () => {
  function rig() {
    const b = base();
    const ignites: Array<{ id: string; spec: { id: string; kind: string; seconds: number } }> = [];
    const wall = new FireWall({ ...b.ports, ignite: (id, spec) => (ignites.push({ id, spec }), true) } as FireWallPorts);
    return { ...b, wall, ignites };
  }

  it('burns hostiles in the 6 m band 4 m ahead, 4 per half second for 8 s, with its own ignite id', () => {
    const { w, wall, ignites, s } = rig();
    hostile(w, 'in', 0, -4);
    hostile(w, 'edge', 2.9, -4.5);
    hostile(w, 'long', 3.2, -4);
    hostile(w, 'thick', 0, -5);
    hostile(w, 'near', 0, -2);
    w.actors.add(new FakeActor('npc', 'neutral', 0, -4));
    expect(wall.cast()).toEqual({ ok: true });
    expect(s.effects).toEqual(['fire-wall']);
    run(wall, 0.49);
    expect(w.damage.applied).toHaveLength(0);
    run(wall, 0.02);
    expect(w.damage.applied.map((r) => r.targetId).sort()).toEqual(['edge', 'in']);
    expect(w.damage.applied[0]).toMatchObject({ amount: 4, kind: 'spell', attackerId: 'player', attackId: 'emberwright.fireWall' });
    expect(ignites[0]).toMatchObject({ spec: { id: 'emberwright.fireWall.ignite', kind: 'ignite', seconds: 3 } });
    run(wall, 10);
    expect(w.damage.applied.filter((r) => r.targetId === 'in')).toHaveLength(16);
    expect(wall.active).toBe(false);
    expect(s.stops).toBe(1);
  });

  it('runs perpendicular to the facing', () => {
    const { w, wall, s } = rig();
    s.yaw = Math.PI / 2; // forward is -x, the line runs along z
    w.player.feet.set(0, 0, 0);
    hostile(w, 'on', -4, 2.5);
    hostile(w, 'off', -4, 3.5);
    wall.cast();
    run(wall, 0.6);
    expect(w.damage.applied.map((r) => r.targetId)).toEqual(['on']);
  });

  it('skips mercy states and the dead, and a recast replaces the wall', () => {
    const { w, wall, s } = rig();
    const y = hostile(w, 'kneel', 0, -4);
    (y as unknown as { mercyState: () => string }).mercyState = () => 'yielding';
    hostile(w, 'dead', 0, -4.2).kill();
    hostile(w, 'ok', 0, -3.8);
    wall.cast();
    run(wall, 0.6);
    expect(w.damage.applied.map((r) => r.targetId)).toEqual(['ok']);
    wall.cast();
    expect(s.stops).toBe(1);
    expect(s.effects).toHaveLength(2);
  });

  it('refuses the wrong class, an unlearned skill and a blocked caster; ends on class loss and reset', () => {
    const { w, wall, s } = rig();
    s.ember = false;
    expect(wall.cast()).toEqual({ ok: false, reason: 'class' });
    s.ember = true; s.learned = false;
    expect(wall.cast()).toEqual({ ok: false, reason: 'not-learned' });
    s.learned = true; s.canAct = false;
    expect(wall.cast()).toEqual({ ok: false, reason: 'blocked' });
    s.canAct = true;
    hostile(w, 'in', 0, -4);
    wall.cast();
    s.learned = false; // a respec
    wall.update(DT);
    expect(wall.active).toBe(false);
    s.learned = true;
    wall.cast();
    wall.end();
    run(wall, 1);
    expect(w.damage.applied).toHaveLength(0);
  });
});

function familiarRig() {
  const b = base();
  const bodies: Array<FamiliarBody & { placed: number[]; disposed: boolean }> = [];
  const engage = new Set<string>();
  const f = new IronFamiliar({
    ...b.ports,
    spawn: (id, at) => {
      const actor = new FakeActor(id, 'ally', at.x, at.z);
      b.w.actors.add(actor);
      const body = { actor, placed: [] as number[], disposed: false, place(x: number, y: number, z: number) { actor.pos.set(x, y, z); this.placed = [x, y, z]; }, dispose() { this.disposed = true; b.w.actors.map.delete(id); } };
      bodies.push(body);
      return body;
    },
    mayEngage: (id) => engage.has(id),
  } as IronFamiliarPorts);
  return { ...b, f, bodies, engage };
}

describe('Iron Familiar', () => {
  it('spawns familiar:<n> hovering 1.2 m up, follows within 3 m, one at a time, gone after 20 s', () => {
    const { w, f, bodies } = familiarRig();
    expect(f.cast()).toEqual({ ok: true });
    expect(f.actorId).toBe('familiar:1');
    expect(w.actors.get('familiar:1')!.team).toBe('ally');
    w.player.feet.set(20, 0, 0);
    run(f, 4);
    const p = bodies[0].placed;
    expect(p[1]).toBeCloseTo(1.2);
    expect(Math.hypot(p[0] - 20, p[2])).toBeLessThanOrEqual(3);
    f.cast();
    expect(bodies[0].disposed).toBe(true);
    expect(f.actorId).toBe('familiar:2');
    run(f, 19.9);
    expect(f.active).toBe(true);
    run(f, 0.2);
    expect(f.active).toBe(false);
    expect(bodies[1].disposed).toBe(true);
  });

  it('strikes the nearest engageable hostile within 12 m for 6 every 1.5 s, as the familiar, and skips mercy and unengaged foes', () => {
    const { w, f, engage } = familiarRig();
    hostile(w, 'far', 11, 0);
    hostile(w, 'near', 5, 0);
    hostile(w, 'calm', 2, 0);
    hostile(w, 'out', 30, 0);
    const k = hostile(w, 'kneel', 1, 0);
    (k as unknown as { mercyState: () => string }).mercyState = () => 'yielding';
    for (const id of ['far', 'near', 'out', 'kneel']) engage.add(id);
    f.cast();
    run(f, 1.4);
    expect(w.damage.applied).toHaveLength(0);
    run(f, 0.2);
    expect(w.damage.applied).toHaveLength(1);
    expect(w.damage.applied[0]).toMatchObject({ attackerId: 'familiar:1', targetId: 'near', amount: 6, kind: 'spell' });
    run(f, 1.5);
    expect(w.damage.applied).toHaveLength(2);
  });

  it('retries soon when nothing is engageable, and a despawned actor ends it', () => {
    const { w, f, engage, bodies } = familiarRig();
    hostile(w, 'e', 4, 0);
    f.cast();
    run(f, 2);
    expect(w.damage.applied).toHaveLength(0);
    engage.add('e');
    run(f, 0.3);
    expect(w.damage.applied).toHaveLength(1);
    w.actors.map.delete('familiar:1');
    f.update(DT);
    expect(f.active).toBe(false);
    expect(bodies[0].disposed).toBe(true);
  });

  it('refuses without the class or skill, refuses a failed spawn, and ends on a respec', () => {
    const { s, f } = familiarRig();
    s.ember = false;
    expect(f.cast()).toEqual({ ok: false, reason: 'class' });
    s.ember = true; s.learned = false;
    expect(f.cast()).toEqual({ ok: false, reason: 'not-learned' });
    s.learned = true;
    f.cast();
    s.learned = false;
    f.update(DT);
    expect(f.active).toBe(false);
    const b = base();
    const none = new IronFamiliar({ ...b.ports, spawn: () => null, mayEngage: () => true } as IronFamiliarPorts);
    expect(none.cast()).toEqual({ ok: false, reason: 'no-room' });
  });
});

describe('Iron Familiar: teleports and walls', () => {
  it('snaps next to the player at the hover height when the player is more than 10 m away, and follows normally inside that', () => {
    const { w, f, bodies } = familiarRig();
    f.cast();
    w.player.feet.set(9, 5, 0);
    f.update(DT);
    expect(bodies[0].placed[0]).toBeLessThan(2); // 9 m away: walks, no snap
    w.player.feet.set(300, 7, -200); // fast travel
    f.update(DT);
    const [x, y, z] = bodies[0].placed;
    expect(Math.hypot(x - 300, z + 200)).toBeCloseTo(IRON_FAMILIAR.spawnSide);
    expect(y).toBeCloseTo(7 + IRON_FAMILIAR.hover);
  });

  it('skips a foe it has no line of sight to and strikes the next one', () => {
    const b = familiarRig();
    hostile(b.w, 'behindWall', 3, 0);
    hostile(b.w, 'open', 6, 0);
    b.engage.add('behindWall');
    b.engage.add('open');
    const wall = new IronFamiliar({ ...b.ports, spawn: (id, at) => {
      const actor = b.w.actors.add(new FakeActor(id, 'ally', at.x, at.z));
      return { actor, place: (x: number, y: number, z: number) => actor.pos.set(x, y, z), dispose: () => void b.w.actors.map.delete(id) };
    }, mayEngage: () => true, blocked: (_from, to) => Math.abs(to.x - 3) < 0.1 } as IronFamiliarPorts);
    wall.cast();
    run(wall, 1.6);
    expect(b.w.damage.applied.map((r) => r.targetId)).toEqual(['open']);
  });
});

describe('Smoke Screen', () => {
  function rig(opts: { stealth?: boolean; perception?: boolean } = {}) {
    const b = base();
    const blockers: Array<{ b: { x: number; z: number; r: number; seconds: number }; released: boolean }> = [];
    const providers = new Set<PerceptionProvider>();
    const warn = vi.fn();
    const sm = new SmokeScreen({
      ...b.ports,
      stealth: () => (opts.stealth === false ? undefined : { addSightBlocker: (x) => { const e = { b: x, released: false }; blockers.push(e); return () => void (e.released = true); } }),
      perception: () => (opts.perception === false ? undefined : { register: (p) => (providers.add(p), () => void providers.delete(p)) }),
      warn,
    } as SmokeScreenPorts);
    return { ...b, sm, blockers, providers, warn };
  }
  const observer = (x: number, z: number) => ({ feet: { x, y: 0, z } }) as never;

  it('registers a 5 m blocker 6 m ahead and a provider giving 3 m sight inside, released after 8 s', () => {
    const { sm, blockers, providers, s } = rig();
    expect(sm.cast()).toEqual({ ok: true });
    expect(blockers[0].b).toMatchObject({ x: expect.closeTo(0), z: expect.closeTo(-6), r: 5, seconds: 8 });
    expect(s.effects).toEqual(['smoke-screen']);
    const [prov] = [...providers];
    const inside = prov.modifiers('player', observer(0, -9))!;
    expect(AI.sightRange * inside.sightRangeScale).toBeCloseTo(3);
    expect(inside.coneScale).toBe(1);
    expect(prov.modifiers('player', observer(0, -12))).toBeNull();
    run(sm, 7.9);
    expect(sm.active).toBe(true);
    run(sm, 0.2);
    expect(sm.active).toBe(false);
    expect(blockers[0].released).toBe(true);
    expect(providers.size).toBe(0);
    expect(prov.modifiers('player', observer(0, -9))).toBeNull();
  });

  it('a recast replaces, end and a respec release, and with no service at all it refuses', () => {
    const { sm, blockers, providers, s } = rig();
    sm.cast();
    sm.cast();
    expect(blockers.map((x) => x.released)).toEqual([true, false]);
    expect(providers.size).toBe(1);
    s.learned = false;
    sm.update(DT);
    expect(blockers[1].released).toBe(true);
    expect(providers.size).toBe(0);
    s.learned = true;
    expect(rig({ stealth: false, perception: false }).sm.cast()).toEqual({ ok: false, reason: 'no-stealth' });
    s.ember = false;
    expect(sm.cast()).toEqual({ ok: false, reason: 'class' });
  });

  it('works with only one of the services and warns once when perception is absent', () => {
    const r = rig({ perception: false });
    expect(r.sm.cast()).toEqual({ ok: true });
    r.sm.cast();
    expect(r.warn).toHaveBeenCalledTimes(1);
    expect(r.blockers).toHaveLength(2);
    const o = rig({ stealth: false });
    expect(o.sm.cast()).toEqual({ ok: true });
    expect(o.providers.size).toBe(1);
  });
});

describe('EmberwrightTier3 reset', () => {
  it('drops the wall, the familiar and the cloud together', () => {
    const b = base();
    const released: string[] = [];
    const t = new EmberwrightTier3({
      base: b.ports as never,
      ignite: () => true,
      spawn: (id) => ({ actor: b.w.actors.add(new FakeActor(id, 'ally')), place() {}, dispose() { released.push('familiar'); b.w.actors.map.delete(id); } }),
      mayEngage: () => false,
      stealth: () => ({ addSightBlocker: () => () => void released.push('blocker') }),
      perception: () => ({ register: () => () => void released.push('provider') }),
      warn: () => {},
    });
    for (const id of [FIRE_WALL.skillId, IRON_FAMILIAR.skillId, SMOKE_SCREEN.skillId]) expect(t.cast(id)).toEqual({ ok: true });
    expect(t.cast('x')).toEqual({ ok: false, reason: 'unknown' });
    t.reset();
    expect(t.fireWall.active || t.familiar.active || t.smoke.active).toBe(false);
    expect(released.sort()).toEqual(['blocker', 'familiar', 'provider']);
    expect(b.s.stops).toBe(2);
    t.reset();
  });
});

describe('Iron Familiar against a real Enemy', () => {
  let gltf: Awaited<ReturnType<typeof loadKnight>>;
  beforeAll(async () => { gltf = await loadKnight(); });
  beforeEach(() => void vi.spyOn(console, 'warn').mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  function world() {
    const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: -40 } });
    const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { seed: 3, spawners: [] });
    const root = new THREE.Group();
    root.position.set(2, 1.2, 0);
    fake.scene.add(root);
    const fam = new EnemyFakeActor('familiar:1', 'familiar', { kind: 'familiar', team: 'ally', maxHealth: 60, root });
    fam.hittable = false;
    fake.actorMap.set(fam.id, fam);
    const id = m.spawnLoose('blighted-soldier', { x: 0, y: 0, z: 0 }, { leash: false, aggro: false })!;
    const tick = (n: number) => {
      for (let i = 0; i < n; i++) {
        m.think(FIXED_TIMESTEP);
        m.animate(FIXED_TIMESTEP);
        fake.combatStep(FIXED_TIMESTEP);
        m.react(FIXED_TIMESTEP);
      }
    };
    const strike = () => fake.apply({ attackerId: 'familiar:1', targetId: id, amount: IRON_FAMILIAR.damage, poise: 0, kind: 'spell', attackId: IRON_FAMILIAR.attackId });
    return { fake, m, id, tick, strike };
  }

  it('an enemy with no aggro is provoked by a familiar strike: it takes the 6 damage and emits ai.aggro on the familiar', () => {
    const t = world();
    t.tick(5);
    expect(t.fake.bus.of('ai.aggro')).toHaveLength(0);
    const hp = t.fake.actorMap.get(t.id)!.health;
    expect(t.strike()?.outcome).toBe('hit');
    t.tick(1);
    expect(t.fake.actorMap.get(t.id)!.health).toBeCloseTo(hp - 6);
    expect(t.fake.bus.of('ai.aggro')[0]).toEqual({ actorId: t.id, targetId: 'familiar:1' });
  });

  it('documents the limit: enemy senses know only the player, so the familiar-aggro lapses to ai.calm and the enemy goes back to idle', () => {
    const t = world();
    t.tick(5);
    t.strike();
    t.tick(60);
    expect(t.fake.bus.of('ai.calm' as never).length).toBeGreaterThan(0);
    expect(t.m.get(t.id)!.state).toBe('idle');
  });

  it('an enemy already aggroed on someone keeps its target: the strike is damage, not a retarget', () => {
    const t = world();
    const e = t.m.spawnLoose('blighted-soldier', { x: 3, y: 0, z: 0 }, { leash: false, aggro: true })!;
    t.tick(5);
    const before = t.fake.bus.of('ai.aggro').filter((a) => a.actorId === e);
    t.fake.apply({ attackerId: 'familiar:1', targetId: e, amount: 6, poise: 0, kind: 'spell' });
    t.tick(2);
    expect(t.fake.bus.of('ai.aggro').filter((a) => a.actorId === e)).toEqual(before);
    expect(before.every((a) => a.targetId === 'player')).toBe(true);
  });
});
