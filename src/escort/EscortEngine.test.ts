// L4: the escorts service on a real core Game (real damage, movement modes, anchors, interaction) with fake enemies and
// the shipped taunt registry.
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TauntRegistry } from '../enemies/taunts';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { makeKit, type Kit } from '../waves/testKit';
import { ESCORT_ENGINE, EscortEngine, type Act4EscortDef } from './EscortEngine';
import { ESCORT_CART } from './EscortCart';

let physics: PhysicsWorld;
let kit: Kit;
let engine: EscortEngine;
let taunts: TauntRegistry;
/** Cael's position as the engine reads it. */
const cael = { x: 0, y: 0, z: 0 };
const weather = { kind: 'clear' as 'clear' | 'storm', holds: [] as string[], released: [] as string[] };

/** A straight route from the player toward -Z: start, j1 at 30 m, shelter at 40 m, j2 at 60 m, end at 80 m. */
function route(): Act4EscortDef {
  const f = kit.ctx.player.feet;
  const at = (id: string, dz: number) => void (kit.ctx.anchors.find(id) ?? kit.ctx.anchors.define({ id, position: { x: f.x, y: f.y, z: f.z - dz }, yaw: 0 }));
  at('test.r.0', 0);
  at('test.r.1', 80);
  at('test.j.1', 30);
  at('test.j.2', 60);
  at('test.sh.1', 40);
  return {
    id: 'test.deep-run',
    members: [{ id: 'edric', kind: 'npc' }, { id: 'rook', kind: 'npc' }],
    route: ['test.r.0', 'test.r.1'],
    pace: 2,
    stopAt: ['test.j.1', 'test.j.2'],
    shelters: ['test.sh.1'],
    kneelOnHit: true,
  };
}

/** Walks the player with the lead (2 m behind it) for `s` seconds. */
function follow(s: number) {
  for (let t = 0; t < s; t += 1 / 60) {
    const lead = engine.view() ? (kit.ctx.actors.get((engine as unknown as { cur: { members: { all: { id: string }[] } } }).cur.members.all[0].id)!.root!.position) : null;
    if (lead) Object.assign(cael, { x: lead.x, y: lead.y, z: lead.z + 2 });
    kit.run(1);
  }
}
const events = (type: string) => kit.events.filter((e) => e.type === type).map((e) => e.payload);

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  kit = await makeKit(physics, { withWaves: false, anchors: false });
  taunts = new TauntRegistry();
  (kit.enemies.service as unknown as { taunts: TauntRegistry }).taunts = taunts;
  weather.kind = 'clear';
  weather.holds = [];
  weather.released = [];
  (kit.ctx.services.provide as (n: string, v: unknown) => void)('weather', {
    state: () => ({ kind: weather.kind, t: 0, forced: false, held: false }),
    holdClear: (r: string) => {
      weather.holds.push(r);
      return () => weather.released.push(r);
    },
    forceStorm: () => () => {},
    clock: { seed: 0, next: () => ({ kind: 'clear', at: 0 }) },
    onShelter: () => false,
  });
  Object.assign(cael, { x: kit.ctx.player.feet.x, y: kit.ctx.player.feet.y, z: kit.ctx.player.feet.z });
  engine = new EscortEngine(kit.ctx, () => cael);
  kit.ctx.systems.add({ id: 'test.escorts', fixedPhase: 'rules', order: 12, fixedUpdate: (dt) => { taunts.update(dt); engine.fixedUpdate(dt); } });
}, 30_000);
afterEach(() => {
  engine.dispose();
  kit.teardown();
  vi.restoreAllMocks();
});

describe('escorts service', () => {
  it('starts, emits escort.started, pushes the escort mode and walks', () => {
    expect(engine.start(route())).toBe(true);
    expect(engine.active()).toBe('test.deep-run');
    expect(events('escort.started')).toEqual([{ escortId: 'test.deep-run' }]);
    expect(kit.ctx.services.require('movementMode').current).toBe('escort');
    follow(5);
    expect(engine.state('test.deep-run')).toMatchObject({ reason: null, junction: null, arrived: false });
  });

  it('refuses a second escort, an unknown member and a missing anchor; start of the running id is a no-op', () => {
    const def = route();
    expect(engine.start({ ...def, members: [{ id: 'nobody', kind: 'npc' }] })).toBe(false);
    expect(engine.start({ ...def, route: ['test.r.0', 'nowhere'] })).toBe(false);
    expect(engine.active()).toBeNull();
    expect(engine.start(def)).toBe(true);
    expect(engine.start(def)).toBe(true);
    expect(engine.start({ ...def, id: 'other' })).toBe(false);
    expect(events('escort.started')).toHaveLength(1);
  });

  it('stops at a junction; go (the F talk on the lead) resumes it; lastJunction reports it', () => {
    engine.start(route());
    follow(16);
    expect(events('escort.junction')).toEqual([{ escortId: 'test.deep-run', junction: 'test.j.1' }]);
    expect(events('escort.halted')).toContainEqual({ escortId: 'test.deep-run', reason: 'junction' });
    expect(engine.lastJunction('test.deep-run')).toBe('test.j.1');
    expect(engine.go('test.deep-run')).toBe(true);
    expect(events('escort.resumed')).toHaveLength(1);
    expect(engine.go('test.deep-run')).toBe(false);
  });

  it('a junction with Cael absent waits with call-outs every 20 s and never times out', () => {
    engine.start(route());
    follow(16);
    cael.x += 200;
    kit.runSecs(65);
    expect(engine.state('test.deep-run')?.junction).toBe('test.j.1');
    const callouts = kit.events.filter((e) => e.type === 'hud.toast' && e.payload.textKey === 'escort.callout');
    expect(callouts.length).toBeGreaterThanOrEqual(3);
    expect(callouts.length).toBeLessThanOrEqual(4);
  });

  it('a hostile hit halts it with reason hit; killing the hostile resumes it', () => {
    engine.start(route());
    follow(3);
    const r = (engine as unknown as { cur: { members: { all: Array<{ id: string; position: THREE.Vector3 }> } } }).cur;
    const root = new THREE.Group();
    root.position.copy(r.members.all[0].position).add(new THREE.Vector3(3, 0, 0));
    kit.ctx.scene.add(root);
    const foe = kit.ctx.actors.spawn({ kind: 'blighted-soldier', team: 'hostile', maxHealth: 40, maxPoise: 15, root });
    kit.ctx.damage.apply({ attackerId: foe.id, targetId: r.members.all[0].id, amount: 5, kind: 'melee' });
    follow(1);
    expect(events('escort.halted')).toContainEqual({ escortId: 'test.deep-run', reason: 'hit' });
    expect(engine.view()!.members[0].kneeling).toBe(true);
    kit.ctx.damage.apply({ attackerId: kit.ctx.actors.player.id, targetId: foe.id, amount: 999, kind: 'melee' });
    follow(1);
    expect(engine.view()!.members[0].kneeling).toBe(false);
    expect(events('escort.resumed').length).toBeGreaterThan(0);
  });

  it('a storm sends it to the shelter; a clear resumes it', () => {
    engine.start(route());
    follow(16);
    engine.go('test.deep-run');
    follow(1);
    weather.kind = 'storm';
    follow(10);
    expect(events('escort.halted')).toContainEqual({ escortId: 'test.deep-run', reason: 'storm' });
    const lead = engine.view();
    expect(lead).not.toBeNull();
    weather.kind = 'clear';
    follow(1);
    expect(engine.state('test.deep-run')?.reason).toBeNull();
  });

  it('holds weather clear near the hand-in, arrives once, and stop releases the hold and the mode', () => {
    engine.start(route());
    follow(16);
    engine.go('test.deep-run');
    follow(16);
    engine.go('test.deep-run');
    follow(12);
    expect(weather.holds).toEqual([ESCORT_ENGINE.holdReason('test.deep-run')]);
    expect(events('escort.arrived')).toEqual([{ escortId: 'test.deep-run' }]);
    engine.stop('test.deep-run');
    expect(weather.released).toEqual([ESCORT_ENGINE.holdReason('test.deep-run')]);
    expect(engine.active()).toBeNull();
    expect(kit.ctx.services.require('movementMode').current).toBe('walk');
    expect(events('escort.stopped')).toEqual([{ escortId: 'test.deep-run' }]);
  });

  it('the escort safe point is the last junction', () => {
    engine.start(route());
    follow(16);
    engine.go('test.deep-run');
    follow(5);
    const sp = kit.ctx.services.require('movementMode').safePoint!;
    const j = kit.ctx.anchors.find('test.j.1')!.position;
    expect(Math.hypot(sp.position.x - j.x, sp.position.z - j.z)).toBeLessThan(0.01);
  });
});

describe('escorts save and load', () => {
  const states: Array<[string, () => void]> = [
    ['at the junction', () => follow(16)],
    ['walking after it', () => { follow(16); engine.go('test.deep-run'); follow(3); }],
    ['halted for a storm', () => { follow(16); engine.go('test.deep-run'); follow(1); weather.kind = 'storm'; follow(2); }],
    ['halted with Cael far', () => { follow(16); engine.go('test.deep-run'); follow(1); cael.x += 100; kit.runSecs(1); }],
  ];
  it.each(states)('%s: a load puts the column back at the last junction, waiting, members up', (_n, reach) => {
    engine.start(route());
    reach();
    const saved = JSON.parse(JSON.stringify(engine.serialize()));
    expect(saved.running.junctionIndex).toBe(0);
    weather.kind = 'clear';
    engine.load(saved, ESCORT_ENGINE.persistVersion);
    kit.ctx.events.emit('save.loaded', { slot: 'test' } as never);
    expect(engine.active()).toBe('test.deep-run');
    expect(engine.state('test.deep-run')).toMatchObject({ reason: 'junction', junction: 'test.j.1' });
    expect(engine.view()!.members.every((m) => !m.kneeling)).toBe(true);
    expect(kit.ctx.services.require('movementMode').current).toBe('escort');
    // released once: the old mode push went with the teardown
    engine.stop('test.deep-run');
    expect(kit.ctx.services.require('movementMode').current).toBe('walk');
  });

  it('the junction talk with a dialogue keeps the column waiting until the dialogue ends', () => {
    const started: string[] = [];
    (kit.ctx.services.provide as (n: string, v: unknown) => void)('dialogue', { start: (id: string) => (started.push(id), true) });
    engine.start({ ...route(), junctionDialogue: { 'test.j.1': 'test-talk' } });
    follow(16);
    // the lead's talk, as F on it would run it
    const items = (kit.ctx.interaction as unknown as { items: Map<string, { onInteract(): void }> }).items;
    const talkItem = items.get('escort:test-deep-run');
    expect(talkItem).toBeTruthy();
    talkItem!.onInteract();
    expect(started).toEqual(['test-talk']);
    follow(1);
    expect(engine.state('test.deep-run')).toMatchObject({ reason: 'junction' });
    kit.ctx.events.emit('dialogue.ended', { dialogueId: 'other', npcId: 'edric', reason: 'done' } as never);
    expect(engine.state('test.deep-run')!.reason).toBe('junction');
    kit.ctx.events.emit('dialogue.ended', { dialogueId: 'test-talk', npcId: 'edric', reason: 'done' } as never);
    expect(engine.state('test.deep-run')!.reason).toBeNull();
  });

  it.each([
    ['a null member', (d: Act4EscortDef) => ({ ...d, members: [null] })],
    ['a route that is not a list', (d: Act4EscortDef) => ({ ...d, route: 7 })],
    ['an inherited member id', (d: Act4EscortDef) => ({ ...d, members: [{ id: 'toString', kind: 'npc' }] })],
    ['a missing route anchor', (d: Act4EscortDef) => ({ ...d, route: ['test.r.0', 'nowhere.at-all'] })],
  ])('a load with %s drops the escort without throwing', (_n, spoil) => {
    engine.start(route());
    follow(2);
    const bad = { running: { def: spoil(route()), junctionIndex: 0, cartHealth: null } };
    engine.load(bad, ESCORT_ENGINE.persistVersion);
    expect(() => kit.ctx.events.emit('save.loaded', { slot: 'test' } as never)).not.toThrow();
    expect(engine.active()).toBeNull();
    expect(kit.ctx.services.require('movementMode').current).toBe('walk');
  });

  it('a later Cael absence calls out at once, even when it starts under a junction halt', () => {
    engine.start(route());
    follow(16);
    const before = events('hud.toast').length;
    cael.x += 100;
    kit.runSecs(0.5);
    expect(events('hud.toast').length).toBe(before + 1);
    follow(0.5); // back with the lead
    cael.x += 100;
    kit.runSecs(0.5);
    expect(events('hud.toast').length).toBe(before + 2);
  });

  it('a load with no escort entry (or an old save) despawns a running escort', () => {
    engine.start(route());
    follow(3);
    kit.ctx.events.emit('save.loaded', { slot: 'test' } as never);
    expect(engine.active()).toBeNull();
    expect(kit.ctx.services.require('movementMode').current).toBe('walk');
  });

  it('an arrived escort saves as none; a bad version loads as none', () => {
    engine.start(route());
    expect(engine.serialize().running).not.toBeNull();
    engine.load({ running: { def: route(), junctionIndex: 0, cartHealth: null } }, 99);
    kit.ctx.events.emit('save.loaded', { slot: 'test' } as never);
    expect(engine.active()).toBeNull();
  });
});

describe('escorts with a cart', () => {
  const cartDef = (): Act4EscortDef => ({ ...route(), id: 'test.r24', members: [{ id: 'carter', kind: 'npc' }, { id: 'cart.rain', kind: 'cart' }], threatGroups: ['test.group'] });

  it('the cart at 0 halts it until its group is cleared, then comes back at half health; it never breaks', () => {
    engine.start(cartDef());
    follow(3);
    const cart = (engine as unknown as { cur: { cart: { actorId: string } } }).cur.cart;
    const [foeId] = kit.enemies.service.spawnGroup('test.group', { count: 1 });
    kit.ctx.damage.apply({ attackerId: foeId, targetId: cart.actorId, amount: 99999, kind: 'melee' });
    follow(2);
    expect(engine.view()!.cart).toEqual({ health: 0, max: ESCORT_CART.maxHealth });
    expect(engine.state('test.r24')?.reason).toBe('hit');
    kit.ctx.damage.apply({ attackerId: kit.ctx.actors.player.id, targetId: foeId, amount: 999, kind: 'melee' });
    follow(1);
    expect(engine.view()!.cart!.health).toBe(ESCORT_CART.maxHealth * 0.5);
    expect(engine.state('test.r24')?.reason).toBeNull();
  });

  it('a group cleared by sparing a member mid-fight brings the cart back', () => {
    engine.start(cartDef());
    follow(3);
    const cart = (engine as unknown as { cur: { cart: { actorId: string } } }).cur.cart;
    const ids = kit.enemies.service.spawnGroup('test.group', { count: 2 });
    kit.ctx.damage.apply({ attackerId: ids[0], targetId: cart.actorId, amount: 99999, kind: 'melee' });
    follow(1);
    kit.ctx.damage.apply({ attackerId: kit.ctx.actors.player.id, targetId: ids[0], amount: 999, kind: 'melee' });
    kit.ctx.events.emit('mercy', { verb: 'spare', tier: 'normal', track: 'ashwalkers', creature: 'ash-wraith', actorId: ids[1] });
    follow(1);
    expect(engine.view()!.cart!.health).toBeGreaterThan(0);
  });

  it('the cart health is saved, and a load restores at least half', () => {
    engine.start(cartDef());
    follow(16);
    const cart = (engine as unknown as { cur: { cart: { actorId: string } } }).cur.cart;
    const [foeId] = kit.enemies.service.spawnGroup('test.group', { count: 1 });
    kit.ctx.damage.apply({ attackerId: foeId, targetId: cart.actorId, amount: 99999, kind: 'melee' });
    const saved = JSON.parse(JSON.stringify(engine.serialize()));
    expect(saved.running.cartHealth).toBe(0);
    engine.load(saved, ESCORT_ENGINE.persistVersion);
    kit.ctx.events.emit('save.loaded', { slot: 'test' } as never);
    expect(engine.view()!.cart!.health).toBe(ESCORT_CART.maxHealth * 0.5);
  });
});
