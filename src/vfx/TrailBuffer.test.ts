import { describe, expect, it } from 'vitest';
import { TrailBuffer } from './TrailBuffer';
import { CAPS } from './tuning';

const h = (x: number) => ({ x, y: 0, z: 0 });
const t = (x: number) => ({ x, y: 1, z: 0 });
const bufs = () => [new Float32Array(CAPS.trailSegments * 6), new Float32Array(CAPS.trailSegments * 2)] as const;

describe('TrailBuffer', () => {
  it('empty buffer writes 0', () => {
    const [p, a] = bufs();
    expect(new TrailBuffer(0.2).write(p, a)).toBe(0);
  });
  it('writes freshest first', () => {
    const b = new TrailBuffer(1);
    b.push(h(1), t(1), 0);
    b.push(h(2), t(2), 0.1);
    const [p, a] = bufs();
    expect(b.write(p, a)).toBe(4);
    expect(p[0]).toBe(2);
    expect(p[3]).toBe(2);
    expect(p[6]).toBe(1);
    expect(a[0]).toBeCloseTo(0);
    expect(a[2]).toBeCloseTo(0.1);
  });
  it('wraps past 24 pushes keeping the freshest 24', () => {
    const b = new TrailBuffer(100);
    for (let i = 0; i < 30; i++) b.push(h(i), t(i), i * 0.001);
    expect(b.length).toBe(24);
    const [p, a] = bufs();
    expect(b.write(p, a)).toBe(48);
    expect(p[0]).toBe(29);
    expect(p[23 * 6]).toBe(6);
  });
  it('drops non-finite coordinates', () => {
    const b = new TrailBuffer(1);
    b.push({ x: NaN, y: 0, z: 0 }, t(1), 0);
    b.push(h(1), { x: 0, y: Infinity, z: 0 }, 0);
    b.push(h(1), t(1), NaN);
    expect(b.length).toBe(0);
  });
  it('ages and collapses old segments; boundary is live', () => {
    const b = new TrailBuffer(0.2);
    b.push(h(1), t(1), 0);
    b.push(h(2), t(2), 0.1);
    b.age(0.2);
    expect(b.length).toBe(2);
    b.age(0.25);
    expect(b.length).toBe(1);
    const [p, a] = bufs();
    expect(b.write(p, a)).toBe(2);
    expect(p[0]).toBe(2);
    b.age(1);
    expect(b.length).toBe(0);
    expect(b.write(p, a)).toBe(0);
  });
  it('a pair that stops arriving mid-swing lets the tail fade out', () => {
    const b = new TrailBuffer(0.2);
    for (let i = 0; i < 5; i++) b.push(h(i), t(i), i * 0.02);
    const [p, a] = bufs();
    let prev = b.length;
    for (let now = 0.1; now < 0.5; now += 0.02) {
      b.age(now);
      expect(b.length).toBeLessThanOrEqual(prev);
      prev = b.length;
    }
    expect(b.write(p, a)).toBe(0);
  });
  it('write respects small output arrays', () => {
    const b = new TrailBuffer(1);
    for (let i = 0; i < 5; i++) b.push(h(i), t(i), 0);
    expect(b.write(new Float32Array(12), new Float32Array(4))).toBe(4);
  });
});
