import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActorRegistry } from '../../actors/ActorRegistry';
import { DamageResolver, type DamageResult } from '../../actors/DamageResolver';
import { playerInit } from '../../actors/teams';
import { FIXED_TIMESTEP } from '../../config/constants';
import { GameEvents } from '../../core/events';
import { EnemyManager } from '../../enemies/EnemyManager';
import { mercyInteractableId } from '../../enemies/mercy';
import { FakeHost, FakeStatus, loadKnight } from '../../enemies/testing/fakeHost';
import { AI } from '../../enemies/tuning';
import type { SpawnerDef } from '../../enemies/types';
import { StatusEngine } from '../../status/StatusEngine';
import { StealthEffects } from '../../stealth/hooks';
import { FireWall, SmokeScreen, type FireWallPorts, type SmokeScreenPorts } from './tier3';
import { FIRE_WALL, IGNITE, SMOKE_SCREEN } from './tuning';

const DT = FIXED_TIMESTEP;
let gltf: Awaited<ReturnType<typeof loadKnight>>;
beforeAll(async () => {
  gltf = await loadKnight();
});
beforeEach(() => void vi.spyOn(console, 'warn').mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

const group = (id: string): SpawnerDef => ({
  id, enemy: 'blighted-soldier', count: 1, anchor: 'a', band: { min: 1, max: 1 }, activation: 'manual', respawn: 'never', leash: false,
});

describe('Fire Wall against a real EnemyManager keeps Spare open', () => {
  function rig() {
    const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: 4 } });
    fake.defineAnchor('a', 0, 0);
    fake.status = new FakeStatus();
    const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: [group('s')], seed: 11 });
    m.service.setMercyUnlocked('spare', true);
    const wall = new FireWall({
      isEmberwright: () => true,
      learned: () => true,
      canAct: () => true,
      playerId: () => 'player',
      feet: () => fake.playerFeet,
      facingYaw: () => 0, // forward is -z: the wall stands on the foe at the origin
      actors: () => ({ get: (i: string) => fake.actorMap.get(i) as never, all: () => fake.actorMap.values() as never, player: fake.player as never }),
      apply: (req) => fake.apply(req as never) as never,
      ignite: (id, spec) => (fake.status as FakeStatus).apply(id, spec as never),
    } as FireWallPorts);
    const tick = (seconds: number) => {
      for (let i = 0; i < Math.round(seconds / DT); i++) {
        wall.update(DT);
        m.think(DT);
        m.animate(DT);
        fake.combatStep(DT);
        m.react(DT);
        m.render(1);
      }
    };
    const revoked: unknown[] = [];
    fake.bus.on('mercy.revoked', (e) => void revoked.push(e));
    const hits: Array<{ targetId: string; attackId?: string }> = [];
    fake.bus.on('damage.dealt', (r) => void (r.attackId === FIRE_WALL.attackId && hits.push(r)));
    return { fake, m, wall, tick, revoked, hits };
  }

  it('a foe burned by the wall that reaches a poise break at low health opens Spare, is not hit while it kneels, and nothing is revoked', () => {
    const t = rig();
    const [id] = t.m.service.spawnGroup('s');
    t.tick(0.1);
    expect(t.wall.cast()).toEqual({ ok: true });
    t.tick(1.1);
    expect(t.hits.length).toBeGreaterThanOrEqual(1);
    expect((t.fake.status as FakeStatus).calls.every((c) => c.spec.id === FIRE_WALL.igniteId)).toBe(true);
    const actor = t.fake.actorMap.get(id!)!;
    actor.health = actor.maxHealth * 0.4;
    t.fake.stagger(id!, 'player');
    t.tick(AI.breakStaggerSeconds + 0.3);
    expect(t.m.get(id!)!.state).toBe('yield');
    const hold = t.fake.interactables.get(mercyInteractableId(t.m.get(id!)!.slug))!;
    expect(hold.enabled!()).toBe(true);
    const before = t.hits.length;
    t.tick(0.4);
    expect(t.hits.length).toBe(before); // a kneeling foe is in a mercy state: the wall skips it
    hold.onInteract(t.fake.player);
    expect(t.fake.bus.of('mercy')).toEqual([expect.objectContaining({ verb: 'spare', actorId: id })]);
    expect(t.revoked).toEqual([]);
  });
});

describe('Fire Wall ignite and Flame Lash ignite on the real StatusEngine', () => {
  it('coexist as two entries, each refreshing on its own', () => {
    const events = new GameEvents(() => {});
    const actors = new ActorRegistry(events);
    const dr = new DamageResolver(actors, events, () => {});
    actors.spawn(playerInit());
    const foe = actors.spawn({ kind: 'blighted-soldier', team: 'hostile', maxHealth: 500, maxPoise: 20 });
    const engine = new StatusEngine({ actor: (id) => actors.get(id) ?? undefined, tick: (req) => dr.apply(req) !== null, applied: () => {}, expired: () => {}, view: () => {} });
    const lash = () => engine.apply(foe.id, { id: IGNITE.id, kind: 'ignite', dps: IGNITE.dps, seconds: IGNITE.seconds, sourceId: 'player' });
    const wall = () => engine.apply(foe.id, { id: FIRE_WALL.igniteId, kind: 'ignite', dps: FIRE_WALL.igniteDps, seconds: FIRE_WALL.igniteSeconds, sourceId: 'player' });
    const remaining = (id: string) => engine.list(foe.id).find((e) => e.id === id)?.remaining;
    lash();
    engine.update(2);
    wall();
    expect(engine.list(foe.id).filter((e) => e.kind === 'ignite').map((e) => e.id).sort()).toEqual([FIRE_WALL.igniteId, IGNITE.id].sort());
    expect(remaining(IGNITE.id)).toBeCloseTo(1);
    expect(remaining(FIRE_WALL.igniteId)).toBeCloseTo(3);
    engine.update(0.9);
    wall(); // the wall's next tick refreshes only its own entry
    expect(remaining(FIRE_WALL.igniteId)).toBeCloseTo(3);
    expect(remaining(IGNITE.id)).toBeCloseTo(0.1);
    lash();
    expect(remaining(IGNITE.id)).toBeCloseTo(3);
    expect(engine.list(foe.id)).toHaveLength(2);
    const dealt: DamageResult[] = [];
    events.on('damage.dealt', (r: DamageResult) => void dealt.push(r));
    engine.update(1);
    expect(dealt.filter((r) => r.kind === 'status').length).toBeGreaterThanOrEqual(2);
  });
});

describe('Smoke Screen against a real aggroed Enemy', () => {
  function world(smoke: boolean) {
    // The foe stands at the origin, leashed and already chasing; the player is 8 m south, outside a cloud that covers the foe.
    const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: -8 } });
    const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { seed: 3, spawners: [] });
    const fx = new StealthEffects();
    const NONE = { sightRangeScale: 1, coneScale: 1, hearingQuietScale: 1, hearingLoudScale: 1 };
    m.service.perception.register({ modifiers: () => ({ ...NONE, blockSight: [...fx.blockers()] }) });
    const sm = new SmokeScreen({
      isEmberwright: () => true, learned: () => true, canAct: () => true, playerId: () => 'player',
      feet: () => fake.playerFeet, facingYaw: () => Math.PI, // forward is +z: the cloud centre is at z = -2
      actors: () => ({}) as never, apply: () => null,
      stealth: () => fx, perception: () => m.service.perception, warn: () => {},
    } as unknown as SmokeScreenPorts);
    const id = m.spawnLoose('blighted-soldier', { x: 0, y: 0, z: 0 }, { leash: true, aggro: true })!;
    const tick = (seconds: number) => {
      for (let i = 0; i < Math.round(seconds / DT); i++) {
        sm.update(DT);
        fx.tick(DT);
        m.think(DT);
        m.animate(DT);
        fake.combatStep(DT);
        m.react(DT);
      }
    };
    if (smoke) expect(sm.cast()).toEqual({ ok: true });
    return { fake, m, id, tick, sm };
  }
  const fighting = (s: string) => s !== 'idle' && s !== 'return' && s !== 'patrol';

  it('with no cloud the foe sees the player at 8 m; inside the cloud it sees nothing beyond 3 m, so sees is false', () => {
    const open = world(false);
    open.tick(1);
    expect(open.m.service.perception.state(open.id)!.sees).toBe(true);
    const cloud = world(true);
    cloud.tick(1);
    expect(SMOKE_SCREEN.sightRange).toBe(3);
    expect(cloud.m.service.perception.state(cloud.id)!.sees).toBe(false);
  });

  it('what blind does to a foe already fighting: its sight drops to 3 m but it keeps its aggro (AI.lostSightSeconds applies only once it has been unseen that long) and keeps closing in', () => {
    const t = world(true);
    t.tick(0.5);
    expect(t.m.service.perception.state(t.id)!.sees).toBe(false);
    expect(fighting(t.m.get(t.id)!.state)).toBe(true);
    t.tick(AI.lostSightSeconds - 1.5);
    expect(t.sm.active).toBe(true);
    expect(fighting(t.m.get(t.id)!.state)).toBe(true);
    // It walks out of the cloud toward the player (an aggroed foe heads for the target, seen or not) and sees again.
    const out = world(true);
    out.tick(3);
    const z = out.fake.actorMap.get(out.id)!.root!.position.z;
    expect(z).toBeLessThan(-2);
    out.tick(SMOKE_SCREEN.seconds);
    expect(out.sm.active).toBe(false);
  });
});
