import { describe, expect, it, vi } from 'vitest';
import { FogGrid, buildMarkers } from './MapModel';
import { createMapModal } from './MapView';
import { MAP_STRINGS_EN } from './strings.en';
import type { MapViewModel } from './viewTypes';

function fakeCtx(): any {
  const calls: Array<[string, unknown[]]> = [];
  const ctx: any = { calls };
  for (const n of ['clearRect', 'fillRect', 'drawImage', 'putImageData', 'beginPath', 'arc', 'moveTo', 'lineTo', 'closePath', 'fill', 'stroke', 'save', 'restore', 'translate', 'rotate', 'clip']) {
    ctx[n] = (...a: unknown[]) => { calls.push([n, a]); };
  }
  ctx.createImageData = (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) });
  return ctx;
}

function fakeEl(tag = 'div'): any {
  const listeners = new Map<string, Set<(e: any) => void>>();
  const el: any = { tag, className: '', textContent: '', style: {}, children: [] as any[], removed: false, width: 0, height: 0, listeners };
  el.appendChild = (c: any) => el.children.push(c);
  el.remove = () => { el.removed = true; };
  el.addEventListener = (t: string, f: any) => { (listeners.get(t) ?? listeners.set(t, new Set()).get(t)!).add(f); };
  el.removeEventListener = (t: string, f: any) => { listeners.get(t)?.delete(f); };
  el.fire = (t: string, e: any) => { for (const f of [...(listeners.get(t) ?? [])]) f(e); };
  el.getBoundingClientRect = () => ({ left: 100, top: 50, width: 320, height: 320 });
  el.focus = vi.fn();
  if (tag === 'canvas') { const c = fakeCtx(); el.ctx = c; el.getContext = () => c; }
  return el;
}

const BOUNDS = { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 };

function make(opts: { blocked?: string | null; bitmap?: boolean } = {}) {
  const fog = FogGrid.forBounds(BOUNDS, 500); // 4x4
  const state = {
    bitmap: opts.bitmap === false ? null : { width: 4, height: 4, bounds: BOUNDS, pixels: new Uint8ClampedArray(64) },
    blocked: opts.blocked ?? null,
    player: { x: 0, z: 0, yaw: 0.5 },
  };
  const markers = buildMarkers({
    waystones: [
      { id: 'a', x: 100, z: 0, state: 'rekindled', discovered: true },
      { id: 'b', x: -500, z: 500, state: 'dormant', discovered: true },
      { id: 'c', x: 800, z: 800, state: 'rekindled', discovered: true },
    ],
  });
  const model: MapViewModel = {
    bounds: BOUNDS,
    fullBitmap: () => state.bitmap,
    minimapTile: () => null,
    fog: () => fog,
    markers: () => markers,
    player: () => state.player,
    travelBlockedReason: () => state.blocked,
    travel: vi.fn(),
    t: (k) => MAP_STRINGS_EN[k] ?? k,
  };
  const close = vi.fn();
  const created: any[] = [];
  const doc = { createElement: (t: string) => { const e = fakeEl(t); created.push(e); return e; } } as any;
  const w = createMapModal({ model, close, doc });
  const canvas = created.find((e) => e.tag === 'canvas');
  const px = (x: number, z: number) => [((x - BOUNDS.minX) / 2000) * 640, ((z - BOUNDS.minZ) / 2000) * 640] as const;
  return { w, model, close, fog, state, canvas, created, px };
}

const count = (c: any, name: string) => c.ctx.calls.filter((x: any) => x[0] === name).length;

describe('MapModal', () => {
  it('has id, title and hint text', () => {
    const { w } = make();
    expect(w.id).toBe('map.modal');
    const el: any = w.element;
    expect(el.children[0].textContent).toBe('Map');
    expect(el.children[3].textContent).toBe(MAP_STRINGS_EN['map.hint']);
  });

  it('builds the terrain once and the fog only when the revealed count changes', () => {
    const { w, fog, canvas } = make();
    for (let i = 0; i < 20; i++) w.update(0.1);
    expect(w.stats.bitmapBuilds).toBe(1);
    expect(w.stats.fogBuilds).toBe(1);
    expect(w.stats.frames).toBe(20);
    fog.reveal(0, 0, 400);
    w.update(0.1);
    expect(w.stats.fogBuilds).toBe(2);
    w.update(0.1);
    expect(w.stats.fogBuilds).toBe(2);
    expect(count(canvas, 'putImageData')).toBe(0); // terrain lives on its own offscreen canvas
  });

  it('puts the bitmap on an offscreen canvas exactly once and defers until it exists', () => {
    const { w, state, created } = make({ bitmap: false });
    w.update(0.1);
    expect(w.stats.bitmapBuilds).toBe(0);
    state.bitmap = { width: 4, height: 4, bounds: BOUNDS, pixels: new Uint8ClampedArray(64) };
    w.update(0.1);
    w.update(0.1);
    const puts = created.filter((e) => e.tag === 'canvas').reduce((n, c) => n + count(c, 'putImageData'), 0);
    expect(puts).toBe(1);
    expect(w.stats.bitmapBuilds).toBe(1);
  });

  it('rate limits redraws to 10 Hz', () => {
    const { w } = make();
    w.update(0.016);
    for (let i = 0; i < 5; i++) w.update(0.016);
    expect(w.stats.frames).toBe(1);
    w.update(0.05);
    expect(w.stats.frames).toBe(2);
  });

  it('draws the player arrow rotated by yaw', () => {
    const { w, canvas } = make();
    w.update(0.1);
    expect(canvas.ctx.calls.some((c: any) => c[0] === 'rotate' && c[1][0] === -0.5)).toBe(true);
  });

  it('click on a lit waystone travels and closes', () => {
    const { w, model, close, px } = make();
    w.click(...px(100, 0));
    expect(model.travel).toHaveBeenCalledWith('a');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('click on a dormant waystone or empty space does nothing', () => {
    const { w, model, close, px } = make();
    w.click(...px(-500, 500));
    w.click(...px(-900, -900));
    expect(model.travel).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it('blocked travel shows a status message and does not travel', () => {
    const { w, model, close, px } = make({ blocked: 'in-combat' });
    w.click(...px(100, 0));
    expect(model.travel).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect((w.element as any).children[2].textContent).toBe(MAP_STRINGS_EN['map.blocked.in-combat']);
  });

  it('keyboard selection wraps and Enter travels', () => {
    const { w, model, close } = make();
    // distances from player: a 100, b ~707, c ~1131
    w.key('ArrowRight');
    expect(w.selectedId).toBe('a');
    w.key('Tab');
    expect(w.selectedId).toBe('b');
    w.key('ArrowDown');
    expect(w.selectedId).toBe('c');
    w.key('ArrowDown');
    expect(w.selectedId).toBe('a');
    w.key('ArrowLeft');
    expect(w.selectedId).toBe('c');
    w.key('ArrowUp');
    expect(w.selectedId).toBe('b');
    w.key('Enter'); // dormant: nothing
    expect(model.travel).not.toHaveBeenCalled();
    w.key('ArrowUp');
    expect(w.selectedId).toBe('a');
    w.key('Enter');
    expect(model.travel).toHaveBeenCalledWith('a');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('Enter without a selection does nothing', () => {
    const { w, model } = make();
    w.key('Enter');
    expect(model.travel).not.toHaveBeenCalled();
  });

  it('Escape and M close', () => {
    const { w, close } = make();
    w.key('Escape');
    w.key('KeyM');
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('DOM listeners convert client coords to canvas pixels and call click/key', () => {
    const { w, model, close, canvas } = make();
    // canvas rect: left 100, top 50, 320 wide for 640 px: client (100+160*... ) -> world (100,0) is px (352, 320) -> client (276, 210)
    canvas.fire('click', { clientX: 276, clientY: 210 });
    expect(model.travel).toHaveBeenCalledWith('a');
    const prevent = vi.fn();
    (w.element as any).fire('keydown', { code: 'Escape', preventDefault: prevent });
    expect(prevent).toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('dispose removes listeners and stops drawing', () => {
    const { w, canvas, model, close, px } = make();
    w.update(0.1);
    w.dispose();
    expect(canvas.listeners.get('click')!.size).toBe(0);
    expect((w.element as any).listeners.get('keydown').size).toBe(0);
    expect((w.element as any).removed).toBe(true);
    canvas.fire('click', { clientX: 276, clientY: 210 });
    (w.element as any).fire('keydown', { code: 'Escape' });
    expect(model.travel).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    const frames = w.stats.frames;
    w.update(1);
    expect(w.stats.frames).toBe(frames);
    void px;
  });
});
