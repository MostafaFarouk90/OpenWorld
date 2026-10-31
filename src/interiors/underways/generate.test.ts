import { describe, expect, it } from 'vitest';
import { NavGrid } from '../../nav/NavGrid';
import { findPath } from '../../nav/pathfind';
import { regionAt } from '../../region/regionMask';
import { heightAt } from '../../terrain/heightfield';
import { layoutInterior } from '../layout';
import type { InteriorDef } from '../types';
import { generateUnderways, planCartSpur, planUnderways, UNDERWAYS_ARENA_GATE, UNDERWAYS_CARTWAY_GATE, UNDERWAYS_DEF, UNDERWAYS_SEED } from './generate';

/**
 * FNV-1a over the def's JSON without its site: changes when the seed, the algorithm or any constant moves a corridor, not when
 * thread 17 moves the door (the tunnels are in local metres).
 */
function hashDef(def: InteriorDef): string {
  const { site: _site, ...local } = def;
  const s = JSON.stringify(local);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const layout = layoutInterior(UNDERWAYS_DEF, heightAt);
const grid = new NavGrid(layout.nav);
const at = (id: string) => {
  const a = layout.anchors.find((x) => x.id === id);
  if (!a) throw new Error(`no anchor ${id}`);
  return a;
};
const reach = (from: string, to: string, g = grid) => {
  const p = findPath(g, at(from).position, at(to).position, 0.4);
  const end = p[p.length - 1];
  return !!end && Math.hypot(end.x - at(to).position.x, end.z - at(to).position.z) < 0.6;
};

describe('the Underways generator', () => {
  it('is deterministic: the shipped seed gives the pinned layout', () => {
    expect(hashDef(generateUnderways(UNDERWAYS_SEED))).toBe(hashDef(generateUnderways(UNDERWAYS_SEED)));
    // Update deliberately when the layout is meant to change (old saves inside land at the entry, see InteriorController).
    // bbcbf1f0: the density pass (batch 4) added the D02 valve, tally, sluice-hound and crate anchors; no room moved.
    // 41104a5a: the Act 1 side job j11 added the cart-track spur off a dead-end branch (four rooms, a grate, six anchors, two
    // triggers); no earlier room moved.
    expect(hashDef(UNDERWAYS_DEF)).toBe('298a8f16');
  });

  it('gives different tunnels for different seeds, and refuses a non-integer seed', () => {
    expect(hashDef(generateUnderways(1))).not.toBe(hashDef(generateUnderways(2)));
    expect(() => planUnderways(1.5)).toThrow(/integer/);
    expect(() => planUnderways(Number.NaN)).toThrow(/integer/);
  });

  it('keeps both kennels on every way to the arena, for many seeds', () => {
    for (let seed = 0; seed < 60; seed++) {
      const def = generateUnderways(seed);
      const l = layoutInterior(def, heightAt);
      const g = new NavGrid(l.nav);
      const pos = (id: string) => l.anchors.find((a) => a.id === id)!.position;
      const entry = g.cellIndex(pos('harrowmark.underways.entry').x, pos('harrowmark.underways.entry').z);
      const door = g.cellIndex(pos('underways.arena.door').x, pos('underways.arena.door').z);
      expect(g.component(entry), `seed ${seed}`).toBe(g.component(door));
      const plan = planUnderways(seed);
      expect(plan.mainPath[0]).toBe(0);
      expect(plan.mainPath[plan.mainPath.length - 1]).toBe(plan.arenaHook);
      const i1 = plan.mainPath.indexOf(plan.kennels[0]);
      const i2 = plan.mainPath.indexOf(plan.kennels[1]);
      expect(i1, `seed ${seed}`).toBeGreaterThan(0);
      expect(i2, `seed ${seed}`).toBeGreaterThan(i1);
      expect(i2, `seed ${seed}`).toBeLessThan(plan.mainPath.length - 1);
    }
  });

  it('every kept cell is connected to the stair', () => {
    const plan = planUnderways(UNDERWAYS_SEED);
    const seen = new Set([0]);
    const queue = [0];
    for (let q = 0; q < queue.length; q++) for (const n of plan.links.get(queue[q]!) ?? []) if (!seen.has(n) && seen.add(n)) queue.push(n);
    expect([...plan.kept].every((c) => seen.has(c))).toBe(true);
  });
});

describe('the shipped Underways', () => {
  it('has the anchors, trigger, blocker and door other threads use', () => {
    const ids = layout.anchors.map((a) => a.id);
    for (const id of [
      'harrowmark.underways.entry',
      'harrowmark.underways.exit',
      'underways.arena.door',
      'underways.arena.centre',
      ...[1, 2, 3, 4].map((i) => `underways.summon.${i}`),
      ...[1, 2, 3, 4, 5, 6].map((i) => `underways.spawn.hound-${i}`),
      // the density pass, batch 4 (D02)
      'd02.valve-1', 'd02.valve-2', 'd02.tally', 'd02.den-crates', ...[1, 2, 3].map((i) => `underways.spawn.sluice-${i}`),
      // side job j11 (the cart-track spur)
      'j11.grate', 'j11.track-1', 'j11.track-2', 'j11.waybill', 'j11.spawn.hound-1', 'j11.spawn.hound-2',
    ]) {
      expect(ids, id).toContain(id);
    }
    expect(layout.triggers.map((t) => t.id)).toEqual(['trg.underways.arena', 'trg.underways.j11-track-1', 'trg.underways.j11-track-2']);
    expect(UNDERWAYS_DEF.blockers.map((b) => b.id)).toEqual([UNDERWAYS_ARENA_GATE, UNDERWAYS_CARTWAY_GATE]);
    expect(UNDERWAYS_DEF.doors.map((d) => d.doorId)).toEqual(['underways']);
    expect(UNDERWAYS_DEF.id).toBe('underways');
  });

  it('puts every anchor on a walkable cell with 0.4 m clearance, reachable from the entry', () => {
    for (const a of layout.anchors) {
      const i = grid.cellIndex(a.position.x, a.position.z);
      expect(grid.isWalkable(i), a.id).toBe(true);
      expect(grid.clearance(i), a.id).toBeGreaterThanOrEqual(0.4);
      if (a.id !== 'harrowmark.underways.entry') expect(reach('harrowmark.underways.entry', a.id), a.id).toBe(true);
    }
  });

  it('builds a flat 24 x 24 m, 6 m arena with no pillars, summons 8 m or more from the centre', () => {
    const arena = UNDERWAYS_DEF.rooms.find((r) => r.id === 'arena')!;
    expect(arena.x1 - arena.x0).toBe(24);
    expect(arena.z1 - arena.z0).toBe(24);
    expect(arena.height).toBe(6);
    expect(UNDERWAYS_DEF.pillars).toEqual([]);
    const c = at('underways.arena.centre').position;
    for (let i = 1; i <= 4; i++) {
      const s = at(`underways.summon.${i}`).position;
      expect(Math.hypot(s.x - c.x, s.z - c.z)).toBeGreaterThanOrEqual(8);
    }
  });

  it('puts the arena door at least 3 m outside the arena trigger, and the trigger across the doorway', () => {
    const t = layout.triggers[0]!;
    const d = at('underways.arena.door').position;
    const dx = Math.max(0, Math.abs(d.x - t.center.x) - t.half.x);
    const dz = Math.max(0, Math.abs(d.z - t.center.z) - t.half.z);
    expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(3);
    expect(t.half.x * 2 * t.half.z * 2).toBeGreaterThan(0);
    // The way to the arena centre passes through the trigger.
    const path = findPath(grid, d, at('underways.arena.centre').position, 0.4);
    const inside = (p: { x: number; z: number }) => Math.abs(p.x - t.center.x) <= t.half.x && Math.abs(p.z - t.center.z) <= t.half.z;
    let crossed = false;
    let prev = d;
    for (const p of path) {
      for (let k = 0; k <= 20; k++) {
        const q = { x: prev.x + ((p.x - prev.x) * k) / 20, z: prev.z + ((p.z - prev.z) * k) / 20 };
        if (inside(q)) crossed = true;
      }
      prev = p;
    }
    expect(crossed).toBe(true);
  });

  it('closes the arena with its gate', () => {
    const g = new NavGrid(layout.nav);
    g.setBlocker(UNDERWAYS_ARENA_GATE, true);
    expect(reach('harrowmark.underways.entry', 'underways.arena.centre', g)).toBe(false);
    expect(reach('harrowmark.underways.entry', 'underways.arena.door', g)).toBe(true);
    g.setBlocker(UNDERWAYS_ARENA_GATE, false);
    expect(reach('harrowmark.underways.entry', 'underways.arena.centre', g)).toBe(true);
  });

  it('cannot reach the arena without crossing both kennels', () => {
    // Fill each kennel room with a blocker-sized wall and check the arena falls out of reach.
    for (const kennel of ['kennel-1', 'kennel-2']) {
      const room = UNDERWAYS_DEF.rooms.find((r) => r.id === kennel)!;
      const def = { ...UNDERWAYS_DEF, pillars: [{ x0: room.x0, z0: room.z0, x1: room.x1, z1: room.z1 }] };
      const g = new NavGrid(layoutInterior(def, heightAt).nav);
      const e = at('harrowmark.underways.entry').position;
      const c = at('underways.arena.centre').position;
      expect(g.component(g.cellIndex(e.x, e.z)), kennel).not.toBe(g.component(g.cellIndex(c.x, c.z)));
    }
  });

  it('stays in budget: boxes and A* time from the stair to the arena', () => {
    expect(layout.boxes.length).toBeLessThan(650);
    const from = at('harrowmark.underways.entry').position;
    const to = at('underways.arena.centre').position;
    findPath(grid, from, to, 0.4);
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) findPath(grid, from, to, 0.4);
    const each = (performance.now() - t0) / 20;
    // Loose for CI; locally a few milliseconds. Agents repath at most every 0.5 s.
    expect(each).toBeLessThan(25);
  });

  it('floats 150 m over flat ground, inside the region of its door', () => {
    expect(layout.floorY - heightAt(UNDERWAYS_DEF.site.x, UNDERWAYS_DEF.site.z)).toBeCloseTo(150, 0);
    const region = regionAt(UNDERWAYS_DEF.site.x, UNDERWAYS_DEF.site.z)?.id ?? null;
    for (const p of [layout.bounds.min, layout.bounds.max, { x: layout.bounds.min.x, z: layout.bounds.max.z }, { x: layout.bounds.max.x, z: layout.bounds.min.z }]) {
      expect(regionAt(p.x, p.z)?.id ?? null).toBe(region);
    }
  });
});

describe('the cart-track spur (side job j11)', () => {
  const spur = planCartSpur(planUnderways(UNDERWAYS_SEED))!;

  it('branches off a dead-end side branch, not the main path or a kennel', () => {
    const plan = planUnderways(UNDERWAYS_SEED);
    expect(spur).toBeTruthy();
    expect(plan.mainPath).not.toContain(spur.from);
    expect(plan.kennels).not.toContain(spur.from);
    expect(plan.links.get(spur.from)!.size).toBe(1);
    expect(planCartSpur(plan)).toEqual(spur);
  });

  it('adds no room that overlaps an older one, and no other room moved', () => {
    const rooms = UNDERWAYS_DEF.rooms;
    const mine = rooms.filter((r) => r.id.startsWith('j11-spur'));
    expect(mine.map((r) => r.id)).toEqual(['j11-spur-1', 'j11-spur-c1', 'j11-spur-2', 'j11-spur-yard']);
    const [first, ...rest] = mine;
    for (const r of rooms.filter((x) => !x.id.startsWith('j11-spur'))) {
      for (const m of [first, ...rest]) {
        const overlap = m!.x0 < r.x1 && m!.x1 > r.x0 && m!.z0 < r.z1 && m!.z1 > r.z0;
        // the first corridor starts inside the dead end's own chamber (they touch there); nothing else may
        if (overlap) expect(r.id, `${m!.id} overlaps ${r.id}`).toMatch(/^(cell|corridor)-/);
      }
    }
  });

  it('is shut at the grate until the blocker opens: closed, nothing past it can be reached; open, the whole spur can', () => {
    const g = new NavGrid(layout.nav);
    expect(UNDERWAYS_DEF.blockers.find((b) => b.id === UNDERWAYS_CARTWAY_GATE)!.startClosed).toBe(true);
    g.setBlocker(UNDERWAYS_CARTWAY_GATE, true);
    expect(reach('harrowmark.underways.entry', 'j11.grate', g)).toBe(true);
    for (const id of ['j11.track-1', 'j11.track-2', 'j11.waybill', 'j11.spawn.hound-1', 'j11.spawn.hound-2']) {
      expect(reach('harrowmark.underways.entry', id, g), `${id} behind the shut grate`).toBe(false);
    }
    g.setBlocker(UNDERWAYS_CARTWAY_GATE, false);
    for (const id of ['j11.track-1', 'j11.track-2', 'j11.waybill', 'j11.spawn.hound-1', 'j11.spawn.hound-2']) {
      expect(reach('harrowmark.underways.entry', id, g), `${id} past the open grate`).toBe(true);
    }
  });

  it('keeps the waybill, the hounds and the second track clear of the grate and the first track (3 m or more)', () => {
    const d = (a: string, b: string) => Math.hypot(at(a).position.x - at(b).position.x, at(a).position.z - at(b).position.z);
    expect(d('j11.waybill', 'j11.track-1')).toBeGreaterThan(3);
    expect(d('j11.spawn.hound-1', 'j11.spawn.hound-2')).toBeGreaterThan(3);
    expect(d('j11.grate', 'j11.track-1')).toBeGreaterThan(3);
  });
});

