// The Waste creatures in the enemy stack (plans/act4-L5.md sections 2 to 4): the strider's range, trip and Rain Flask Calm,
// the Husk Knight's ember, Release and one rise, and the gnats' scatter. A fake host runs the real EnemyManager with the
// waste plugin's damage rules registered on it.
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP } from '../../config/constants';
import { ENEMY_DEFS, TELEGRAPH_STYLE } from '../defs';
import { EnemyManager } from '../EnemyManager';
import { mercyInteractableId } from '../mercy';
import { FakeHost, loadKnight } from '../testing/fakeHost';
import type { SpawnerDef, SpawnOptions } from '../types';
import './overlays';
import { registerWasteRules } from './rules';
import { HUSK_KNIGHT, STRIDER } from './tuning';
import { WASTE_STRIDER } from './strider/def';
import { HUSK_KNIGHT_DEF } from './huskKnight/def';
import { CINDER_GNAT_SWARM } from './gnats/def';
import { StriderBody } from './strider/StriderBody';
import { SwarmBody } from './gnats/SwarmBody';
import { striderView } from './strider/overlay';
import { huskKnightView, huskRiseLethal } from './huskKnight/overlay';
import { scattersGnats } from './gnats/overlay';

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

function rig(kind: 'waste-strider' | 'husk-knight' | 'cinder-gnat-swarm', o: { items?: Record<string, number>; playerZ?: number; count?: number } = {}) {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: o.playerZ ?? -20 } });
  fake.defineAnchor('a', 0, 0);
  fake.flags.set('enemies.mercy.calm', true);
  fake.flags.set('enemies.mercy.release', true);
  fake.provideItems(o.items ?? { 'rain-flask': 2 });
  let clock = 0;
  registerWasteRules({ addModifier: (id, fn, order) => fake.host.damage.addModifier(id, fn, order), now: () => clock });
  const def: SpawnerDef = { id: 'g', enemy: kind, count: o.count ?? 1, anchor: 'a', band: { min: 1, max: 1 }, activation: 'manual', respawn: 'never', leash: false };
  const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: [def], seed: 5 });
  const tick = (seconds = DT, until?: () => boolean): boolean => {
    for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) {
      clock += DT;
      m.think(DT);
      m.animate(DT);
      fake.combatStep(DT);
      m.react(DT);
      if (until?.()) return true;
    }
    return false;
  };
  const spawn = (opts: SpawnOptions = { aggro: true }) => m.service.spawnGroup('g', opts).map((id) => ({ id, enemy: m.get(id)! }));
  const hold = (id: string) => fake.interactables.get(mercyInteractableId(m.get(id)!.slug))!;
  const hit = (id: string, extra: Record<string, unknown> = {}) =>
    fake.apply({ attackerId: 'player', targetId: id, amount: 1, poise: 1, kind: 'melee', ...extra } as never);
  const mercies = () => fake.bus.log.filter((e) => e.type === 'mercy.granted' || e.type === 'enemies.mercy');
  return { fake, m, tick, spawn, hold, hit, mercies };
}

describe('Waste defs', () => {
  it('registers the three kinds with telegraph styles and the ids L8 wired sounds to', () => {
    expect(ENEMY_DEFS['waste-strider']).toBe(WASTE_STRIDER);
    expect(ENEMY_DEFS['husk-knight']).toBe(HUSK_KNIGHT_DEF);
    expect(ENEMY_DEFS['cinder-gnat-swarm']).toBe(CINDER_GNAT_SWARM);
    for (const k of ['waste-strider', 'husk-knight', 'cinder-gnat-swarm'] as const) expect(TELEGRAPH_STYLE[k]).toBeDefined();
    expect(WASTE_STRIDER.moves.map((x) => x.id)).toContain('strider.lunge');
    expect(HUSK_KNIGHT_DEF.moves.map((x) => x.id)).toEqual(expect.arrayContaining(['huskknight.raise', 'huskknight.rush']));
    expect(CINDER_GNAT_SWARM.moves.map((x) => x.id)).toEqual(['gnats.sting']);
  });
  it('carries the design numbers: 0.6 s draw-backs, poise 40 and 90, 0.7 s raises, a 0.8 s contract, the mercies', () => {
    for (const mv of WASTE_STRIDER.moves) expect(mv.windup).toBe(0.6);
    expect(WASTE_STRIDER.maxPoise).toBe(40);
    expect(WASTE_STRIDER.mercy).toMatchObject({ verb: 'calm', track: 'ashwalkers', tier: 'normal', precondition: 'grounded', offerings: [{ itemId: 'rain-flask', count: 1 }] });
    expect(HUSK_KNIGHT_DEF.maxPoise).toBe(90);
    expect(HUSK_KNIGHT_DEF.model.scale).toBe(1.1);
    for (const id of ['huskknight.raise', 'huskknight.rush']) expect(HUSK_KNIGHT_DEF.moves.find((x) => x.id === id)!.windup).toBe(0.7);
    expect(HUSK_KNIGHT_DEF.mercy).toMatchObject({ verb: 'release', tier: 'elite', track: 'ashwalkers' });
    expect(CINDER_GNAT_SWARM.moves[0]!.windup).toBe(0.8);
    expect(CINDER_GNAT_SWARM.maxPoise).toBe(0);
    expect(CINDER_GNAT_SWARM.mercy).toBeUndefined();
  });
});

describe('Waste Strider', () => {
  it('spawns on the strider body and keeps its target between 4 and 9 m', () => {
    const t = rig('waste-strider', { playerZ: -20 });
    const [{ id, enemy }] = t.spawn();
    expect(enemy.body).toBeInstanceOf(StriderBody);
    t.tick(8, () => striderView(id)?.range === 'hold');
    expect(striderView(id)!.range).toBe('hold');
    const d = enemy.feet.distanceTo(t.fake.playerFeet);
    expect(d).toBeGreaterThanOrEqual(STRIDER.nearRange - 0.5);
    expect(d).toBeLessThanOrEqual(STRIDER.farRange + 0.5);
    // Walk in close: it backs off.
    t.fake.movePlayer(enemy.feet.x, enemy.feet.z - 1.5);
    t.tick(0.2);
    expect(striderView(id)!.range).toBe('back');
  });

  it('a bolt on a shin trips it at once: the leg folds, it lies 4 s, and Calm with a Rain Flask works (Ashwalkers, one flask)', () => {
    const t = rig('waste-strider');
    const [{ id, enemy }] = t.spawn();
    t.tick(0.5);
    t.hit(id, { bone: 'leg.fr', attackId: 'pathfinder.bolt.1' });
    t.tick(0.1);
    expect(enemy.state).toBe('stagger');
    expect(striderView(id)!.tripped).toBe('fr');
    expect((enemy.body as unknown as StriderBody).tripLeg).toBe('fr');
    expect(enemy.mercyOpen).toBe(true);
    expect(enemy.calmContext()).toMatchObject({ grounded: true });
    const h = t.hold(id);
    expect(h.enabled!()).toBe(true);
    h.onInteract(t.fake.player);
    expect(enemy.state).toBe('calmed');
    expect(t.fake.inventory!.removed).toEqual([{ itemId: 'rain-flask', count: 1 }]);
    // It walks to the water, drinks, then walks off and is gone.
    t.tick(1);
    expect(t.m.get(id)).toBeDefined();
    t.tick(STRIDER.waterSeconds + STRIDER.drinkSeconds + STRIDER.walkOffSeconds + 1);
    expect(t.m.get(id)).toBeUndefined();
  });

  it('tripped again while its poise is still broken: a bolt on a leg folds it at once and Calm is offered (review fix)', () => {
    const t = rig('waste-strider');
    const [{ id, enemy }] = t.spawn();
    t.tick(0.5);
    t.hit(id, { bone: 'leg.fr', attackId: 'pathfinder.bolt.1' });
    t.tick(STRIDER.tripSeconds + 0.3);
    expect(striderView(id)!.tripped).toBeNull();
    // In the game its poise stays broken while the hits keep coming (it regains it only after a pause); set that here.
    t.fake.actorMap.get(id)!.poise = 0;
    t.hit(id, { bone: 'leg.bl', attackId: 'pathfinder.bolt.2' });
    t.tick(0.1);
    expect(enemy.state).toBe('stagger');
    expect(striderView(id)!.tripped).toBe('bl');
    expect(enemy.mercyOpen).toBe(true);
    expect(t.hold(id).enabled!()).toBe(true);
  });

  it('one light cut on a leg does not trip it; a second on the same leg inside 4 s does; two on different legs do not', () => {
    const t = rig('waste-strider');
    const [{ id, enemy }] = t.spawn();
    t.tick(0.5);
    t.hit(id, { bone: 'leg.fl' });
    t.tick(0.1);
    expect(enemy.state).not.toBe('stagger');
    t.hit(id, { bone: 'leg.bl' });
    t.tick(0.1);
    expect(enemy.state).not.toBe('stagger');
    t.hit(id, { bone: 'leg.fl' });
    t.tick(0.1);
    expect(enemy.state).toBe('stagger');
    expect(striderView(id)!.tripped).toBe('fl');
    // The trip ends with the stagger.
    t.tick(STRIDER.tripSeconds + 0.5);
    expect(striderView(id)!.tripped).toBeNull();
  });

  it('two light cuts on one leg more than 4 s apart do not trip it; a heavy blow on the hull does nothing special', () => {
    const t = rig('waste-strider');
    const [{ id, enemy }] = t.spawn();
    t.tick(0.5);
    t.hit(id, { bone: 'leg.br' });
    t.tick(STRIDER.lightHitWindow + 0.5);
    t.hit(id, { bone: 'leg.br' });
    t.tick(0.1);
    expect(enemy.state).not.toBe('stagger');
    t.hit(id, { bone: 'body', attackId: '1H_Melee_Attack_Chop', poise: 10 });
    t.tick(0.1);
    expect(enemy.state).not.toBe('stagger');
  });

  it('engaged and standing, no Calm prompt; without a flask, no Calm prompt even tripped', () => {
    const t = rig('waste-strider', { items: {} });
    const [{ id }] = t.spawn();
    t.tick(1);
    expect(t.hold(id).enabled!()).toBe(false);
    t.hit(id, { bone: 'leg.fl', kind: 'spell' });
    t.tick(0.1);
    expect(t.hold(id).enabled!()).toBe(false);
  });

  it('unaware (not yet fighting), Calm with a flask works', () => {
    const t = rig('waste-strider', { playerZ: -60 });
    const [{ id, enemy }] = t.spawn({});
    t.tick(1);
    expect(enemy.calmContext()).toMatchObject({ grounded: true });
    t.fake.movePlayer(0, -3);
    const h = t.hold(id);
    expect(h.enabled!()).toBe(true);
    h.onInteract(t.fake.player);
    expect(enemy.state).toBe('calmed');
  });

  it('struck while it walks off, the calm is revoked and it fights again', () => {
    const t = rig('waste-strider');
    const [{ id, enemy }] = t.spawn();
    t.tick(0.5);
    t.hit(id, { bone: 'leg.fl', kind: 'spell' });
    t.tick(0.1);
    t.hold(id).onInteract(t.fake.player);
    t.tick(0.5);
    // The core revokes the credit on a strike and says so.
    t.fake.bus.emit('mercy.revoked', { actorId: id, track: 'ashwalkers', removed: 1 });
    t.tick(0.5);
    expect(enemy.state).not.toBe('calmed');
    expect(striderView(id)!.drinking).toBe(false);
  });

  it('its body plants its feet as it walks (no foot slides while down)', () => {
    const t = rig('waste-strider', { playerZ: -40 });
    const [{ enemy }] = t.spawn();
    const body = enemy.body as unknown as StriderBody;
    let maxSlide = 0;
    for (let i = 0; i < 240; i++) {
      const before = { ...body.gait.foot('fl') };
      const at = { ...before.at };
      t.tick(DT);
      const now = body.gait.foot('fl');
      if (before.planted && now.planted) maxSlide = Math.max(maxSlide, Math.hypot(now.at.x - at.x, now.at.z - at.z));
    }
    expect(maxSlide).toBeLessThan(1e-6);
  });
});

describe('Husk Knight', () => {
  const raiseUntil = (t: ReturnType<typeof rig>, id: string, moveId: string) =>
    t.tick(12, () => t.m.get(id)!.state === 'telegraph' && huskKnightView(id)!.exposed && (t.m.get(id) as unknown as { brain: { currentMove?: { id: string } } }).brain.currentMove?.id === moveId);

  it('the chest breaks its poise only while the ember glows; then Release costs 10 Burn and it never rises', () => {
    const t = rig('husk-knight', { playerZ: -1.6 });
    const [{ id, enemy }] = t.spawn({});
    t.tick(0.3);
    expect(huskKnightView(id)!.exposed).toBe(false);
    // A chest hit while the ember is dark: plain poise only (and it provokes the fight).
    t.hit(id, { bone: 'torso', poise: 5 });
    t.tick(0.05);
    expect(enemy.state).not.toBe('stagger');
    expect(t.tick(12, () => huskKnightView(id)!.exposed)).toBe(true);
    t.hit(id, { bone: 'torso', poise: 5 });
    t.tick(0.05);
    expect(enemy.state).toBe('stagger');
    expect(enemy.mercyOpen).toBe(true);
    const h = t.hold(id);
    expect(h.enabled!()).toBe(true);
    h.onInteract(t.fake.player);
    t.tick(3);
    expect(t.m.get(id)).toBeUndefined();
    expect(huskKnightView(id)).toBeNull();
    void raiseUntil;
  });

  it('killed unreleased it lies in its heap (no death, Release offered), rises at half health, and the second death is final', () => {
    const t = rig('husk-knight');
    const [{ id, enemy }] = t.spawn();
    t.tick(0.3);
    const actor = t.fake.actorMap.get(id)!;
    const r = t.hit(id, { amount: actor.maxHealth * 2, bone: 'head' });
    expect(r!.killed).toBe(false);
    expect(actor.health).toBe(1);
    expect(t.fake.bus.log.some((e) => e.type === 'actor.died')).toBe(false);
    t.tick(0.1);
    expect(huskKnightView(id)!.heaped).toBe(true);
    expect(enemy.mercyOpen).toBe(true);
    // Nothing kills it in the heap.
    t.hit(id, { amount: 999 });
    expect(actor.health).toBe(1);
    t.tick(HUSK_KNIGHT.heapSeconds + 0.2);
    expect(huskKnightView(id)!.heaped).toBe(false);
    expect(huskKnightView(id)!.rises).toBe(1);
    expect(actor.health).toBe(Math.round(actor.maxHealth * HUSK_KNIGHT.riseHealth));
    const r2 = t.hit(id, { amount: actor.maxHealth * 2 });
    expect(r2!.killed).toBe(true);
    t.tick(0.1);
    expect(t.fake.bus.log.filter((e) => e.type === 'actor.died')).toHaveLength(1);
  });

  it('released from its heap, it is gone and never rises', () => {
    const t = rig('husk-knight');
    const [{ id }] = t.spawn();
    t.tick(0.3);
    const actor = t.fake.actorMap.get(id)!;
    t.hit(id, { amount: actor.maxHealth * 2 });
    t.tick(0.2);
    t.hold(id).onInteract(t.fake.player);
    t.tick(HUSK_KNIGHT.heapSeconds + 2);
    expect(t.m.get(id)).toBeUndefined();
    expect(t.fake.bus.log.some((e) => e.type === 'actor.died')).toBe(false);
  });

  it('a heavy poise hit in the heap neither cuts its stun short nor closes Release (review fix)', () => {
    const t = rig('husk-knight');
    const [{ id, enemy }] = t.spawn();
    t.tick(0.3);
    const actor = t.fake.actorMap.get(id)!;
    t.hit(id, { amount: actor.maxHealth * 2 });
    t.tick(0.5);
    t.hit(id, { amount: 10, poise: 999 });
    t.tick(2.7);
    expect(huskKnightView(id)!.heaped).toBe(true);
    expect(enemy.state).toBe('stagger');
    expect(enemy.mercyOpen).toBe(true);
  });

  it('a raw kill (damage.kill skips the modifiers) lays it in its heap through the lethal handler; once risen it dies', () => {
    const t = rig('husk-knight');
    const [{ id }] = t.spawn();
    t.tick(0.3);
    const actor = t.fake.actorMap.get(id)!;
    const target = { id, health: 0, maxHealth: actor.maxHealth };
    expect(huskRiseLethal(target)).toBe(true);
    expect(target.health).toBe(1);
    t.tick(0.1);
    expect(huskKnightView(id)!.heaped).toBe(true);
    // In the heap a raw kill is refused too.
    target.health = 0;
    expect(huskRiseLethal(target)).toBe(true);
    t.tick(HUSK_KNIGHT.heapSeconds + 0.2);
    target.health = 0;
    expect(huskRiseLethal(target)).toBe(false);
    expect(huskRiseLethal({ id: 'nobody', health: 0, maxHealth: 10 })).toBe(false);
  });

  it('a burn tick that would kill it also lays it in the heap', () => {
    const t = rig('husk-knight');
    const [{ id }] = t.spawn();
    t.tick(0.3);
    const actor = t.fake.actorMap.get(id)!;
    actor.health = 2;
    t.fake.apply({ attackerId: null, targetId: id, amount: 5, poise: 0, kind: 'status' } as never);
    expect(actor.health).toBe(1);
    t.tick(0.1);
    expect(huskKnightView(id)!.heaped).toBe(true);
  });
});

describe('Cinder Gnat swarm', () => {
  it('spawns as a points cloud with no poise and no mercy prompt', () => {
    const t = rig('cinder-gnat-swarm');
    const [{ id, enemy }] = t.spawn();
    expect(enemy.body).toBeInstanceOf(SwarmBody);
    expect((enemy.body as unknown as SwarmBody).pointCount).toBe(140);
    expect(t.fake.interactables.has(mercyInteractableId(enemy.slug))).toBe(false);
    t.hit(id, { poise: 500 });
    t.tick(0.1);
    expect(enemy.state).not.toBe('stagger');
  });

  it('an area skill, a spell or any fire scatters it at once; a sword cut only hurts it', () => {
    for (const extra of [{ attackId: 'warden.whirlingHew' }, { kind: 'spell', attackId: 'emberwright.bolt' }, { element: 'fire' }, { attackId: 'pathfinder.bolt.1.blast' }]) {
      const t = rig('cinder-gnat-swarm');
      const [{ id }] = t.spawn();
      t.tick(0.2);
      expect(t.hit(id, { amount: 1, ...extra })!.killed, JSON.stringify(extra)).toBe(true);
    }
    const t = rig('cinder-gnat-swarm');
    const [{ id }] = t.spawn();
    t.tick(0.2);
    const r = t.hit(id, { amount: 5, attackId: '1H_Melee_Attack_Slice_Diagonal' });
    expect(r!.killed).toBe(false);
    expect(t.fake.actorMap.get(id)!.health).toBeGreaterThan(0);
  });

  it('its sting contracts the cloud, then sets the player burning', () => {
    const t = rig('cinder-gnat-swarm', { playerZ: -1 });
    const [{ id, enemy }] = t.spawn();
    const body = enemy.body as unknown as SwarmBody;
    expect(t.tick(10, () => enemy.state === 'telegraph')).toBe(true);
    t.tick(0.6);
    expect(body.radiusNow).toBeLessThan(1.2);
    t.tick(1.5);
    const status = t.fake.host.services.get('status') as unknown as { calls?: Array<{ spec: { kind: string } }> } | undefined;
    const burned = (status?.calls ?? []).some((c) => c.spec.kind === 'ignite') || t.fake.bus.log.some((e) => e.type === 'damage.dealt' && (e.payload as { targetId: string; attackerId: string }).targetId === 'player' && (e.payload as { attackerId: string }).attackerId === id);
    expect(burned).toBe(true);
  });

  it('the scatter rule: status burns count as fire; other status ticks and script hits do not', () => {
    expect(scattersGnats({ kind: 'status', statusKind: 'ignite' })).toBe(true);
    expect(scattersGnats({ kind: 'status', statusKind: 'bleed' })).toBe(false);
    expect(scattersGnats({ kind: 'script', element: 'fire' })).toBe(false);
    expect(scattersGnats({ kind: 'melee', attackId: 'torch.swing' })).toBe(true);
    expect(scattersGnats({ kind: 'melee', outcome: 'blocked', element: 'fire' })).toBe(false);
  });
});
