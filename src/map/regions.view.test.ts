import { describe, expect, it, vi } from 'vitest';
import { FogGrid, buildMarkers, mapExtent } from './MapModel';
import { createMapModal, MAP_CANVAS_SIZE } from './MapView';
import { createMinimap } from './Minimap';
import { regionChips } from './regionLayer';
import { MAP_STRINGS_EN } from './strings.en';
import { DEFAULT_WORLD_BOUNDS, MAP_TUNING } from './tuning';
import type { MapViewModel } from './viewTypes';

function fakeEl(tag = 'div'): any {
  const el: any = { tag, className: '', textContent: '', style: {}, children: [] as any[], width: 0, height: 0 };
  el.appendChild = (c: any) => el.children.push(c);
  el.remove = () => {};
  el.addEventListener = () => {};
  el.removeEventListener = () => {};
  el.setAttribute = () => {};
  if (tag === 'canvas') {
    const calls: Array<[string, unknown[]]> = [];
    const ctx: any = { calls, measureText: (t: string) => ({ width: t.length * 7 }) };
    for (const n of ['clearRect', 'fillRect', 'drawImage', 'putImageData', 'beginPath', 'arc', 'moveTo', 'lineTo', 'closePath', 'fill', 'stroke', 'save', 'restore', 'translate', 'rotate', 'clip', 'fillText']) {
      ctx[n] = (...a: unknown[]) => { calls.push([n, a]); };
    }
    ctx.createImageData = (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) });
    el.ctx = ctx;
    el.getContext = () => ctx;
  }
  return el;
}

function model(open: Parameters<typeof regionChips>[0], caption: string | null = null): MapViewModel {
  const fog = FogGrid.forBounds(DEFAULT_WORLD_BOUNDS);
  return {
    bounds: DEFAULT_WORLD_BOUNDS,
    fullBitmap: () => null,
    minimapTile: () => ({ bitmap: { width: 4, height: 4, bounds: DEFAULT_WORLD_BOUNDS, pixels: new Uint8ClampedArray(64) }, centerX: 0, centerZ: 0 }),
    fog: () => fog,
    markers: () => buildMarkers({ waystones: [{ id: 'w', x: 100, z: 100, state: 'rekindled', discovered: true }] }),
    player: () => ({ x: 0, z: 0, yaw: 0 }),
    regions: () => regionChips(open),
    regionCaption: () => caption,
    travelBlockedReason: () => null,
    travel: vi.fn(),
    t: (k) => MAP_STRINGS_EN[k] ?? k,
  };
}

function modal(m: MapViewModel) {
  const created: any[] = [];
  const doc = { createElement: (t: string) => { const e = fakeEl(t); created.push(e); return e; } } as any;
  const w = createMapModal({ model: m, close: () => {}, doc });
  return { w, canvas: created.find((e) => e.tag === 'canvas') };
}

const texts = (c: any): string[] => c.ctx.calls.filter((x: any) => x[0] === 'fillText').map((x: any) => x[1][0]);

describe('map region layer in the view', () => {
  it('Act 1: draws two names and Unknown lands, never an Act 2 name', () => {
    const { w, canvas } = modal(model(['brightwater', 'harrowmark']));
    w.update(1);
    const t = texts(canvas);
    expect(t).toContain('Brightwater');
    expect(t).toContain('Harrowmark');
    expect(t).toContain('Unknown lands');
    expect(t.join('|')).not.toMatch(/Cinderreach|Oldsmoke/);
  });

  it('shades only closed regions and draws chips before the markers', () => {
    const { w, canvas } = modal(model(['brightwater', 'harrowmark']));
    w.update(1);
    const calls = canvas.ctx.calls as Array<[string, unknown[]]>;
    const shades = calls.filter((c) => c[0] === 'fillRect' && (c[1] as number[]).length === 4);
    expect(shades.length).toBeGreaterThan(4); // background + closed boxes + chip backgrounds
    const lastText = calls.map((c) => c[0]).lastIndexOf('fillText');
    const firstArc = calls.map((c) => c[0]).indexOf('arc');
    expect(lastText).toBeLessThan(firstArc); // markers drawn over the chips
  });

  it('opening Cinderreach names it', () => {
    const { w, canvas } = modal(model(['brightwater', 'harrowmark', 'cinderreach']));
    w.update(1);
    expect(texts(canvas)).toContain('Cinderreach');
  });

  it('a view without region data still draws', () => {
    const m = model([]);
    delete (m as any).regions;
    const { w, canvas } = modal(m);
    expect(() => w.update(1)).not.toThrow();
    expect(texts(canvas)).toEqual([]);
  });

  it('a canvas without text support skips chips but keeps the shading', () => {
    const m = model([]);
    const created: any[] = [];
    const doc = { createElement: (t: string) => { const e = fakeEl(t); if (t === 'canvas') delete e.ctx.fillText; created.push(e); return e; } } as any;
    const w = createMapModal({ model: m, close: () => {}, doc });
    expect(() => w.update(1)).not.toThrow();
  });
});

describe('384 px full map on the design bounds', () => {
  it('keeps the aspect: the longer edge is the tuned size', () => {
    expect(MAP_TUNING.fullMapPixels).toBe(384);
    const e = mapExtent(DEFAULT_WORLD_BOUNDS, MAP_TUNING.fullMapPixels);
    expect(e.width).toBe(384);
    expect(e.height).toBe(Math.round((384 * 19000) / 25000));
    // The modal canvas aspect follows the bounds, not the bitmap size.
    const m = mapExtent(DEFAULT_WORLD_BOUNDS, MAP_CANVAS_SIZE);
    expect(m.width / m.height).toBeCloseTo(e.width / e.height, 1);
  });
});

describe('minimap caption', () => {
  function mini(caption: string | null) {
    const created: any[] = [];
    const doc = { createElement: (t: string) => { const e = fakeEl(t); created.push(e); return e; } } as any;
    const w = createMinimap({ model: model(['brightwater'], caption), doc });
    return { w, cap: created.find((e) => e.className === 'minimap__caption') };
  }
  it('shows the region name and clears between regions', () => {
    const a = mini('Brightwater');
    a.w.update(1);
    expect(a.cap.textContent).toBe('Brightwater');
    const b = mini(null);
    b.w.update(1);
    expect(b.cap.textContent).toBe('');
  });
});
