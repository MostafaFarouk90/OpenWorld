import mapSourcesSource from './MapSources.ts?raw';
import { describe, expect, it, vi } from 'vitest';
import { GameEvents } from '../core/events';
import { FlagGates } from '../state/FlagGates';
import { WorldState } from '../state/WorldState';
import { buildForgeState, SHRINE_IDS } from './ForgeMarks';
import { FOG_OPEN_FLAGS } from '../region/fogWall';
import { FOG_WALL, createMapSources, type PostAnchor } from './MapSources';
import { DEFAULT_WORLD_BOUNDS } from './tuning';
import { FogGrid, buildMarkers } from './MapModel';
import { createMapModal } from './MapView';
import { MAP_STRINGS_EN } from './strings.en';
import type { MapViewModel } from './viewTypes';

function make(services: Record<string, unknown> = {}) {
  const events = new GameEvents(() => {});
  const state = new WorldState(events, () => {});
  const gates = new FlagGates(state, events, () => {});
  const src = createMapSources({ gates, events, service: (n) => services[n] }, (k) => MAP_STRINGS_EN[k] ?? k);
  const load = (flags: Record<string, unknown>) => {
    state.load({ flags });
    events.emit('save.loaded', { slot: 't' });
  };
  return { events, state, src, load };
}

describe('forge state', () => {
  it('lists the eight contract ids in order', () => {
    expect([...SHRINE_IDS]).toEqual(['quenchstone', 'hushed-anvil', 'weeping-bellows', 'hathrens-mere', 'last-anvil', 'wyrms-hearth', 'singing-slag', 'anvil-of-ages']);
  });

  it('shows tiers 0..8 with that many marks lit, and clamps out of range', () => {
    for (let t = 0; t <= 8; t++) {
      const f = buildForgeState({ isLit: (id) => SHRINE_IDS.indexOf(id) < t, tier: t });
      expect(f.tier).toBe(t);
      expect(f.marks.filter((m) => m.lit)).toHaveLength(t);
    }
    expect(buildForgeState({ isLit: () => false, tier: 12 }).tier).toBe(8);
    expect(buildForgeState({ isLit: () => false, tier: -3 }).tier).toBe(0);
    expect(buildForgeState({ isLit: (id) => id === 'quenchstone', tier: NaN }).tier).toBe(1);
    expect(buildForgeState({ isLit: (id) => id === 'quenchstone', tier: 'x' }).tier).toBe(1);
  });

  it('cooled pip only for a positive remaining time', () => {
    const c = (v: unknown) => buildForgeState({ isLit: () => false, cooledRemaining: v }).cooled;
    expect([c(10), c(0), c(-1), c(undefined), c('5'), c(NaN)]).toEqual([true, false, false, false, false, false]);
  });
});

describe('MapSources', () => {
  it('lights marks from their own flags, live and when set by a load', () => {
    const { state, src, load } = make();
    expect(src.forge().marks.every((m) => !m.lit)).toBe(true);
    state.setFlag('shrine.hushed-anvil.lit', true);
    expect(src.forge().marks.map((m) => m.lit)).toEqual([false, true, false, false, false, false, false, false]);
    load({ 'shrine.quenchstone.lit': true, 'shrine.anvil-of-ages.lit': true }); // no flag.changed
    const lit = src.forge().marks.map((m) => m.lit);
    expect(lit).toEqual([true, false, false, false, false, false, false, true]);
    expect(src.forge().tier).toBe(2); // no warmth service: lit count
  });

  it('ignores the hidden kindling-dell shrine', () => {
    const { state, src } = make();
    state.setFlag('shrine.kindling-dell.lit', true);
    expect(src.forge().marks.some((m) => m.lit)).toBe(false);
  });

  it('reads warmth.tier() and shrine.cooledRemaining() when present, last warmth.changed otherwise', () => {
    const tier = vi.fn(() => 3);
    const a = make({ warmth: { tier }, shrine: { cooledRemaining: () => 42 } });
    expect(a.src.forge()).toMatchObject({ tier: 3, cooled: true });
    const b = make();
    b.events.emit('warmth.changed', { tier: 5, previous: 4 });
    expect(b.src.forge().tier).toBe(5);
  });

  it('missing or throwing services never throw', () => {
    const boom = () => {
      throw new Error('x');
    };
    const { src } = make({ warmth: { tier: boom }, shrine: { cooledRemaining: boom }, region: { at: boom } });
    expect(src.forge()).toMatchObject({ tier: 0, cooled: false });
    expect(src.legend(0, 0)).toBeNull();
    const none = make({ warmth: {}, shrine: {}, region: {} });
    expect(none.src.forge().tier).toBe(0);
    expect(none.src.legend(0, 0)).toBeNull();
    expect(make().src.legend(1, 1)).toBeNull();
  });

  it('fog wall marker stands iff none of region/fogWall FOG_OPEN_FLAGS is true, including via a load', () => {
    const { state, src, load } = make();
    expect(FOG_OPEN_FLAGS.length).toBeGreaterThan(0);
    expect(src.fogWall()).toMatchObject({ id: 'trg.fog.harrowmark', x: FOG_WALL.x, z: FOG_WALL.z });
    expect(buildMarkers({ waystones: [], fog: src.fogWall() })).toHaveLength(1);
    for (const flag of FOG_OPEN_FLAGS) {
      state.setFlag(flag, true);
      expect(src.fogWall()).toBeNull();
      state.setFlag(flag, false);
      expect(src.fogWall()).not.toBeNull();
      load({ [flag]: true });
      expect(src.fogWall()).toBeNull();
      load({});
      expect(src.fogWall()).not.toBeNull();
      load({ [flag]: false });
      expect(src.fogWall()).not.toBeNull();
    }
  });

  it('the map reads the same open list as the wall itself (one import, no local copy)', () => {
    const source = mapSourcesSource;
    expect(source).toContain("import { FOG_OPEN_FLAGS } from '../region/fogWall'");
    expect(source).not.toMatch(/FOG_OPEN_FLAGS\s*=/);
  });

  describe('trainer and vendor posts', () => {
    const grid = () => FogGrid.forBounds(DEFAULT_WORLD_BOUNDS);
    const mk = (anchors: PostAnchor[]) => {
      const events = new GameEvents(() => {});
      const state = new WorldState(events, () => {});
      const gates = new FlagGates(state, events, () => {});
      const src = createMapSources({ gates, events, service: () => undefined }, (k) => k, anchors);
      const load = (flags: Record<string, unknown>) => {
        state.load({ flags });
        events.emit('save.loaded', { slot: 't' });
      };
      return { src, state, load };
    };

    it('default table lists the five Bastion trainers, hidden until revealed', () => {
      const { src } = make();
      const g = grid();
      expect(src.posts((x, z) => g.isRevealed(x, z))).toHaveLength(0);
      g.reveal(8200, 1730, 100);
      const out = src.posts((x, z) => g.isRevealed(x, z));
      expect(out.map((p) => p.id)).toEqual(['gaut', 'stane', 'pennard', 'gerta', 'ashdown'].map((n) => `harrowmark.bastion.trainer.${n}`));
      expect(out[0]).toMatchObject({ x: 8150, z: 1742.5, label: 'Gaut, trainer' });
      expect(new Set(out.map((p) => p.x)).size).toBe(5);
      expect(buildMarkers({ waystones: [], poi: out })).toHaveLength(5);
    });

    it('vendors need story.m08.favourTab, set directly or by a load', () => {
      const { src, state, load } = mk([{ id: 'shop.wystan', kind: 'vendor', x: 10, z: 20 }]);
      const seen = () => true;
      expect(src.posts(seen)).toHaveLength(0);
      state.setFlag('story.m08.favourTab', true);
      expect(src.posts(seen)).toHaveLength(1);
      expect(src.posts(() => false)).toHaveLength(0);
      load({});
      expect(src.posts(seen)).toHaveLength(0);
      load({ 'story.m08.favourTab': true });
      expect(src.posts(seen)).toHaveLength(1);
    });

    it('survives a throwing reveal check, non-finite anchors and anchors outside the bounds', () => {
      const { src } = mk([
        { id: 'a', kind: 'trainer', x: 99999, z: -99999 },
        { id: 'b', kind: 'trainer', x: NaN, z: 0 },
        { id: 'c', kind: 'trainer', x: 1, z: 1 },
      ]);
      const g = grid();
      expect(() => src.posts((x, z) => g.isRevealed(x, z))).not.toThrow();
      expect(src.posts((x, z) => g.isRevealed(x, z))).toHaveLength(0);
      expect(src.posts((x) => x === 99999 || x === 1).map((p) => p.id)).toEqual(['a', 'c']);
      expect(src.posts(() => { throw new Error('x'); })).toEqual([]);
    });
  });

  it('legend reads region.at(x, z).levelBand and hides without data', () => {
    const at = vi.fn((x: number) => (x < 0 ? null : { levelBand: { min: 3, max: 6 } }));
    const { src } = make({ region: { at } });
    expect(src.legend(10, 0)).toEqual({ min: 3, max: 6 });
    expect(src.legend(-10, 0)).toBeNull();
    expect(make({ region: { at: () => ({}) } }).src.legend(0, 0)).toBeNull();
    expect(make({ region: { at: () => ({ levelBand: { min: NaN, max: 2 } }) } }).src.legend(0, 0)).toBeNull();
  });

  it('lit quenchstone becomes a shrine marker; dispose stops updates', () => {
    const { state, src } = make();
    expect(src.litShrines()).toEqual([]);
    state.setFlag('shrine.quenchstone.lit', true);
    expect(src.litShrines()).toMatchObject([{ id: 'shrine.quenchstone', x: 900, z: -170 }]);
    src.dispose();
    state.setFlag('shrine.quenchstone.lit', false);
    expect(src.litShrines()).toHaveLength(1);
  });
});

// ---- view
function fakeEl(tag = 'div'): any {
  const el: any = { tag, className: '', textContent: '', style: {}, children: [] as any[], width: 0, height: 0 };
  el.appendChild = (c: any) => el.children.push(c);
  el.remove = () => {
    el.removed = true;
  };
  el.addEventListener = () => {};
  el.removeEventListener = () => {};
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1, height: 1 });
  if (tag === 'canvas') {
    const calls: string[] = [];
    const c: any = { calls };
    for (const n of ['clearRect', 'fillRect', 'drawImage', 'putImageData', 'beginPath', 'arc', 'moveTo', 'lineTo', 'closePath', 'fill', 'stroke', 'save', 'restore', 'translate', 'rotate']) c[n] = () => calls.push(n);
    c.createImageData = (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) });
    el.ctx = c;
    el.getContext = () => c;
  }
  return el;
}

function view(extra: Partial<MapViewModel>, markers = buildMarkers({ waystones: [] })) {
  const B = { minX: -2000, maxX: 10500, minZ: -2000, maxZ: 4500 };
  const model: MapViewModel = {
    bounds: B,
    fullBitmap: () => null,
    minimapTile: () => null,
    fog: () => FogGrid.forBounds(B),
    markers: () => markers,
    player: () => ({ x: 0, z: 0, yaw: 0 }),
    travelBlockedReason: () => null,
    travel: () => {},
    t: (k, p) => (MAP_STRINGS_EN[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => String(p?.[n])),
    ...extra,
  };
  const created: any[] = [];
  const w = createMapModal({ model, close: () => {}, doc: { createElement: (t: string) => { const e = fakeEl(t); created.push(e); return e; } } as any });
  const el: any = w.element;
  const forgeRow = el.children[4];
  const legend = el.children[5];
  return { w, forgeRow, legend, canvas: created.find((e) => e.tag === 'canvas') };
}

describe('MapView overlays', () => {
  it('draws the forge row, tier, names only for lit marks and the cooled pip', () => {
    const lit = new Set(['quenchstone']);
    const { w, forgeRow } = view({ forge: () => buildForgeState({ isLit: (id) => lit.has(id), tier: 1, cooledRemaining: 30 }) });
    w.update(0.1);
    const texts = forgeRow.children.map((c: any) => c.textContent);
    expect(texts[0]).toBe('Warmth 1');
    expect(texts[1]).toBe('Quenchstone Shrine');
    expect(texts.slice(2, 9)).toEqual(Array(7).fill('???'));
    expect(texts.at(-1)).toBe('Cooled');
    expect(forgeRow.style.display).toBe('flex');
  });

  it('rebuilds the row when marks change and hides it with no forge data', () => {
    const lit = new Set<string>();
    const { w, forgeRow } = view({ forge: () => buildForgeState({ isLit: (id) => lit.has(id) }) });
    w.update(0.1);
    expect(forgeRow.children.filter((c: any) => !c.removed)).toHaveLength(9);
    lit.add('last-anvil');
    w.update(0.2);
    expect(forgeRow.children.filter((c: any) => !c.removed).length).toBeGreaterThan(0);
    expect(forgeRow.children.filter((c: any) => !c.removed && c.textContent === 'Last Anvil')).toHaveLength(1);
    const none = view({});
    none.w.update(0.1);
    expect(none.forgeRow.style.display).toBe('none');
  });

  it('shows the level legend and hides it when absent', () => {
    const a = view({ legend: () => ({ min: 3, max: 6 }) });
    a.w.update(0.1);
    expect(a.legend.textContent).toBe('Expected level 3 to 6');
    expect(a.legend.style.display).toBe('block');
    const b = view({ legend: () => null });
    b.w.update(0.1);
    expect(b.legend.style.display).toBe('none');
    const c = view({});
    c.w.update(0.1);
    expect(c.legend.style.display).toBe('none');
  });

  it('draws shrine, fog and unknown marker kinds without throwing; canvas keeps the bounds aspect', () => {
    const markers = [
      ...buildMarkers({ waystones: [], shrines: [{ id: 's', x: 900, z: -170 }], fog: { id: 'f', x: 1100, z: -150 } }),
      { id: 'u', kind: 'mystery' as any, x: 50, z: 50, label: 'u', travelable: false },
    ];
    const { w, canvas } = view({}, markers);
    expect(() => w.update(0.1)).not.toThrow();
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(333);
    expect(canvas.ctx.calls.filter((c: string) => c === 'beginPath').length).toBeGreaterThanOrEqual(3);
  });
});
