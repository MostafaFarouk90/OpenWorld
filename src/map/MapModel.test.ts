import { describe, expect, it } from 'vitest';
import {
  FogGrid,
  buildMarkers,
  clampToBounds,
  hitTestMarker,
  mapToWorld,
  nearestMarker,
  playerArrowPosition,
  selectionOrder,
  stepSelection,
  worldToMap,
  type MapMarker,
} from './MapModel';
import { DEFAULT_WORLD_BOUNDS, MAP_TUNING } from './tuning';

const B = DEFAULT_WORLD_BOUNDS;

describe('transforms', () => {
  it('maps corners and centre', () => {
    expect(worldToMap(B.minX, B.minZ, B, 256)).toEqual({ u: 0, v: 0 });
    expect(worldToMap(B.maxX, B.maxZ, B, 256)).toEqual({ u: 256, v: 256 });
    expect(worldToMap(0, 0, B, 256)).toEqual({ u: 128, v: 128 });
  });

  it('round trips', () => {
    for (const [x, z] of [[0, 0], [123.4, -987.6], [-2000, 2000], [1999.9, -1.5]] as const) {
      const p = worldToMap(x, z, B, 256);
      const w = mapToWorld(p.u, p.v, B, 256);
      expect(w.x).toBeCloseTo(x, 9);
      expect(w.z).toBeCloseTo(z, 9);
    }
  });

  it('works for a non-square, off-centre world', () => {
    const b = { minX: 100, maxX: 24100, minZ: -500, maxZ: 17500 };
    const p = worldToMap(12100, 8500, b, 100);
    expect(p).toEqual({ u: 50, v: 50 });
    expect(mapToWorld(50, 50, b, 100)).toEqual({ x: 12100, z: 8500 });
  });

  it('clamps outside points to the edge and reports it', () => {
    expect(clampToBounds(5000, -9000, B)).toEqual({ x: 2000, z: -2000, clamped: true });
    expect(clampToBounds(10, 20, B)).toEqual({ x: 10, z: 20, clamped: false });
    expect(clampToBounds(2000, -2000, B).clamped).toBe(false);
    expect(clampToBounds(NaN, Infinity, B)).toMatchObject({ x: 0, z: 0 });
  });

  it('places the player arrow on the map edge when outside', () => {
    expect(playerArrowPosition(9000, 0, B, 256)).toEqual({ u: 256, v: 128, clamped: true });
    expect(playerArrowPosition(0, 0, B, 256)).toEqual({ u: 128, v: 128, clamped: false });
  });
});

describe('FogGrid', () => {
  const spec = { originX: 0, originZ: 0, cellSize: 10, cols: 40, rows: 40 };

  function expectedCells(x: number, z: number, r: number): Set<number> {
    const s = new Set<number>();
    for (let row = 0; row < spec.rows; row++)
      for (let col = 0; col < spec.cols; col++) {
        const cx = (col + 0.5) * 10;
        const cz = (row + 0.5) * 10;
        if (Math.hypot(cx - x, cz - z) <= r) s.add(row * spec.cols + col);
      }
    return s;
  }

  function revealedSet(g: FogGrid): Set<number> {
    const s = new Set<number>();
    for (let row = 0; row < g.rows; row++)
      for (let col = 0; col < g.cols; col++) if (g.isCellRevealed(col, row)) s.add(row * g.cols + col);
    return s;
  }

  it('reveals exactly the cells whose centres are in radius', () => {
    for (const [x, z, r] of [[200, 200, 55], [203.7, 118.2, 41], [200, 200, 0], [195, 195, 5]] as const) {
      const g = new FogGrid(spec);
      g.reveal(x, z, r);
      expect(revealedSet(g)).toEqual(expectedCells(x, z, r));
      expect(g.revealedCount).toBe(expectedCells(x, z, r).size);
    }
  });

  it('is idempotent', () => {
    const g = new FogGrid(spec);
    const first = g.reveal(200, 200, 60);
    expect(first).toBeGreaterThan(0);
    expect(g.reveal(200, 200, 60)).toBe(0);
    expect(g.revealedCount).toBe(first);
  });

  it('includes cells exactly on the radius and excludes just outside', () => {
    const g = new FogGrid(spec);
    g.reveal(105, 105, 20); // centres at 105 +- 20 on-axis are exactly on the border
    expect(g.isCellRevealed(12, 10)).toBe(true);
    expect(g.isCellRevealed(8, 10)).toBe(true);
    expect(g.isCellRevealed(13, 10)).toBe(false);
  });

  it('clips at grid borders and ignores far or bad input', () => {
    const g = new FogGrid(spec);
    g.reveal(0, 0, 30);
    expect(g.isCellRevealed(0, 0)).toBe(true);
    expect(g.revealedCount).toBe(expectedCells(0, 0, 30).size);
    const h = new FogGrid(spec);
    expect(h.reveal(9999, 9999, 50)).toBe(0);
    expect(h.reveal(NaN, 0, 50)).toBe(0);
    expect(h.reveal(0, 0, -1)).toBe(0);
    expect(h.isRevealed(-5, 5)).toBe(false);
  });

  it('isRevealed uses world coordinates', () => {
    const g = new FogGrid(spec);
    g.reveal(105, 105, 1);
    expect(g.isRevealed(101, 109)).toBe(true);
    expect(g.isRevealed(111, 105)).toBe(false);
  });

  it('round trips through encode/decode', () => {
    const g = new FogGrid(spec);
    g.reveal(200, 200, 80);
    g.reveal(15, 380, 60);
    const d = FogGrid.decode(g.encode(), spec);
    expect(revealedSet(d)).toEqual(revealedSet(g));
    expect(d.revealedCount).toBe(g.revealedCount);
    expect(d.spec).toEqual(spec);
  });

  it('round trips a non-multiple-of-8 grid and an empty/full grid', () => {
    const s = { originX: -3.5, originZ: 7.25, cellSize: 12.5, cols: 13, rows: 7 };
    const g = new FogGrid(s);
    expect(FogGrid.decode(g.encode(), s).revealedCount).toBe(0);
    g.reveal(0, 0, 1e6);
    expect(g.revealedCount).toBe(91);
    expect(FogGrid.decode(g.encode(), s).revealedCount).toBe(91);
  });

  it('returns an empty grid on corrupt input', () => {
    const g = new FogGrid(spec);
    g.reveal(200, 200, 80);
    const good = g.encode();
    const bad: unknown[] = [
      undefined,
      null,
      42,
      '',
      '!!!not base64!!!',
      'abc',
      good.slice(0, good.length - 8),
      good.slice(0, 20),
      good + 'AAAA',
      btoa('hello world, definitely not a fog grid at all, nope'),
    ];
    for (const b of bad) {
      const d = FogGrid.decode(b, spec);
      expect(d.revealedCount).toBe(0);
      expect(d.spec).toEqual(spec);
    }
  });

  it('returns an empty grid when origin, cell size or dimensions mismatch', () => {
    const g = new FogGrid(spec);
    g.reveal(200, 200, 80);
    const enc = g.encode();
    for (const other of [
      { ...spec, originX: 1 },
      { ...spec, originZ: -1 },
      { ...spec, cellSize: 20 },
      { ...spec, cols: 41 },
      { ...spec, rows: 39 },
    ]) {
      const d = FogGrid.decode(enc, other);
      expect(d.revealedCount).toBe(0);
      expect(d.spec).toEqual(other);
    }
  });

  it('rejects invalid constructor specs', () => {
    expect(() => new FogGrid({ ...spec, cellSize: 0 })).toThrow(RangeError);
    expect(() => new FogGrid({ ...spec, cols: 0 })).toThrow(RangeError);
    expect(() => new FogGrid({ ...spec, rows: 1.5 })).toThrow(RangeError);
  });

  it('forBounds covers the default 4 km world with 50 m cells', () => {
    const g = FogGrid.forBounds();
    expect(g.cols).toBe(80);
    expect(g.rows).toBe(80);
    expect(g.originX).toBe(-2000);
  });

  it('fits a 24 km x 18 km world: raw 21.6 KB, sparse saves are tiny', () => {
    const g = FogGrid.forBounds({ minX: -12000, maxX: 12000, minZ: -9000, maxZ: 9000 }, 50);
    expect(g.cols).toBe(480);
    expect(g.rows).toBe(360);
    const empty = g.encode();
    expect(empty.length).toBeLessThan(100);
    // A long walk: a 12 km line of reveals.
    for (let x = -6000; x <= 6000; x += 100) g.reveal(x, 0, MAP_TUNING.revealRadius);
    const walked = g.encode();
    expect(walked.length).toBeLessThan(8000);
    // Worst case (everything revealed) is still well under the raw bitset size in base64.
    const full = FogGrid.forBounds({ minX: -12000, maxX: 12000, minZ: -9000, maxZ: 9000 }, 50);
    full.reveal(0, 0, 1e6);
    expect(full.revealedCount).toBe(480 * 360);
    expect(full.encode().length).toBeLessThan(Math.ceil((480 * 360) / 8 / 3) * 4 + 100);
    const back = FogGrid.decode(walked, g.spec);
    expect(back.revealedCount).toBe(g.revealedCount);
  });
});

describe('markers', () => {
  const stones = [
    { id: 'chapel', x: 80, z: 50, state: 'rekindled' as const, discovered: true },
    { id: 'north', x: 0, z: -900, state: 'dormant' as const, discovered: false },
    { id: 'kettlewick', x: 12, z: 150, state: 'dormant' as const, discovered: true },
    { id: 'odd', x: NaN, z: 0, state: 'rekindled' as const, discovered: true },
  ];

  it('excludes undiscovered dormant stones and bad positions', () => {
    const m = buildMarkers({ waystones: stones });
    expect(m.map((x) => x.id)).toEqual(['chapel', 'kettlewick']);
    expect(m[0]!.travelable).toBe(true);
    expect(m[1]!.travelable).toBe(false);
  });

  it('keeps an undiscovered but rekindled stone', () => {
    const m = buildMarkers({ waystones: [{ id: 'a', x: 1, z: 1, state: 'rekindled', discovered: false }] });
    expect(m).toHaveLength(1);
  });

  it('adds poi then quest marker, quest optional', () => {
    const m = buildMarkers({
      waystones: stones,
      poi: [{ id: 'mill', x: 5, z: 5, label: 'Mill' }],
      quest: { id: 'q1', x: 9, z: 9 },
    });
    expect(m.map((x) => x.kind)).toEqual(['waystone', 'waystone', 'poi', 'quest']);
    expect(m[2]!.label).toBe('Mill');
    expect(buildMarkers({ waystones: [], quest: null })).toEqual([]);
  });

  const list = (): MapMarker[] =>
    buildMarkers({
      waystones: [
        { id: 'a', x: 100, z: 0, state: 'rekindled', discovered: true },
        { id: 'b', x: 10, z: 0, state: 'rekindled', discovered: true },
        { id: 'c', x: 500, z: 0, state: 'rekindled', discovered: true },
      ],
    });

  it('orders by distance from the player', () => {
    expect(selectionOrder(list(), 0, 0).map((m) => m.id)).toEqual(['b', 'a', 'c']);
  });

  it('steps next/prev with wrap', () => {
    const o = selectionOrder(list(), 0, 0);
    expect(stepSelection(o, null, 1)).toBe('b');
    expect(stepSelection(o, null, -1)).toBe('c');
    expect(stepSelection(o, 'b', 1)).toBe('a');
    expect(stepSelection(o, 'c', 1)).toBe('b');
    expect(stepSelection(o, 'b', -1)).toBe('c');
    expect(stepSelection(o, 'gone', 1)).toBe('b');
  });

  it('handles zero markers and a single marker', () => {
    expect(stepSelection([], null, 1)).toBeNull();
    expect(stepSelection([], 'x', -1)).toBeNull();
    const one = [list()[0]!];
    expect(stepSelection(one, 'a', 1)).toBe('a');
    expect(stepSelection(one, 'a', -1)).toBe('a');
  });

  it('finds the nearest marker', () => {
    expect(nearestMarker(list(), 90, 0)?.id).toBe('a');
    expect(nearestMarker(list(), 90, 0, 5)).toBeNull();
    expect(nearestMarker([], 0, 0)).toBeNull();
  });

  it('hit tests a click against marker pixels', () => {
    const m = list(); // a at x=100 -> u = (2100/4000)*256 = 134.4 ; v = 128
    const p = worldToMap(100, 0, B, 256);
    expect(hitTestMarker(m, p.u + 3, p.v - 3, B, 256)?.id).toBe('a');
    expect(hitTestMarker(m, p.u - 70, p.v, B, 256)).toBeNull();
    expect(hitTestMarker([], 1, 1, B, 256)).toBeNull();
    // Overlapping: nearest wins.
    const near = hitTestMarker(m, worldToMap(10, 0, B, 256).u + 1, 128, B, 256, 20);
    expect(near?.id).toBe('b');
  });
});
