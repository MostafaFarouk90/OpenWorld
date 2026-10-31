import * as THREE from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ActorRegistry } from '../../actors/ActorRegistry';
import { DamageResolver, type DamageRequest } from '../../actors/DamageResolver';
import { PULL_MAX_DROP, PlayerPull, type PullPorts } from '../../actors/pull';
import { playerInit } from '../../actors/teams';
import { FIXED_TIMESTEP as DT } from '../../config/constants';
import { GameEvents, type GameEventMap } from '../../core/events';
import { StatusEngine } from '../../status/StatusEngine';
import { EnemyManager } from '../EnemyManager';
import { HUNTER_HARPOONER, HUNTER_SPEARMAN } from '../hunters/def';
import type { EnemyHost, StatusPort } from '../ports';
import { FakeHost, loadKnight } from '../testing/fakeHost';
import type { MoveDef, SpawnerDef } from '../types';
import { areaHit } from './areaHit';
import { BellowsBlessing } from '../../shrine/bellowsBlessing';
import { BLESSING } from '../../shrine/weepingBellows.tuning';
import { SLAG_CRAWLER } from '../crawler/def';
import { CINDER_GOLEM } from '../golem/def';
import { ENEMY_DEFS } from '../defs';
import { EnemyProjectiles, type Shooter } from './EnemyProjectiles';
import { GroundAttacks } from './GroundAttacks';
import { AREA_HEIGHT_TOLERANCE, PROJECTILE_CAPACITY, RANGED_ATTACK_PREFIX } from './tuning';

const NET = HUNTER_SPEARMAN.moves.find((m) => m.id === 'hunter.net')!;
const HARPOON = HUNTER_HARPOONER.moves.find((m) => m.id === 'harpooner.harpoon')!;

type Physics = NonNullable<EnemyHost['physics']>;

/**
 * A rig on the REAL core pieces (ActorRegistry, DamageResolver, StatusEngine) so outcomes, unblockable handling and the
 * "pull only on a surviving hit" rule are the shipped ones. The player stands at z = -10; the shooter at the origin.
 */
function rig(opts: { heightAt?: (x: number, z: number) => number; wallZ?: number; playerHealth?: number } = {}) {
  const events = new GameEvents(() => {});
  const registry = new ActorRegistry(events);
  const dr = new DamageResolver(registry, events, () => {});
  const playerRoot = new THREE.Group();
  const feet = new THREE.Vector3(0, 0, -10);
  playerRoot.position.copy(feet);
  const player = registry.spawn({ ...playerInit(), root: playerRoot });
  if (opts.playerHealth !== undefined) player.health = opts.playerHealth;
  const shooterRoot = new THREE.Group();
  const shooterActor = registry.spawn({ kind: 'hunter-harpooner', team: 'hostile', maxHealth: 60, root: shooterRoot });
  const shooter: Shooter = { id: shooterActor.id, damageScale: 1, feet: { x: 0, y: 0, z: 0 }, yaw: 0 };

  const pulled: GameEventMap['actor.pulled'][] = [];
  events.on('actor.pulled', (e) => void pulled.push(e));

  const requests: DamageRequest[] = [];
  const applySpy = vi.fn((req: DamageRequest) => {
    requests.push(req);
    return dr.apply(req);
  });
  const statusCalls: Array<{ actorId: string; spec: Parameters<StatusPort['apply']>[1] }> = [];
  const engine = new StatusEngine({
    actor: (id) => registry.get(id),
    tick: () => true,
    applied: () => {},
    expired: () => {},
    view: () => {},
  });
  const status: StatusPort = {
    apply: (actorId, spec) => {
      statusCalls.push({ actorId, spec });
      return engine.apply(actorId, spec as never);
    },
    list: (id) => engine.list(id),
    clear: (id, only) => engine.clear(id, only),
  };

  const scene = new THREE.Scene();
  const raycast: Physics['raycast'] = ((origin: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, maxDist: number) => {
    if (opts.wallZ === undefined || dir.z === 0) return null;
    const t = (opts.wallZ - origin.z) / dir.z;
    return t >= 0 && t <= maxDist ? { point: { x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: opts.wallZ } } : null;
  }) as never;
  const host = {
    scene,
    physics: opts.wallZ !== undefined ? ({ raycast } as unknown as Physics) : null,
    actors: registry,
    damage: { apply: applySpy },
    services: { get: (name: string) => (name === 'status' ? status : undefined) },
    player: { feet, collider: null, actor: player },
    heightAt: opts.heightAt ?? (() => 0),
    warn: () => {},
  } as unknown as EnemyHost;

  const resolver = dr;
  const run = (ep: { update(dt: number): void }, seconds: number) => {
    for (let t = 0; t < seconds; t += DT) ep.update(DT);
  };
  const meshCount = () => scene.children.filter((c) => (c as THREE.Mesh).isMesh).length;
  return { events, registry, resolver, player, shooter, shooterActor, host, scene, pulled, requests, applySpy, statusCalls, engine, run, meshCount, feet };
}

describe('EnemyProjectiles: flight', () => {
  it('a net bolt flies to the player and sends one melee request carrying the move id', () => {
    const t = rig();
    const ep = new EnemyProjectiles(t.host);
    expect(ep.fire(t.shooter, NET, t.feet)).toBe(true);
    expect(ep.liveCount).toBe(1);
    expect(t.meshCount()).toBe(1);
    t.run(ep, 2);
    expect(t.requests).toHaveLength(1);
    expect(t.requests[0]).toMatchObject({
      attackerId: t.shooter.id,
      targetId: 'player',
      kind: 'melee',
      attackId: RANGED_ATTACK_PREFIX + 'hunter.net',
      amount: NET.damage,
    });
    expect(ep.liveCount).toBe(0);
    expect(t.meshCount()).toBe(0);
  });

  it('a move without `ranged` fires nothing', () => {
    const t = rig();
    const ep = new EnemyProjectiles(t.host);
    expect(ep.fire(t.shooter, HUNTER_SPEARMAN.moves[0]!, t.feet)).toBe(false);
    expect(ep.liveCount).toBe(0);
  });

  it('stops at a wall between shooter and player and applies nothing', () => {
    const t = rig({ wallZ: -5 });
    const ep = new EnemyProjectiles(t.host);
    ep.fire(t.shooter, NET, t.feet);
    t.run(ep, 2);
    expect(t.requests).toHaveLength(0);
    expect(t.statusCalls).toHaveLength(0);
    expect(ep.liveCount).toBe(0);
    expect(t.meshCount()).toBe(0);
  });

  it('stops at rising terrain between shooter and player and applies nothing', () => {
    const t = rig({ heightAt: (_x, z) => (z < -5 ? 6 : 0) });
    const ep = new EnemyProjectiles(t.host);
    ep.fire(t.shooter, NET, t.feet);
    t.run(ep, 2);
    expect(t.requests).toHaveLength(0);
    expect(ep.liveCount).toBe(0);
    expect(t.meshCount()).toBe(0);
  });

  it('expires at max range without a hit when the player is out of reach', () => {
    const t = rig();
    const ep = new EnemyProjectiles(t.host);
    ep.fire(t.shooter, NET, { x: 0, y: 0, z: 40 });
    t.run(ep, (NET.ranged!.maxRange / NET.ranged!.speed) + 0.5);
    expect(t.requests).toHaveLength(0);
    expect(ep.liveCount).toBe(0);
    expect(t.meshCount()).toBe(0);
  });
});

describe('EnemyProjectiles: pool and lifetime', () => {
  const away = { x: 0, y: 0, z: 30 };

  it('recycles slots: firing more than the capacity never exceeds it, and clear leaves nothing behind', () => {
    const t = rig();
    const ep = new EnemyProjectiles(t.host);
    const before = t.scene.children.length;
    for (let i = 0; i < PROJECTILE_CAPACITY + 10; i++) expect(ep.fire(t.shooter, NET, away)).toBe(true);
    expect(ep.liveCount).toBe(PROJECTILE_CAPACITY);
    expect(t.meshCount()).toBe(PROJECTILE_CAPACITY);
    ep.clear();
    expect(ep.liveCount).toBe(0);
    expect(t.meshCount()).toBe(0);
    expect(t.scene.children.length).toBe(before);
    // The pool is whole again.
    for (let i = 0; i < PROJECTILE_CAPACITY; i++) ep.fire(t.shooter, NET, away);
    expect(ep.liveCount).toBe(PROJECTILE_CAPACITY);
    ep.clear();
    expect(t.requests).toHaveLength(0);
  });

  it('the evicted oldest bolt vanishes silently (no request, no mesh leak)', () => {
    const t = rig();
    const ep = new EnemyProjectiles(t.host, 2);
    ep.fire(t.shooter, NET, t.feet);
    ep.fire(t.shooter, NET, away);
    ep.fire(t.shooter, NET, away); // evicts the first (the one aimed at the player)
    expect(ep.liveCount).toBe(2);
    expect(t.meshCount()).toBe(2);
    t.run(ep, 0.5);
    expect(t.requests).toHaveLength(0);
  });

  it('cancelFor drops only that shooter\'s bolts and they never hit', () => {
    const t = rig();
    const other = t.registry.spawn({ kind: 'hunter-spearman', team: 'hostile', maxHealth: 70, root: new THREE.Group() });
    const ep = new EnemyProjectiles(t.host);
    ep.fire(t.shooter, NET, t.feet);
    ep.fire(t.shooter, NET, t.feet);
    ep.fire({ ...t.shooter, id: other.id }, NET, t.feet);
    expect(ep.liveCount).toBe(3);
    ep.cancelFor(t.shooter.id);
    expect(t.meshCount()).toBe(1);
    t.run(ep, 2);
    expect(t.requests).toHaveLength(1);
    expect(t.requests[0]!.attackerId).toBe(other.id);
  });

  it('GroundAttacks.shooterGone cancels the dead shooter\'s bolts in flight', () => {
    const t = rig();
    const ga = new GroundAttacks(t.host);
    ga.windowOpened(t.shooter, NET);
    expect(ga.projectiles.liveCount).toBe(1);
    ga.update(DT);
    ga.shooterGone(t.shooter.id);
    t.run(ga, 2);
    expect(t.requests).toHaveLength(0);
    expect(t.meshCount()).toBe(0);
  });

  it('GroundAttacks.clear (a load) removes every bolt without a hit', () => {
    const t = rig();
    const ga = new GroundAttacks(t.host);
    ga.windowOpened(t.shooter, NET);
    ga.windowOpened(t.shooter, HARPOON);
    expect(ga.projectiles.liveCount).toBe(2);
    ga.clear();
    expect(ga.projectiles.liveCount).toBe(0);
    expect(t.meshCount()).toBe(0);
    t.run(ga, 2);
    expect(t.requests).toHaveLength(0);
    expect(t.statusCalls).toHaveLength(0);
  });

  it('a bolt that landed after its shooter was removed from the registry still resolves safely', () => {
    const t = rig();
    const ep = new EnemyProjectiles(t.host);
    ep.fire(t.shooter, NET, t.feet);
    t.registry.despawn(t.shooter.id);
    expect(() => t.run(ep, 2)).not.toThrow();
    expect(ep.liveCount).toBe(0);
    expect(t.meshCount()).toBe(0);
  });
});

describe('net: root applies only on a landed hit', () => {
  const fireAndRun = (t: ReturnType<typeof rig>) => {
    const ep = new EnemyProjectiles(t.host);
    ep.fire(t.shooter, NET, t.feet);
    t.run(ep, 2);
  };

  it('outcome hit: roots the player for the spec seconds, sourced from the shooter', () => {
    const t = rig();
    fireAndRun(t);
    expect(NET.ranged!.root).toBe(2);
    expect(t.statusCalls).toEqual([{ actorId: 'player', spec: { id: 'hunter.net.root', kind: 'root', seconds: 2, sourceId: t.shooter.id } }]);
    expect(t.engine.has('player', 'root')).toBe(true);
  });

  it('net is blockable: a blocking modifier turns it into outcome blocked and no root lands', () => {
    const t = rig();
    expect(NET.telegraph).toBe('block');
    t.resolver.addModifier('test.block', (req) => void (req.outcome = 'blocked'));
    fireAndRun(t);
    expect(t.requests[0]!.unblockable).toBe(false);
    expect(t.statusCalls).toHaveLength(0);
    expect(t.engine.has('player', 'root')).toBe(false);
  });

  it('a parried net does not root', () => {
    const t = rig();
    t.resolver.addModifier('test.parry', (req) => void (req.outcome = 'parried'));
    fireAndRun(t);
    expect(t.statusCalls).toHaveLength(0);
  });

  it('an immune (dodging) player is not rooted', () => {
    const t = rig();
    t.player.invulnerable = true;
    fireAndRun(t);
    expect(t.requests).toHaveLength(1);
    expect(t.statusCalls).toHaveLength(0);
  });

  it('a refused request (null result) applies nothing', () => {
    const t = rig();
    t.player.hittable = false;
    fireAndRun(t);
    expect(t.statusCalls).toHaveLength(0);
  });

  it('a second net while rooted refreshes to the longest remaining time, not a sum', () => {
    const t = rig();
    fireAndRun(t);
    t.engine.update(1.5); // 0.5 s of the first root left
    const left = () => t.engine.list('player').find((e) => e.id === 'hunter.net.root')!.remaining;
    expect(left()).toBeCloseTo(0.5, 5);
    fireAndRun(t);
    expect(t.statusCalls).toHaveLength(2);
    expect(t.statusCalls[1]!.spec).toMatchObject({ id: 'hunter.net.root', kind: 'root', seconds: 2 });
    expect(left()).toBeCloseTo(2, 5);
    expect(t.engine.list('player').filter((e) => e.kind === 'root')).toHaveLength(1);
  });

  it('a second net never shortens a longer remaining root', () => {
    const t = rig();
    t.engine.apply('player', { id: 'hunter.net.root', kind: 'root', seconds: 5, sourceId: null });
    fireAndRun(t);
    expect(t.engine.list('player').find((e) => e.id === 'hunter.net.root')!.remaining).toBeCloseTo(5, 5);
  });

  it('without a status service the hit still lands and nothing throws', () => {
    const t = rig();
    (t.host.services as { get: unknown }).get = () => undefined;
    expect(() => fireAndRun(t)).not.toThrow();
    expect(t.requests).toHaveLength(1);
  });
});

describe('harpoon: unblockable and pull', () => {
  const fireAndRun = (t: ReturnType<typeof rig>) => {
    const ep = new EnemyProjectiles(t.host);
    ep.fire(t.shooter, HARPOON, t.feet);
    t.run(ep, 2);
  };

  it('the request is unblockable with pull distance 4 and no root', () => {
    const t = rig();
    expect(HARPOON.telegraph).toBe('dodge');
    expect(HARPOON.ranged!.pull).toBe(4);
    fireAndRun(t);
    expect(t.requests).toHaveLength(1);
    expect(t.requests[0]).toMatchObject({ unblockable: true, pull: { distance: 4 }, attackId: RANGED_ATTACK_PREFIX + 'harpooner.harpoon' });
    expect(t.statusCalls).toHaveLength(0);
  });

  it('the net request is blockable and carries no pull', () => {
    const t = rig();
    const ep = new EnemyProjectiles(t.host);
    ep.fire(t.shooter, NET, t.feet);
    t.run(ep, 2);
    expect(t.requests[0]!.unblockable).toBe(false);
    expect(t.requests[0]!.pull).toBeUndefined();
  });

  it('a block modifier cannot stop the harpoon (undone) and the resolver emits actor.pulled once', () => {
    const t = rig();
    t.resolver.addModifier('test.block', (req) => void (req.outcome = 'blocked'));
    fireAndRun(t);
    expect(t.pulled).toEqual([{ actorId: 'player', fromId: t.shooter.id, distance: 4 }]);
    expect(t.player.health).toBeLessThan(t.player.maxHealth);
  });

  it('a dodge (immune) harpoon does not pull', () => {
    const t = rig();
    t.player.invulnerable = true;
    fireAndRun(t);
    expect(t.requests).toHaveLength(1);
    expect(t.pulled).toEqual([]);
  });

  it('a KILLING harpoon hit does not pull', () => {
    const t = rig({ playerHealth: 1 });
    fireAndRun(t);
    expect(t.requests).toHaveLength(1);
    expect(t.player.dead).toBe(true);
    expect(t.pulled).toEqual([]);
  });

  it('a wall between shooter and player stops the bolt, so there is no hit and no pull', () => {
    const t = rig({ wallZ: -4 });
    fireAndRun(t);
    expect(t.requests).toHaveLength(0);
    expect(t.pulled).toEqual([]);
  });

  it('rising terrain between shooter and player stops the bolt, so there is no pull', () => {
    const t = rig({ heightAt: (_x, z) => (z < -6 ? 8 : 0) });
    fireAndRun(t);
    expect(t.requests).toHaveLength(0);
    expect(t.pulled).toEqual([]);
  });

  // The bolt itself flies over a pit (only ground ABOVE the bolt stops it), so a drop between them is guarded by the
  // pull mover, not by the projectile: the player's PlayerPull ends the pull at a ledge deeper than PULL_MAX_DROP.
  it('a drop between shooter and player does not stop the bolt; the pull mover stops at the ledge instead', () => {
    const ground = (_x: number, z: number) => (z > -7 && z < -3 ? -3 : 0);
    const t = rig({ heightAt: ground });
    fireAndRun(t);
    expect(t.pulled).toHaveLength(1);

    const pos = { x: 0, y: 0, z: -10 };
    const held: Array<{ x: number; z: number; speed: number } | null> = [];
    const ports: PullPorts = {
      playerId: () => 'player',
      invulnerable: () => false,
      playerFeet: () => pos,
      sourcePosition: () => ({ x: 0, z: 0 }),
      heightAt: ground,
      hold: (m) => void held.push(m),
    };
    const pull = new PlayerPull(ports, DT);
    pull.onPulled(t.pulled[0]!);
    expect(pull.pulling).toBe(true);
    for (let i = 0; i < 40 && pull.pulling; i++) {
      pull.fixedUpdate();
      const m = held[held.length - 1];
      if (m) pos.z += m.z * m.speed * DT;
    }
    expect(pull.pulling).toBe(false);
    expect(held[held.length - 1]).toBeNull();
    // It was stopped at the ledge edge (z about -7), well short of the 4 m request.
    expect(pos.z).toBeLessThan(-6);
    expect(pos.z).toBeGreaterThan(-10);
    expect(ground(0, 0) - -3).toBeGreaterThan(PULL_MAX_DROP);
  });

  it('a level path lets the pull run its whole course and stop 1 m short of the shooter', () => {
    const t = rig();
    fireAndRun(t);
    const pos = { x: 0, y: 0, z: -10 };
    const ports: PullPorts = {
      playerId: () => 'player',
      invulnerable: () => false,
      playerFeet: () => pos,
      sourcePosition: () => ({ x: 0, z: 0 }),
      heightAt: () => 0,
      hold: (m) => {
        if (m) pos.z += m.z * m.speed * DT;
      },
    };
    const pull = new PlayerPull(ports, DT);
    pull.onPulled(t.pulled[0]!);
    for (let i = 0; i < 60 && pull.pulling; i++) pull.fixedUpdate();
    expect(pos.z).toBeCloseTo(-6, 1);
  });
});

describe('areaHit', () => {
  const stomp: MoveDef = {
    id: 'test.stomp', clip: 'x', activeStart: 0.3, activeEnd: 0.6, windup: 0.5, telegraph: 'dodge', weapon: 'right',
    damage: 12, poise: 8, range: [0, 3], cooldown: 2, recover: 1, weight: 1,
    area: { centre: 'self', radius: 3 },
  };
  const at = (t: ReturnType<typeof rig>, x: number, y: number, z: number) => {
    t.feet.set(x, y, z);
    (t.player.root as THREE.Object3D).position.set(x, y, z);
  };

  it('hits a player inside the radius, once, with the move\'s damage and an unblockable melee request', () => {
    const t = rig();
    at(t, 2, 0, 1);
    expect(areaHit(t.host, t.shooter, stomp)).toBe(true);
    expect(t.requests).toHaveLength(1);
    expect(t.requests[0]).toMatchObject({ kind: 'melee', amount: 12, unblockable: true, targetId: 'player', attackId: RANGED_ATTACK_PREFIX + 'test.stomp' });
    expect(t.player.health).toBe(t.player.maxHealth - 12);
  });

  it('misses a player outside the radius', () => {
    const t = rig();
    at(t, 3.2, 0, 0);
    expect(areaHit(t.host, t.shooter, stomp)).toBe(false);
    expect(t.requests).toHaveLength(0);
  });

  it('counts the radius edge as inside', () => {
    const t = rig();
    at(t, 3, 0, 0);
    expect(areaHit(t.host, t.shooter, stomp)).toBe(true);
  });

  it('respects the height tolerance both ways', () => {
    const t = rig();
    at(t, 0, AREA_HEIGHT_TOLERANCE - 0.1, 1);
    expect(areaHit(t.host, t.shooter, stomp)).toBe(true);
    at(t, 0, AREA_HEIGHT_TOLERANCE + 0.1, 1);
    expect(areaHit(t.host, t.shooter, stomp)).toBe(false);
    at(t, 0, -(AREA_HEIGHT_TOLERANCE + 0.1), 1);
    expect(areaHit(t.host, t.shooter, stomp)).toBe(false);
    expect(t.requests).toHaveLength(1);
  });

  it('an offset centre is measured ahead of the shooter (yaw 0 faces -Z)', () => {
    const t = rig();
    const ahead: MoveDef = { ...stomp, area: { centre: 'front', offset: 4, radius: 1 } };
    at(t, 0, 0, -4);
    expect(areaHit(t.host, t.shooter, ahead)).toBe(true);
    at(t, 0, 0, 4);
    expect(areaHit(t.host, t.shooter, ahead)).toBe(false);
  });

  it('a dead player is not hit, and a move without `area` does nothing', () => {
    const t = rig();
    at(t, 0, 0, 1);
    expect(areaHit(t.host, t.shooter, NET)).toBe(false);
    t.player.health = 0;
    (t.player as unknown as { _dead: boolean })._dead = true;
    expect(areaHit(t.host, t.shooter, stomp)).toBe(false);
  });

  it('a dodging player (immune) takes the request but it is not a hit', () => {
    const t = rig();
    at(t, 0, 0, 1);
    t.player.invulnerable = true;
    expect(areaHit(t.host, t.shooter, stomp)).toBe(false);
    expect(t.player.health).toBe(t.player.maxHealth);
  });
});

describe('telegraph before the bolt', () => {
  let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
  beforeAll(async () => {
    gltf = await loadKnight();
  });

  it('emits the net telegraph first and fires only when the window opens, after its lead time', () => {
    const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: -8 } });
    fake.defineAnchor('a', 0, 0);
    fake.flags.set('enemies.mercy.spare', true);
    const spawner: SpawnerDef = { id: 'h', enemy: 'hunter-spearman', count: 1, anchor: 'a', band: { min: 1, max: 1 }, activation: 'manual', respawn: 'never', leash: false };
    const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: [spawner], seed: 5 });
    const live = () => (m as unknown as { attacks: GroundAttacks }).attacks.projectiles.liveCount;
    m.service.spawnGroup('h', { aggro: true, guard: false });
    let telegraphTick = -1;
    let fireTick = -1;
    let lead = 0;
    for (let i = 0; i < 60 * 8 && fireTick < 0; i++) {
      m.think(DT);
      m.animate(DT);
      fake.combatStep(DT);
      m.react(DT);
      const tg = fake.bus.of('telegraph').find((e) => e.moveId === 'hunter.net');
      if (tg && telegraphTick < 0) {
        telegraphTick = i;
        lead = tg.leadSeconds;
        expect(tg.kind).toBe('block');
        expect(live()).toBe(0);
      }
      if (live() > 0 && fireTick < 0) fireTick = i;
    }
    expect(telegraphTick).toBeGreaterThanOrEqual(0);
    expect(fireTick).toBeGreaterThan(telegraphTick);
    expect(lead).toBeGreaterThan(0);
    // The bolt leaves when the window opens: about `lead` seconds after the telegraph, give or take two ticks.
    expect(Math.abs((fireTick - telegraphTick) * DT - lead)).toBeLessThan(DT * 3);
  });
});

// Review B M2: the Bellows Blessing's fire resistance reaches real enemy hits. A fire move carries `element: 'fire'` into
// the request, and the real DamageResolver runs the real Blessing modifier at its order.
describe('fire hits and the Bellows Blessing (review-b M2)', () => {
  const blessed = (t: ReturnType<typeof rig>) => {
    const blessing = new BellowsBlessing({ emitApplied: () => {}, emitRemoved: () => {} });
    blessing.apply();
    t.resolver.addModifier('shrine.bellows-blessing', (req, target) => {
      if (target.id === t.player.id) blessing.modify(req);
    }, BLESSING.modifierOrder);
    return blessing;
  };
  const glob = SLAG_CRAWLER.moves.find((m) => m.id === 'crawler.spit')!;
  const stomp = CINDER_GOLEM.moves.find((m) => m.id === 'golem.stomp')!;

  it('the slag glob is a fire hit: tagged, and 15% lighter on a blessed player', () => {
    const t = rig();
    blessed(t);
    const ep = new EnemyProjectiles(t.host);
    expect(ep.fire(t.shooter, glob, t.feet)).toBe(true);
    t.run(ep, 2);
    expect(t.requests).toHaveLength(1);
    expect(t.requests[0].element).toBe('fire');
    expect(t.player.maxHealth - t.player.health).toBeCloseTo(glob.damage * BLESSING.fireMultiplier, 5);
  });

  it('without the Blessing the glob deals its full damage; a non-fire area hit is untouched by the Blessing', () => {
    const t = rig();
    const ep = new EnemyProjectiles(t.host);
    ep.fire(t.shooter, glob, t.feet);
    t.run(ep, 2);
    expect(t.player.maxHealth - t.player.health).toBeCloseTo(glob.damage, 5);
    const u = rig();
    blessed(u);
    u.feet.set(1, 0, 0);
    (u.player.root as THREE.Object3D).position.set(1, 0, 0);
    expect(areaHit(u.host, u.shooter, stomp)).toBe(true);
    expect(u.requests[0].element).toBeUndefined();
    expect(u.player.maxHealth - u.player.health).toBeCloseTo(stomp.damage, 5);
  });

  it('an area move tagged fire carries the tag', () => {
    const t = rig();
    blessed(t);
    t.feet.set(1, 0, 0);
    (t.player.root as THREE.Object3D).position.set(1, 0, 0);
    expect(areaHit(t.host, t.shooter, { ...stomp, element: 'fire' })).toBe(true);
    expect(t.requests[0].element).toBe('fire');
    expect(t.player.maxHealth - t.player.health).toBeCloseTo(stomp.damage * BLESSING.fireMultiplier, 5);
  });

  it('every enemy move that sets the target burning is itself tagged fire (so a new one is not missed)', () => {
    const burning = Object.values(ENEMY_DEFS).flatMap((d) => d.moves.filter((m) => m.onHit === 'ignite' || m.ranged?.ignite));
    expect(burning.map((m) => m.id).sort()).toEqual(['crawler.spit', 'drake.spit', 'hound.bite', 'wyrm.spit', 'wyrmling.puff']);
    for (const m of burning) expect(m.element, m.id).toBe('fire');
  });
});
