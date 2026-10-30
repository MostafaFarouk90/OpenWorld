import { describe, expect, it } from 'vitest';
import type { WaterVolumeDef } from '../../water/types';
import { inArea, WaterVolumes } from './WaterVolumes';
import type { DiveRouteStandsDef } from '../dive/types';

const flags = (on: Record<string, boolean> = {}) => ({ getFlag: (k: string) => on[k] });
const box = (x0: number, z0: number, x1: number, z1: number) => ({ box: { x0, z0, x1, z1 } });
const make = (on: Record<string, boolean> = {}, ground = 0) => new WaterVolumes({ groundAt: () => ground, flags: flags(on) });

const route = (over: Partial<DiveRouteStandsDef> = {}): DiveRouteStandsDef => ({
  id: 'dive.t',
  volumeId: 'water.t.dive',
  points: [{ x: 0, y: -2, z: 0 }, { x: 30, y: -2, z: 0 }],
  airPockets: [{ id: 'p1', at: { x: 15, y: 0, z: 0 }, stand: { x: 15, y: 0.5, z: 5 } }],
  entryStand: { x: -2, y: 0.5, z: 0 },
  ...over,
});

describe('WaterVolumes', () => {
  it('box and polygon areas', () => {
    expect(inArea(box(0, 0, 10, 10), 5, 5)).toBe(true);
    expect(inArea(box(10, 10, 0, 0), 5, 5)).toBe(true);
    expect(inArea(box(0, 0, 10, 10), 11, 5)).toBe(false);
    const tri = { polygon: [[0, 0], [10, 0], [0, 10]] as [number, number][] };
    expect(inArea(tri, 2, 2)).toBe(true);
    expect(inArea(tri, 8, 8)).toBe(false);
  });

  it('throws on a duplicate id, a bad kind, a missing surface or an empty area; the undo removes it', () => {
    const w = make();
    const off = w.register({ id: 'a', kind: 'wade', surfaceY: 1, area: box(0, 0, 1, 1) });
    expect(() => w.register({ id: 'a', kind: 'wade', surfaceY: 1, area: box(0, 0, 1, 1) })).toThrow(/duplicate/);
    expect(() => w.register({ id: 'b', kind: 'lake' as never, surfaceY: 1, area: box(0, 0, 1, 1) })).toThrow(/kind/);
    expect(() => w.register({ id: 'c', kind: 'wade', surfaceY: NaN, area: box(0, 0, 1, 1) })).toThrow(/surfaceY/);
    expect(() => w.register({ id: 'd', kind: 'wade', surfaceY: 1, area: box(0, 0, 0, 1) })).toThrow(/area/);
    expect(() => w.register({ id: 'e', kind: 'wade', surfaceY: 1, area: { polygon: [[0, 0], [1, 1]] } })).toThrow(/area/);
    off();
    expect(w.get('a')).toBeUndefined();
  });

  it('volumeAt: only below the surface; the overlap winner is dive over deep over wade', () => {
    const w = make();
    w.register({ id: 'wade', kind: 'wade', surfaceY: 1, area: box(0, 0, 100, 100) });
    w.register({ id: 'deep', kind: 'deep', surfaceY: 1, area: box(0, 0, 50, 50) });
    w.register({ id: 'dive', kind: 'dive', surfaceY: 0.8, area: box(0, 0, 20, 20) });
    expect(w.volumeAt({ x: 10, y: 0, z: 10 })?.id).toBe('dive');
    expect(w.volumeAt({ x: 30, y: 0, z: 30 })?.id).toBe('deep');
    expect(w.volumeAt({ x: 70, y: 0, z: 70 })?.id).toBe('wade');
    expect(w.volumeAt({ x: 70, y: 1.2, z: 70 })).toBeNull();
    expect(w.volumeAt({ x: 200, y: 0, z: 0 })).toBeNull();
  });

  it('activeWhen is read on every query: a sluice flag swaps the set at once', () => {
    const on: Record<string, boolean> = {};
    const w = make(on);
    w.register({ id: 'high', kind: 'dive', surfaceY: 5, area: box(0, 0, 10, 10), activeWhen: { none: ['story.d05.sluice1'] } });
    w.register({ id: 'low', kind: 'dive', surfaceY: 2, area: box(0, 0, 10, 10), activeWhen: { all: ['story.d05.sluice1'] } });
    expect(w.volumeAt({ x: 5, y: 3, z: 5 })?.id).toBe('high');
    on['story.d05.sluice1'] = true;
    expect(w.volumeAt({ x: 5, y: 3, z: 5 })).toBeNull();
    expect(w.volumeAt({ x: 5, y: 1, z: 5 })?.id).toBe('low');
  });

  it('depthAt is the surface over the probed ground, 0 when dry', () => {
    const w = make({}, 0.2);
    w.register({ id: 'w', kind: 'wade', surfaceY: 1, area: box(0, 0, 10, 10) });
    expect(w.depthAt(5, 5)).toBeCloseTo(0.8);
    expect(w.depthAt(50, 5)).toBe(0);
  });

  it('registerRoute: stands are required and must be dry; the 40 m lint applies; active routes follow their volume', () => {
    const on: Record<string, boolean> = {};
    const w = make(on);
    w.register({ id: 'water.t.dive', kind: 'dive', surfaceY: 0, area: box(-1, -1, 31, 3), activeWhen: { none: ['off'] } });
    expect(() => w.registerRoute(route({ entryStand: undefined as never }))).toThrow(/entry has no stand/);
    expect(() => w.registerRoute(route({ airPockets: [{ id: 'p1', at: { x: 15, y: 0, z: 0 } } as never] }))).toThrow(/p1 has no stand/);
    expect(() => w.registerRoute(route({ entryStand: { x: 5, y: -1, z: 0 } }))).toThrow(/inside dive water/);
    expect(() => w.registerRoute(route({ points: [{ x: 0, y: 0, z: 0 }, { x: 90, y: 0, z: 0 }] }))).toThrow(/max 40/);
    const off = w.registerRoute(route());
    expect(() => w.registerRoute(route())).toThrow(/duplicate/);
    expect(w.activePockets().map((p) => p.id)).toEqual(['p1']);
    on.off = true;
    expect(w.activeRoutes()).toEqual([]);
    off();
    expect(w.routes()).toEqual([]);
  });

  it('a stand inside an inactive sluice set still fails (every set is checked)', () => {
    const w = make();
    const v: WaterVolumeDef = { id: 'other', kind: 'deep', surfaceY: 3, area: box(-5, -5, 0, 5), activeWhen: { all: ['never'] } };
    w.register(v);
    w.register({ id: 'water.t.dive', kind: 'dive', surfaceY: 0, area: box(1, -1, 31, 3) });
    expect(() => w.registerRoute(route())).toThrow(/entry's stand point is inside deep water/);
  });
});
