import { describe, expect, it } from 'vitest';
import { centripetal, WyrmSpine } from './spine';

const DT = 1 / 60;

function at(s: WyrmSpine, i: number) {
  return { x: s.positions[i * 3]!, y: s.positions[i * 3 + 1]!, z: s.positions[i * 3 + 2]! };
}

/** Walks the head from `from` along `dir` at `speed` for `seconds`. */
function walk(s: WyrmSpine, from: { x: number; z: number }, dir: { x: number; z: number }, speed: number, seconds: number) {
  const n = Math.round(seconds / DT);
  let x = from.x;
  let z = from.z;
  for (let k = 0; k < n; k++) {
    x += dir.x * speed * DT;
    z += dir.z * speed * DT;
    s.step(DT, { x, y: 1, z }, { speed, flying: false });
  }
  return { x, z };
}

describe('WyrmSpine', () => {
  it('rejects bad sizes', () => {
    expect(() => new WyrmSpine(1, 6)).toThrow();
    expect(() => new WyrmSpine(28, 0)).toThrow();
    expect(() => new WyrmSpine(28, Number.NaN)).toThrow();
  });

  it('lays the body straight behind the head on reset, at equal arc spacing', () => {
    const s = new WyrmSpine(28, 6);
    s.reset({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 });
    expect(at(s, 0)).toEqual({ x: 0, y: 1, z: 0 });
    for (let i = 1; i < 28; i++) {
      const a = at(s, i - 1);
      const b = at(s, i);
      expect(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)).toBeCloseTo(6 / 27, 3);
      expect(b.x).toBeCloseTo(0, 6);
    }
    expect(at(s, 27).z).toBeCloseTo(6, 3);
    // Tangents point toward the head (-Z here).
    expect(s.tangents[2 * 3 + 2]).toBeCloseTo(-1, 5);
  });

  it('segment 0 sits at the head, and after a straight walk the tail lies the body length behind on that line', () => {
    const s = new WyrmSpine(28, 6);
    s.reset({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 });
    const end = walk(s, { x: 0, z: 0 }, { x: 1, z: 0 }, 4, 4);
    expect(at(s, 0).x).toBeCloseTo(end.x, 6);
    const tail = at(s, 27);
    // The gait sways sideways (z) a little; along the path the tail is about 6 m behind.
    expect(end.x - tail.x).toBeGreaterThan(5.4);
    expect(end.x - tail.x).toBeLessThan(6.05);
    expect(Math.abs(tail.z)).toBeLessThan(0.6);
  });

  it('follows the path through a U-turn instead of cutting straight back', () => {
    const s = new WyrmSpine(28, 6);
    s.reset({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 });
    let p = walk(s, { x: 0, z: 0 }, { x: 0, z: -1 }, 4, 3);
    // A tight 180 degree turn (radius 1.5 m), then 1 m back.
    for (let k = 0; k <= 60; k++) {
      const a = (k / 60) * Math.PI;
      s.step(DT, { x: p.x + 1.5 - 1.5 * Math.cos(a), y: 1, z: p.z - 1.5 * Math.sin(a) }, { speed: 4, flying: false });
    }
    p = { x: p.x + 3, z: p.z };
    walk(s, p, { x: 0, z: 1 }, 4, 0.25);
    // The middle of the body is still out on the turn, east of the straight line between head and tail would be.
    const mid = at(s, 14);
    const head = at(s, 0);
    expect(head.x).toBeCloseTo(3, 1);
    expect(mid.x).toBeLessThan(2.6);
    expect(mid.z).toBeLessThan(head.z + 0.1);
  });

  it('a jump of more than the reset distance lays the body straight again', () => {
    const s = new WyrmSpine(28, 6);
    s.reset({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 });
    walk(s, { x: 0, z: 0 }, { x: 0, z: -1 }, 3, 1);
    s.step(DT, { x: 50, y: 1, z: 50 }, { speed: 0, flying: false });
    expect(at(s, 0)).toEqual({ x: 50, y: 1, z: 50 });
    const tail = at(s, 27);
    expect(Math.hypot(tail.x - 50, tail.z - 50)).toBeCloseTo(6, 1);
  });

  it('the gait is zero at the head and largest toward the tail; at rest it still sways without drifting', () => {
    const s = new WyrmSpine(28, 6);
    s.reset({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 });
    let maxNeck = 0;
    let maxTail = 0;
    const base = at(s, 27);
    for (let k = 0; k < 600; k++) {
      s.step(DT, { x: 0, y: 1, z: 0 }, { speed: 0, flying: false });
      maxNeck = Math.max(maxNeck, Math.abs(at(s, 2).x));
      maxTail = Math.max(maxTail, Math.abs(at(s, 27).x));
    }
    expect(at(s, 0).x).toBe(0);
    expect(maxNeck).toBeLessThan(maxTail);
    expect(maxTail).toBeGreaterThan(0.01);
    // Sway is an offset, not a drift: the tail stays put along the body.
    expect(at(s, 27).z).toBeCloseTo(base.z, 1);
  });

  it('flying swaps most of the sideways wave for a vertical one', () => {
    const ground = new WyrmSpine(28, 6);
    const air = new WyrmSpine(28, 6);
    for (const s of [ground, air]) s.reset({ x: 0, y: 5, z: 0 }, { x: 0, y: 0, z: 1 });
    let gx = 0;
    let gy = 0;
    let ax = 0;
    let ay = 0;
    for (let k = 0; k < 300; k++) {
      ground.step(DT, { x: 0, y: 5, z: 0 }, { speed: 6, flying: false });
      air.step(DT, { x: 0, y: 5, z: 0 }, { speed: 6, flying: true });
      gx = Math.max(gx, Math.abs(at(ground, 27).x));
      gy = Math.max(gy, Math.abs(at(ground, 27).y - 5));
      ax = Math.max(ax, Math.abs(at(air, 27).x));
      ay = Math.max(ay, Math.abs(at(air, 27).y - 5));
    }
    expect(gy).toBeLessThan(1e-9);
    expect(ay).toBeGreaterThan(0.05);
    expect(ax).toBeLessThan(gx);
  });

  it('never produces NaN: a degenerate reset direction, a zero step, a non-finite head', () => {
    const s = new WyrmSpine(8, 2);
    s.reset({ x: 1, y: 1, z: 1 }, { x: 0, y: 0, z: 0 });
    s.step(0, { x: 1, y: 1, z: 1 }, { speed: 0, flying: false });
    s.step(DT, { x: Number.NaN, y: 1, z: 1 }, { speed: Number.NaN, flying: false });
    s.step(DT, { x: 1, y: 1, z: 1 }, { speed: -3, flying: true });
    for (const v of s.positions) expect(Number.isFinite(v)).toBe(true);
    for (const v of s.tangents) expect(Number.isFinite(v)).toBe(true);
  });

  it('a fresh spine with no reset lays itself straight on its first step', () => {
    const s = new WyrmSpine(10, 3);
    s.step(DT, { x: 4, y: 0, z: 4 }, { speed: 0, flying: false });
    expect(at(s, 0)).toEqual({ x: 4, y: 0, z: 4 });
    expect(at(s, 9).z).toBeCloseTo(7, 3);
  });

  it('is deterministic', () => {
    const a = new WyrmSpine(28, 6);
    const b = new WyrmSpine(28, 6);
    for (const s of [a, b]) {
      s.reset({ x: 0, y: 1, z: 0 });
      walk(s, { x: 0, z: 0 }, { x: 0.6, z: -0.8 }, 5, 2);
    }
    expect([...a.positions]).toEqual([...b.positions]);
  });

  it('the centripetal curve passes through its control points', () => {
    const p0 = { x: -1, y: 0, z: 0 };
    const p1 = { x: 0, y: 0, z: 0 };
    const p2 = { x: 1, y: 0.5, z: 2 };
    const p3 = { x: 3, y: 0, z: 2 };
    const s = centripetal(p0, p1, p2, p3, 0);
    const e = centripetal(p0, p1, p2, p3, 1);
    expect(s.x).toBeCloseTo(0, 9);
    expect(e.x).toBeCloseTo(1, 9);
    expect(e.y).toBeCloseTo(0.5, 9);
    expect(e.z).toBeCloseTo(2, 9);
  });

  it('in flight a climb carries the body level; on the ground the body follows the slope', () => {
    const air = new WyrmSpine(28, 6);
    air.reset({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 });
    for (let k = 1; k <= 60; k++) air.step(DT, { x: 0, y: 1 + (5 * k) / 60, z: 0 }, { speed: 0, flying: true });
    // Head-up at first, then it levels off while hovering.
    expect(at(air, 27).y).toBeGreaterThan(4.5);
    for (let k = 0; k < 300; k++) air.step(DT, { x: 0, y: 6, z: 0 }, { speed: 0, flying: true });
    expect(Math.abs(at(air, 27).y - 6)).toBeLessThan(0.15);
    const ground = new WyrmSpine(28, 6);
    ground.reset({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    for (let k = 1; k <= 120; k++) ground.step(DT, { x: 0, y: k * 0.02, z: -k * 0.05 }, { speed: 3, flying: false });
    expect(at(ground, 27).y).toBeLessThan(at(ground, 0).y - 1.5);
  });
});
