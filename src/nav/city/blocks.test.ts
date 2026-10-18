import { describe, expect, it } from 'vitest';
import { HARROWMARK_LAYOUT } from '../../harrowmark/harrowmark.layout';
import type { StructureSpec } from '../../region/layoutTypes';
import { heightAt } from '../../terrain/heightfield';
import { NavGrid } from '../NavGrid';
import { findPath } from '../pathfind';
import { blockGridDef, blocksStreet, CITY_NAV_BLOCKS, footprintRect, MAX_BLOCK_CELLS, type CityNavBlock } from './blocks';

const structures = HARROWMARK_LAYOUT.structures;
const anchor = (id: string) => {
  const a = HARROWMARK_LAYOUT.anchors.find((q) => q.id === id);
  if (!a) throw new Error(`no anchor ${id}`);
  return { x: a.x, y: 20, z: a.z };
};
const gridFor = (id: string): NavGrid => {
  const r = blockGridDef(CITY_NAV_BLOCKS.find((b) => b.id === id)!, structures, heightAt);
  if (!('def' in r)) throw new Error(r.skipped);
  return new NavGrid(r.def);
};
const box = (id: string, x: number, z: number, w: number, d: number, yawDeg = 0, rest: Partial<StructureSpec> = {}): StructureSpec => ({
  id, kind: 'house', x, z, yawDeg, footprint: [w, d], mode: 'solid', height: 6, ...rest,
});
/** True when (x, z) is inside the structure's real (unpadded) footprint. */
const inside = (s: StructureSpec, x: number, z: number): boolean => {
  const o = footprintRect(s, 0);
  const dx = x - o.cx;
  const dz = z - o.cz;
  const lx = dx * Math.cos(o.yaw) - dz * Math.sin(o.yaw);
  const lz = dx * Math.sin(o.yaw) + dz * Math.cos(o.yaw);
  return Math.abs(lx) < o.hx && Math.abs(lz) < o.hz;
};

describe('CITY_NAV_BLOCKS', () => {
  it('builds every block on flat ground under the cell cap', () => {
    for (const b of CITY_NAV_BLOCKS) {
      const r = blockGridDef(b, structures, heightAt);
      expect('def' in r, b.id).toBe(true);
      const g = new NavGrid((r as { def: ConstructorParameters<typeof NavGrid>[0] }).def);
      expect(g.cols * g.rows).toBeLessThanOrEqual(MAX_BLOCK_CELLS);
      expect(g.id).toBe(`city.${b.id}`);
    }
  });

  it('keeps every pair of blocks at least 50 m apart, so a neighbouring grid is never a step away', () => {
    for (const a of CITY_NAV_BLOCKS) for (const b of CITY_NAV_BLOCKS) {
      if (a === b) continue;
      const dx = Math.max(a.rect.x0 - b.rect.x1, b.rect.x0 - a.rect.x1);
      const dz = Math.max(a.rect.z0 - b.rect.z1, b.rect.z0 - a.rect.z1);
      expect(Math.max(dx, dz), `${a.id} / ${b.id}`).toBeGreaterThanOrEqual(50);
    }
  });

  it('blocks the centre of every street-blocking building in each block', () => {
    let checked = 0;
    for (const b of CITY_NAV_BLOCKS) {
      const g = gridFor(b.id);
      for (const s of structures.filter(blocksStreet)) {
        const i = g.cellIndex(s.x, s.z);
        if (i < 0) continue;
        expect(g.isWalkable(i), `${s.id} in ${b.id}`).toBe(false);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  // The places where fights and quests happen in these streets must be walkable for a 0.4 m agent and joined up.
  const SPOTS: Record<string, string[]> = {
    'guild-quarter': ['harrowmark.square.market', 'm07.satchel', 'm07.thieves.1', 'm07.thieves.2', 'm07.thieves.3', 'r03.guildhall.1', 'r03.guildhall.2', 'r03.guildhall.3', 'harrowmark.hide.guild-crates', 'harrowmark.hide.thieves-barrel', 'chest.harrowmark.2'],
    'forge-row': ['harrowmark.forge-row.centre', 'harrowmark.dunstan.forge', 'chest.harrowmark.1', 'harrowmark.hide.forge-coalbin', 'r04.page-2'],
    'bastion-yard': ['m07.bastion-yard', 'harrowmark.bastion.yard', 'harrowmark.bastion.drill.dodge-lane', 'npc-post.gaut.bastion', 'npc-post.ashdown.bastion'],
    'south-gate': ['harrowmark.square.gate', 'stealth.m06.cp.inside', 'stealth.m06.end', 'harrowmark.hide.gate-cart', 'harrowmark.hide.gate-barrels'],
  };
  for (const [block, ids] of Object.entries(SPOTS)) {
    it(`reaches the quest and fight spots in ${block} from one another`, () => {
      const g = gridFor(block);
      const comps = new Set<number>();
      for (const id of ids) {
        const p = anchor(id);
        const i = g.cellIndex(p.x, p.z);
        expect(i, id).toBeGreaterThanOrEqual(0);
        // A spot may hug a wall (hide spots do): its nearest valid cell must be within 1.5 m.
        let best = Infinity;
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
          const j = g.cellIndex(p.x + dx, p.z + dz);
          if (j >= 0 && g.isWalkable(j) && g.clearance(j) >= 0.4) {
            const c = g.cellCentre(j);
            best = Math.min(best, Math.hypot(c.x - p.x, c.z - p.z));
            comps.add(g.component(j));
          }
        }
        expect(best, id).toBeLessThanOrEqual(1.5);
      }
      expect(comps.size, `${block} spots in one component`).toBe(1);
    });
  }

  it('routes around the buildings: no path segment crosses a footprint', () => {
    const cases: Array<[string, string, string]> = [
      ['guild-quarter', 'harrowmark.square.market', 'm07.thieves.2'],
      ['guild-quarter', 'm07.satchel', 'r03.guildhall.3'],
      ['forge-row', 'harrowmark.dunstan.forge', 'chest.harrowmark.1'],
      ['south-gate', 'stealth.m06.end', 'harrowmark.hide.gate-cart'],
    ];
    const blocking = structures.filter(blocksStreet);
    for (const [block, from, to] of cases) {
      const g = gridFor(block);
      const a = anchor(from);
      const path = findPath(g, a, anchor(to), 0.4);
      expect(path.length, `${from} -> ${to}`).toBeGreaterThan(0);
      let prev = a;
      for (const w of path) {
        for (let t = 0; t <= 1; t += 0.02) {
          const x = prev.x + (w.x - prev.x) * t;
          const z = prev.z + (w.z - prev.z) * t;
          const hit = blocking.find((s) => inside(s, x, z));
          expect(hit?.id, `${from} -> ${to} at (${x.toFixed(1)}, ${z.toFixed(1)})`).toBeUndefined();
        }
        prev = w;
      }
    }
  });

  it('floors each grid on the plateau and keeps the Rooftop Ward band out', () => {
    const g = gridFor('guild-quarter');
    expect(g.floorY).toBeCloseTo(heightAt(8780, 1520), 3);
    expect(g.contains({ x: 8780, y: g.floorY + 6, z: 1520 })).toBe(false);
  });
});

describe('blockGridDef', () => {
  const block: CityNavBlock = { id: 'test', rect: { x0: 0, z0: 0, x1: 40, z1: 40 } };
  const flat = () => 5;

  it('blocks a rotated footprint by its true shape, padded by half a cell', () => {
    const s = box('diamond', 20, 20, 10, 2, 45);
    const r = blockGridDef(block, [s], flat);
    if (!('def' in r)) throw new Error(r.skipped);
    const g = new NavGrid(r.def);
    expect(g.floorY).toBe(5);
    // Along the long axis, rotated 45 degrees: local (+4, 0) lands at (20 + 4 cos, 20 - 4 sin).
    const k = Math.SQRT1_2;
    expect(g.isWalkable(g.cellIndex(20 + 4 * k, 20 - 4 * k))).toBe(false);
    expect(g.isWalkable(g.cellIndex(20 - 4 * k, 20 + 4 * k))).toBe(false);
    // The unrotated corner (24.5, 20.5) is off the diagonal bar and stays walkable.
    expect(g.isWalkable(g.cellIndex(24.5, 22.5))).toBe(true);
    expect(g.isWalkable(g.cellIndex(15.5, 17.5))).toBe(true);
  });

  it('ignores open structures, rooftop props and footprints wholly outside the block', () => {
    const r = blockGridDef(
      block,
      [box('fence', 20, 20, 10, 10, 0, { mode: 'open' }), box('chimney', 10, 10, 2, 2, 0, { inside: 'roof' }), box('far', 100, 100, 10, 10)],
      flat,
    );
    if (!('def' in r)) throw new Error(r.skipped);
    expect(r.def.blockedOriented).toEqual([]);
  });

  it('counts an enterable structure as wholly blocking', () => {
    const r = blockGridDef(block, [box('hut', 20, 20, 6, 6, 0, { mode: 'enterable' })], flat);
    if (!('def' in r)) throw new Error(r.skipped);
    expect(r.def.blockedOriented).toHaveLength(1);
  });

  it('skips a block whose ground varies more than 0.6 m, and keeps one at 0.6 m', () => {
    const r = blockGridDef(block, [], (x) => (x > 39 ? 5.7 : 5));
    expect(r).toEqual({ skipped: expect.stringContaining('0.70') });
    expect('def' in blockGridDef(block, [], (x) => (x > 39 ? 5.6 : 5))).toBe(true);
    expect('skipped' in blockGridDef(block, [], () => Number.NaN)).toBe(true);
  });

  it('throws when a block is over the cell cap', () => {
    expect(() => blockGridDef({ id: 'huge', rect: { x0: 0, z0: 0, x1: 400, z1: 400 } }, [], flat)).toThrow(/over the cap/);
  });
});
