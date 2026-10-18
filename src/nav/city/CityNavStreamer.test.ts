import { describe, expect, it, vi } from 'vitest';
import type { NavGrid } from '../NavGrid';
import type { BlockGridResult, CityNavBlock } from './blocks';
import { CITY_NAV_BUILD_DISTANCE, CITY_NAV_DROP_DISTANCE, CityNavStreamer } from './CityNavStreamer';

const A: CityNavBlock = { id: 'a', rect: { x0: 0, z0: 0, x1: 20, z1: 20 } };
const B: CityNavBlock = { id: 'b', rect: { x0: 100, z0: 0, x1: 120, z1: 20 } };
const C: CityNavBlock = { id: 'c', rect: { x0: 1000, z0: 0, x1: 1020, z1: 20 } };
const okDef = (b: CityNavBlock): BlockGridResult => ({
  def: { id: `city.${b.id}`, minX: b.rect.x0, minZ: b.rect.z0, maxX: b.rect.x1, maxZ: b.rect.z1, floorY: 0, cellSize: 1, walkable: [b.rect] },
});

function make(blocks: CityNavBlock[], def: (b: CityNavBlock) => BlockGridResult = okDef) {
  const registered = new Set<string>();
  const adds: string[] = [];
  const ports = {
    def: vi.fn(def),
    add: vi.fn((g: NavGrid) => {
      registered.add(g.id);
      adds.push(g.id);
      return () => registered.delete(g.id);
    }),
    warn: vi.fn(),
  };
  return { s: new CityNavStreamer(blocks, ports), ports, registered, adds };
}

describe('CityNavStreamer', () => {
  it('builds a block once the player is within 150 m of its rect, not before', () => {
    const t = make([A]);
    t.s.update(20 + CITY_NAV_BUILD_DISTANCE + 1, 10);
    expect(t.registered.size).toBe(0);
    t.s.update(20 + CITY_NAV_BUILD_DISTANCE, 10);
    expect([...t.registered]).toEqual(['city.a']);
    expect(t.s.active).toEqual(['a']);
  });

  it('builds at most one block per update, nearest first', () => {
    const t = make([B, A]);
    t.s.update(30, 10); // 10 m from A, 70 m from B
    expect(t.adds).toEqual(['city.a']);
    t.s.update(30, 10);
    expect(t.adds).toEqual(['city.a', 'city.b']);
    t.s.update(30, 10);
    expect(t.ports.def).toHaveBeenCalledTimes(2);
  });

  it('removes a grid beyond 250 m, keeps it between 150 and 250 m, and re-adds it without rebuilding', () => {
    const t = make([A]);
    t.s.update(10, 10);
    t.s.update(20 + 200, 10); // inside the hysteresis band
    expect(t.s.active).toEqual(['a']);
    t.s.update(20 + CITY_NAV_DROP_DISTANCE + 1, 10);
    expect(t.registered.size).toBe(0);
    expect(t.s.active).toEqual([]);
    expect(t.s.built).toEqual(['a']);
    t.s.update(20 + 200, 10); // back inside 250 but not 150: stays off
    expect(t.registered.size).toBe(0);
    t.s.update(10, 10);
    expect([...t.registered]).toEqual(['city.a']);
    expect(t.ports.def).toHaveBeenCalledTimes(1);
  });

  it('warns once about a skipped block and never retries it, while others still build', () => {
    const t = make([A, B], (b) => (b.id === 'a' ? { skipped: 'ground varies 2.00 m' } : okDef(b)));
    t.s.update(50, 10);
    t.s.update(50, 10);
    t.s.update(50, 10);
    expect(t.ports.warn).toHaveBeenCalledTimes(1);
    expect(t.ports.warn.mock.calls[0]![0]).toMatch(/"a" skipped: ground varies/);
    expect(t.s.active).toEqual(['b']);
    expect(t.ports.def).toHaveBeenCalledTimes(2);
  });

  it('survives a def that throws and a registry that refuses the grid', () => {
    const boom = make([A], () => {
      throw new Error('cap');
    });
    boom.s.update(10, 10);
    boom.s.update(10, 10);
    expect(boom.ports.warn).toHaveBeenCalledTimes(1);
    expect(boom.s.active).toEqual([]);

    const refuse = make([A]);
    refuse.ports.add.mockImplementationOnce(() => {
      throw new Error('duplicate grid');
    });
    refuse.s.update(10, 10);
    expect(refuse.s.active).toEqual([]);
    expect(refuse.ports.warn).toHaveBeenCalledWith(expect.stringMatching(/could not be registered/), expect.any(Error));
    refuse.s.update(10, 10); // the next update tries to register it again
    expect(refuse.s.active).toEqual(['a']);
  });

  it('ignores a non-finite position and leaves far blocks alone', () => {
    const t = make([A, C]);
    t.s.update(Number.NaN, 0);
    expect(t.ports.def).not.toHaveBeenCalled();
    t.s.update(10, 10);
    t.s.update(10, 10);
    expect(t.s.built).toEqual(['a']);
  });

  it('dispose removes every registered grid', () => {
    const t = make([A, B]);
    t.s.update(60, 10);
    t.s.update(60, 10);
    expect(t.registered.size).toBe(2);
    t.s.dispose();
    expect(t.registered.size).toBe(0);
    t.s.dispose();
  });
});
