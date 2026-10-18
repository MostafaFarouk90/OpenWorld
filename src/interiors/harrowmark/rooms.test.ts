import { describe, expect, it } from 'vitest';
import { NavGrid } from '../../nav/NavGrid';
import { findPath } from '../../nav/pathfind';
import { heightAt } from '../../terrain/heightfield';
import { boundsContain, layoutInterior, type InteriorLayout } from '../layout';
import type { InteriorDef, PropDef } from '../types';
import { VAULT_DEF } from '../vaultDef';
import { HARROWMARK_INTERIORS, ARCHIVE_DEF, COUNTING_HOUSE_DEF, KEEP_HALL_DEF, TILTED_ANVIL_BACKROOM_GATE, TILTED_ANVIL_DEF } from './index';

const layouts = new Map<string, InteriorLayout>(HARROWMARK_INTERIORS.map((d) => [d.id, layoutInterior(d, heightAt)]));
const L = (def: InteriorDef) => layouts.get(def.id)!;
const anchorOf = (l: InteriorLayout, id: string) => {
  const a = l.anchors.find((x) => x.id === id);
  if (!a) throw new Error(`no anchor ${id}`);
  return a;
};
const solidAt = (l: InteriorLayout, p: { x: number; y: number; z: number }) =>
  l.boxes.some((b) => b.kind !== 'blocker' && p.x > b.min.x && p.x < b.max.x && p.y > b.min.y && p.y < b.max.y && p.z > b.min.z && p.z < b.max.z);
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const reaches = (grid: NavGrid, from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }) => {
  const path = findPath(grid, from, to, 0.4);
  return path.length > 0 && dist(path[path.length - 1], to) <= 0.6;
};

describe.each(HARROWMARK_INTERIORS.map((d) => [d.id, d] as const))('%s', (_id, def) => {
  const l = L(def);
  const grid = new NavGrid(l.nav);
  const first = anchorOf(l, def.doors[0].inside).position;

  it('lays out', () => {
    expect(l.boxes.length).toBeGreaterThan(10);
  });

  it('puts every anchor on a walkable cell with 0.4 m clearance, in bounds and clear of solids', () => {
    for (const a of l.anchors) {
      const i = grid.cellIndex(a.position.x, a.position.z);
      expect(grid.isWalkable(i), a.id).toBe(true);
      expect(grid.clearance(i), a.id).toBeGreaterThanOrEqual(0.4);
      expect(boundsContain(l.bounds, a.position), a.id).toBe(true);
      expect(solidAt(l, { ...a.position, y: a.position.y + 1 }), a.id).toBe(false);
    }
  });

  it('reaches every anchor and door entry from the first door', () => {
    for (const a of l.anchors) expect(reaches(grid, first, a.position), a.id).toBe(true);
    for (const d of def.doors) expect(reaches(grid, first, anchorOf(l, d.inside).position), d.doorId).toBe(true);
  });

  it('keeps each exit within 2.5 m of its entry, facing out', () => {
    for (const d of def.doors) {
      const e = anchorOf(l, d.inside).position;
      const x = anchorOf(l, d.exit).position;
      expect(dist(e, x), d.doorId).toBeLessThanOrEqual(2.5);
      expect(dist(e, x), d.doorId).toBeGreaterThanOrEqual(1);
    }
  });

  it('gives triggers positive half sizes and a fog that covers the room', () => {
    for (const t of l.triggers) expect(Math.min(t.half.x, t.half.y, t.half.z), t.id).toBeGreaterThan(0);
    const xs = def.rooms.flatMap((r) => [r.x0, r.x1]);
    const zs = def.rooms.flatMap((r) => [r.z0, r.z1]);
    const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
    expect(def.environment.fogFar).toBeGreaterThanOrEqual(diag + 10);
  });

  it('keeps torches on the room edge', () => {
    for (const t of def.torches) {
      expect(t.y).toBeGreaterThanOrEqual(2);
      expect(t.y).toBeLessThanOrEqual(3);
    }
  });
});

describe('the Tilted Anvil', () => {
  const l = L(TILTED_ANVIL_DEF);
  it('has two doors, front first', () => {
    expect(TILTED_ANVIL_DEF.doors.map((d) => d.doorId)).toEqual(['tilted-anvil', 'tilted-anvil-back']);
    for (const id of ['inn.aldith', 'inn.room', 'npc-post.aldith.inside', 'npc-post.tobb.tilted-anvil']) expect(anchorOf(l, id)).toBeTruthy();
  });
  it('cuts the back room off when the gate is closed', () => {
    const grid = new NavGrid(l.nav);
    const comp = (id: string) => {
      const p = anchorOf(l, id).position;
      return grid.component(grid.cellIndex(p.x, p.z));
    };
    const ids = ['inn.room', 'harrowmark.tilted-anvil-back.entry'];
    expect(grid.setBlocker(TILTED_ANVIL_BACKROOM_GATE, true)).toBe(true);
    for (const id of ids) expect(comp(id), id).not.toBe(comp('harrowmark.tilted-anvil.entry'));
    expect(comp(ids[0])).toBe(comp(ids[1]));
    grid.setBlocker(TILTED_ANVIL_BACKROOM_GATE, false);
    for (const id of ids) expect(comp(id), id).toBe(comp('harrowmark.tilted-anvil.entry'));
  });
  it('puts the gate inside a room', () => {
    const g = TILTED_ANVIL_DEF.blockers.find((b) => b.id === TILTED_ANVIL_BACKROOM_GATE)!;
    expect(TILTED_ANVIL_DEF.rooms.some((r) => g.rect.x0 >= r.x0 && g.rect.x1 <= r.x1 && g.rect.z0 >= r.z0 && g.rect.z1 <= r.z1)).toBe(true);
  });
});

describe('the keep hall', () => {
  const l = L(KEEP_HALL_DEF);
  it('stands Edric on a walkable 0.4 m dais', () => {
    const dais = KEEP_HALL_DEF.props!.find((p) => p.id === 'dais.1')!;
    expect(dais.walkable).toBe(true);
    expect(dais.height).toBeLessThanOrEqual(0.4);
    expect(anchorOf(l, 'npc-post.edric.hall').position.y - l.floorY).toBeCloseTo(0.4, 6);
    expect(anchorOf(l, 'npc-post.vey.hall').position.y - l.floorY).toBeCloseTo(0.4, 6);
    const room = KEEP_HALL_DEF.rooms[0];
    expect(dais.rect.z0).toBe(room.z0);
  });
  it('contains m08.keep-hall in its trigger', () => {
    const t = l.triggers.find((x) => x.id === 'trg.harrowmark.keep-hall')!;
    const p = anchorOf(l, 'm08.keep-hall').position;
    expect(Math.abs(p.x - t.center.x)).toBeLessThanOrEqual(t.half.x);
    expect(Math.abs(p.y - t.center.y)).toBeLessThanOrEqual(t.half.y);
    expect(Math.abs(p.z - t.center.z)).toBeLessThanOrEqual(t.half.z);
  });
  it('has eight columns that are not walkable', () => {
    expect(KEEP_HALL_DEF.pillars).toHaveLength(8);
    const grid = new NavGrid(l.nav);
    for (const p of KEEP_HALL_DEF.pillars) {
      const i = grid.cellIndex(l.origin.x + (p.x0 + p.x1) / 2, l.origin.z + (p.z0 + p.z1) / 2);
      expect(grid.isWalkable(i)).toBe(false);
    }
  });
});

describe('the counting house', () => {
  const l = L(COUNTING_HOUSE_DEF);
  const grid = new NavGrid(l.nav);
  const pos = (id: string) => anchorOf(l, id).position;
  const loop = (prefix: string) => l.anchors.filter((a) => a.id.startsWith(prefix)).map((a) => a.position);

  it('defines every stealth anchor', () => {
    const ids = [
      'stealth.m09.entry', 'stealth.m09.cp.hall', 'stealth.m09.cp.office', 'stealth.m09.exit',
      ...[1, 2, 3, 4].map((i) => `hide.m09.${i}`),
      ...[1, 2, 3, 4].map((i) => `spawn.m09.watch-${i}`),
      ...[1, 2, 3].map((i) => `m09.invoice-${i}`),
      'npc-post.merrin.inside',
    ];
    for (const id of ids) expect(anchorOf(l, id), id).toBeTruthy();
    expect(loop('patrol.m09.hall.').length).toBeGreaterThanOrEqual(4);
    expect(loop('patrol.m09.hall.').length).toBeLessThanOrEqual(6);
    expect(loop('patrol.m09.stacks.')).toHaveLength(4);
    expect(dist(pos('stealth.m09.exit'), pos('harrowmark.counting-house.exit'))).toBeLessThanOrEqual(2);
  });

  const loops = [loop('patrol.m09.hall.'), loop('patrol.m09.stacks.')];
  it('has a clear line between consecutive patrol nodes, last to first', () => {
    for (const nodes of loops) {
      nodes.forEach((a, i) => {
        const b = nodes[(i + 1) % nodes.length];
        const len = dist(a, b);
        const steps = Math.ceil(len / 0.25);
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const c = grid.cellIndex(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
          expect(grid.isWalkable(c)).toBe(true);
          expect(grid.clearance(c)).toBeGreaterThanOrEqual(0.4);
        }
      });
    }
  });

  it('keeps every hide spot 3 m from every patrol segment', () => {
    const segDist = (p: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }) => {
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
      return dist(p, { x: a.x + dx * t, z: a.z + dz * t });
    };
    for (let h = 1; h <= 4; h++) {
      const p = pos(`hide.m09.${h}`);
      for (const nodes of loops) {
        nodes.forEach((a, i) => expect(segDist(p, a, nodes[(i + 1) % nodes.length]), `hide ${h}`).toBeGreaterThanOrEqual(3));
      }
    }
  });

  it('sizes shelves and desks', () => {
    const props = COUNTING_HOUSE_DEF.props!;
    const byPrefix = (p: string): PropDef[] => props.filter((x) => x.id?.startsWith(p));
    expect(byPrefix('shelf.').length).toBeGreaterThanOrEqual(3);
    expect(byPrefix('desk.').length).toBeGreaterThanOrEqual(6);
    for (const s of byPrefix('shelf.')) expect(s.height).toBeGreaterThanOrEqual(2);
    for (const d of byPrefix('desk.')) expect(d.height).toBeLessThanOrEqual(1.1);
    for (const s of byPrefix('stair.')) expect(s.height).toBe(2.5);
  });
});

describe('the archive', () => {
  it('posts Whitlock', () => {
    expect(anchorOf(L(ARCHIVE_DEF), 'npc-post.whitlock.inside')).toBeTruthy();
  });
});

describe('failure paths and ids', () => {
  it('rejects a walkable prop 0.5 m tall', () => {
    const bad: InteriorDef = { ...KEEP_HALL_DEF, props: [{ id: 'step', rect: { x0: -1, z0: -5, x1: 1, z1: -3 }, height: 0.5, walkable: true }] };
    expect(() => layoutInterior(bad, heightAt)).toThrow(/walkable prop/);
  });
  it('rejects a def with no rooms', () => {
    expect(() => layoutInterior({ ...ARCHIVE_DEF, rooms: [] }, heightAt)).toThrow(/no rooms/);
  });
  it('has no duplicate anchor or trigger ids across the defs and the vault', () => {
    const defs = [...HARROWMARK_INTERIORS, VAULT_DEF];
    for (const key of ['anchors', 'triggers'] as const) {
      const ids = defs.flatMap((d) => d[key].map((x) => x.id));
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
