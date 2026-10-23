import { describe, expect, it } from 'vitest';
import { layoutInterior, boundsContain } from '../../interiors/layout';
import type { LocalRect } from '../../interiors/types';
import { NavGrid } from '../../nav/NavGrid';
import { findPath } from '../../nav/pathfind';
import { heightAt } from '../../terrain/heightfield';
import { OLD_GALLERIES_DEF, OLD_GALLERIES_STRINGS_EN } from './oldGalleries';
import { MINE_LANDINGS, MINE_LOCAL_BOUNDS } from './kit';

const def = OLD_GALLERIES_DEF;
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
const landing = MINE_LANDINGS.old;
const ids = def.anchors.map((a) => a.id);
const range = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}.${i + 1}`);

const tasks = ['pump', 'cart', 'prop', 'bell'].map((t) => `oldsmoke.old.task.${t}`);
const required = [
  landing, `${landing}.up`, `${landing}.call`, ...tasks,
  ...range('oldsmoke.old.relic', 6), ...range('oldsmoke.old.spawn', 3), ...range('oldsmoke.old.drop', 8),
];

describe('the Old Galleries', () => {
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

  it('keeps the door on the landing and the main route 60 to 90 m', () => {
    expect(def.doors[0]).toMatchObject({ inside: landing, exit: `${landing}.up` });
    const z = Math.abs(local('oldsmoke.old.task.prop').z - local(landing).z);
    expect(z).toBeGreaterThan(60);
    expect(z).toBeLessThan(90);
  });

  it('reaches every anchor, task and relic from the landing', () => {
    for (const id of required) expect(reaches(landing, id), id).toBe(true);
    for (const id of [...tasks, ...range('oldsmoke.old.relic', 6)]) expect(reaches(id, landing), id).toBe(true);
  });

  it('keeps crawler drops 2 m from room edges', () => {
    for (const id of range('oldsmoke.old.drop', 8)) {
      const { x, z } = local(id);
      expect(def.rooms.some((r) => inRect(r, x, z, 2)), id).toBe(true);
    }
  });

  it('keeps the dedicated R08 posts and the letter on floor, apart from the landing and each other', () => {
    const ids = ['npc-post.pickett.old', 'npc-post.shift-crew.old', 'oldsmoke.old.letter'];
    const landing = local(MINE_LANDINGS.old);
    for (const id of ids) {
      const p = local(id);
      expect(def.rooms.some((r) => inRect(r, p.x, p.z, 0.5)), id).toBe(true);
      expect(Math.hypot(p.x - landing.x, p.z - landing.z), id).toBeGreaterThanOrEqual(4);
    }
  });

  it('has the exit prompt string', () => {
    expect(OLD_GALLERIES_STRINGS_EN['interior.exit.mine-old-galleries']).toBeTruthy();
    expect(def.id).toBe('mine-old-galleries');
  });
});
