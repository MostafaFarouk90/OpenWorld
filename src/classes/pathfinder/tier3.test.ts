import * as THREE from 'three';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DamageResolver, type DamageResult } from '../../actors/DamageResolver';
import { ActorRegistry } from '../../actors/ActorRegistry';
import { playerInit } from '../../actors/teams';
import { FIXED_TIMESTEP, PLAYER } from '../../config/constants';
import { GameEvents } from '../../core/events';
import { ENEMY_DEFS } from '../../enemies/defs';
import { EnemyManager } from '../../enemies/EnemyManager';
import { mercyInteractableId } from '../../enemies/mercy';
import { FakeHost, FakeStatus, loadKnight } from '../../enemies/testing/fakeHost';
import { AI } from '../../enemies/tuning';
import type { EnemyDef, EnemyKind, SpawnerDef } from '../../enemies/types';
import { CharacterController, type MoveIntent } from '../../physics/CharacterController';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { flatGround } from '../../physics/flatGround';
import { FakeActor as SpellActor, FakeActors } from '../../spells/testHost';
import { StatusEngine } from '../../status/StatusEngine';
import { SURGE } from '../../vfx/tuning';
import '../../hud/events';
import { LightStep, NetLauncher, emberQuarrelHandler, terrainBlocked, type AirJumper } from './tier3';
import { PF } from './tuning';

const DT = FIXED_TIMESTEP;

// ---- Ember Quarrel on the real DamageResolver and StatusEngine

function world() {
  const events = new GameEvents(() => {});
  const actors = new ActorRegistry(events);
  const dr = new DamageResolver(actors, events, () => {});
  const player = actors.spawn(playerInit());
  const ally = actors.spawn({ kind: 'companion:hrolf', team: 'ally', maxHealth: 80 });
  const foe = actors.spawn({ kind: 'blighted-soldier', team: 'hostile', maxHealth: 500, maxPoise: 20 });
  const engine = new StatusEngine({
    actor: (id) => actors.get(id) ?? undefined,
    tick: (req) => dr.apply(req) !== null,
    applied: () => {},
    expired: () => {},
    view: () => {},
  });
  const dealt: DamageResult[] = [];
  events.on('damage.dealt', (r: DamageResult) => void dealt.push(r));
  return { events, actors, dr, player, ally, foe, engine, dealt };
}

describe('Ember Quarrel', () => {
  function rig(opts: { active?: boolean; status?: boolean } = {}) {
    const w = world();
    const st = { active: opts.active ?? true, fx: 0, triggers: 0, warns: [] as string[] };
    const h = emberQuarrelHandler({
      playerId: () => w.player.id,
      active: () => st.active,
      status: () => (opts.status === false ? undefined : w.engine),
      warn: (m) => void st.warns.push(m),
      fx: () => void st.fx++,
      triggered: () => void st.triggers++,
    });
    w.events.on('damage.dealt', (r: DamageResult) => h(r));
    const bolt = (extra: Record<string, unknown> = {}) =>
      w.dr.apply({ attackerId: w.player.id, targetId: w.foe.id, amount: 14, poise: 10, kind: 'melee', attackId: 'pathfinder.bolt.1', point: new THREE.Vector3(), ...extra } as never);
    const ignites = () => w.engine.list(w.foe.id).filter((e) => e.kind === 'ignite');
    return { ...w, st, bolt, ignites };
  }

  it('a bolt that hits ignites the target under its own id: 3 dps for 3 s from the player', () => {
    const r = rig();
    r.bolt();
    expect(r.ignites()).toEqual([expect.objectContaining({ id: 'pathfinder.emberQuarrel.ignite', remaining: 3, sourceId: r.player.id })]);
    expect(PF.emberQuarrel).toMatchObject({ dps: 3, seconds: 3 });
    expect(r.st.fx).toBe(1);
    expect(r.st.triggers).toBe(1);
  });

  it('the ignite ticks 3 health a second as status damage', () => {
    const r = rig();
    r.bolt();
    const hp = r.foe.health;
    r.engine.update(1.01);
    expect(hp - r.foe.health).toBeCloseTo(3);
    expect(r.dealt.some((d) => d.kind === 'status')).toBe(true);
  });

  it('refreshes and never stacks: a second bolt after 2 s resets to 3 s on one entry, and ticks do not re-ignite', () => {
    const r = rig();
    r.bolt();
    r.engine.update(2);
    expect(r.ignites()[0].remaining).toBeCloseTo(1);
    r.bolt();
    expect(r.ignites()).toHaveLength(1);
    expect(r.ignites()[0].remaining).toBeCloseTo(3);
    const before = r.dealt.length;
    r.engine.update(1.01);
    const ticks = r.dealt.slice(before).filter((d) => d.kind === 'status');
    expect(ticks.length).toBeGreaterThan(0);
    expect(r.ignites()).toHaveLength(1);
    expect(r.ignites()[0].remaining).toBeLessThan(2.1);
  });

  it('does nothing for the area shot splash, the Surge quarrel, other attacks, other attackers, blocked hits or status damage', () => {
    const r = rig();
    r.bolt({ attackId: 'pathfinder.bolt.4.blast', kind: 'spell' });
    r.bolt({ attackId: SURGE.spellId, kind: 'spell' });
    r.bolt({ attackId: '2H_Ranged_Shoot' });
    r.bolt({ attackId: 'pathfinder.bolt.1', kind: 'status' });
    r.bolt({ attackerId: r.ally.id });
    r.bolt({ attackId: undefined });
    expect(r.ignites()).toEqual([]);
    const off = r.dr.addModifier('test.block', (req) => void (req.outcome = 'blocked'), -150);
    r.bolt();
    off();
    expect(r.ignites()).toEqual([]);
    r.foe.invulnerable = true;
    r.bolt();
    expect(r.ignites()).toEqual([]);
  });

  it('does nothing when unlearned, and ignites no corpse (a killing bolt)', () => {
    const off = rig({ active: false });
    off.bolt();
    expect(off.ignites()).toEqual([]);
    const k = rig();
    k.bolt({ amount: 9999 });
    expect(k.foe.dead).toBe(true);
    expect(k.ignites()).toEqual([]);
  });

  it('warns once when the status service is absent and does not throw', () => {
    const r = rig({ status: false });
    expect(() => {
      r.bolt();
      r.bolt();
    }).not.toThrow();
    expect(r.st.warns).toHaveLength(1);
    expect(r.st.fx).toBe(0);
  });
});

// ---- Net Launcher

describe('Net Launcher', () => {
  function rig(opts: { lock?: string | null; blocked?: boolean; status?: 'real' | 'none' | 'refuse' } = {}) {
    const player = new SpellActor('player', 'player', 0, 0);
    const actors = new FakeActors(player);
    const foe = (id: string, x: number, z: number) => actors.add(new SpellActor(id, 'hostile', x, z));
    const calls: Array<{ id: string; spec: Parameters<StatusEngineApply>[1] }> = [];
    const st = { lock: opts.lock ?? null, blocked: opts.blocked ?? false, fx: [] as unknown[], triggers: 0, aimDir: { x: 0, y: 0, z: -1 } };
    const w = world();
    const status =
      opts.status === 'none'
        ? undefined
        : { apply: (id: string, spec: Parameters<StatusEngineApply>[1]) => (calls.push({ id, spec }), opts.status !== 'refuse') };
    const net = new NetLauncher({
      actors,
      playerId: () => 'player',
      status: () => status,
      origin: (out) => out.set(0, 1.3, 0),
      aim: () => st.aimDir,
      lockTarget: () => st.lock,
      blocked: () => st.blocked,
      fx: (at) => void st.fx.push(at),
      triggered: () => void st.triggers++,
    });
    return { actors, foe, net, calls, st, w };
  }
  type StatusEngineApply = StatusEngine['apply'];

  it('roots the foe in front for 4 s through status.apply with the player as source, with the effect and trigger', () => {
    const t = rig();
    t.foe('a', 0, -10);
    expect(t.net.cast()).toEqual({ ok: true });
    expect(t.calls).toEqual([{ id: 'a', spec: { id: 'pathfinder.netLauncher.root', kind: 'root', seconds: 4, sourceId: 'player' } }]);
    expect(t.st.fx).toHaveLength(1);
    expect(t.st.triggers).toBe(1);
  });

  it('picks the nearest foe along the aim, within 18 m and 1.5 m of the ray; others are ignored', () => {
    const t = rig();
    t.foe('far', 0, -17);
    t.foe('near', 0.5, -6);
    t.foe('side', 6, -4);
    t.foe('behind', 0, 5);
    t.net.cast();
    expect(t.calls.map((c) => c.id)).toEqual(['near']);
    const e = rig();
    e.foe('out', 0, -19);
    e.foe('wide', 5, -6);
    expect(e.net.cast()).toEqual({ ok: false, reason: 'no-target' });
    expect(e.calls).toEqual([]);
  });

  it('uses the lock-on target when in range, even off the aim ray, and fails when it is out of range or hidden', () => {
    const t = rig({ lock: 'lock' });
    t.foe('lock', 8, -8);
    t.foe('front', 0, -5);
    t.net.cast();
    expect(t.calls.map((c) => c.id)).toEqual(['lock']);
    const far = rig({ lock: 'lock' });
    far.foe('lock', 0, -25);
    far.foe('front', 0, -5);
    expect(far.net.cast()).toEqual({ ok: false, reason: 'no-target' });
    const hidden = rig({ lock: 'lock', blocked: true });
    hidden.foe('lock', 0, -5);
    expect(hidden.net.cast()).toEqual({ ok: false, reason: 'no-target' });
  });

  it('an ineligible lock-on target (dead, in a mercy state, out of range) refuses instead of netting someone else', () => {
    const t = rig({ lock: 'lock' });
    t.foe('front', 0, -5);
    const lock = t.foe('lock', 0, -7);
    (lock as unknown as { mercyState: () => string }).mercyState = () => 'spared';
    expect(t.net.cast()).toEqual({ ok: false, reason: 'no-target' });
    (lock as unknown as { mercyState: () => string }).mercyState = () => 'none';
    lock.kill();
    expect(t.net.cast()).toEqual({ ok: false, reason: 'no-target' });
    expect(t.calls).toEqual([]);
  });

  it('skips dead foes, allies, foes in a mercy state and terrain-blocked foes', () => {
    const t = rig();
    const dead = t.foe('dead', 0, -4);
    dead.kill();
    t.actors.add(new SpellActor('ally', 'ally', 0, -5));
    const spared = t.foe('spared', 0, -6);
    (spared as unknown as { mercyState: () => string }).mercyState = () => 'spared';
    expect(t.net.cast()).toEqual({ ok: false, reason: 'no-target' });
    t.foe('ok', 0, -9);
    t.net.cast();
    expect(t.calls.map((c) => c.id)).toEqual(['ok']);
    const b = rig({ blocked: true });
    b.foe('wall', 0, -5);
    expect(b.net.cast()).toEqual({ ok: false, reason: 'no-target' });
  });

  it('refuses with no status service and with an immune target, without effect or trigger', () => {
    const none = rig({ status: 'none' });
    none.foe('a', 0, -5);
    expect(none.net.cast()).toEqual({ ok: false, reason: 'no-status' });
    const imm = rig({ status: 'refuse' });
    imm.foe('a', 0, -5);
    expect(imm.net.cast()).toEqual({ ok: false, reason: 'immune' });
    expect(imm.st.fx).toEqual([]);
    expect(imm.st.triggers).toBe(0);
  });

  it('on the real DamageResolver and StatusEngine: no damage request at all, health and poise untouched, a second net refreshes and never extends', () => {
    const w = world();
    const requests: unknown[] = [];
    w.events.onAny((t) => t === 'damage.dealt' && requests.push(t));
    const player = new SpellActor(w.player.id, 'player', 0, 0);
    const foe = new SpellActor(w.foe.id, 'hostile', 0, -6);
    const actors = new FakeActors(player);
    actors.add(foe);
    const net = new NetLauncher({
      actors,
      playerId: () => w.player.id,
      status: () => w.engine,
      origin: (out) => out.set(0, 1.3, 0),
      aim: () => ({ x: 0, y: 0, z: -1 }),
      lockTarget: () => null,
    });
    const hp = w.foe.health;
    const poise = w.foe.poise;
    expect(net.cast()).toEqual({ ok: true });
    expect(w.engine.has(w.foe.id, 'root')).toBe(true);
    expect(w.engine.list(w.foe.id)).toEqual([expect.objectContaining({ id: 'pathfinder.netLauncher.root', remaining: 4 })]);
    w.engine.update(3);
    expect(w.engine.list(w.foe.id)[0].remaining).toBeCloseTo(1);
    net.cast();
    expect(w.engine.list(w.foe.id)).toHaveLength(1);
    expect(w.engine.list(w.foe.id)[0].remaining).toBeCloseTo(4);
    w.engine.update(5);
    expect(w.engine.has(w.foe.id, 'root')).toBe(false);
    expect(requests).toEqual([]);
    expect(w.foe.health).toBe(hp);
    expect(w.foe.poise).toBe(poise);
  });
});

// ---- Net Launcher and mercy on a real EnemyManager

let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
const HOUND: EnemyDef = {
  ...ENEMY_DEFS['ash-wraith'],
  kind: 'pf-fixture-hound' as EnemyKind,
  rises: false,
  mercy: { verb: 'calm', tier: 'normal', track: 'dragons', when: 'calming', offerings: [{ itemId: 'hearth-bread', count: 1 }], warmHand: true },
};

beforeAll(async () => {
  gltf = await loadKnight();
});

const group = (id: string, enemy: string): SpawnerDef => ({
  id,
  enemy: enemy as SpawnerDef['enemy'],
  count: 1,
  anchor: 'a',
  band: { min: 1, max: 1 },
  activation: 'manual',
  respawn: 'never',
  leash: false,
});

describe('Net Launcher against real enemies keeps mercy open', () => {
  beforeEach(() => {
    (ENEMY_DEFS as unknown as Record<string, EnemyDef>)[HOUND.kind] = HOUND;
    return () => delete (ENEMY_DEFS as unknown as Record<string, EnemyDef>)[HOUND.kind];
  });

  function rig(playerZ: number, spawners: SpawnerDef[]) {
    const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: playerZ } });
    fake.defineAnchor('a', 0, 0);
    const status = new FakeStatus();
    fake.status = status;
    fake.provideItems({ 'hearth-bread': 1 });
    fake.flags.set('enemies.mercy.calm', true);
    fake.spells = { useShard: () => {} };
    const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners, seed: 11 });
    const tick = (seconds = DT) => {
      for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) {
        m.think(DT);
        m.animate(DT);
        fake.combatStep(DT);
        m.react(DT);
        m.render(1);
      }
    };
    const hold = (id: string) => fake.interactables.get(mercyInteractableId(m.get(id)!.slug))!;
    const net = (id: string) => {
      const damage: unknown[] = [];
      fake.bus.on('damage.dealt', (r) => void damage.push(r));
      const nets = new NetLauncher({
        actors: { get: (i) => fake.actorMap.get(i) as never, all: () => fake.actorMap.values() as never, player: fake.player as never },
        playerId: () => fake.player.id,
        status: () => status,
        origin: (out) => out.set(0, 1.3, fake.player.root?.position.z ?? playerZ),
        aim: () => ({ x: 0, y: 0, z: -1 }),
        lockTarget: () => id,
      });
      return { nets, damage };
    };
    const revoked: unknown[] = [];
    fake.bus.on('mercy.revoked', (e) => void revoked.push(e));
    return { fake, m, tick, hold, net, status, revoked };
  }

  it('a netted wraith that later reaches a poise break still opens Release, and nothing is revoked', () => {
    const t = rig(-30, [group('pack', 'ash-wraith')]);
    const [id] = t.m.service.spawnGroup('pack');
    t.tick(AI.riseSeconds + 0.1);
    t.m.service.setMercyUnlocked('release', true);
    const { nets, damage } = t.net(id!);
    t.fake.actorMap.get(id!)!.root!.position.set(0, 0, -20);
    expect(nets.cast()).toEqual({ ok: true });
    expect(t.status.calls).toEqual([{ actorId: id, spec: expect.objectContaining({ kind: 'root', seconds: 4 }) }]);
    expect(damage).toEqual([]);
    expect(t.m.get(id!)!.brain.struck).toBe(false);
    t.fake.stagger(id!, 'player');
    t.tick(0.1);
    expect(t.hold(id!).enabled!()).toBe(true);
    t.hold(id!).onInteract(t.fake.player);
    expect(t.fake.bus.of('mercy')).toEqual([expect.objectContaining({ verb: 'release', actorId: id })]);
    expect(t.revoked).toEqual([]);
  });

  it('a netted soldier broken at low health opens Spare (the hunter stand-in: no hunter def is on this tree), and nothing is revoked', () => {
    const t = rig(-1.5, [group('pair', 'blighted-soldier')]);
    t.m.service.setMercyUnlocked('spare', true);
    const [id] = t.m.service.spawnGroup('pair', { aggro: true });
    t.tick(0.1);
    const { nets, damage } = t.net(id!);
    t.fake.actorMap.get(id!)!.root!.position.set(0, 0, -6);
    expect(nets.cast()).toEqual({ ok: true });
    t.fake.actorMap.get(id!)!.health = t.fake.actorMap.get(id!)!.maxHealth * 0.4;
    t.fake.stagger(id!, 'player');
    t.tick(0.1);
    expect(damage).toEqual([]);
    expect(t.m.get(id!)!.brain.struck).toBe(false);
    expect(t.hold(id!).enabled!()).toBe(true);
    t.hold(id!).onInteract(t.fake.player);
    expect(t.fake.bus.of('mercy')).toEqual([expect.objectContaining({ verb: 'spare', actorId: id })]);
    expect(t.revoked).toEqual([]);
  });

  it('a netted hound is still calmable without a stagger, while a struck one (the control) is refused', () => {
    const t = rig(-12, [group('kennel', 'pf-fixture-hound'), group('control', 'pf-fixture-hound')]);
    const [a] = t.m.service.spawnGroup('kennel');
    const [b] = t.m.service.spawnGroup('control');
    t.tick(0.1);
    const { nets } = t.net(a!);
    expect(nets.cast()).toEqual({ ok: true });
    expect(t.m.get(a!)!.mercyOpen).toBe(true);
    expect(t.hold(a!).enabled!()).toBe(true);
    t.fake.apply({ attackerId: 'player', targetId: b!, amount: 0, poise: 0, kind: 'melee' });
    expect(t.m.get(b!)!.brain.struck).toBe(true);
    expect(t.hold(b!).enabled!()).toBe(false);
    t.hold(a!).onInteract(t.fake.player);
    expect(t.m.get(a!)!.state).toBe('calmed');
    expect(t.revoked).toEqual([]);
  });

  it('the real hunter defs open Spare when rooted (the manager path with a net root is in enemies/hunters/hunters.test.ts)', () => {
    for (const kind of ['hunter-spearman', 'hunter-harpooner'] as const) {
      expect(ENEMY_DEFS[kind].yieldWhenRooted, kind).toBe(true);
      expect(ENEMY_DEFS[kind].mercy, kind).toMatchObject({ verb: 'spare', when: 'yielding' });
    }
  });
});

// ---- Light Step

describe('Light Step reconcile (fake controller)', () => {
  function rig(active = true) {
    const c: AirJumper & { grounded: boolean } = { airJumps: 0, airJumpSpeed: undefined, grounded: true };
    const st = { active, y: 0, fx: 0, triggers: 0, ctl: c as AirJumper | null };
    const ls = new LightStep({
      active: () => st.active,
      controller: () => st.ctl,
      feetY: () => st.y,
      fx: () => void st.fx++,
      triggered: () => void st.triggers++,
    });
    return { c, st, ls };
  }

  it('sets one air jump at sqrt(0.7) of the ground speed while active and puts both back when not', () => {
    const { c, st, ls } = rig();
    ls.tick(DT);
    expect(c.airJumps).toBe(1);
    expect(c.airJumpSpeed).toBeCloseTo(Math.sqrt(0.7) * PLAYER.jumpSpeed);
    st.active = false;
    ls.tick(DT);
    expect(c.airJumps).toBe(0);
    expect(c.airJumpSpeed).toBeUndefined();
  });

  it('reset() (death, class change, load) hands the controller back at once; the next active tick takes it again', () => {
    const { c, ls } = rig();
    ls.tick(DT);
    ls.reset();
    expect(c.airJumps).toBe(0);
    expect(c.airJumpSpeed).toBeUndefined();
    ls.tick(DT);
    expect(c.airJumps).toBe(1);
  });

  it('releases the old controller when the avatar changes, and tolerates a missing one', () => {
    const { c, st, ls } = rig();
    ls.tick(DT);
    const next: AirJumper = { airJumps: 0, airJumpSpeed: undefined, grounded: true };
    st.ctl = next;
    ls.tick(DT);
    expect(c.airJumps).toBe(0);
    expect(next.airJumps).toBe(1);
    st.ctl = null;
    expect(() => ls.tick(DT)).not.toThrow();
    expect(next.airJumps).toBe(0);
  });

  it('never clobbers a controller it does not own when inactive', () => {
    const { c, ls, st } = rig(false);
    c.airJumps = 2;
    ls.tick(DT);
    expect(c.airJumps).toBe(2);
    st.active = false;
    ls.reset();
    expect(c.airJumps).toBe(2);
  });
});

describe('Light Step on the real CharacterController', () => {
  let physics: PhysicsWorld;
  const IDLE: MoveIntent = { moveX: 0, moveZ: 0, sprint: false, jump: false };

  beforeEach(async () => {
    physics = new PhysicsWorld();
    await physics.init();
    physics.addHeightfield(flatGround(200));
  });

  let lane = 0;
  function rig() {
    // Each rig stands on its own patch of the shared ground: two capsules in one spot would stack.
    const c = new CharacterController(physics, { x: (lane += 10), y: 0, z: 0 });
    const st = { active: true, fx: 0, triggers: 0 };
    const feetY = (): number => c.interpolatedFeet(1, { x: 0, y: 0, z: 0 }).y;
    const ls = new LightStep({ active: () => st.active, controller: () => c, feetY, fx: () => void st.fx++, triggered: () => void st.triggers++ });
    const step = (jump: boolean): number => {
      ls.tick(DT);
      c.fixedUpdate({ ...IDLE, jump });
      physics.step();
      return feetY();
    };
    for (let i = 0; i < 30; i++) step(false);
    return { c, st, ls, step, feetY };
  }

  /** Presses jump once on the ground and returns the apex height gained, leaving the controller falling. */
  function groundJumpApex(r: ReturnType<typeof rig>): number {
    const y0 = r.feetY();
    let apex = y0;
    r.step(true);
    for (let i = 0; i < 30; i++) apex = Math.max(apex, r.step(false));
    return apex - y0;
  }

  it('the air jump rises to about 0.7 of the ground jump apex; one air jump, then none until landing', () => {
    const a = rig();
    const ground = groundJumpApex(a);
    expect(ground).toBeGreaterThan(0.9);

    const r = rig();
    r.step(true);
    for (let i = 0; i < 20; i++) r.step(false);
    expect(r.c.grounded).toBe(false);
    const y0 = r.feetY();
    let apex = y0;
    r.step(true);
    for (let i = 0; i < 40; i++) apex = Math.max(apex, r.step(false));
    const ratio = (apex - y0) / ground;
    expect(ratio).toBeGreaterThan(0.64);
    expect(ratio).toBeLessThan(0.76);
    expect(r.st.fx).toBe(1);

  });

  it('a second press in the air does nothing: the rise keeps slowing by gravity', () => {
    const r = rig();
    r.step(true);
    for (let i = 0; i < 20; i++) r.step(false);
    r.step(true); // the air jump
    for (let i = 0; i < 3; i++) r.step(false);
    const vy = (): number => {
      const y = r.feetY();
      r.step(false);
      return (r.feetY() - y) / DT;
    };
    const before = vy();
    const y = r.feetY();
    r.step(true); // second press, rising at about 4 m/s: a relaunch would be 5.1
    const during = (r.feetY() - y) / DT;
    expect(during).toBeLessThan(before);
    expect(r.st.fx).toBe(1);
  });

  it('a normal ground jump fires no effect and no trigger', () => {
    const r = rig();
    r.step(true);
    for (let i = 0; i < 60; i++) r.step(false);
    expect(r.st.fx).toBe(0);
    expect(r.st.triggers).toBe(0);
  });

  it('lands and gets its air jump back', () => {
    const r = rig();
    r.step(true);
    for (let i = 0; i < 10; i++) r.step(false);
    r.step(true);
    for (let i = 0; i < 300 && !r.c.grounded; i++) r.step(false);
    expect(r.c.grounded).toBe(true);
    for (let i = 0; i < 5; i++) r.step(false);
    r.step(true);
    for (let i = 0; i < 10; i++) r.step(false);
    const y0 = r.feetY();
    r.step(true);
    for (let i = 0; i < 20; i++) r.step(false);
    expect(r.feetY()).toBeGreaterThan(y0);
    expect(r.st.fx).toBe(2);
  });

  it('with the skill gone (respec, class change) the controller is back at zero and mid-air presses do nothing, even with a jump banked', () => {
    const r = rig();
    r.step(true);
    for (let i = 0; i < 10; i++) r.step(false);
    // banked: airJumpsLeft is 1 here; the skill is removed in the air
    r.st.active = false;
    r.step(false);
    expect(r.c.airJumps).toBe(0);
    expect(r.c.airJumpSpeed).toBeUndefined();
    r.step(false);
    const y1 = r.feetY();
    r.step(false);
    const vyBefore = (r.feetY() - y1) / DT;
    const y2 = r.feetY();
    r.step(true);
    const vyAfter = (r.feetY() - y2) / DT;
    expect(vyAfter).toBeLessThan(vyBefore + 1);
    expect(r.st.fx).toBe(0);
  });
});

describe('Net Launcher line of sight on real colliders', () => {
  let physics: PhysicsWorld;
  beforeEach(async () => {
    physics = new PhysicsWorld();
    await physics.init();
  });
  const R = () => physics.rapier;
  const kinematicBox = (x: number, z: number, half: number) => {
    const body = physics.world.createRigidBody(R().RigidBodyDesc.kinematicPositionBased().setTranslation(x, 1, z));
    physics.world.createCollider(R().ColliderDesc.cuboid(half, 2, half), body);
  };
  const from = { x: 0, y: 1.3, z: 0 };

  it('a foe collider on the target, or another foe in the line, does not block; a wall does', () => {
    const blocked = terrainBlocked(physics as never);
    kinematicBox(0, -10, 1.5); // the target itself, a big one
    kinematicBox(0, -5, 1); // another foe in front
    physics.step();
    expect(blocked(from, { x: 0, y: 1.1, z: -10 })).toBe(false);
    physics.addStaticCollider(R().ColliderDesc.cuboid(5, 3, 0.2).setTranslation(0, 1, -3));
    physics.step();
    expect(blocked(from, { x: 0, y: 1.1, z: -10 })).toBe(true);
  });
});
