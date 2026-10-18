import { describe, expect, it } from 'vitest';
import { NavGrid } from '../nav/NavGrid';
import { findPath } from '../nav/pathfind';
import { heightAt } from '../terrain/heightfield';
import { boundsContain, FLOAT_HEIGHT, layoutInterior, type InteriorLayout } from './layout';
import type { InteriorDef } from './types';
import { PILLAR_STAND_OFF, VAULT_DEF, VAULT_GATE } from './vaultDef';

const layout = layoutInterior(VAULT_DEF, heightAt);
const anchor = (id: string) => {
  const a = layout.anchors.find((x) => x.id === id);
  if (!a) throw new Error(`no anchor ${id}`);
  return a;
};
const solidAt = (l: InteriorLayout, p: { x: number; y: number; z: number }) =>
  l.boxes.some((b) => b.kind !== 'blocker' && p.x > b.min.x && p.x < b.max.x && p.y > b.min.y && p.y < b.max.y && p.z > b.min.z && p.z < b.max.z);

describe('the chapel vault layout', () => {
  it('defines every anchor and trigger id the contract names', () => {
    const ids = layout.anchors.map((a) => a.id).sort();
    const expected = [
      'vault.entry',
      'vault.exit',
      'vault.arena.door',
      'vault.arena.centre',
      ...[1, 2, 3, 4].map((i) => `vault.pillar.${i}`),
      ...[1, 2, 3, 4].map((i) => `vault.summon.${i}`),
      ...[1, 2, 3].map((i) => `vault.spawn.wraith-${i}`),
      ...[1, 2, 3].map((i) => `vault.pile.${i}`),
      'vault.bloom',
    ].sort();
    expect(ids).toEqual(expected);
    expect(layout.triggers.map((t) => t.id)).toEqual(['trg.vault.arena']);
    // The chapel side is thread 4's.
    expect(ids).not.toContain('vault.door');
    expect(ids).not.toContain('npc-post.aelfreda.vault');
  });

  it('floats 150 m above the terrain under every walkable cell (inside the save loader window)', () => {
    const grid = new NavGrid(layout.nav);
    let checked = 0;
    for (let i = 0; i < grid.cols * grid.rows; i++) {
      if (!grid.isWalkable(i)) continue;
      const c = grid.cellCentre(i);
      const above = layout.floorY - heightAt(c.x, c.z);
      expect(above).toBeGreaterThanOrEqual(130);
      expect(above).toBeLessThanOrEqual(190);
      checked++;
    }
    expect(checked).toBeGreaterThan(1000);
    expect(layout.floorY).toBeGreaterThanOrEqual(FLOAT_HEIGHT);
  });

  it('puts every inside anchor on a walkable cell with 0.4 m clearance, inside the bounds and clear of solids', () => {
    const grid = new NavGrid(layout.nav);
    for (const a of layout.anchors) {
      const i = grid.cellIndex(a.position.x, a.position.z);
      expect(i, a.id).toBeGreaterThanOrEqual(0);
      expect(grid.isWalkable(i), a.id).toBe(true);
      expect(grid.clearance(i), a.id).toBeGreaterThanOrEqual(0.4);
      expect(boundsContain(layout.bounds, a.position), a.id).toBe(true);
      expect(solidAt(layout, { ...a.position, y: a.position.y + 1 }), a.id).toBe(false);
    }
  });

  it('reaches the arena, pillars, summons and spawns from the entry at radius 0.5, and not past a closed gate', () => {
    const grid = new NavGrid(layout.nav);
    const from = anchor('vault.entry').position;
    const targets = layout.anchors.filter((a) => a.id !== 'vault.entry');
    for (const t of targets) {
      const path = findPath(grid, from, t.position, 0.5);
      const end = path[path.length - 1];
      expect(Math.hypot(end.x - t.position.x, end.z - t.position.z), t.id).toBeLessThan(1e-6);
    }
    expect(grid.setBlocker(VAULT_GATE, true)).toBe(true);
    const centre = anchor('vault.arena.centre').position;
    const blocked = findPath(grid, from, centre, 0.5);
    const end = blocked[blocked.length - 1];
    expect(Math.hypot(end.x - centre.x, end.z - centre.z)).toBeGreaterThan(5);
  });

  it('gives thread 3b its arena: pillars 7 to 9 m from the centre, teleport points 1.5 m from the pillar face', () => {
    const centre = anchor('vault.arena.centre').position;
    for (const p of VAULT_DEF.pillars) {
      const cx = layout.origin.x + (p.x0 + p.x1) / 2;
      const cz = layout.origin.z + (p.z0 + p.z1) / 2;
      const d = Math.hypot(cx - centre.x, cz - centre.z);
      expect(d).toBeGreaterThanOrEqual(7);
      expect(d).toBeLessThanOrEqual(9);
    }
    for (let i = 1; i <= 4; i++) {
      const a = anchor(`vault.pillar.${i}`).position;
      const p = VAULT_DEF.pillars[i - 1];
      const r = { x0: layout.origin.x + p.x0, x1: layout.origin.x + p.x1, z0: layout.origin.z + p.z0, z1: layout.origin.z + p.z1 };
      const dx = Math.max(r.x0 - a.x, 0, a.x - r.x1);
      const dz = Math.max(r.z0 - a.z, 0, a.z - r.z1);
      expect(Math.hypot(dx, dz)).toBeCloseTo(PILLAR_STAND_OFF, 6);
      // Facing the centre: forward = (-sin, -cos).
      const yaw = anchor(`vault.pillar.${i}`).yaw;
      const to = { x: centre.x - a.x, z: centre.z - a.z };
      const len = Math.hypot(to.x, to.z);
      expect(-Math.sin(yaw)).toBeCloseTo(to.x / len, 6);
      expect(-Math.cos(yaw)).toBeCloseTo(to.z / len, 6);
    }
    const arena = VAULT_DEF.rooms.find((r) => r.id === 'arena')!;
    expect(arena.x1 - arena.x0).toBeGreaterThanOrEqual(20);
  });

  it('puts the arena door at least 3 m outside the arena trigger, facing into the arena', () => {
    const door = anchor('vault.arena.door');
    const t = layout.triggers[0];
    const dx = Math.max(Math.abs(door.position.x - t.center.x) - t.half.x, 0);
    const dz = Math.max(Math.abs(door.position.z - t.center.z) - t.half.z, 0);
    expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(3);
    expect(t.center.z).toBeLessThan(door.position.z); // the arena is along -Z, which yaw 0 faces
    expect(door.yaw).toBe(0);
    expect([t.half.x * 2, t.half.y * 2, t.half.z * 2]).toEqual([6, 4, 3]);
  });

  it('keeps every ash pile within 10 m of the Blightbloom', () => {
    const bloom = anchor('vault.bloom').position;
    for (let i = 1; i <= 3; i++) {
      const p = anchor(`vault.pile.${i}`).position;
      expect(Math.hypot(p.x - bloom.x, p.z - bloom.z)).toBeLessThanOrEqual(10);
    }
  });

  it('closes every room: the walls are solid just outside the walkable area at head height', () => {
    const grid = new NavGrid(layout.nav);
    let probes = 0;
    for (let i = 0; i < grid.cols * grid.rows; i++) {
      if (!grid.isWalkable(i)) continue;
      const c = grid.cellCentre(i);
      for (const [dx, dz] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) {
        const x = c.x + dx;
        const z = c.z + dz;
        const j = grid.cellIndex(x, z);
        const insidePillar = VAULT_DEF.pillars.some((p) => {
          const lx = x - layout.origin.x;
          const lz = z - layout.origin.z;
          return lx > p.x0 && lx < p.x1 && lz > p.z0 && lz < p.z1;
        });
        if (j >= 0 && grid.isWalkable(j)) continue;
        if (insidePillar) continue;
        probes++;
        expect(solidAt(layout, { x, y: layout.floorY + 1.5, z }), `open wall at ${x},${z}`).toBe(true);
      }
    }
    expect(probes).toBeGreaterThan(100);
  });

  it('has a floor under and a ceiling over every walkable cell, and no solid at head height', () => {
    const grid = new NavGrid(layout.nav);
    for (let i = 0; i < grid.cols * grid.rows; i += 7) {
      if (!grid.isWalkable(i)) continue;
      const c = grid.cellCentre(i);
      expect(solidAt(layout, { x: c.x, y: layout.floorY - 0.25, z: c.z })).toBe(true);
      expect(solidAt(layout, { x: c.x, y: layout.floorY + 1.7, z: c.z })).toBe(false);
      const room = VAULT_DEF.rooms.find((r) => {
        const lx = c.x - layout.origin.x;
        const lz = c.z - layout.origin.z;
        return lx >= r.x0 && lx < r.x1 && lz >= r.z0 && lz < r.z1;
      })!;
      expect(solidAt(layout, { x: c.x, y: layout.floorY + room.height + 0.25, z: c.z })).toBe(true);
    }
  });

  it('merges the raster into a modest number of boxes', () => {
    expect(layout.boxes.length).toBeLessThan(400);
    expect(layout.boxes.filter((b) => b.kind === 'pillar')).toHaveLength(4);
    expect(layout.boxes.filter((b) => b.kind === 'blocker').map((b) => b.blockerId)).toEqual([VAULT_GATE]);
  });

  it('follows the terrain: a raised site raises the floor', () => {
    const raised = layoutInterior(VAULT_DEF, () => 40);
    expect(raised.floorY).toBe(40 + FLOAT_HEIGHT);
    const uneven = layoutInterior(VAULT_DEF, (x) => (x > 60 ? 12 : 0));
    expect(uneven.floorY).toBe(12 + FLOAT_HEIGHT);
  });

  it('refuses a def with no rooms', () => {
    const bad: InteriorDef = { ...VAULT_DEF, id: 'empty', rooms: [] };
    expect(() => layoutInterior(bad, heightAt)).toThrow(/no rooms/);
  });
});
