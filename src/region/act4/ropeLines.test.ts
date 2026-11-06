// Act 4 thread L1: the rope-lines, shelters and posts (plans/act4-L1.md section 7).
import { describe, expect, it } from 'vitest';
import { heightAt } from '../../terrain/heightfield';
import { ASHGATE, CALDERA_BOX, CINDER_CHAPEL, CROSSING, GLASSLANDS, HUSK_CATHEDRAL, R24_SPRING, RIMFOOT, WALKER_CAMP, WASTE_BOX, type XZ } from '../../terrain/shape/waste';
import {
  CROSSING_SHELTER_ID,
  nearestRope,
  NEAREST_ROPE_LIMIT,
  onRopeLane,
  pointAt,
  POST_SPACING,
  ROPE_LANE_HALF_WIDTH,
  ROPE_ANCHORS,
  ROPE_LINE_GEOMS,
  ROPE_LINES,
  ropeLine,
  ropeLineLength,
  ropePosts,
  SHELTER_MAX_SPACING,
  SHELTER_SPOTS,
  SHELTERS,
} from './ropeLines';
import { ACT4_WORLD_LAYOUT } from './act4World.layout';

const near = (p: readonly [number, number], q: XZ, m = 40) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= m;
const first = (id: Parameters<typeof ropeLine>[0]) => ropeLine(id).points[0];
const last = (id: Parameters<typeof ropeLine>[0]) => ropeLine(id).points[ropeLine(id).points.length - 1];
const inCaldera = (x: number, z: number) => x >= CALDERA_BOX.x0 && x < CALDERA_BOX.x1 && z >= CALDERA_BOX.z0 && z < CALDERA_BOX.z1;

describe('rope-lines', () => {
  it('join the sites the brief names, the Crossing joining the camp line to the Cinder Road North', () => {
    expect(near(first('rope.ashgate-camp'), ASHGATE)).toBe(true);
    expect(near(last('rope.ashgate-camp'), WALKER_CAMP, 1)).toBe(true);
    expect(near(last('rope.camp-chapel'), CINDER_CHAPEL, 1)).toBe(true);
    expect(near(last('rope.camp-crossing'), CROSSING, 1)).toBe(true);
    expect(ropeLine('rope.camp-crossing').points).toContainEqual(R24_SPRING);
    expect(near(first('rope.crossing-glasslands'), CROSSING, 1)).toBe(true);
    expect(near(last('rope.crossing-glasslands'), GLASSLANDS, 1)).toBe(true);
    expect(near(last('rope.glasslands-cathedral'), HUSK_CATHEDRAL, 1)).toBe(true);
    expect(near(first('rope.cinder-road-north'), ASHGATE)).toBe(true);
    expect(ropeLine('rope.cinder-road-north').points).toContainEqual(CROSSING);
    expect(near(last('rope.cinder-road-north'), RIMFOOT, 1)).toBe(true);
  });

  it('total about 14 km and stay inside the open Waste (or Ashgate), never in the Caldera hole', () => {
    const total = ROPE_LINE_GEOMS.reduce((s, l) => s + ropeLineLength(l.id), 0);
    expect(total).toBeGreaterThan(13000);
    expect(total).toBeLessThan(15000);
    for (const l of ROPE_LINE_GEOMS) {
      const len = ropeLineLength(l.id);
      for (let s = 0; s <= len; s += 10) {
        const p = pointAt(l.points, s);
        expect(inCaldera(p.x, p.z), `${l.id} at ${s}`).toBe(false);
        expect(p.z >= 4400 && p.z < WASTE_BOX.z1 - 100 && p.x >= WASTE_BOX.x0 && p.x < WASTE_BOX.x1, `${l.id} at ${s}`).toBe(true);
      }
    }
  });

  it('give the M42 crossing four shelters about 430 m apart', () => {
    const l = ropeLine('rope.ashgate-camp');
    expect(l.shelters).toHaveLength(4);
    const arcs = l.shelters.map((id) => SHELTER_SPOTS.find((s) => s.id === id)!.arc);
    for (let i = 1; i < arcs.length; i++) expect(arcs[i] - arcs[i - 1]).toBeCloseTo(ropeLineLength(l.id) / 5, 0);
  });
});

describe('shelters', () => {
  it('number about 25, with unique ids, every one on a line that lists it', () => {
    expect(SHELTER_SPOTS.length).toBeGreaterThanOrEqual(22);
    expect(SHELTER_SPOTS.length).toBeLessThanOrEqual(30);
    expect(new Set(SHELTER_SPOTS.map((s) => s.id)).size).toBe(SHELTER_SPOTS.length);
    for (const s of SHELTER_SPOTS) expect(ROPE_LINE_GEOMS.some((l) => l.shelters.includes(s.id)), s.id).toBe(true);
    for (const l of ROPE_LINE_GEOMS) expect(new Set(l.shelters).size, l.id).toBe(l.shelters.length);
  });

  it('are never more than 500 m apart along a line, counting its ends', () => {
    for (const l of ROPE_LINE_GEOMS) {
      const len = ropeLineLength(l.id);
      // The Crossing's arc is per line: recompute it on this line.
      const fixed = l.shelters.map((id) => {
        if (id !== CROSSING_SHELTER_ID) return SHELTER_SPOTS.find((s) => s.id === id)!.arc;
        let best = Infinity;
        let arc = 0;
        for (let s = 0; s <= len; s += 1) {
          const p = pointAt(l.points, s);
          const d = Math.hypot(p.x - CROSSING[0], p.z - CROSSING[1]);
          if (d < best) {
            best = d;
            arc = s;
          }
        }
        return arc;
      });
      const all = [0, ...fixed, len].sort((a, b) => a - b);
      for (let i = 1; i < all.length; i++) expect(all[i] - all[i - 1], `${l.id} leg ${i}`).toBeLessThanOrEqual(SHELTER_MAX_SPACING + 1);
    }
  });

  it('stand off the lane, on ground no steeper than a plateau blend, outside the Caldera hole', () => {
    for (const s of SHELTER_SPOTS) {
      expect(onRopeLane(s.at.x, s.at.z), s.id).toBe(false);
      expect(inCaldera(s.at.x, s.at.z), s.id).toBe(false);
      const h = heightAt(s.at.x, s.at.z);
      const slope = Math.max(Math.abs(heightAt(s.at.x + 3, s.at.z) - h), Math.abs(heightAt(s.at.x, s.at.z + 3) - h)) / 3;
      expect(slope, s.id).toBeLessThan(0.6);
    }
  });
});

describe('posts', () => {
  it('stand every 25 m along each line, about 560 in all, none inside a shelter', () => {
    let total = 0;
    for (const l of ROPE_LINE_GEOMS) {
      const posts = ropePosts(l.id);
      total += posts.length;
      expect(posts.length, l.id).toBeGreaterThan(ropeLineLength(l.id) / POST_SPACING - 3);
      for (const p of posts) for (const s of SHELTER_SPOTS) expect(Math.hypot(p.x - s.at.x, p.z - s.at.z)).toBeGreaterThan(s.radius);
    }
    expect(total).toBeGreaterThan(500);
    expect(total).toBeLessThan(620);
  });
});

describe('nearestRope', () => {
  it('matches a brute-force search on 2,000 seeded points', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2000; i++) {
      const x = 7000 + rand() * 8000;
      const z = 4300 + rand() * 6700;
      let best = Infinity;
      for (const l of ROPE_LINE_GEOMS) {
        for (let k = 1; k < l.points.length; k++) {
          const [ax, az] = l.points[k - 1];
          const [bx, bz] = l.points[k];
          const dx = bx - ax;
          const dz = bz - az;
          const t = Math.min(Math.max(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0), 1);
          best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
        }
      }
      const got = nearestRope(x, z);
      if (best <= NEAREST_ROPE_LIMIT) expect(got?.distance).toBeCloseTo(best, 6);
      else expect(got).toBeNull();
    }
  });

  it('puts the lane at 4 m either side of a centreline', () => {
    expect(ROPE_LANE_HALF_WIDTH).toBe(4);
    const p = pointAt(ropeLine('rope.ashgate-camp').points, 700);
    expect(onRopeLane(p.x, p.z)).toBe(true);
    expect(onRopeLane(p.x - p.dz * 3.9, p.z + p.dx * 3.9)).toBe(true);
    expect(onRopeLane(p.x - p.dz * 4.5, p.z + p.dx * 4.5)).toBe(false);
    expect(nearestRope(0, 0)).toBeNull();
  });
});

describe("L0's contract shapes", () => {
  it('name anchors that sit on the geometry, all in the Act 4 world layout', () => {
    const anchors = new Map(ACT4_WORLD_LAYOUT.anchors.map((a) => [a.id, a]));
    for (const a of ROPE_ANCHORS) expect(anchors.get(a.id), a.id).toEqual(a);
    expect(ROPE_LINES.map((l) => l.id)).toEqual(ROPE_LINE_GEOMS.map((l) => l.id));
    for (const l of ROPE_LINES) {
      const g = ropeLine(l.id as Parameters<typeof ropeLine>[0]);
      expect(l.shelters).toEqual(g.shelters);
      l.points.forEach((id, i) => expect([anchors.get(id)!.x, anchors.get(id)!.z], id).toEqual([g.points[i][0], g.points[i][1]]));
      for (const s of l.shelters) expect(SHELTERS.some((d) => d.id === s), s).toBe(true);
    }
    for (const s of SHELTERS) {
      const spot = SHELTER_SPOTS.find((p) => p.id === s.id)!;
      expect([anchors.get(s.at)!.x, anchors.get(s.at)!.z]).toEqual([spot.at.x, spot.at.z]);
      expect(s.radius).toBe(spot.radius);
    }
  });
});
