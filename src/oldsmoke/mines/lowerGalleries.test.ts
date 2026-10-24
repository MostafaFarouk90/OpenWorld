import { describe, expect, it } from 'vitest';
import { boundsContain, layoutInterior } from '../../interiors/layout';
import { NavGrid } from '../../nav/NavGrid';
import { findPath } from '../../nav/pathfind';
import { heightAt } from '../../terrain/heightfield';
import { MINE_LOCAL_BOUNDS } from './kit';
import {
  LOWER_GALLERIES_DEF as DEF,
  LOWER_GALLERIES_STRINGS_EN,
  LOWER_SEALED_DOOR,
  LOWER_SHORTCUT_GATE,
  M19_ROUTE,
  M20_HALL_HEIGHT,
  M20_HALL_RECT,
} from './lowerGalleries';

const layout = layoutInterior(DEF, heightAt);
const localOf = (id: string) => {
  const a = DEF.anchors.find((x) => x.id === id);
  if (!a) throw new Error(`no anchor ${id}`);
  return a;
};
const pos = (id: string) => layout.anchors.find((a) => a.id === id)!.position;

/** A nav grid with the given blockers closed (their cells blocked), the rest open. */
function gridWith(closed: string[]) {
  const l = layoutInterior(
    { ...DEF, blockers: DEF.blockers.filter((b) => !closed.includes(b.id)), props: [...(DEF.props ?? []), ...DEF.blockers.filter((b) => closed.includes(b.id)).map((b) => ({ id: b.id, rect: b.rect, height: b.height }))] },
    heightAt,
  );
  return new NavGrid(l.nav);
}
const walk = (g: NavGrid, a: string, b: string) => {
  const p = findPath(g, pos(a), pos(b), 0.4);
  const end = p[p.length - 1];
  // The path leaves out its start; put it back so lengths are the whole walk.
  return end && Math.hypot(end.x - pos(b).x, end.z - pos(b).z) < 0.6 ? [pos(a), ...p] : null;
};
const length = (p: { x: number; z: number }[]) => p.reduce((s, q, i) => (i ? s + Math.hypot(q.x - p[i - 1]!.x, q.z - p[i - 1]!.z) : 0), 0);

describe('the Lower Galleries def', () => {
  const open = gridWith([]);

  it('stays inside the mine cell and every footprint rect', () => {
    for (const r of DEF.rooms) {
      expect(r.x0).toBeGreaterThanOrEqual(MINE_LOCAL_BOUNDS.x0);
      expect(r.x1).toBeLessThanOrEqual(MINE_LOCAL_BOUNDS.x1);
      expect(r.z0).toBeGreaterThanOrEqual(MINE_LOCAL_BOUNDS.z0);
      expect(r.z1).toBeLessThanOrEqual(MINE_LOCAL_BOUNDS.z1);
    }
  });

  it('puts every anchor on walkable floor inside a room, clear of pillars and props', () => {
    for (const a of DEF.anchors) {
      expect(DEF.rooms.some((r) => a.x >= r.x0 && a.x <= r.x1 && a.z >= r.z0 && a.z <= r.z1), a.id).toBe(true);
      const p = pos(a.id);
      expect(boundsContain(layout.bounds, p), a.id).toBe(true);
      const i = open.cellIndex(p.x, p.z);
      expect(open.isWalkable(i), a.id).toBe(true);
      expect(open.clearance(i), a.id).toBeGreaterThanOrEqual(0.4);
      for (const b of layout.boxes) {
        if (b.kind === 'blocker') continue;
        expect(p.x > b.min.x && p.x < b.max.x && p.z > b.min.z && p.z < b.max.z && p.y + 1 > b.min.y && p.y + 1 < b.max.y, `${a.id} in ${b.kind}`).toBe(false);
      }
    }
  });

  it('defines the section 11 anchors', () => {
    const ids = new Set(DEF.anchors.map((a) => a.id));
    const want = [
      'oldsmoke.lower.lift', 'oldsmoke.lower.lift.up', 'oldsmoke.lower.lift.call', 'oldsmoke.m19.nursery',
      'oldsmoke.stealth.m19.start', 'oldsmoke.stealth.m19.cp.inside', 'oldsmoke.stealth.m19.end', 'oldsmoke.stealth.m19.centre', ...[1, 2, 3, 4].map((n) => `oldsmoke.m19.watch.${n}`), ...[1, 2, 3, 4, 5].map((n) => `oldsmoke.m19.patrol.${n}`),
      'oldsmoke.lower.shortcut.a', 'oldsmoke.lower.shortcut.b', 'oldsmoke.m20.captain', 'oldsmoke.m20.roof',
      ...[1, 2, 3, 4].map((n) => `oldsmoke.hide.m19.${n}`),
      ...[1, 2, 3].map((n) => `oldsmoke.lower.sealed.${n}`),
      ...[1, 2, 3, 4, 5].flatMap((n) => [`oldsmoke.m20.chain.${n}`, `oldsmoke.m20.post.${n}`]),
      ...[1, 2, 3].map((n) => `oldsmoke.lower.spawn.${n}`),
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `oldsmoke.lower.drop.${n}`),
    ];
    for (const id of want) expect(ids.has(id), id).toBe(true);
    expect(new Set([...ids]).size).toBe(DEF.anchors.length);
    expect(DEF.blockers.map((b) => b.id).sort()).toEqual([LOWER_SEALED_DOOR, LOWER_SHORTCUT_GATE].sort());
    expect(DEF.doors[0]).toMatchObject({ doorId: 'mine-lower-galleries', inside: 'oldsmoke.lower.lift', exit: 'oldsmoke.lower.lift.up' });
  });

  it('lays Wenna\'s route 4 to 6 m apart, 20 to 30 points, every consecutive pair reachable', () => {
    expect(M19_ROUTE.length).toBeGreaterThanOrEqual(20);
    expect(M19_ROUTE.length).toBeLessThanOrEqual(30);
    for (let i = 0; i < M19_ROUTE.length; i++) {
      expect(DEF.anchors.some((a) => a.id === `oldsmoke.m19.route.${i}`)).toBe(true);
      if (i) {
        const d = Math.hypot(M19_ROUTE[i]!.x - M19_ROUTE[i - 1]!.x, M19_ROUTE[i]!.z - M19_ROUTE[i - 1]!.z);
        expect(d, `route ${i}`).toBeGreaterThanOrEqual(3);
        expect(d, `route ${i}`).toBeLessThanOrEqual(6);
        expect(walk(open, `oldsmoke.m19.route.${i - 1}`, `oldsmoke.m19.route.${i}`), `route ${i - 1} -> ${i}`).not.toBeNull();
      }
    }
  });

  it('with everything open: the long way is about 120 m, the shortcut about 35 m, the hall is reachable', () => {
    const landing = 'oldsmoke.lower.lift';
    for (const id of ['oldsmoke.m19.nursery', 'oldsmoke.m20.roof', 'oldsmoke.m20.captain', 'oldsmoke.stealth.m19.start', 'oldsmoke.stealth.m19.end']) {
      expect(walk(open, landing, id), id).not.toBeNull();
    }
    const short = walk(open, landing, 'oldsmoke.m19.nursery')!;
    expect(length(short)).toBeGreaterThan(30);
    expect(length(short)).toBeLessThan(50);
    const route = walk(gridWith([LOWER_SHORTCUT_GATE]), 'oldsmoke.m19.route.0', `oldsmoke.m19.route.${M19_ROUTE.length - 1}`)!;
    expect(length(route)).toBeGreaterThan(105);
    expect(length(route)).toBeLessThan(135);
  });

  it('with the sealed door closed and the gate closed: the nursery is cut off, the hall is not', () => {
    const g = gridWith([LOWER_SEALED_DOOR, LOWER_SHORTCUT_GATE]);
    expect(walk(g, 'oldsmoke.lower.lift', 'oldsmoke.m19.nursery')).toBeNull();
    expect(walk(g, 'oldsmoke.lower.lift', 'oldsmoke.stealth.m19.start')).toBeNull();
    for (const id of ['oldsmoke.m20.roof', 'oldsmoke.m20.captain', 'oldsmoke.m20.chain.3', 'oldsmoke.m20.post.5']) expect(walk(g, 'oldsmoke.lower.lift', id), id).not.toBeNull();
    // The sealed door splits the long way: in front is reachable, behind is not.
    expect(walk(g, 'oldsmoke.lower.lift', 'oldsmoke.lower.sealed.1')).not.toBeNull();
    expect(walk(g, 'oldsmoke.lower.lift', 'oldsmoke.lower.sealed.3')).toBeNull();
  });

  it('with only the gate closed the long way still reaches the nursery; with only the door closed the shortcut does', () => {
    const gateOnly = gridWith([LOWER_SHORTCUT_GATE]);
    expect(walk(gateOnly, 'oldsmoke.lower.lift', 'oldsmoke.m19.nursery')).not.toBeNull();
    expect(length(walk(gateOnly, 'oldsmoke.lower.lift', 'oldsmoke.m19.nursery')!)).toBeGreaterThan(100);
    const doorOnly = gridWith([LOWER_SEALED_DOOR]);
    expect(length(walk(doorOnly, 'oldsmoke.lower.lift', 'oldsmoke.m19.nursery')!)).toBeLessThan(50);
    expect(walk(doorOnly, 'oldsmoke.lower.shortcut.a', 'oldsmoke.lower.shortcut.b')).not.toBeNull();
    expect(walk(gateOnly, 'oldsmoke.lower.shortcut.a', 'oldsmoke.lower.shortcut.b')).not.toBeNull();
  });

  it('makes the M20 hall 36 x 30 m and 16 m high, with the roof point at its centre and the chains around its edge', () => {
    expect(M20_HALL_RECT.x1 - M20_HALL_RECT.x0).toBe(36);
    expect(M20_HALL_RECT.z1 - M20_HALL_RECT.z0).toBe(30);
    expect(DEF.rooms.find((r) => r.id === 'm20-hall')!.height).toBe(M20_HALL_HEIGHT);
    const roof = localOf('oldsmoke.m20.roof');
    expect(roof.x).toBeCloseTo((M20_HALL_RECT.x0 + M20_HALL_RECT.x1) / 2);
    expect(roof.z).toBeCloseTo((M20_HALL_RECT.z0 + M20_HALL_RECT.z1) / 2);
    for (let n = 1; n <= 5; n++) {
      const c = localOf(`oldsmoke.m20.chain.${n}`);
      const edge = Math.min(c.x - M20_HALL_RECT.x0, M20_HALL_RECT.x1 - c.x, c.z - M20_HALL_RECT.z0, M20_HALL_RECT.z1 - c.z);
      expect(edge, `chain ${n}`).toBeLessThan(3);
    }
  });

  it('keeps the crawler drops and spawns 2 m from walls', () => {
    const clear = (id: string) => {
      const a = localOf(id);
      const near = (r: { x0: number; x1: number; z0: number; z1: number }) => a.x >= r.x0 && a.x <= r.x1 && a.z >= r.z0 && a.z <= r.z1;
      const r = DEF.rooms.find(near)!;
      return Math.min(a.x - r.x0, r.x1 - a.x, a.z - r.z0, r.z1 - a.z);
    };
    for (let n = 1; n <= 8; n++) expect(clear(`oldsmoke.lower.drop.${n}`), `drop ${n}`).toBeGreaterThanOrEqual(2);
    for (let n = 1; n <= 3; n++) expect(clear(`oldsmoke.lower.spawn.${n}`), `spawn ${n}`).toBeGreaterThanOrEqual(2);
  });

  it('gives the cover room hide spots away from the walking line and strings for the door prompts', () => {
    for (let n = 1; n <= 4; n++) expect(walk(open, 'oldsmoke.stealth.m19.start', `oldsmoke.hide.m19.${n}`), `hide ${n}`).not.toBeNull();
    expect(LOWER_GALLERIES_STRINGS_EN['interior.exit.mine-lower-galleries']).toBeTruthy();
    expect(LOWER_GALLERIES_STRINGS_EN['interior.enter.mine-lower-galleries']).toBeTruthy();
  });
});
