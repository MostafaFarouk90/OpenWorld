import type * as THREE from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { FIXED_TIMESTEP } from '../../config/constants';
import { EnemyManager } from '../EnemyManager';
import type { AnchorLike } from '../ports';
import { SpawnerRegistry, type SpawnRequest } from '../spawners';
import { FakeHost, loadKnight } from '../testing/fakeHost';
import type { SpawnerDef } from '../types';
import { CUTPURSE_MOVES } from './def';
import { CUTPURSE, theftAmount } from './tuning';

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

// ---- the registry on its own --------------------------------------------------------------------

const anchor = (id: string, x: number, z: number): AnchorLike => ({ id, position: { x, y: 0, z }, yaw: 0 });

function registry(defs: SpawnerDef[]) {
  const anchors = [anchor('a', 0, 0), anchor('b', 5, 0)];
  const reqs: SpawnRequest[] = [];
  let n = 0;
  const reg = new SpawnerRegistry({
    anchors: { find: (id) => anchors.find((x) => x.id === id), withTag: () => [] },
    warn: vi.fn(),
    spawn: (r) => {
      reqs.push(r);
      return `e${++n}`;
    },
    despawn: () => {},
    rng: () => 0.5,
  });
  defs.forEach((d) => reg.define(d));
  return { reg, reqs };
}

const thieves = (over: Partial<SpawnerDef> = {}): SpawnerDef => ({
  id: 't', enemy: 'alley-cutpurse', count: 3, anchor: 'a', memberAnchors: ['a', 'b', 'a'], band: { min: 1, max: 1 },
  activation: 'manual', respawn: 'never', ...over,
});

describe('the registry and an escaped thief', () => {
  it('frees the slot without spending it, does not clear the group, and refills only that slot after the wait', () => {
    const { reg, reqs } = registry([thieves()]);
    const [a, b, c] = reg.spawnGroup('t');
    expect(reg.onMemberGone(b!, 'escaped')).toBe(false);
    expect(reg.isSpent('t#1')).toBe(false);
    expect(reg.alive('t')).toEqual([a, c]);
    expect(reg.pendingRefillSlots('t')).toEqual([1]);
    expect(reg.tickRefills(CUTPURSE.refillSeconds - 1)).toEqual([]);
    const refilled = reg.tickRefills(2);
    expect(refilled).toHaveLength(1);
    expect(reqs.at(-1)).toMatchObject({ spawnerId: 't', slot: 1, anchorId: 'b', spentKey: 't#1' });
    expect(reg.alive('t')).toHaveLength(3);
    expect(reg.pendingRefillSlots('t')).toEqual([]);
  });

  it('groupCleared: an escape never completes the group; the refilled thief does when it dies', () => {
    const { reg } = registry([thieves({ count: 2, memberAnchors: ['a', 'b'] })]);
    const [a, b] = reg.spawnGroup('t');
    expect(reg.onMemberGone(a!, 'died')).toBe(false);
    // The other one escapes: still not cleared, even though no member is alive.
    expect(reg.onMemberGone(b!, 'escaped')).toBe(false);
    expect(reg.alive('t')).toEqual([]);
    expect(reg.isCleared('t')).toBe(false);
    const [again] = reg.tickRefills(CUTPURSE.refillSeconds + 0.1);
    expect(again).toBeDefined();
    expect(reg.onMemberGone(again!, 'died')).toBe(true); // now every slot is dead: cleared once
    expect(reg.isCleared('t')).toBe(true);
  });

  it('a refill never replaces a slot that was killed, spared or spent', () => {
    const { reg } = registry([thieves({ count: 2, memberAnchors: ['a', 'b'] })]);
    const [a, b] = reg.spawnGroup('t');
    reg.onMemberGone(b!, 'escaped');
    reg.onMemberGone(a!, 'spared');
    expect(reg.isSpent('t#0')).toBe(true);
    reg.tickRefills(CUTPURSE.refillSeconds + 1);
    expect(reg.alive('t')).toHaveLength(1); // only the escaped slot came back
  });

  it('waits while the player can see the anchor, then refills', () => {
    const { reg } = registry([thieves({ count: 1, memberAnchors: ['a'] })]);
    const [a] = reg.spawnGroup('t');
    reg.onMemberGone(a!, 'escaped');
    expect(reg.tickRefills(CUTPURSE.refillSeconds + 5, () => true)).toEqual([]);
    expect(reg.pendingRefillSlots('t')).toEqual([0]);
    expect(reg.tickRefills(0.1, () => false)).toHaveLength(1);
  });

  it('despawnGroup, reset and load drop pending refills (the group is no longer live)', () => {
    for (const end of ['despawnGroup', 'reset', 'load'] as const) {
      const { reg } = registry([thieves({ count: 1, memberAnchors: ['a'] })]);
      const [a] = reg.spawnGroup('t');
      reg.onMemberGone(a!, 'escaped');
      if (end === 'load') reg.load({ spent: [], cleared: [], warmthTier: 0, lockedBlockLevels: {} });
      else reg[end]('t');
      expect(reg.pendingRefillSlots('t'), end).toEqual([]);
      expect(reg.tickRefills(CUTPURSE.refillSeconds + 1), end).toEqual([]);
    }
  });

  it('a group that was never spawned does not queue a refill', () => {
    const { reg } = registry([thieves({ count: 1, memberAnchors: ['a'] })]);
    reg.spawnGroup('t');
    reg.despawnGroup('t');
    expect(reg.pendingRefillSlots('t')).toEqual([]);
  });

  it('only thief kinds escape: another kind reported as escaped is a plain despawn (slot freed, nothing queued)', () => {
    const { reg } = registry([{ ...thieves(), id: 'w', enemy: 'ash-wraith', count: 1, memberAnchors: ['a'] }]);
    const [a] = reg.spawnGroup('w');
    expect(reg.onMemberGone(a!, 'escaped')).toBe(false);
    expect(reg.pendingRefillSlots('w')).toEqual([]);
    expect(reg.isSpent('w#0')).toBe(false);
  });

  it('a plain despawn still queues nothing', () => {
    const { reg } = registry([thieves({ count: 1, memberAnchors: ['a'] })]);
    const [a] = reg.spawnGroup('t');
    expect(reg.onMemberGone(a!, 'despawned')).toBe(false);
    expect(reg.pendingRefillSlots('t')).toEqual([]);
  });
});

// ---- end to end through the manager -------------------------------------------------------------

function rig(count: number, gold = 1000) {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: -1 } });
  fake.defineAnchor('thief.1', 0, 0);
  fake.defineAnchor('thief.2', 0, 40);
  fake.flags.set('enemies.mercy.spare', true);
  const inv = fake.provideInventory(gold);
  const def: SpawnerDef = {
    id: 'm07.thieves', tag: 'm07.thieves', enemy: 'alley-cutpurse', count, anchor: 'thief.1',
    memberAnchors: ['thief.1', 'thief.2'].slice(0, count), band: { min: 1, max: 1 },
    activation: 'manual', respawn: 'never', leash: false,
  };
  const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: [def], seed: 7 });
  const tick = (seconds = DT) => {
    for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) {
      m.think(DT);
      m.animate(DT);
      fake.combatStep(DT);
      m.react(DT);
    }
  };
  return { fake, inv, m, tick };
}

describe('an escape through the manager', () => {
  it('grab, flee 12 s, despawn, refill out of sight, then both kills clear the group', () => {
    const t = rig(2);
    const ids = t.m.service.spawnGroup('m07.thieves', { moves: [CUTPURSE_MOVES.grab] });
    expect(ids).toHaveLength(2);
    const [first, second] = ids as [string, string];
    t.fake.movePlayer(0, 36); // beside the second thief
    // The first thief is far from the player; make the second one rob instead by starting beside it.
    t.m.get(first)!.alert('player');
    t.m.get(second)!.alert('player');
    let robbed = false;
    for (let i = 0; i < 20 / DT && !robbed; i++) {
      t.tick();
      robbed = t.fake.bus.of('enemies.cutpurse.robbed').length > 0;
    }
    expect(robbed).toBe(true);
    // Whoever robbed the player now flees; the player walks away so it escapes unseen.
    const thief = [first, second].find((id) => t.m.get(id)?.thief?.stolenGold)!;
    (t.m.get(thief)!.thief as unknown as { smokeUsed: boolean }).smokeUsed = true;
    t.fake.movePlayer(0, 200);
    for (let i = 0; i < (CUTPURSE.fleeSeconds + 1) / DT && t.m.get(thief); i++) t.tick();
    expect(t.m.get(thief)).toBeUndefined();
    expect(t.fake.bus.of('enemies.groupCleared')).toEqual([]);
    expect(t.m.service.alive('m07.thieves')).toHaveLength(1);
    // The player stays far away: the slot refills after the wait.
    t.tick(CUTPURSE.refillSeconds + 1);
    const alive = t.m.service.alive('m07.thieves');
    expect(alive).toHaveLength(2);
    expect(alive).not.toContain(thief);
    // Kill both: the group clears exactly once, after the second death.
    const deaths: string[] = [];
    t.fake.bus.on('actor.died', (e) => deaths.push(e.actorId));
    for (const id of alive) {
      expect(t.fake.bus.of('enemies.groupCleared')).toEqual([]);
      t.fake.apply({ attackerId: 'player', targetId: id, amount: 9999, poise: 0, kind: 'script' });
      t.tick(5);
    }
    expect(deaths).toHaveLength(2);
    expect(t.fake.bus.of('enemies.groupCleared')).toEqual([{ spawnerId: 'm07.thieves' }]);
  });
});

describe('the grab at different purses', () => {
  const cases: Array<[number, number]> = [
    [0, 0],
    [5, 1],
    [500, 40],
  ];
  it.each(cases)('gold %i: takes %i, and exports grabShare and grabMax', (gold, taken) => {
    expect(CUTPURSE.grabShare).toBe(0.1);
    expect(CUTPURSE.grabMax).toBe(40);
    expect(theftAmount(gold)).toBe(taken);
    const t = rig(1, gold);
    t.m.service.spawnGroup('m07.thieves', { aggro: true, moves: [CUTPURSE_MOVES.grab, CUTPURSE_MOVES.slash] });
    t.tick(8);
    expect(t.inv.spent.reduce((s, x) => s + x.amount, 0)).toBe(taken === 0 ? 0 : taken);
    expect(t.fake.bus.of('enemies.cutpurse.robbed')).toEqual(taken > 0 ? [{ actorId: expect.any(String), amount: taken }] : []);
  });
});

describe('a load while a thief holds a pouch', () => {
  it('removes the thief without paying out, so killing it afterwards cannot duplicate gold', () => {
    const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: -3 } });
    fake.defineAnchor('t', 0, 0);
    const inv = fake.provideInventory(100);
    const m = new EnemyManager(fake.host, FakeHost.factory(gltf), {
      seed: 3,
      spawners: [{ id: 'thieves', enemy: 'alley-cutpurse', count: 1, anchor: 't', band: { min: 1, max: 1 }, activation: 'manual', respawn: 'never', leash: false }],
    });
    const tick = (secs = DT) => {
      for (let i = 0; i < Math.max(1, Math.round(secs / DT)); i++) {
        m.think(DT);
        m.animate(DT);
        fake.combatStep(DT);
        m.react(DT);
      }
    };
    const [id] = m.service.spawnGroup('thieves', { aggro: true, leash: false });
    tick(0.2);
    const saved = m.spawners.serialize();
    m.get(id!)!.thief!.grabHit();
    expect(inv.gold).toBe(90);
    inv.gold = 100; // the loaded inventory
    m.spawners.load(saved);
    fake.bus.emit('save.loaded', {} as never);
    tick(0.1);
    expect(m.get(id!)).toBeUndefined(); // gone, not fleeing with the old pouch
    fake.host.damage.kill?.(id!, 'player');
    tick(0.5);
    expect(inv.gold).toBe(100);
    expect(m.spawners.isCleared('thieves')).toBe(false);
  });
});
