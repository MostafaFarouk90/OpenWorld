import { describe, expect, it } from 'vitest';
import { layoutInterior, boundsContain } from '../../interiors/layout';
import type { LocalRect } from '../../interiors/types';
import { NavGrid } from '../../nav/NavGrid';
import { findPath } from '../../nav/pathfind';
import { heightAt } from '../../terrain/heightfield';
import { SHAFT_MINE_DEF, SHAFT_MINE_STRINGS_EN } from './shaft';
import { MINE_LANDINGS, MINE_LOCAL_BOUNDS } from './kit';

const def = SHAFT_MINE_DEF;
const layout = layoutInterior(def, heightAt);
const grid = new NavGrid(layout.nav);
const local = (id: string) => {
  const found = def.anchors.filter((a) => a.id === id);
  if (found.length !== 1) throw new Error(`anchor ${id} defined ${found.length} times`);
  return found[0];
};
const world = (id: string) => {
  const a = layout.anchors.find((x) => x.id === id);
  if (!a) throw new Error(`no laid-out anchor ${id}`);
  return a.position;
};
const inRect = (r: LocalRect, x: number, z: number, m = 0) => x >= r.x0 + m && x <= r.x1 - m && z >= r.z0 + m && z <= r.z1 - m;
const solidAt = (id: string) => {
  const { x, z } = local(id);
  return def.pillars.some((p) => inRect(p, x, z)) || (def.props ?? []).some((p) => !p.walkable && inRect(p.rect, x, z)) || def.blockers.some((b) => inRect(b.rect, x, z));
};
const reaches = (from: string, to: string) => {
  const t = world(to);
  const p = findPath(grid, world(from), t, 0.4);
  const end = p[p.length - 1];
  return !!end && Math.hypot(end.x - t.x, end.z - t.z) <= 0.6;
};
const landing = MINE_LANDINGS.shaft;
const ids = def.anchors.map((a) => a.id);
const range = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}.${i + 1}`);

const required = [
  landing, `${landing}.up`, `${landing}.call`,
  ...range('oldsmoke.shaft.vent', 4), ...range('oldsmoke.shaft.miner', 2), ...range('oldsmoke.shaft.drop', 12), ...range('oldsmoke.spawn.mines', 3),
];

describe('the Deepgate shaft floor', () => {
  it('defines every required anchor exactly once', () => {
    for (const id of required) expect(ids.filter((x) => x === id), id).toHaveLength(1);
  });

  it('puts every anchor on floor, clear of pillars and solid props', () => {
    for (const a of def.anchors) {
      expect(def.rooms.some((r) => inRect(r, a.x, a.z)), a.id).toBe(true);
      expect(solidAt(a.id), a.id).toBe(false);
    }
  });

  it('stays inside the mine bounds', () => {
    const b = MINE_LOCAL_BOUNDS;
    for (const r of def.rooms) {
      expect(r.x0).toBeGreaterThanOrEqual(b.x0);
      expect(r.x1).toBeLessThanOrEqual(b.x1);
      expect(r.z0).toBeGreaterThanOrEqual(b.z0);
      expect(r.z1).toBeLessThanOrEqual(b.z1);
    }
    for (const a of layout.anchors) expect(boundsContain(layout.bounds, a.position), a.id).toBe(true);
  });

  it('keeps the exit and call beside the landing, and the door on the landing', () => {
    expect(def.doors[0]).toMatchObject({ inside: landing, exit: `${landing}.up` });
    for (const id of [`${landing}.up`, `${landing}.call`]) {
      const d = Math.hypot(local(id).x - local(landing).x, local(id).z - local(landing).z);
      expect(d).toBeGreaterThan(1);
      expect(d).toBeLessThan(5);
    }
  });

  it('reaches every anchor from the landing', () => {
    for (const id of required) expect(reaches(landing, id), id).toBe(true);
  });

  it('lets the player walk out with each miner', () => {
    for (const id of range('oldsmoke.shaft.miner', 2)) expect(reaches(id, landing), id).toBe(true);
  });

  it('keeps crawler drops 2 m from room edges and spawns 6 m from the landing', () => {
    for (const id of range('oldsmoke.shaft.drop', 12)) {
      const { x, z } = local(id);
      expect(def.rooms.some((r) => inRect(r, x, z, 2)), id).toBe(true);
    }
    for (const id of range('oldsmoke.spawn.mines', 3)) {
      const a = local(id);
      expect(Math.hypot(a.x - local(landing).x, a.z - local(landing).z), id).toBeGreaterThanOrEqual(6);
    }
  });

  it('has the exit prompt string', () => {
    expect(SHAFT_MINE_STRINGS_EN['interior.exit.mine-deepgate-shaft']).toBeTruthy();
    expect(def.id).toBe('mine-deepgate-shaft');
  });
});
