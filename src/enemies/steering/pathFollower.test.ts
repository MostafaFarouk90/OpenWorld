import { describe, expect, it, vi } from 'vitest';
import type { NavPort } from '../ports';
import { PathFollower } from './pathFollower';

const at = (x: number, z: number) => ({ x, y: 0, z });

function rig(nav: Partial<NavPort> | undefined) {
  const warn = vi.fn();
  const port = nav as NavPort | undefined;
  return { warn, follower: new PathFollower(() => port, warn) };
}

describe('PathFollower', () => {
  it('returns null without a nav service or outside every grid, silently', () => {
    const none = rig(undefined);
    expect(none.follower.goalFor(0.016, at(0, 0), at(5, 5))).toBeNull();
    const outdoors = rig({ hasGrid: () => false, path: vi.fn() });
    expect(outdoors.follower.goalFor(0.016, at(0, 0), at(5, 5))).toBeNull();
    expect(none.warn).not.toHaveBeenCalled();
    expect(outdoors.warn).not.toHaveBeenCalled();
  });

  it('a null path inside a grid is the normal outdoor answer: no warning, no goal', () => {
    const { follower, warn } = rig({ hasGrid: () => true, path: () => null });
    expect(follower.goalFor(0.016, at(0, 0), at(5, 5))).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('steers to the first waypoint and advances as each is reached', () => {
    const path = vi.fn(() => [at(0, -2), at(3, -2), at(3, -6)]);
    const { follower } = rig({ hasGrid: () => true, path });
    expect(follower.goalFor(0.016, at(0, 0), at(3, -6))).toEqual({ x: 0, z: -2 });
    expect(follower.goalFor(0.016, at(0, -1.9), at(3, -6))).toEqual({ x: 3, z: -2 });
    expect(follower.goalFor(0.016, at(2.9, -2), at(3, -6))).toEqual({ x: 3, z: -6 });
    expect(follower.goalFor(0.016, at(3, -6), at(3, -6))).toEqual({ x: 3, z: -6 }); // the last point stays
    expect(path).toHaveBeenCalledTimes(1);
  });

  it('repaths on a timer and when the target moves far, but not every tick', () => {
    const path = vi.fn(() => [at(1, 1)]);
    const { follower } = rig({ hasGrid: () => true, path });
    follower.goalFor(0.016, at(0, 0), at(5, 5));
    for (let i = 0; i < 10; i++) follower.goalFor(0.016, at(0, 0), at(5.1, 5));
    expect(path).toHaveBeenCalledTimes(1);
    follower.goalFor(0.016, at(0, 0), at(9, 9)); // target moved more than 2 m
    expect(path).toHaveBeenCalledTimes(2);
    follower.goalFor(0.6, at(0, 0), at(9, 9)); // half a second passed
    expect(path).toHaveBeenCalledTimes(3);
  });

  it('an empty path counts as no path', () => {
    const { follower } = rig({ hasGrid: () => true, path: () => [] });
    expect(follower.goalFor(0.016, at(0, 0), at(1, 1))).toBeNull();
  });

  it('a throwing nav service warns once and then stays off for this follower', () => {
    const path = vi.fn(() => {
      throw new Error('boom');
    });
    const { follower, warn } = rig({ hasGrid: () => true, path });
    expect(follower.goalFor(0.016, at(0, 0), at(1, 1))).toBeNull();
    expect(follower.goalFor(1, at(0, 0), at(9, 9))).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(path).toHaveBeenCalledTimes(1);
  });

  it('leaving the grid drops the old path', () => {
    let grid = true;
    const { follower } = rig({ hasGrid: () => grid, path: () => [at(4, 4)] });
    expect(follower.goalFor(0.016, at(0, 0), at(4, 4))).toEqual({ x: 4, z: 4 });
    grid = false;
    expect(follower.goalFor(0.016, at(0, 0), at(4, 4))).toBeNull();
    grid = true;
    expect(follower.goalFor(0.016, at(0, 0), at(4, 4))).toEqual({ x: 4, z: 4 });
  });

  it('steers to the raw goal past the last waypoint when the goal lies outside every grid', () => {
    const inGrid = (p: { x: number }) => p.x < 10;
    const path = vi.fn(() => [at(5, 0), at(9, 0)]);
    const { follower } = rig({ hasGrid: inGrid, path });
    expect(follower.goalFor(0.016, at(0, 0), at(30, 0))).toEqual({ x: 5, z: 0 });
    expect(follower.goalFor(0.016, at(4.9, 0), at(30, 0))).toEqual({ x: 9, z: 0 });
    expect(follower.goalFor(0.016, at(9, 0), at(30, 0))).toEqual({ x: 30, z: 0 });
  });

  it('latches the raw goal and leaves a real nav grid at the edge (no jitter)', async () => {
    const { NavRegistry } = await import('../../nav/NavRegistry');
    const { NavGrid } = await import('../../nav/NavGrid');
    const reg = new NavRegistry();
    reg.add(new NavGrid({ id: 'g', minX: 0, minZ: 0, maxX: 10, maxZ: 10, floorY: 0, walkable: [{ x0: 0, z0: 0, x1: 10, z1: 10 }] }));
    const f = new PathFollower(() => reg as never, () => {});
    const goal = { x: 15, y: 0, z: 5 };
    let self = { x: 5, y: 0, z: 5 };
    let left = false;
    for (let i = 0; i < 600 && !left; i++) {
      const g = f.goalFor(1 / 60, self, goal) ?? goal;
      const d = Math.hypot(g.x - self.x, g.z - self.z);
      if (d > 1e-6) self = { x: self.x + (g.x - self.x) / d * Math.min(d, 0.09), y: 0, z: self.z + (g.z - self.z) / d * Math.min(d, 0.09) };
      if (self.x >= 10) left = true;
    }
    expect(left).toBe(true);
  });
});
