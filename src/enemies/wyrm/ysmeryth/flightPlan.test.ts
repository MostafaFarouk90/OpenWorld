import { describe, expect, it } from 'vitest';
import { PathWalker } from '../large/flightPath';
import { YSMERYTH } from './def';
import { landPath, landSpeed, leavePath, loopPath, loopSpeed } from './flightPlan';

const CENTRE = { x: 100, z: -40 };
const LAND = { x: 100, z: -19 };
const seconds = (path: ReturnType<typeof loopPath>, speed: number) => {
  const w = new PathWalker(path, speed);
  const s = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 };
  let t = 0;
  while (!w.done && t < 120) {
    w.step(1 / 60, s);
    t += 1 / 60;
  }
  return t;
};

describe("Ysmeryth's flight plan (K6a PR 2)", () => {
  it('a loop takes about loopSeconds at loop altitude round the arena centre, under the flight cap', () => {
    const p = loopPath(LAND, 0, CENTRE);
    const v = loopSpeed(p);
    expect(v).toBeLessThanOrEqual(YSMERYTH.flySpeed);
    expect(seconds(p, v)).toBeCloseTo(YSMERYTH.loopSeconds, 0);
    const w = new PathWalker(p, v);
    const s = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 };
    w.step(YSMERYTH.loopSeconds / 2, s);
    expect(s.y).toBeCloseTo(YSMERYTH.loopAltitude, 0);
    expect(Math.hypot(s.x - CENTRE.x, s.z - CENTRE.z)).toBeCloseTo(YSMERYTH.loopRadius, -1);
  });

  it('a landing from anywhere on the loop is down within landWithin, ending on the mark at altitude 0', () => {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const from = { x: CENTRE.x + Math.cos(a) * YSMERYTH.loopRadius, z: CENTRE.z + Math.sin(a) * YSMERYTH.loopRadius };
      const p = landPath(from, YSMERYTH.loopAltitude, LAND);
      expect(seconds(p, landSpeed(p))).toBeLessThanOrEqual(YSMERYTH.landWithin);
      const end = p.points[p.points.length - 1]!;
      expect(end).toMatchObject({ x: LAND.x, y: 0, z: LAND.z });
    }
  });

  it('edge: a landing from right on the mark still makes a valid path; leave climbs away from the player', () => {
    const p = landPath(LAND, 0, LAND);
    expect(p.length).toBeGreaterThan(0);
    expect(Number.isFinite(landSpeed(p))).toBe(true);
    const l = leavePath(LAND, 0, { x: LAND.x, z: LAND.z + 10 }, 80);
    const end = l.points[l.points.length - 1]!;
    expect(end.z).toBeLessThan(LAND.z - 70);
    expect(end.y).toBe(30);
    const same = leavePath(LAND, 0, LAND, 80); // the player right under her: any direction, still finite
    expect(Number.isFinite(same.length)).toBe(true);
  });
});
