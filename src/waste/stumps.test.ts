// The petrified stumps (PR 1's follow-up): fixed rows, about 600, wood-class (so they thin by quality and hide by range like
// every wood row), none in a lane, a site, a shelter or on a plateau, and both groves filled.
import { describe, expect, it } from 'vitest';
import { classOf, DENSITY } from '../env/PlacementField';
import { LAZY_TILES } from '../env/tiles';
import { ASH_ROAD_POINTS, CALDERA_BOX, SHELTER_PAD_SITES } from '../terrain/shape/waste';
import { nearestRopeDistance } from './ropeDistance';
import { STUMP_CLEAR, STUMP_ID, stumpRefusal, wasteStumpRows } from './stumps';
import { wastePoi, WASTE_SITE_DISCS } from './wasteSites';

const rows = wasteStumpRows();

describe('waste stumps', () => {
  it('are about 600 fixed rows, and the lazy tile w1 serves them', async () => {
    expect(rows.length).toBeGreaterThanOrEqual(550);
    expect(rows.length).toBeLessThanOrEqual(650);
    expect(await LAZY_TILES.w1!()).toEqual(rows);
    expect(JSON.stringify(rows.slice(0, 5))).toMatchInlineSnapshot(
      `"[{"id":"charred-stump","x":9406.2,"z":3454.4,"yaw":328,"scale":0.75},{"id":"charred-stump","x":9224.3,"z":3210.8,"yaw":27,"scale":1.22},{"id":"charred-stump","x":9675,"z":3596.2,"yaw":135,"scale":0.76},{"id":"charred-stump","x":9912.5,"z":3998,"yaw":77,"scale":0.93},{"id":"charred-stump","x":9214.6,"z":3200.1,"yaw":129,"scale":0.74}]"`,
    );
  });

  it('are wood rows: 40% on Low, 80% on Medium, all on High', () => {
    expect(classOf(STUMP_ID)).toBe('wood');
    expect([DENSITY.low.wood, DENSITY.medium.wood, DENSITY.high.wood]).toEqual([0.4, 0.8, 1]);
  });

  it('keep off the rope-lines, the Ash Road, the sites, the shelters and the Caldera', () => {
    for (const r of rows) {
      expect(nearestRopeDistance(r.x, r.z)).toBeGreaterThanOrEqual(STUMP_CLEAR.rope);
      expect(r.x > CALDERA_BOX.x0 && r.x < CALDERA_BOX.x1 && r.z > CALDERA_BOX.z0 && r.z < CALDERA_BOX.z1).toBe(false);
      for (const s of WASTE_SITE_DISCS) expect(Math.hypot(r.x - s.at[0], r.z - s.at[1])).toBeGreaterThan(s.radius);
      for (const [, x, z] of SHELTER_PAD_SITES) expect(Math.hypot(r.x - x, r.z - z)).toBeGreaterThanOrEqual(STUMP_CLEAR.shelter - 0.1);
    }
    const road = (x: number, z: number) =>
      Math.min(
        ...ASH_ROAD_POINTS.slice(1).map((b, i) => {
          const a = ASH_ROAD_POINTS[i]!;
          const dx = b[0] - a[0];
          const dz = b[1] - a[1];
          const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
          return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
        }),
      );
    for (const r of rows) expect(road(r.x, r.z)).toBeGreaterThanOrEqual(STUMP_CLEAR.road - 0.1);
  });

  it('fill both stump groves and leave room round their tall trunks', () => {
    for (const id of ['stumps.1', 'stumps.2']) {
      const p = wastePoi(id);
      const inside = rows.filter((r) => Math.hypot(r.x - p.at[0], r.z - p.at[1]) <= p.radius);
      expect(inside.length, id).toBeGreaterThanOrEqual(40);
      for (const r of inside) expect(Math.hypot(r.x - p.at[0], r.z - p.at[1])).toBeGreaterThanOrEqual(3);
    }
  });

  it('refuse a spot on a rope-line and the Crossing pad, and allow open ground', () => {
    expect(stumpRefusal(10460, 5300)).not.toBeNull();
    expect(stumpRefusal(12000, 4800)).toBeNull();
  });
});
