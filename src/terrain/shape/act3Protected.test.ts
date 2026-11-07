// Act 3 thread K1: the shipped ground of Acts 1 and 2 stays bit-equal after the Act 3 shaping (review blocking item 2).
// The shipped shape is WORLD_SHAPE without the Act 3 features; it runs the same code (empty v0.7 lists), so this compares
// the world against the ground 506264a shipped. Only an Act 3 road's own corridor may change it.
import { describe, expect, it } from 'vitest';
import { engineBox, type RegionId } from '../../region/regions';
import { heightAt, shapeBaseHeight, WORLD_SHAPER_OPTIONS } from '../heightfield';
import { buildShaper, type ShapeBox } from '../shaping';
import { ACT3_PLATEAUS, ACT3_PROTECTED_BOXES, ACT3_PROTECTED_REGIONS, ACT3_ROADS } from './act3';
import { detailRelief } from './detailRelief';
import { WORLD_SHAPE } from './index';
import { WASTE_PLATEAUS, WASTE_ROADS } from './waste';
import { CALDERA_PLATEAUS, CALDERA_ROADS, CALDERA_WASTE_SIDE_PLATEAUS } from './caldera';

const shipped = buildShaper(
  {
    suppressions: WORLD_SHAPE.suppressions,
    // Act 4 (L1): the Waste's plateaus and roads are left out too; their reach is skipped below like an Act 3 road's.
    // Act 5 (N1): the Caldera's too (all inside the Waste's box, nowhere near Acts 1 and 2).
    plateaus: WORLD_SHAPE.plateaus.filter((p) => !ACT3_PLATEAUS.includes(p) && !WASTE_PLATEAUS.includes(p) && !CALDERA_PLATEAUS.includes(p) && !CALDERA_WASTE_SIDE_PLATEAUS.includes(p)),
    roads: WORLD_SHAPE.roads.filter((r) => !ACT3_ROADS.includes(r) && !WASTE_ROADS.includes(r) && !CALDERA_ROADS.includes(r)),
  },
  shapeBaseHeight,
  { bounds: WORLD_SHAPER_OPTIONS.bounds, heightRange: WORLD_SHAPER_OPTIONS.heightRange },
);

/** Distance from (x, z) to an Act 3 road's centreline, the shortest over every road. */
function nearestAct3Road(x: number, z: number): number {
  let best = Infinity;
  for (const r of [...ACT3_ROADS, ...WASTE_ROADS]) {
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1];
      const b = r.points[i];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const t = Math.min(Math.max(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0), 1);
      best = Math.min(best, Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)));
    }
  }
  return best;
}
/** A road changes ground at most this far from its centreline (half width plus the widest blend). */
const ROAD_REACH = 6 + 300;

/** Act 4 (L1): a Waste plateau's own reach (the M41 camp outside Harrowmark's north wall). */
const nearWastePlateau = (x: number, z: number): boolean =>
  WASTE_PLATEAUS.some((p) => x >= p.box.minX - p.blend && x <= p.box.maxX + p.blend && z >= p.box.minZ - p.blend && z <= p.box.maxZ + p.blend);

describe('Acts 1 and 2 ground under the Act 3 shaping', () => {
  it('protects every shipped region and the Act 4 Waste', () => {
    expect([...ACT3_PROTECTED_REGIONS].sort()).toEqual(['ashen-waste', 'brightwater', 'cinderreach', 'harrowmark', 'oldsmoke']);
    expect(ACT3_PROTECTED_BOXES).toHaveLength(ACT3_PROTECTED_REGIONS.length);
  });

  // Act 4 (L1): the Waste is Act 4's ground now; waste.test.ts pins that no Act 3 layer reaches it.
  for (const id of (ACT3_PROTECTED_REGIONS as readonly RegionId[]).filter((r) => r !== 'ashen-waste')) {
    it(`a 50 m grid over ${id} matches the shipped ground exactly, outside the Act 3 roads' reach`, () => {
      const b = engineBox(id);
      const box: ShapeBox = { minX: b.x0, maxX: b.x1, minZ: b.z0, maxZ: b.z1 };
      let compared = 0;
      for (let x = box.minX; x <= box.maxX; x += 50) {
        for (let z = box.minZ; z <= box.maxZ; z += 50) {
          if (nearestAct3Road(x, z) < ROAD_REACH || nearWastePlateau(x, z)) continue;
          compared++;
          if (heightAt(x, z) !== shipped.heightAt(x, z) + detailRelief(x, z)) throw new Error(`${id} ground moved at (${x}, ${z})`);
        }
      }
      expect(compared).toBeGreaterThan(1000);
    });
  }
});
