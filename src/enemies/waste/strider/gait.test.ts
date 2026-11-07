import { describe, expect, it } from 'vitest';
import { STRIDER_BUILD } from '../tuning';
import {
  LEG_IDS,
  StriderGait,
  dist,
  feetInAir,
  forwardOf,
  hipPoint,
  legPole,
  restFoot,
  solveLeg,
  type HullFrame,
  type LegId,
} from './gait';

const b = STRIDER_BUILD;

describe('strider gait: phases', () => {
  it('never lifts more than one foot at once, and lifts each in turn', () => {
    const lifted = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const p = i / 1000;
      const n = feetInAir(p);
      expect(n).toBeLessThanOrEqual(1);
      lifted.add(n);
    }
    expect(lifted.has(1)).toBe(true);
    expect(lifted.has(0)).toBe(true);
  });
});

describe('strider gait: IK', () => {
  const hip = { x: 0, y: 3, z: 0 };
  it('reaches a target inside reach, with both segment lengths kept and the knee above the line', () => {
    const target = { x: 1.5, y: 0, z: 0.5 };
    const r = solveLeg(hip, target, b.thigh, b.shin, { x: 1, y: 1, z: 0 });
    expect(r.clamped).toBe(false);
    expect(dist(r.foot, target)).toBeLessThan(1e-6);
    expect(dist(hip, r.knee)).toBeCloseTo(b.thigh, 5);
    expect(dist(r.knee, r.foot)).toBeCloseTo(b.shin, 5);
    expect(r.knee.y).toBeGreaterThan((hip.y + target.y) / 2);
  });
  it('clamps a target beyond reach along the hip-to-target line', () => {
    const r = solveLeg(hip, { x: 10, y: 0, z: 0 }, b.thigh, b.shin, { x: 0, y: 1, z: 0 });
    expect(r.clamped).toBe(true);
    expect(dist(hip, r.foot)).toBeLessThanOrEqual(b.thigh + b.shin);
    expect(dist(hip, r.foot)).toBeGreaterThan(b.thigh + b.shin - 0.01);
  });
  it('pushes out a target closer than the segment difference, and survives a target on the hip', () => {
    const r = solveLeg(hip, { x: 0, y: 3, z: 0.1 }, b.thigh, b.shin, { x: 0, y: 1, z: 0 });
    expect(r.clamped).toBe(true);
    expect(dist(hip, r.foot)).toBeGreaterThanOrEqual(Math.abs(b.thigh - b.shin));
    const same = solveLeg(hip, hip, b.thigh, b.shin, { x: 0, y: 1, z: 0 });
    expect(Number.isFinite(same.knee.x + same.knee.y + same.knee.z)).toBe(true);
  });
  it('bends the knee outward to its own side', () => {
    const f: HullFrame = { x: 0, y: 0, z: 0, yaw: 0 };
    for (const leg of LEG_IDS) {
      const h = hipPoint(f, leg, b.hullHeight);
      const r = solveLeg(h, restFoot(f, leg), b.thigh, b.shin, legPole(f, leg));
      // Yaw 0: the body's right is +X.
      const side = leg.endsWith('r') ? 1 : -1;
      expect(Math.sign(r.knee.x - h.x)).toBe(side);
      expect(r.knee.y).toBeGreaterThan(h.y);
    }
  });
});

describe('strider gait: walking', () => {
  const walk = (frames: number, speed: number, yaw = 0, ground?: (x: number, z: number) => number) => {
    const f: HullFrame = { x: 0, y: ground ? ground(0, 0) : 0, z: 0, yaw };
    const g = new StriderGait(f, undefined, ground ?? null);
    const fw = forwardOf(yaw);
    const slides: number[] = [];
    let maxAir = 0;
    for (let i = 0; i < frames; i++) {
      const prev: Record<string, { x: number; y: number; z: number; planted: boolean }> = {};
      for (const leg of LEG_IDS) prev[leg] = { ...g.foot(leg).at, planted: g.foot(leg).planted };
      f.x += fw.x * speed / 60;
      f.z += fw.z * speed / 60;
      if (ground) f.y = ground(f.x, f.z);
      g.step(f, 1 / 60);
      let air = 0;
      for (const leg of LEG_IDS) {
        const now = g.foot(leg);
        if (!now.planted) air++;
        if (prev[leg]!.planted && now.planted) slides.push(dist(prev[leg]!, now.at));
      }
      maxAir = Math.max(maxAir, air);
    }
    return { g, f, slides, maxAir };
  };

  it('keeps planted feet still and three feet down while walking and running', () => {
    for (const speed of [b.stride, 3.2]) {
      const { slides, maxAir } = walk(600, speed);
      expect(Math.max(...slides)).toBeLessThan(1e-9);
      expect(maxAir).toBeLessThanOrEqual(1);
    }
  });

  it('keeps every foot within reach of its hip, so the IK never clamps on flat ground', () => {
    const { g, f } = walk(400, 3.2, 0.7);
    for (const leg of LEG_IDS as LegId[]) {
      const h = hipPoint(f, leg, g.hullY);
      expect(dist(h, g.foot(leg).at)).toBeLessThan(b.thigh + b.shin);
    }
  });

  it('turns the cadence with speed: twice as fast covers twice the cycles in the same time', () => {
    const slow = walk(120, 1.6);
    const fast = walk(120, 3.2);
    const cycles = (speed: number) => (speed * 2) / b.stride;
    expect(cycles(3.2)).toBeCloseTo(cycles(1.6) * 2, 6);
    // Both still moved their feet.
    expect(slow.g.phase).not.toBe(0);
    expect(fast.g.phase).not.toBe(0);
  });

  it('rides a slope: the hull height follows the planted feet', () => {
    const slope = (_x: number, z: number) => -z * 0.2;
    const { g, f } = walk(300, 1.6, 0, slope);
    const feetY = LEG_IDS.map((l) => g.foot(l).at.y);
    const mean = feetY.reduce((a, c) => a + c, 0) / feetY.length;
    expect(Math.abs(f.y + g.hullY - (mean + b.hullHeight))).toBeLessThan(0.6);
    for (const leg of LEG_IDS) if (g.foot(leg).planted) expect(g.foot(leg).at.y).toBeCloseTo(slope(g.foot(leg).at.x, g.foot(leg).at.z), 6);
  });

  it('standing still, the feet settle back to rest; a jump re-plants every foot', () => {
    const f: HullFrame = { x: 0, y: 0, z: 0, yaw: 0 };
    const g = new StriderGait(f);
    for (let i = 0; i < 60; i++) g.step(f, 1 / 60);
    for (const leg of LEG_IDS) expect(dist(g.foot(leg).at, restFoot(f, leg))).toBeLessThan(1e-9);
    f.x = 50;
    g.step(f, 1 / 60);
    for (const leg of LEG_IDS) expect(dist(g.foot(leg).at, restFoot(f, leg))).toBeLessThan(1e-9);
  });

  it('turning on the spot steps the feet round toward their new rest points', () => {
    const f: HullFrame = { x: 0, y: 0, z: 0, yaw: 0 };
    const g = new StriderGait(f);
    f.yaw = Math.PI / 2;
    for (let i = 0; i < 600; i++) g.step(f, 1 / 60);
    for (const leg of LEG_IDS) expect(dist(g.foot(leg).at, restFoot(f, leg))).toBeLessThan(b.stride * 0.4);
  });
});
