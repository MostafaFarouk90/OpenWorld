import { describe, expect, it, vi } from 'vitest';
import type { AnchorLike } from './ports';
import { SLICE_SPAWNERS } from './spawnerDefs';
import { SpawnRequest, SpawnerRegistry, patrolForSlot } from './spawners';
import { WORLD_AI } from './tuning';
import type { SpawnerDef } from './types';

function anchor(id: string, x: number, z: number, tags?: string[]): AnchorLike {
  return { id, position: { x, y: 2, z }, yaw: 1.5, tags };
}

function setup(anchors: AnchorLike[], defs: SpawnerDef[]) {
  const warn = vi.fn();
  const reqs: SpawnRequest[] = [];
  const despawned: string[] = [];
  let n = 0;
  const reg = new SpawnerRegistry({
    anchors: {
      find: (id) => anchors.find((a) => a.id === id),
      withTag: (t) => anchors.filter((a) => a.tags?.includes(t)),
    },
    warn,
    spawn: (r) => {
      reqs.push(r);
      return `a${++n}`;
    },
    despawn: (id) => despawned.push(id),
    rng: () => 0.5,
  });
  defs.forEach((d) => reg.define(d));
  return { reg, warn, reqs, despawned };
}

const mk = (over: Partial<SpawnerDef> = {}): SpawnerDef => ({
  id: 's', enemy: 'ash-wraith', count: 3, anchor: 'sp', band: { min: 1, max: 1 },
  activation: 'manual', respawn: 'never', ...over,
});

describe('SpawnerRegistry', () => {
  it('count 1 spawns at the anchor, more on a ring', () => {
    const { reg, reqs } = setup([anchor('sp', 10, 20)], [mk(), mk({ id: 'one', count: 1 })]);
    expect(reg.spawnGroup('one')).toHaveLength(1);
    expect(reqs[0]!.feet).toEqual({ x: 10, y: 2, z: 20 });
    expect(reg.spawnGroup('s')).toHaveLength(3);
    for (const r of reqs.slice(1)) {
      expect(Math.hypot(r.feet.x - 10, r.feet.z - 20)).toBeCloseTo(WORLD_AI.ringRadius);
      expect(r.yaw).toBe(1.5);
    }
    const pts = new Set(reqs.slice(1).map((r) => `${r.feet.x.toFixed(3)},${r.feet.z.toFixed(3)}`));
    expect(pts.size).toBe(3);
  });
  it('missing anchor warns once, spawns nothing, others unaffected', () => {
    const { reg, warn, reqs } = setup([anchor('ok', 0, 0)], [mk({ id: 'bad', anchor: 'gone' }), mk({ id: 'good', anchor: 'ok' })]);
    expect(reg.spawnGroup('bad')).toEqual([]);
    expect(reg.spawnGroup('bad')).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('gone');
    expect(reg.spawnGroup('good')).toHaveLength(3);
    expect(reqs.every((r) => r.spawnerId === 'good')).toBe(true);
  });
  it('unknown spawner warns and returns []; duplicate define throws', () => {
    const { reg, warn } = setup([], [mk()]);
    expect(reg.spawnGroup('nope')).toEqual([]);
    expect(warn).toHaveBeenCalled();
    expect(() => reg.define(mk())).toThrow();
  });
  it('spawning twice does not double; only fills empty slots', () => {
    const { reg } = setup([anchor('sp', 0, 0)], [mk()]);
    const first = reg.spawnGroup('s');
    expect(reg.spawnGroup('s')).toEqual([]);
    expect(reg.alive('s')).toEqual(first);
    reg.onMemberGone(first[0]!, 'died');
    expect(reg.spawnGroup('s')).toHaveLength(1);
    expect(reg.alive('s')).toHaveLength(3);
  });
  it('requests carry spawnTag (tag, else id) and leash resolution', () => {
    const { reg, reqs } = setup(
      [anchor('sp', 0, 0)],
      [mk({ id: 'a', count: 1, tag: 'spawn.x', leash: false }), mk({ id: 'b', count: 1 })],
    );
    reg.spawnGroup('a');
    reg.spawnGroup('b', { aggro: true });
    expect(reqs[0]!.spawnTag).toBe('spawn.x');
    expect(reqs[0]!.options.leash).toBe(false);
    expect(reqs[1]!.spawnTag).toBe('b');
    expect(reqs[1]!.options.leash).toBe(true);
    expect(reqs[1]!.options.aggro).toBe(true);
    expect(reqs[0]!.spentKey).toBe('a#0');
  });
  it('slice m01.lanes spawns five wraiths tagged m01, one per wraith anchor', () => {
    const anchors = [1, 2, 3, 4, 5].map((i) => anchor(`spawn.m01.wraith-${i}`, i * 10, -i));
    const { reg, reqs, warn } = setup(anchors, [...SLICE_SPAWNERS]);
    reg.onQuestStarted('m01');
    expect(reqs.length).toBe(5);
    expect(reqs.every((r) => r.spawnTag === 'm01')).toBe(true);
    expect(reqs.map((r) => [r.feet.x, r.feet.z])).toEqual(anchors.map((a) => [a.position.x, a.position.z]));
    expect(warn).not.toHaveBeenCalled();
  });
  it('a missing member anchor warns once and falls back to a ring slot around the main anchor', () => {
    const { reg, reqs, warn } = setup(
      [anchor('sp', 0, 0), anchor('m1', 20, 20)],
      [mk({ count: 2, memberAnchors: ['m1', 'gone'] })],
    );
    reg.spawnGroup('s');
    expect(reqs[0]!.feet).toEqual({ x: 20, y: 2, z: 20 });
    expect(Math.hypot(reqs[1]!.feet.x, reqs[1]!.feet.z)).toBeCloseTo(WORLD_AI.ringRadius);
    reg.despawnGroup('s');
    reg.spawnGroup('s');
    expect(warn.mock.calls.filter((c) => String(c[0]).includes("'gone'")).length).toBe(1);
  });
  it('level uses band, roll and tierOffset; unknown region warns once and uses default', () => {
    const { reg, reqs, warn } = setup(
      [anchor('sp', 0, 0)],
      [mk({ id: 'band', count: 1, band: { min: 2, max: 4 } }), mk({ id: 'reg', count: 1, band: 'nowhere' }), mk({ id: 'bw', count: 1, band: 'brightwater' })],
    );
    reg.spawnGroup('band');
    expect(reqs[0]!.level).toBe(3);
    reg.despawnGroup('band');
    reg.spawnGroup('band', { tierOffset: 10 });
    expect(reqs[1]!.level).toBe(13);
    reg.despawnGroup('band');
    reg.spawnGroup('band', { tierOffset: -50 });
    expect(reqs[2]!.level).toBe(1);
    reg.spawnGroup('reg');
    reg.despawnGroup('reg');
    reg.spawnGroup('reg');
    expect(reqs[3]!.level).toBe(1);
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('nowhere'))).toHaveLength(1);
    reg.spawnGroup('bw');
    expect(reqs[5]!.level).toBe(5);
  });
  it('patrol by tag and by ids; missing waypoint skipped with one warning', () => {
    const anchors = [anchor('sp', 0, 0), anchor('w1', 1, 1, ['t']), anchor('w2', 2, 2, ['t']), anchor('w3', 3, 3)];
    const { reg, reqs, warn } = setup(anchors, [
      mk({ id: 'tag', count: 1, patrol: { tag: 't' } }),
      mk({ id: 'ids', count: 1, patrol: ['w1', 'missing', 'w3'] }),
    ]);
    reg.spawnGroup('tag');
    expect(reqs[0]!.patrol.map((a) => a.id)).toEqual(['w1', 'w2']);
    reg.spawnGroup('ids');
    expect(reqs[1]!.patrol.map((a) => a.id)).toEqual(['w1', 'w3']);
    reg.despawnGroup('ids');
    reg.spawnGroup('ids');
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('missing'))).toHaveLength(1);
  });
  it('patrolForSlot starts each member on its own waypoint and rings the members past the count', () => {
    const pts = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }];
    expect(patrolForSlot(pts, 0)).toEqual(pts);
    expect(patrolForSlot(pts, 1)).toEqual([pts[1], pts[2], pts[0]]);
    const lapped = patrolForSlot(pts, 3);
    expect(Math.hypot(lapped[0]!.x - pts[0]!.x, lapped[0]!.z - pts[0]!.z)).toBeCloseTo(WORLD_AI.ringRadius);
    expect(patrolForSlot([], 2)).toEqual([]);
  });
  it('onRest respawns only dead members of onRest spawners, never spent', () => {
    const { reg } = setup([anchor('sp', 0, 0)], [mk({ id: 'r', respawn: 'onRest' }), mk({ id: 'n', respawn: 'never' })]);
    const r = reg.spawnGroup('r');
    const n = reg.spawnGroup('n');
    reg.onMemberGone(r[0]!, 'died');
    reg.onMemberGone(r[1]!, 'released');
    reg.onMemberGone(n[0]!, 'died');
    expect(reg.onRest()).toHaveLength(1);
    expect(reg.alive('r')).toHaveLength(2);
    expect(reg.alive('n')).toHaveLength(2);
    expect(reg.isSpent('r#1')).toBe(true);
  });
  it('onRest ignores spawners never spawned', () => {
    const { reg } = setup([anchor('sp', 0, 0)], [mk({ respawn: 'onRest' })]);
    expect(reg.onRest()).toEqual([]);
  });
  it('spent slots survive serialize/load', () => {
    const a = setup([anchor('sp', 0, 0)], [mk({ respawn: 'onRest' })]);
    const ids = a.reg.spawnGroup('s');
    a.reg.onMemberGone(ids[2]!, 'released');
    const data = JSON.parse(JSON.stringify(a.reg.serialize()));
    const b = setup([anchor('sp', 0, 0)], [mk({ respawn: 'onRest' })]);
    b.reg.load(data);
    expect(b.reg.spawnGroup('s')).toHaveLength(2);
    expect(b.reqs.map((r) => r.slot)).toEqual([0, 1]);
  });
  it('groupCleared returns true exactly once; despawn does not count', () => {
    const { reg, despawned } = setup([anchor('sp', 0, 0)], [mk(), mk({ id: 'd' })]);
    const ids = reg.spawnGroup('s');
    expect(reg.onMemberGone(ids[0]!, 'died')).toBe(false);
    expect(reg.onMemberGone(ids[1]!, 'spared')).toBe(false);
    expect(reg.onMemberGone(ids[2]!, 'released')).toBe(true);
    expect(reg.onMemberGone(ids[2]!, 'died')).toBe(false);
    expect(reg.isCleared('s')).toBe(true);
    const d = reg.spawnGroup('d');
    reg.despawnGroup('d');
    expect(despawned).toEqual(d);
    expect(reg.alive('d')).toEqual([]);
    expect(reg.isCleared('d')).toBe(false);
    const d2 = reg.spawnGroup('d');
    reg.onMemberGone(d2[0]!, 'despawned');
    reg.onMemberGone(d2[1]!, 'died');
    expect(reg.onMemberGone(d2[2]!, 'died')).toBe(false);
  });
  it('quest activation spawns, then not again once cleared (also after load)', () => {
    const q = mk({ id: 'q', activation: { quest: 'm01' } });
    const a = setup([anchor('sp', 0, 0)], [q]);
    expect(a.reg.onQuestStarted('other')).toEqual([]);
    const ids = a.reg.onQuestStarted('m01');
    expect(ids).toHaveLength(3);
    ids.forEach((id) => a.reg.onMemberGone(id, 'died'));
    expect(a.reg.onQuestStarted('m01')).toEqual([]);
    const b = setup([anchor('sp', 0, 0)], [q]);
    b.reg.load(a.reg.serialize());
    expect(b.reg.onQuestStarted('m01')).toEqual([]);
  });
  it('startAuto spawns only auto spawners', () => {
    const { reg } = setup([anchor('sp', 0, 0)], [mk({ id: 'a', activation: 'auto' }), mk({ id: 'm' })]);
    expect(reg.startAuto()).toHaveLength(3);
    expect(reg.alive('m')).toEqual([]);
  });
  it('corrupt persist data keeps defaults with a warning', () => {
    const { reg, warn } = setup([], []);
    reg.setWarmthTier(4);
    for (const bad of [null, 'x', 42, [1]]) reg.load(bad);
    expect(warn).toHaveBeenCalledTimes(4);
    expect(reg.serialize()).toEqual({ spent: [], cleared: [], warmthTier: 0, lockedBlockLevels: {} });
    reg.load({ spent: 'no', cleared: [1, 'q'], warmthTier: 'hot', lockedBlockLevels: { a: 'x', b: 99 } });
    expect(reg.serialize()).toEqual({ spent: [], cleared: ['q'], warmthTier: 0, lockedBlockLevels: { b: 40 } });
  });
  it('drops unknown spent entries', () => {
    const { reg } = setup([], []);
    reg.load({ spent: ['a#1', 'junk', 7], cleared: [], warmthTier: 1, lockedBlockLevels: {} });
    expect(reg.serialize().spent).toEqual(['a#1']);
  });
  it('warmthTier clamps 0..8 integer; non-finite ignored; lockBlockLevel', () => {
    const { reg, warn } = setup([], []);
    reg.setWarmthTier(99);
    expect(reg.getWarmthTier()).toBe(8);
    reg.setWarmthTier(-3);
    expect(reg.getWarmthTier()).toBe(0);
    reg.setWarmthTier(2.6);
    expect(reg.getWarmthTier()).toBe(3);
    reg.setWarmthTier(NaN);
    expect(reg.getWarmthTier()).toBe(3);
    expect(warn).toHaveBeenCalled();
    reg.load({ warmthTier: 50 });
    expect(reg.getWarmthTier()).toBe(8);
    reg.lockBlockLevel('b1', 22);
    reg.lockBlockLevel('b2', NaN);
    expect(reg.getLockedBlockLevel('b1')).toBe(22);
    expect(reg.getLockedBlockLevel('b2')).toBeUndefined();
  });
  it('slice table is well-formed', () => {
    expect(SLICE_SPAWNERS).toHaveLength(8);
    const bw = SLICE_SPAWNERS.find((s) => s.id === 'brightwater.north-patrol')!;
    expect(bw).toMatchObject({ count: 3, band: { min: 2, max: 3 }, activation: 'auto', respawn: 'onRest', leash: true });
    expect(new Set(SLICE_SPAWNERS.map((s) => s.id)).size).toBe(8);
    expect(SLICE_SPAWNERS.find((s) => s.id === 't09.soldier')!.enemy).toBe('blighted-soldier');
  });
});
