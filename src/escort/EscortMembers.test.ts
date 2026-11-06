// L4: escort members on a real core Game (real damage, ally engagement and the group-cleared helper), fake enemies with
// the shipped taunt registry.
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TauntRegistry } from '../enemies/taunts';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { makeKit, type Kit } from '../waves/testKit';
import { ESCORT_MEMBER, EscortMembers, placeholderEscortBody, type EscortMemberSpec } from './EscortMembers';
import type { EscortPose } from './EscortRun';

let physics: PhysicsWorld;
let kit: Kit;
let set: EscortMembers;
let taunts: TauntRegistry;

const spec = (id: string, role: 'walker' | 'fighter' = 'walker'): EscortMemberSpec => ({ id, role, makeBody: () => placeholderEscortBody() });
const poses = (n: number, z0 = 0): EscortPose[] => {
  const f = kit.ctx.player.feet;
  return Array.from({ length: n }, (_, i) => ({ x: f.x + 3, y: f.y, z: f.z + z0 + i * 1.6, yaw: 0 }));
};
const hostileAt = (dx: number, dz: number, maxHealth = 40) => {
  const root = new THREE.Group();
  const m = set.all[0].position;
  root.position.set(m.x + dx, m.y, m.z + dz);
  kit.ctx.scene.add(root);
  return kit.ctx.actors.spawn({ kind: 'blighted-soldier', team: 'hostile', maxHealth, maxPoise: 15, root });
};

beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  kit = await makeKit(physics, { withWaves: false, anchors: false });
  taunts = new TauntRegistry();
  (kit.enemies.service as unknown as { taunts: TauntRegistry }).taunts = taunts;
  set = new EscortMembers(kit.ctx);
  kit.ctx.systems.add({ id: 'test.escort', fixedPhase: 'rules', order: 10, fixedUpdate: (dt) => { taunts.update(dt); set.fixedUpdate(dt); } });
}, 30_000);
afterEach(() => {
  set.despawnAll();
  kit.teardown();
  vi.restoreAllMocks();
});

describe('escort members', () => {
  it('spawn as untargetable ally actors at their poses', () => {
    set.build([spec('edric'), spec('rook', 'fighter')], poses(2));
    expect(set.all).toHaveLength(2);
    for (const m of set.all) {
      expect(m.actor.team).toBe('ally');
      expect(m.actor.kind).toBe(ESCORT_MEMBER.kind);
      expect(m.state).toBe('up');
    }
    expect(set.all[1].position.z - set.all[0].position.z).toBeCloseTo(1.6);
  });

  it('a hostile hit kneels a member; lethal damage leaves 1 HP and kneels; nothing ever dies', () => {
    set.build([spec('edric'), spec('miner.1')], poses(2));
    const foe = hostileAt(30, 0);
    kit.ctx.damage.apply({ attackerId: foe.id, targetId: set.all[0].id, amount: 5, kind: 'melee' });
    expect(set.all[0].kneeling).toBe(true);
    expect(set.anyDown).toBe(true);
    for (let i = 0; i < 4; i++) {
      const r = kit.ctx.damage.apply({ attackerId: foe.id, targetId: set.all[1].id, amount: 9999, kind: 'melee' });
      expect(r?.killed).toBe(false);
      expect(set.all[1].actor.dead).toBe(false);
      expect(set.all[1].actor.health).toBe(1);
    }
    expect(set.all[1].kneeling).toBe(true);
    expect(kit.of('actor.died').filter((e) => e.kind === ESCORT_MEMBER.kind)).toEqual([]);
  });

  it('a hit from the player or an ally does not kneel a member', () => {
    set.build([spec('edric')], poses(1));
    kit.ctx.damage.apply({ attackerId: kit.ctx.actors.player.id, targetId: set.all[0].id, amount: 1, kind: 'melee' });
    expect(set.all[0].kneeling).toBe(false);
  });

  it('stays kneeling while a standing hostile is within 8 m, and rises at full health once it is killed', () => {
    set.build([spec('edric')], poses(1));
    const foe = hostileAt(5, 0);
    kit.ctx.damage.apply({ attackerId: foe.id, targetId: set.all[0].id, amount: 30, kind: 'melee' });
    kit.runSecs(3);
    expect(set.all[0].kneeling).toBe(true);
    kit.ctx.damage.apply({ attackerId: kit.ctx.actors.player.id, targetId: foe.id, amount: 999, kind: 'melee' });
    kit.runSecs(0.5);
    expect(set.all[0].kneeling).toBe(false);
    expect(set.all[0].actor.health).toBe(ESCORT_MEMBER.maxHealth);
  });

  it('a hostile beyond 8 m does not hold it down', () => {
    set.build([spec('edric')], poses(1));
    const foe = hostileAt(8.5, 0);
    kit.ctx.damage.apply({ attackerId: foe.id, targetId: set.all[0].id, amount: 5, kind: 'melee' });
    kit.runSecs(0.5);
    expect(set.all[0].kneeling).toBe(false);
  });

  it('a spared hostile still walking off counts as gone (mercy accepted); a revoked mercy stands again', () => {
    set.build([spec('edric')], poses(1));
    const foe = hostileAt(3, 0);
    kit.ctx.damage.apply({ attackerId: foe.id, targetId: set.all[0].id, amount: 5, kind: 'melee' });
    kit.runSecs(1);
    expect(set.all[0].kneeling).toBe(true);
    kit.ctx.events.emit('mercy', { verb: 'spare', tier: 'normal', track: 'halvard', creature: 'blighted-soldier', actorId: foe.id });
    kit.runSecs(0.5);
    expect(set.all[0].kneeling).toBe(false);
    // knocked down again by a second foe; the spared one does not hold it, the new one does
    const foe2 = hostileAt(2, 2);
    kit.ctx.damage.apply({ attackerId: foe2.id, targetId: set.all[0].id, amount: 5, kind: 'melee' });
    kit.runSecs(1);
    expect(set.all[0].kneeling).toBe(true);
  });

  it('standing members are taunters within 4 m; a kneeling one is not, and is again once it rises', () => {
    set.build([spec('edric'), spec('miner.1')], poses(2));
    kit.runSecs(0.1);
    const m0 = set.all[0].position;
    expect(taunts.pick({ x: m0.x + 3, z: m0.z })?.id).toBe(set.all[0].id);
    expect(taunts.pick({ x: m0.x + 10, z: m0.z })).toBeNull();
    const foe = hostileAt(6, 0); // near enough to hold the kneel, outside the taunt reach of the probe
    kit.ctx.damage.apply({ attackerId: foe.id, targetId: set.all[0].id, amount: 5, kind: 'melee' });
    kit.runSecs(0.5);
    expect(set.all[0].kneeling).toBe(true);
    // the kneeling lead is not picked any more: the nearest standing one (1.6 m behind) is
    expect(taunts.pick({ x: m0.x + 3, z: m0.z })?.id).toBe(set.all[1].id);
    kit.ctx.actors.despawn(foe.id);
    kit.runSecs(0.5);
    expect(set.all[0].kneeling).toBe(false);
    expect(taunts.pick({ x: m0.x + 3, z: m0.z - 1 })?.id).toBe(set.all[0].id);
  });

  it('a fighter swings only at a hostile it may engage, never the killing blow; a walker never swings', () => {
    set.build([spec('rook', 'fighter'), spec('edric')], poses(2));
    const foe = hostileAt(1.5, 0, 10);
    // not engaged with anyone yet: no swing
    kit.runSecs(1);
    expect(kit.of('damage.dealt').filter((d) => d.attackerId === set.all[0].id)).toEqual([]);
    // it goes for the player: now Rook may engage
    kit.ctx.events.emit('ai.aggro', { actorId: foe.id, targetId: kit.ctx.actors.player.id } as never);
    kit.runSecs(8);
    const swings = kit.of('damage.dealt').filter((d) => d.attackerId === set.all[0].id);
    expect(swings.length).toBeGreaterThan(0);
    expect(kit.ctx.actors.get(foe.id)?.dead).toBe(false);
    expect(kit.ctx.actors.get(foe.id)?.health).toBe(1);
    expect(kit.of('damage.dealt').filter((d) => d.attackerId === set.all[1].id)).toEqual([]);
  });

  it('despawnAll removes the actors, the handlers and the taunts', () => {
    set.build([spec('edric')], poses(1));
    const id = set.all[0].id;
    set.despawnAll();
    expect(kit.ctx.actors.get(id)).toBeUndefined();
    expect(taunts.size).toBe(0);
    set.despawnAll(); // twice is fine
  });
});
