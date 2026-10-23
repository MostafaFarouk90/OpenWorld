import { describe, expect, it } from 'vitest';
import { layoutInterior, standsIn } from '../../interiors/layout';
import { NavGrid } from '../../nav/NavGrid';
import { findPath } from '../../nav/pathfind';
import { heightAt } from '../../terrain/heightfield';
import { DEEPDELVE_ARENA, DEEPDELVE_ARENA_CENTRE, DEEPDELVE_ARENA_GATE, DEEPDELVE_ARENA_RIM, DEEPDELVE_DEF, DEEPDELVE_STRINGS_EN } from './deepdelve';
import { MINE_IDS, MINE_LOCAL_BOUNDS } from './kit';

const layout = layoutInterior(DEEPDELVE_DEF, heightAt);
const at = (id: string) => {
  const a = layout.anchors.find((x) => x.id === id);
  if (!a) throw new Error(`no anchor ${id}`);
  return a;
};
const reach = (from: string, to: string, g: NavGrid) => {
  const p = findPath(g, at(from).position, at(to).position, 0.4);
  const end = p[p.length - 1];
  return !!end && Math.hypot(end.x - at(to).position.x, end.z - at(to).position.z) < 0.6;
};
const open = () => new NavGrid(layout.nav);
const closed = () => {
  const g = new NavGrid(layout.nav);
  g.setBlocker(DEEPDELVE_ARENA_GATE, true);
  return g;
};
const LIFT = 'oldsmoke.deepdelve.lift';
const ARENA_INSIDE = [
  'deepdelve.slagmaw.arena.centre', 'deepdelve.slagmaw.valve.1', 'deepdelve.slagmaw.valve.2', 'deepdelve.slagmaw.valve.3',
];

describe('Deepdelve', () => {
  it('defines every anchor, trigger and blocker the plan lists', () => {
    const ids = DEEPDELVE_DEF.anchors.map((a) => a.id);
    const want = [
      LIFT, `${LIFT}.up`, `${LIFT}.call`, 'npc-post.slagg.deepdelve', 'deepdelve.slagmaw.arena.door', 'deepdelve.slagmaw.arena.centre',
      'deepdelve.slagmaw.arena.gate',
      ...[1, 2].flatMap((n) => [`oldsmoke.deepdelve.stage.${n}`, `oldsmoke.deepdelve.valve.room.${n}`, `oldsmoke.deepdelve.pool.${n}`]),
      ...[1, 2, 3].flatMap((n) => [`oldsmoke.deepdelve.spawn.${n}`, `deepdelve.slagmaw.valve.${n}`]),
    ];
    for (const id of want) expect(ids, id).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(DEEPDELVE_DEF.triggers.map((t) => t.id).sort()).toEqual(['trg.deepdelve.slagmaw.arena', 'trg.deepdelve.stage.1', 'trg.deepdelve.stage.2']);
    for (const n of [1, 2]) expect(DEEPDELVE_DEF.triggers.find((t) => t.id === `trg.deepdelve.stage.${n}`)!.half).toEqual({ x: 3, y: 2.5, z: 3 });
    expect(DEEPDELVE_DEF.blockers.map((b) => b.id)).toEqual([DEEPDELVE_ARENA_GATE]);
    expect(DEEPDELVE_DEF.id).toBe(MINE_IDS.deepdelve);
    expect(Object.keys(DEEPDELVE_STRINGS_EN)).toEqual([`interior.enter.${MINE_IDS.deepdelve}`, `interior.exit.${MINE_IDS.deepdelve}`]);
  });

  it('stays inside the Deepdelve bounds (x to 220)', () => {
    for (const r of DEEPDELVE_DEF.rooms) {
      expect(r.x0).toBeGreaterThanOrEqual(MINE_LOCAL_BOUNDS.x0);
      expect(r.x1).toBeLessThanOrEqual(MINE_LOCAL_BOUNDS.deepdelveX1);
      expect(r.z0).toBeGreaterThanOrEqual(MINE_LOCAL_BOUNDS.z0);
      expect(r.z1).toBeLessThanOrEqual(MINE_LOCAL_BOUNDS.z1);
    }
  });

  it('puts every anchor on walkable floor, and every trigger centre over a room', () => {
    const g = open();
    for (const a of layout.anchors) {
      const i = g.cellIndex(a.position.x, a.position.z);
      expect(g.isWalkable(i), a.id).toBe(true);
      expect(g.clearance(i), a.id).toBeGreaterThanOrEqual(0.4);
      expect(standsIn(layout, a.position), a.id).toBe(true);
    }
    for (const t of layout.triggers) expect(g.isWalkable(g.cellIndex(t.center.x, t.center.z)), t.id).toBe(true);
  });

  it('reaches every anchor from the landing with the gate open', () => {
    const g = open();
    for (const a of layout.anchors) if (a.id !== LIFT) expect(reach(LIFT, a.id, g), a.id).toBe(true);
  });

  it('with the gate closed, the arena interior is reachable only through the gate', () => {
    const g = closed();
    for (const a of layout.anchors) {
      if (a.id === LIFT || a.id === 'deepdelve.slagmaw.arena.gate') continue;
      const inArena = ARENA_INSIDE.includes(a.id);
      expect(reach(LIFT, a.id, g), a.id).toBe(!inArena);
    }
    // Opening it again restores the way in.
    g.setBlocker(DEEPDELVE_ARENA_GATE, false);
    expect(reach(LIFT, 'deepdelve.slagmaw.arena.centre', g)).toBe(true);
  });

  it('keeps the arena valves 8 m or more from the centre, spread around, inside the rim', () => {
    const c = at('deepdelve.slagmaw.arena.centre').position;
    const angles = [1, 2, 3].map((n) => {
      const p = at(`deepdelve.slagmaw.valve.${n}`).position;
      expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeGreaterThanOrEqual(8);
      return Math.atan2(p.z - c.z, p.x - c.x);
    });
    const gaps = angles.map((x, i) => Math.abs(x - angles[(i + 1) % 3]!));
    for (const gap of gaps) expect(gap).toBeGreaterThan(0.8);
    expect(c.x - layout.origin.x).toBe(DEEPDELVE_ARENA_CENTRE.x);
  });

  it('builds a flat 30 x 30 m arena, clear except for low pools at the rim', () => {
    const room = DEEPDELVE_DEF.rooms.find((r) => r.id === 'arena')!;
    expect(room.x1 - room.x0).toBe(30);
    expect(room.z1 - room.z0).toBe(30);
    const inner = {
      x0: DEEPDELVE_ARENA.x0 + DEEPDELVE_ARENA_RIM,
      z0: DEEPDELVE_ARENA.z0 + DEEPDELVE_ARENA_RIM,
      x1: DEEPDELVE_ARENA.x1 - DEEPDELVE_ARENA_RIM,
      z1: DEEPDELVE_ARENA.z1 - DEEPDELVE_ARENA_RIM,
    };
    const hits = (r: { x0: number; z0: number; x1: number; z1: number }) => r.x0 < inner.x1 && r.x1 > inner.x0 && r.z0 < inner.z1 && r.z1 > inner.z0;
    for (const p of DEEPDELVE_DEF.pillars) expect(hits(p)).toBe(false);
    for (const p of DEEPDELVE_DEF.props ?? []) {
      if (p.id?.startsWith('lava.')) {
        expect(p.walkable, p.id).toBe(true);
        expect(p.height).toBeLessThanOrEqual(0.4);
      } else expect(hits(p.rect), p.id).toBe(false);
    }
    expect((DEEPDELVE_DEF.props ?? []).filter((p) => p.id?.startsWith('lava.')).length).toBeGreaterThan(0);
    const g = open();
    for (let x = inner.x0; x < inner.x1; x += 0.5) {
      for (let z = inner.z0; z < inner.z1; z += 0.5) {
        expect(g.isWalkable(g.cellIndex(layout.origin.x + x + 0.25, layout.origin.z + z + 0.25)), `${x},${z}`).toBe(true);
      }
    }
  });

  it('puts the arena door outside the entrance trigger and the gate between them', () => {
    const t = layout.triggers.find((x) => x.id === 'trg.deepdelve.slagmaw.arena')!;
    const d = at('deepdelve.slagmaw.arena.door').position;
    const gate = at('deepdelve.slagmaw.arena.gate').position;
    const dx = Math.max(0, Math.abs(d.x - t.center.x) - t.half.x);
    const dz = Math.max(0, Math.abs(d.z - t.center.z) - t.half.z);
    expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(3);
    expect(gate.x).toBeGreaterThan(d.x);
    expect(gate.x).toBeLessThan(t.center.x - t.half.x);
    // The trigger is inside the arena.
    expect(t.center.x - t.half.x).toBeGreaterThanOrEqual(layout.origin.x + DEEPDELVE_ARENA.x0);
  });

  it('keeps the three descent stages in series, stage 1 near the landing', () => {
    const x = (id: string) => at(id).position.x;
    expect(x('oldsmoke.deepdelve.stage.1')).toBeLessThan(x('oldsmoke.deepdelve.stage.2'));
    expect(x('oldsmoke.deepdelve.stage.2')).toBeLessThan(x('deepdelve.slagmaw.arena.door'));
    expect(x('oldsmoke.deepdelve.stage.1') - x(LIFT)).toBeLessThan(40);
  });
});
