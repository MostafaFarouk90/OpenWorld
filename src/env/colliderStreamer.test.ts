import { describe, expect, it, vi } from 'vitest';
import type { ColliderBox } from './colliders';
import { COLLIDER_ADD_DISTANCE, COLLIDER_DROP_DISTANCE, COLLIDER_SINK, ColliderStreamer, type ColliderPorts } from './colliderStreamer';

interface FakeDesc {
  half: [number, number, number];
  at: [number, number, number];
  rot: unknown;
  setTranslation(x: number, y: number, z: number): FakeDesc;
  setRotation(q: unknown): FakeDesc;
}
function ports(heightAt: (x: number, z: number) => number = () => 0) {
  const live = new Set<object>();
  const added: FakeDesc[] = [];
  const p: ColliderPorts = {
    rapier: {
      ColliderDesc: {
        cuboid: (hx: number, hy: number, hz: number) => {
          const d: FakeDesc = {
            half: [hx, hy, hz],
            at: [0, 0, 0],
            rot: null,
            setTranslation(x, y, z) {
              d.at = [x, y, z];
              return d;
            },
            setRotation(q) {
              d.rot = q;
              return d;
            },
          };
          return d;
        },
      },
    } as never,
    physics: {
      addStaticCollider: (d) => {
        const c = { d };
        live.add(c);
        added.push(d as never);
        return c as never;
      },
      removeCollider: (c) => void live.delete(c as never),
    },
    heightAt,
    warn: vi.fn(),
  };
  return { p, live, added };
}
const box = (cx: number, cz: number, over: Partial<ColliderBox> = {}): ColliderBox => ({ cx, cz, hx: 1.7, hz: 0.2, h: 1.4, yaw: 0, kind: 'run', id: 'wattle-fence', modules: 1, ...over });
/** One box in the middle of each of the 64 m cells in a row along x: cell i spans 64i .. 64i+64. */
const row = (n: number): ColliderBox[] => Array.from({ length: n }, (_, i) => box(64 * i + 32, 32));

describe('ColliderStreamer', () => {
  it('adds a cell when the player is within 80 m of it and not before', () => {
    const f = ports();
    const s = new ColliderStreamer(f.p);
    s.addBoxes([box(32, 32)]); // cell 0,0
    s.update(32 + 64 + COLLIDER_ADD_DISTANCE + 1, 32); // 81 m from the cell edge (x 64)
    expect(s.liveColliders).toBe(0);
    s.update(64 + COLLIDER_ADD_DISTANCE - 0.5, 32);
    expect(s.liveColliders).toBe(1);
    expect(f.live.size).toBe(1);
  });

  it('drops a cell only beyond 120 m (hysteresis: between 80 and 120 it stays)', () => {
    const f = ports();
    const s = new ColliderStreamer(f.p);
    s.addBoxes([box(32, 32)]);
    s.update(32, 32);
    expect(s.liveColliders).toBe(1);
    s.update(64 + COLLIDER_DROP_DISTANCE - 1, 32);
    expect(s.liveColliders).toBe(1);
    s.update(64 + COLLIDER_DROP_DISTANCE + 1, 32);
    expect(s.liveColliders).toBe(0);
    expect(f.live.size).toBe(0);
    // coming back adds it again
    s.update(40, 40);
    expect(f.live.size).toBe(1);
  });

  it('adds at most one cell per update, nearest first', () => {
    const f = ports();
    const s = new ColliderStreamer(f.p);
    s.addBoxes(row(3)); // cells 0, 1, 2 all within 80 m of x 100
    s.update(100, 32);
    expect(s.liveCells).toBe(1);
    expect(f.added[0]!.at[0]).toBe(96); // the cell the player stands in (64..128)
    s.update(100, 32);
    expect(s.liveCells).toBe(2);
    s.update(100, 32);
    expect(s.liveCells).toBe(3);
    s.update(100, 32);
    expect(s.liveCells).toBe(3);
    expect(f.live.size).toBe(3);
  });

  it('keeps live colliders capped while moving along a long row of cells', () => {
    const f = ports();
    const s = new ColliderStreamer(f.p);
    const boxes = row(60);
    s.addBoxes(boxes);
    let peak = 0;
    for (let x = 0; x < 64 * 60; x += 4) {
      s.update(x, 32);
      s.update(x, 32);
      peak = Math.max(peak, s.liveCells);
    }
    // cells within 120 m of the player either side: at most 2 x ceil(120 / 64) + 1 = 5
    expect(peak).toBeLessThanOrEqual(5);
    expect(s.totalBoxes).toBe(60);
  });

  it('sits the cuboid from the lowest ground minus a sink to the highest ground plus the height', () => {
    const f = ports((x) => x * 0.1); // a slope along x
    const s = new ColliderStreamer(f.p);
    s.addBoxes([box(10, 10, { hx: 5, h: 1.4 })]);
    s.update(10, 10);
    const d = f.added[0]!;
    const lo = (10 - 5) * 0.1;
    const hi = (10 + 5) * 0.1;
    const bottom = lo - COLLIDER_SINK;
    const top = hi + 1.4;
    expect(d.half).toEqual([5, expect.closeTo((top - bottom) / 2, 6), 0.2]);
    expect(d.at[1]).toBeCloseTo((top + bottom) / 2, 6);
    expect(d.rot).toBeNull(); // yaw 0 sets no rotation
  });

  it('rotates a yawed box as a Y quaternion and samples the ground along its own axis', () => {
    const f = ports();
    const s = new ColliderStreamer(f.p);
    s.addBoxes([box(10, 10, { yaw: Math.PI / 2 })]);
    s.update(10, 10);
    const q = f.added[0]!.rot as { x: number; y: number; z: number; w: number };
    expect(q.y).toBeCloseTo(Math.sin(Math.PI / 4), 6);
    expect(q.w).toBeCloseTo(Math.cos(Math.PI / 4), 6);
    expect(q.x + q.z).toBe(0);
  });

  it('skips a box over a non-finite ground and a box the physics refuses, keeping the rest', () => {
    const bad = ports((x) => (x < 5 ? Number.NaN : 0));
    const s = new ColliderStreamer(bad.p);
    s.addBoxes([box(2, 2), box(20, 20)]);
    s.update(10, 10);
    expect(s.liveColliders).toBe(1);

    const f = ports();
    let n = 0;
    const real = f.p.physics.addStaticCollider;
    f.p.physics.addStaticCollider = (d) => {
      if (n++ === 0) throw new Error('refused');
      return real(d);
    };
    const t = new ColliderStreamer(f.p);
    t.addBoxes([box(2, 2), box(20, 20)]);
    t.update(10, 10);
    expect(t.liveColliders).toBe(1);
    expect(f.p.warn).toHaveBeenCalledTimes(1);
  });

  it('ignores a non-finite player position and does nothing after dispose', () => {
    const f = ports();
    const s = new ColliderStreamer(f.p);
    s.addBoxes([box(32, 32)]);
    s.update(Number.NaN, 0);
    s.update(0, Infinity);
    expect(s.liveColliders).toBe(0);
    s.update(32, 32);
    expect(s.liveColliders).toBe(1);
    s.dispose();
    expect(f.live.size).toBe(0);
    s.update(32, 32);
    expect(f.live.size).toBe(0);
    expect(s.totalBoxes).toBe(0);
  });

  it('joins boxes of a second tile into a cell that already exists', () => {
    const f = ports();
    const s = new ColliderStreamer(f.p);
    s.addBoxes([box(10, 10)]);
    s.addBoxes([box(20, 20), box(100, 10)]);
    expect(s.totalBoxes).toBe(3);
    s.update(10, 10);
    expect(s.liveColliders).toBe(2);
  });

  it('removes a cell whose collider is already gone without throwing', () => {
    const f = ports();
    f.p.physics.removeCollider = () => {
      throw new Error('gone');
    };
    const s = new ColliderStreamer(f.p);
    s.addBoxes([box(32, 32)]);
    s.update(32, 32);
    expect(() => s.update(1000, 32)).not.toThrow();
    expect(s.liveColliders).toBe(0);
    expect(f.p.warn).toHaveBeenCalled();
  });
});
