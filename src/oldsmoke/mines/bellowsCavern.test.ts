import { BELLOWS } from '../../shrine/weepingBellows.tuning';
import { WAYSTONE_LOCKS } from '../../waystones/tuning';
import { BELLOWS_SOLVED_FLAG } from '../flags';
import { describe, expect, it } from 'vitest';
import { layoutInterior, standsIn } from '../../interiors/layout';
import { NavGrid } from '../../nav/NavGrid';
import { findPath } from '../../nav/pathfind';
import { bellowsLayout } from '../../shrine/weepingBellows.visuals';
import { heightAt } from '../../terrain/heightfield';
import { BELLOWS_CAVERN_DEF, BELLOWS_CAVERN_STRINGS_EN, BELLOWS_CENTER, BELLOWS_CLEAR_RADIUS } from './bellowsCavern';
import { MINE_IDS, MINE_LOCAL_BOUNDS } from './kit';

const layout = layoutInterior(BELLOWS_CAVERN_DEF, heightAt);
const grid = new NavGrid(layout.nav);
const at = (id: string) => {
  const a = layout.anchors.find((x) => x.id === id);
  if (!a) throw new Error(`no anchor ${id}`);
  return a;
};
const reachPoint = (from: { x: number; z: number }, to: { x: number; z: number }) => {
  const p = findPath(grid, { x: from.x, y: layout.floorY, z: from.z }, { x: to.x, y: layout.floorY, z: to.z }, 0.4);
  const end = p[p.length - 1];
  return !!end && Math.hypot(end.x - to.x, end.z - to.z) < 0.6;
};
const reach = (from: string, to: string) => reachPoint(at(from).position, at(to).position);

describe('the Weeping Bellows cavern', () => {
  it('defines the anchors the plan lists and the lift stop', () => {
    const ids = BELLOWS_CAVERN_DEF.anchors.map((a) => a.id);
    for (const id of [
      'oldsmoke.bellows.lift', 'oldsmoke.bellows.lift.up', 'oldsmoke.bellows.lift.call', 'mines.weeping-bellows.center', 'oldsmoke.bellows.plaque',
      'oldsmoke.bellows.pipes', 'npc-post.pike.bellows', ...[1, 2, 3, 4, 5, 6].map((n) => `oldsmoke.bellows.crawler.${n}`),
    ]) expect(ids, id).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(BELLOWS_CAVERN_DEF.id).toBe(MINE_IDS.bellows);
    expect(BELLOWS_CAVERN_DEF.doors[0]!.inside).toBe('oldsmoke.bellows.lift');
    expect(Object.keys(BELLOWS_CAVERN_STRINGS_EN)).toEqual([`interior.enter.${MINE_IDS.bellows}`, `interior.exit.${MINE_IDS.bellows}`]);
  });

  it('keeps every room inside the mine bounds', () => {
    for (const r of BELLOWS_CAVERN_DEF.rooms) {
      expect(r.x0).toBeGreaterThanOrEqual(MINE_LOCAL_BOUNDS.x0);
      expect(r.x1).toBeLessThanOrEqual(MINE_LOCAL_BOUNDS.x1);
      expect(r.z0).toBeGreaterThanOrEqual(MINE_LOCAL_BOUNDS.z0);
      expect(r.z1).toBeLessThanOrEqual(MINE_LOCAL_BOUNDS.z1);
    }
  });

  it('puts every anchor on walkable floor with clearance, reachable from the landing', () => {
    for (const a of layout.anchors) {
      const i = grid.cellIndex(a.position.x, a.position.z);
      expect(grid.isWalkable(i), a.id).toBe(true);
      expect(grid.clearance(i), a.id).toBeGreaterThanOrEqual(0.4);
      expect(standsIn(layout, a.position), a.id).toBe(true);
      if (a.id !== 'oldsmoke.bellows.lift') expect(reach('oldsmoke.bellows.lift', a.id), a.id).toBe(true);
    }
  });

  it('has a 24 m radius of open floor around the centre, with no pillars or props in it', () => {
    const c = BELLOWS_CENTER;
    for (let x = -BELLOWS_CLEAR_RADIUS; x <= BELLOWS_CLEAR_RADIUS; x += 0.5) {
      for (let z = -BELLOWS_CLEAR_RADIUS; z <= BELLOWS_CLEAR_RADIUS; z += 0.5) {
        if (Math.hypot(x, z) > BELLOWS_CLEAR_RADIUS) continue;
        const i = grid.cellIndex(layout.origin.x + c.x + x, layout.origin.z + c.z + z);
        expect(grid.isWalkable(i), `${x},${z}`).toBe(true);
      }
    }
    for (const p of BELLOWS_CAVERN_DEF.pillars) expect(rectDistance(p, c)).toBeGreaterThan(BELLOWS_CLEAR_RADIUS);
    for (const p of BELLOWS_CAVERN_DEF.props ?? []) expect(rectDistance(p.rect, c), p.id).toBeGreaterThan(BELLOWS_CLEAR_RADIUS);
  });

  it("A9's puzzle layout (braziers, valves, plaque) lies on walkable floor reachable from the landing", () => {
    const centre = at('mines.weeping-bellows.center').position;
    const l = bellowsLayout(centre);
    const spots = [...l.braziers, ...l.valves, l.plaque];
    expect(spots).toHaveLength(13);
    for (const p of spots) {
      const i = grid.cellIndex(p.x, p.z);
      expect(grid.isWalkable(i), `${p.x},${p.z}`).toBe(true);
      expect(grid.clearance(i)).toBeGreaterThanOrEqual(0.4);
      expect(standsIn(layout, p)).toBe(true);
      expect(reachPoint(at('oldsmoke.bellows.lift').position, p), `${p.x},${p.z}`).toBe(true);
    }
  });

  it('stands the plaque reader and Pike off the puzzle ring, the crawlers on the rim', () => {
    const c = at('mines.weeping-bellows.center').position;
    const d = (id: string) => Math.hypot(at(id).position.x - c.x, at(id).position.z - c.z);
    expect(d('oldsmoke.bellows.plaque')).toBeGreaterThan(10.5);
    expect(d('npc-post.pike.bellows')).toBeGreaterThan(15);
    for (let n = 1; n <= 6; n++) expect(d(`oldsmoke.bellows.crawler.${n}`)).toBeGreaterThanOrEqual(22);
    expect(at('oldsmoke.bellows.pipes').position.x - c.x).toBeLessThan(-22);
  });

  it('joins the landing to the cavern by a narrow tunnel of about 25 m', () => {
    const t = BELLOWS_CAVERN_DEF.rooms.find((r) => r.id === 'tunnel')!;
    expect(t.x1 - t.x0).toBeLessThanOrEqual(4);
    expect(t.z1 - t.z0).toBeGreaterThanOrEqual(25);
    expect(t.z1 - t.z0).toBeLessThanOrEqual(32);
  });

  it('unlocks the Bellows waystone path: the cavern defines the anchor the puzzle waits for, and the stone locks on the flag the puzzle sets', () => {
    expect(BELLOWS_CAVERN_DEF.anchors.some((a) => a.id === BELLOWS.centerAnchor)).toBe(true);
    expect(WAYSTONE_LOCKS['weeping-bellows']).toBe(BELLOWS.solvedFlag);
    expect(BELLOWS_SOLVED_FLAG).toBe(BELLOWS.solvedFlag);
  });
});

function rectDistance(r: { x0: number; z0: number; x1: number; z1: number }, c: { x: number; z: number }): number {
  return Math.hypot(Math.max(r.x0 - c.x, 0, c.x - r.x1), Math.max(r.z0 - c.z, 0, c.z - r.z1));
}
