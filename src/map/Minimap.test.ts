import { describe, expect, it, vi } from 'vitest';
import { createMinimap, MINIMAP_SIZE } from './Minimap';
import type { MapViewModel } from './viewTypes';
import type { MapMarker } from './MapModel';

function fakeEl(tag = 'div'): any {
  const el: any = { tag, className: '', textContent: '', style: {}, children: [] as any[], removed: false, attrs: {} as Record<string, string> };
  el.appendChild = (c: any) => el.children.push(c);
  el.remove = () => { el.removed = true; };
  el.setAttribute = (k: string, v: string) => { el.attrs[k] = v; };
  if (tag === 'canvas') {
    const calls: Array<[string, unknown[]]> = [];
    const ctx: any = { calls };
    for (const n of ['clearRect', 'fillRect', 'drawImage', 'putImageData', 'beginPath', 'arc', 'fill', 'stroke', 'save', 'restore', 'translate', 'rotate', 'clip']) {
      ctx[n] = (...a: unknown[]) => { calls.push([n, a]); };
    }
    ctx.createImageData = (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) });
    el.ctx = ctx;
    el.getContext = () => ctx;
  }
  return el;
}

const BOUNDS = { minX: -2000, maxX: 2000, minZ: -2000, maxZ: 2000 };

function make(withTile = true) {
  const state: any = {
    tile: withTile ? { bitmap: { width: 128, height: 128, bounds: BOUNDS, pixels: new Uint8ClampedArray(128 * 128 * 4) }, centerX: 0, centerZ: 0 } : null,
    player: { x: 0, z: 0, yaw: 0 },
    markers: [] as MapMarker[],
  };
  const model: MapViewModel = {
    bounds: BOUNDS,
    fullBitmap: () => null,
    minimapTile: () => state.tile,
    fog: () => { throw new Error('unused'); },
    markers: () => state.markers,
    player: () => state.player,
    travelBlockedReason: () => null,
    travel: vi.fn(),
    t: (k) => k,
  };
  const created: any[] = [];
  const doc = { createElement: (t: string) => { const e = fakeEl(t); created.push(e); return e; } } as any;
  const w = createMinimap({ model, doc });
  const canvas = created.find((e) => e.tag === 'canvas');
  return { w, state, canvas, created };
}

const calls = (c: any, name: string) => c.ctx.calls.filter((x: any) => x[0] === name);
const ws = (id: string, x: number, z: number, state: 'rekindled' | 'dormant' = 'rekindled'): MapMarker =>
  ({ id, kind: 'waystone', x, z, label: id, state, travelable: state === 'rekindled' });

describe('Minimap', () => {
  it('has id, order, round style and label', () => {
    const { w } = make();
    expect(w.id).toBe('map.minimap');
    expect(w.order).toBe(10);
    expect(w.element.style.borderRadius).toBe('50%');
    expect((w.element as any).attrs['aria-label']).toBe('map.minimap.label');
    expect(MINIMAP_SIZE).toBe(160);
  });

  it('never draws before the tile exists', () => {
    const { w, state, canvas } = make(false);
    for (let i = 0; i < 10; i++) w.update(1);
    expect(canvas.ctx.calls.length).toBe(0);
    state.tile = { bitmap: { width: 128, height: 128, bounds: BOUNDS, pixels: new Uint8ClampedArray(128 * 128 * 4) }, centerX: 0, centerZ: 0 };
    w.update(0.01);
    expect(w.stats.draws).toBe(1);
  });

  it('is rate limited to 2 Hz', () => {
    const { w } = make();
    w.update(0.016);
    for (let i = 0; i < 20; i++) w.update(0.016); // 0.32 s
    expect(w.stats.draws).toBe(1);
    w.update(0.2); // past 0.5 s
    expect(w.stats.draws).toBe(2);
    expect(w.stats.tileBuilds).toBe(1);
  });

  it('rotates with yaw and scales the tile to 160 px', () => {
    const { w, state, canvas } = make();
    state.player.yaw = 1.25;
    w.update(0);
    expect(calls(canvas, 'rotate')[0][1]).toEqual([1.25]);
    const draw = calls(canvas, 'drawImage')[0][1];
    expect(draw.slice(3)).toEqual([160, 160]);
    expect(draw[1]).toBeCloseTo(-80);
  });

  it('offsets the tile by the player displacement from the tile centre', () => {
    const { w, state, canvas } = make();
    state.player.x = 20; // 20 m at 2 m per display px = 10 px
    w.update(0);
    expect(calls(canvas, 'drawImage')[0][1][1]).toBeCloseTo(-90);
  });

  it('draws in-range waystones in place and clamps far ones to the edge', () => {
    const { w, state, canvas } = make();
    state.markers = [ws('near', 40, 0), ws('far', 5000, 0, 'dormant'), { ...ws('p', 10, 10), kind: 'poi' } as MapMarker];
    w.update(0);
    const arcs = calls(canvas, 'arc').map((c: any) => c[1]);
    // near: 40 m / 2 = 20 px right of the player; far: clamped to radius 75; poi ignored.
    expect(arcs.some((a: number[]) => Math.abs(a[0]! - 20) < 1e-9 && a[1] === 0)).toBe(true);
    expect(arcs.some((a: number[]) => Math.abs(a[0]! - 75) < 1e-9 && Math.abs(a[1]!) < 1e-9)).toBe(true);
    expect(arcs.some((a: number[]) => a[0] === 5 && a[1] === 5)).toBe(false);
    // player dot at centre
    expect(arcs.some((a: number[]) => a[0] === 80 && a[1] === 80)).toBe(true);
  });

  it('dispose clears and removes', () => {
    const { w, canvas } = make();
    w.update(0);
    w.dispose();
    expect(calls(canvas, 'clearRect').length).toBeGreaterThan(1);
    expect((w.element as any).removed).toBe(true);
    const n = w.stats.draws;
    w.update(5);
    expect(w.stats.draws).toBe(n);
  });
});
