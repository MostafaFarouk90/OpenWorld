// The block grids against the city's real Rapier colliders (thread 17's buildCity), so the footprint rotation and padding
// are checked against what the player actually collides with, not against the grid's own formula.
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildCity } from '../../harrowmark/cityBuild';
import { HARROWMARK_LAYOUT } from '../../harrowmark/harrowmark.layout';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { heightAt } from '../../terrain/heightfield';
import { NavGrid } from '../NavGrid';
import { blockGridDef, CITY_NAV_BLOCKS } from './blocks';

let physics: PhysicsWorld;
const grids: NavGrid[] = [];
beforeAll(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  buildCity({ scene: new THREE.Scene(), physics: physics as never, rapier: physics.rapier! }, HARROWMARK_LAYOUT.structures, heightAt);
  physics.world.step();
  for (const b of CITY_NAV_BLOCKS) {
    const r = blockGridDef(b, HARROWMARK_LAYOUT.structures, heightAt);
    if (!('def' in r)) throw new Error(`${b.id}: ${r.skipped}`);
    grids.push(new NavGrid(r.def));
  }
});

/** Biggest component of each grid. */
const mainComponent = (g: NavGrid): number => {
  const count = new Map<number, number>();
  for (let i = 0; i < g.cols * g.rows; i++) if (g.isWalkable(i)) count.set(g.component(i), (count.get(g.component(i)) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]![0];
};

describe('city block grids vs the built city', () => {
  it('has no walkable cell centre inside a collider or within 0.45 m of one, at waist height', () => {
    const c = { x: 0, y: 0, z: 0 };
    for (const g of grids) {
      let walkable = 0;
      for (let i = 0; i < g.cols * g.rows; i++) {
        if (!g.isWalkable(i)) continue;
        walkable++;
        g.cellCentre(i, c);
        const at = { x: c.x, y: heightAt(c.x, c.z) + 1, z: c.z };
        const pr = physics.world.projectPoint(at, false);
        const d = pr ? Math.hypot(pr.point.x - at.x, pr.point.y - at.y, pr.point.z - at.z) : Infinity;
        expect(pr?.isInside ? 0 : d, `${g.id} (${c.x}, ${c.z})`).toBeGreaterThanOrEqual(0.45);
      }
      expect(walkable, g.id).toBeGreaterThan(5000);
    }
  });

  it('puts every ground-level anchor in a block on a walkable cell of its main component, 0.4 m clear', () => {
    let checked = 0;
    for (const g of grids) {
      const main = mainComponent(g);
      for (const a of HARROWMARK_LAYOUT.anchors) {
        if (a.x < g.minX || a.x >= g.maxX || a.z < g.minZ || a.z >= g.maxZ) continue;
        // Elevated anchors (banners, roofs) are out of the grid's band; crowd lanes never use nav.
        if (a.dy || a.tags?.includes('lane')) continue;
        const i = g.cellIndex(a.x, a.z);
        expect(g.isWalkable(i), `${a.id} walkable in ${g.id}`).toBe(true);
        expect(g.clearance(i), `${a.id} clearance`).toBeGreaterThanOrEqual(0.4);
        expect(g.component(i), `${a.id} in the main component`).toBe(main);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(60);
  });
});
