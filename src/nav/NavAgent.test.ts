import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Vec3 } from '../physics/PhysicsWorld';
import { NavAgent } from './NavAgent';

const P = (x: number, z: number): Vec3 => ({ x, y: 0, z });

function fakeNav(over: { path?: (from: Vec3, to: Vec3) => Vec3[] | null; grid?: boolean } = {}) {
  const calls: Array<{ from: Vec3; to: Vec3 }> = [];
  const nav = {
    hasGrid: () => over.grid ?? true,
    path: vi.fn((from: Vec3, to: Vec3, _opts?: { radius?: number }) => {
      calls.push({ from, to });
      return over.path ? over.path(from, to) : [P(2, 0), P(4, 0), to];
    }),
  };
  return { nav, calls };
}

afterEach(() => vi.restoreAllMocks());

describe('NavAgent', () => {
  it('returns null for a null target and never queries', () => {
    const { nav } = fakeNav();
    const a = new NavAgent(() => nav);
    expect(a.desired(P(0, 0), null, 0.016)).toBeNull();
    expect(nav.path).not.toHaveBeenCalled();
  });

  it('passes the raw target through with no nav service or no grid', () => {
    const none = new NavAgent(() => undefined);
    expect(none.desired(P(0, 0), P(9, 9), 0.1)).toEqual({ x: 9, z: 9 });
    expect(none.onGrid).toBe(false);
    const { nav } = fakeNav({ grid: false });
    const off = new NavAgent(() => nav);
    expect(off.desired(P(0, 0), P(9, 9), 0.1)).toEqual({ x: 9, z: 9 });
    expect(off.onGrid).toBe(false);
    expect(nav.path).not.toHaveBeenCalled();
  });

  it('steers at waypoints and advances past reached ones', () => {
    const { nav } = fakeNav();
    const a = new NavAgent(() => nav);
    expect(a.desired(P(0, 0), P(6, 0), 0.016)).toEqual({ x: 2, z: 0 });
    expect(a.onGrid).toBe(true);
    expect(a.waypoints).toHaveLength(3);
    expect(a.desired(P(1.5, 0), P(6, 0), 0.016)).toEqual({ x: 4, z: 0 }); // within 0.6 of (2, 0)
    expect(a.desired(P(3.6, 0), P(6, 0), 0.016)).toEqual({ x: 6, z: 0 });
    expect(a.desired(P(5.8, 0), P(6, 0), 0.016)).toEqual({ x: 6, z: 0 }); // exhausted: the target
    expect(nav.path).toHaveBeenCalledTimes(1);
  });

  it('repaths after the target moves more than 1 m, and only on the timer otherwise', () => {
    const { nav } = fakeNav();
    const a = new NavAgent(() => nav);
    a.desired(P(0, 0), P(6, 0), 0.1);
    a.desired(P(0, 0), P(6.5, 0), 0.1);
    expect(nav.path).toHaveBeenCalledTimes(1);
    a.desired(P(0, 0), P(7.2, 0), 0.1);
    expect(nav.path).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 4; i++) a.desired(P(0, 0), P(7.2, 0), 0.1);
    expect(nav.path).toHaveBeenCalledTimes(2);
    a.desired(P(0, 0), P(7.2, 0), 0.1); // 0.5 s elapsed
    expect(nav.path).toHaveBeenCalledTimes(3);
  });

  it('falls back to the raw target on a null path, without hammering the service', () => {
    const { nav } = fakeNav({ path: () => null });
    const a = new NavAgent(() => nav);
    expect(a.desired(P(0, 0), P(6, 0), 0.1)).toEqual({ x: 6, z: 0 });
    expect(a.desired(P(0, 0), P(6, 0), 0.1)).toEqual({ x: 6, z: 0 });
    expect(nav.path).toHaveBeenCalledTimes(1);
    expect(a.waypoints).toHaveLength(0);
  });

  it('catches a throwing path, warns once and uses the raw target', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { nav } = fakeNav({
      path: () => {
        throw new Error('boom');
      },
    });
    const a = new NavAgent(() => nav);
    expect(a.desired(P(0, 0), P(6, 0), 0.1)).toEqual({ x: 6, z: 0 });
    a.reset();
    expect(a.desired(P(0, 0), P(6, 0), 0.1)).toEqual({ x: 6, z: 0 });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('reset() forces a repath', () => {
    const { nav } = fakeNav();
    const a = new NavAgent(() => nav);
    a.desired(P(0, 0), P(6, 0), 0.01);
    a.desired(P(0, 0), P(6, 0), 0.01);
    expect(nav.path).toHaveBeenCalledTimes(1);
    a.reset();
    expect(a.waypoints).toHaveLength(0);
    a.desired(P(0, 0), P(6, 0), 0.01);
    expect(nav.path).toHaveBeenCalledTimes(2);
  });

  it('passes the configured radius', () => {
    const { nav } = fakeNav();
    const a = new NavAgent(() => nav, { radius: 0.7 });
    a.desired(P(0, 0), P(6, 0), 0.1);
    expect(nav.path.mock.calls[0]![2]).toEqual({ radius: 0.7 });
  });
});
