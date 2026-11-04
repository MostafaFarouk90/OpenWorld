import { describe, expect, it } from 'vitest';
import {
  bucketByCell,
  buildTileColliders,
  cellOf,
  COLLIDER_CELL,
  EMPTY_KEEP_OUT,
  keepOutHit,
  MAX_RUN_PIECE,
  MIN_HEIGHT,
  NO_COLLIDER,
  pointToRect,
  rectsOverlap,
  segmentToRect,
  SHAPES,
  shapeFor,
  TRUNK_HALF,
  type KeepOut,
} from './colliders';
import type { PlacementRow } from './PlacementField';

const fence = (x: number, z: number, yaw = 0, id = 'wattle-fence', extra: Partial<PlacementRow> = {}): PlacementRow => ({ id, x, z, yaw, scale: 1, ...extra });
/** n wattle modules along +x from (x0, z), 3.4 m apart. */
const line = (n: number, x0 = 0, z = 0, id = 'wattle-fence'): PlacementRow[] => Array.from({ length: n }, (_, i) => fence(x0 + 3.4 * i, z, 0, id));
const ko = (p: Partial<KeepOut>): KeepOut => ({ ...EMPTY_KEEP_OUT, ...p });

describe('run merging', () => {
  it('turns consecutive collinear modules into one box, not one per module', () => {
    const { boxes, stats } = buildTileColliders('h1', line(9));
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toMatchObject({ kind: 'run', modules: 9, id: 'wattle-fence' });
    // 9 modules of 3.4 m: centres 0 .. 27.2, the box spans the module ends -1.7 .. 28.9
    expect(boxes[0]!.cx).toBeCloseTo(13.6, 5);
    expect(boxes[0]!.hx).toBeCloseTo(15.3, 5);
    expect(boxes[0]!.hz).toBeCloseTo(0.2, 5);
    expect(stats).toMatchObject({ modules: 9, runs: 1, runModules: 9, boxes: 1, dropped: 0 });
  });

  it('joins modules up to 1.1 module lengths apart and breaks on a bigger gap (a gate stays open)', () => {
    const joined = buildTileColliders('h1', [fence(0, 0), fence(3.4 * 1.1, 0)]).boxes;
    expect(joined).toHaveLength(1);
    const gap = buildTileColliders('h1', [fence(0, 0), fence(3.4 * 1.1 + 0.05, 0)]).boxes;
    expect(gap).toHaveLength(2);
    // a one-module hole (centre to centre 2 modules) is a real gap of one module length: 3.4 m
    const hole = buildTileColliders('h1', [...line(3), ...line(3, 3.4 * 4)]).boxes.sort((a, b) => a.cx - b.cx);
    expect(hole).toHaveLength(2);
    const clear = hole[1]!.cx - hole[1]!.hx - (hole[0]!.cx + hole[0]!.hx);
    expect(clear).toBeCloseTo(3.4, 5);
  });

  it('keeps runs of different yaw, id or sideways offset apart', () => {
    expect(buildTileColliders('h1', [fence(0, 0, 0), fence(3.4, 0, 90)]).boxes).toHaveLength(2);
    expect(buildTileColliders('h1', [fence(0, 0, 0), fence(3.4, 0, 0, 'picket-fence')]).boxes).toHaveLength(2);
    expect(buildTileColliders('h1', [fence(0, 0), fence(3.4, 0.5)]).boxes).toHaveLength(2);
    // within 0.3 m sideways they are one line
    expect(buildTileColliders('h1', [fence(0, 0), fence(3.4, 0.2)]).boxes).toHaveLength(1);
  });

  it('treats yaw 90 and 270 (and 0 and 180) as the same line', () => {
    const rows = [fence(0, 0, 90), fence(0, 3.4, 270), fence(0, 6.8, 90)];
    const boxes = buildTileColliders('h1', rows).boxes;
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.modules).toBe(3);
    // the box runs along z for yaw 90
    const [b] = boxes;
    const c = Math.cos(b!.yaw);
    const s = Math.sin(b!.yaw);
    expect(Math.abs(c * 0 + s * 1)).toBeGreaterThan(0.99); // local x = (cos, -sin) is along z
  });

  it('merges the ashen variant into its base id family', () => {
    expect(buildTileColliders('h4', [fence(0, 0, 0, 'stonewall-low'), fence(3.4, 0, 0, 'stonewall-low-ashen')]).boxes).toHaveLength(1);
    expect(shapeFor('hedge-straight-ashen')).toBe(SHAPES['hedge-straight']);
  });

  it('cuts a long run into pieces of at most 32 m (so the 64 m cells stay near their boxes)', () => {
    const { boxes } = buildTileColliders('h2', line(120));
    expect(boxes.length).toBeGreaterThan(10);
    for (const b of boxes) expect(2 * b.hx).toBeLessThanOrEqual(MAX_RUN_PIECE + 1e-6);
    expect(boxes.reduce((n, b) => n + b.modules, 0)).toBe(120);
  });

  it('scales a module with the row scale', () => {
    const b = buildTileColliders('h1', [fence(0, 0, 0, 'wattle-fence', { scale: 2 })]).boxes[0]!;
    expect(b.hx).toBeCloseTo(3.4, 5);
    expect(b.hz).toBeCloseTo(0.4, 5);
  });

  it('merges every module of the shipped fence ids and never leaves a box per post', () => {
    for (const id of ['wattle-fence', 'picket-fence', 'scorched-fence', 'stonewall-low', 'hedge-straight', 'stonewall-high', 'fence']) {
      expect(buildTileColliders('h3', line(8, 0, 0, id)).boxes, id).toHaveLength(1);
    }
  });
});

describe('shapes', () => {
  it('gives every box at least MIN_HEIGHT (no 0.5 m trip)', () => {
    for (const [id, s] of Object.entries(SHAPES)) {
      const rows = [{ id, x: 0, z: 0, yaw: 0 }];
      for (const b of buildTileColliders('h4', rows).boxes) expect(b.h, id).toBeGreaterThanOrEqual(MIN_HEIGHT);
      expect(s.h, id).toBeGreaterThan(0);
    }
  });

  it('makes carts 0.9 x 0.8 of the target and the stand-in footprints from targets.json', () => {
    const cart = buildTileColliders('h4', [{ id: 'handcart-a', x: 10, z: 20, yaw: 0 }]).boxes[0]!;
    expect(cart).toMatchObject({ kind: 'box', cx: 10, cz: 20 });
    expect(cart.hx * 2).toBeCloseTo(2.2 * 0.9, 5);
    expect(cart.hz * 2).toBeCloseTo(1.2 * 0.8, 5);
    const mine = buildTileColliders('h4', [{ id: 'mine-cart', x: 0, z: 0 }]).boxes[0]!;
    expect([mine.hx * 2, mine.hz * 2]).toEqual([1.8 * 0.9, 1 * 0.8].map((v) => expect.closeTo(v, 5)));
    const slag = buildTileColliders('h4', [{ id: 'slag-heap', x: 0, z: 0 }]).boxes[0]!;
    expect(slag.hx * 2).toBeCloseTo(5 * 0.85, 5);
    expect(slag.h).toBe(2.5);
    expect(buildTileColliders('h4', [{ id: 'smelter-chimney', x: 0, z: 0 }]).boxes[0]!.h).toBe(9);
  });

  it('rotates a box with the row yaw', () => {
    const b = buildTileColliders('h4', [{ id: 'cart-goods-a', x: 0, z: 0, yaw: 90 }]).boxes[0]!;
    expect(b.yaw).toBeCloseTo(Math.PI / 2, 6);
  });

  it('puts the stall collider on the table front only, against the model front (+Z local)', () => {
    const north = buildTileColliders('h3', [{ id: 'market-stall-a', x: 100, z: 200, yaw: 0 }]).boxes[0]!;
    expect(north.hx * 2).toBeCloseTo(3, 5);
    expect(north.hz * 2).toBeCloseTo(0.45, 5);
    // front band: depth 2.4, so the centre moves (2.4 - 0.45) / 2 toward +Z
    expect(north.cx).toBeCloseTo(100, 5);
    expect(north.cz).toBeCloseTo(200 + (2.4 - 0.45) / 2, 5);
    // the awning area (the rear 1.95 m of the stall) is not covered
    expect(pointToRect(north, 100, 200 - 0.5)).toBeGreaterThan(0.9);
    // turned 90 degrees the front faces +X
    const east = buildTileColliders('h3', [{ id: 'market-stall-b', x: 100, z: 200, yaw: 90 }]).boxes[0]!;
    expect(east.cx).toBeCloseTo(100 + (2.4 - 0.45) / 2, 5);
    expect(east.cz).toBeCloseTo(200, 5);
    expect(north.h).toBe(1);
  });

  it('makes no collider for barrels, crates, ore piles, coal heaps, outbuildings, litter and ground cover', () => {
    const ids = [...NO_COLLIDER, 'stable-a', 'cottage-thatch-a', 'barn-a', 'haystack-round', 'grass-clump-a', 'flower-patch-a', 'bush-round-a', 'boulder-large-a', 'litter-a', 'stump-a', 'fence_broken', 'post_lantern'];
    const rows = ids.map((id, i) => ({ id, x: i * 5, z: 0, yaw: 0 }));
    for (const tile of ['h4', 'b1']) {
      const r = buildTileColliders(tile, rows);
      expect(r.boxes).toEqual([]);
      expect(r.stats).toMatchObject({ modules: 0, boxes: 0 });
    }
  });

  it('gives trees a trunk of r 0.3 in the B tiles only', () => {
    const rows = [{ id: 'oak-a', x: 5, z: 6, yaw: 33, scale: 1.4 }, { id: 'birch-a', x: 9, z: 9 }];
    const b = buildTileColliders('b3', rows);
    expect(b.boxes).toHaveLength(2);
    expect(b.boxes[0]).toMatchObject({ kind: 'trunk', hx: TRUNK_HALF, hz: TRUNK_HALF, yaw: 0, cx: 5, cz: 6 });
    expect(b.stats.trunks).toBe(2);
    for (const tile of ['h1', 'h2', 'h3', 'h4', 'd1']) expect(buildTileColliders(tile, rows).boxes, tile).toEqual([]);
  });

  it('skips rows on a roof deck (dy) and rows with bad numbers, and survives garbage', () => {
    const rows = [
      fence(0, 0, 0, 'wattle-fence', { dy: 8 }),
      { id: 'handcart-a', x: Number.NaN, z: 0 },
      { id: 'handcart-a', x: 0, z: Infinity },
      { id: 'handcart-a', x: 50, z: 50, yaw: Number.NaN, scale: -3 },
      { id: 'barn-a', x: 1, z: 1 },
      null as unknown as PlacementRow,
    ];
    const r = buildTileColliders('h3', rows);
    expect(r.stats.skipped).toBe(3);
    expect(r.boxes).toHaveLength(1);
    expect(r.boxes[0]!.yaw).toBe(0);
    expect(r.boxes[0]!.hx).toBeCloseTo(1.0, 1);
    expect(buildTileColliders('h3', []).boxes).toEqual([]);
  });
});

describe('keep-walkable rule', () => {
  it('drops a module that touches an anchor (r 1.2), a door point, a sphere trigger', () => {
    const rows = line(5);
    const r = buildTileColliders('h1', rows, ko({ discs: [{ x: 6.8, z: 0.6, r: 1.2, why: 'anchor quest.a' }] }));
    // the anchor is 0.6 m (centre) from the module at 6.8: inside; the neighbours are 3.4 m away, their ends 1.7 m off, outside r 1.2
    expect(r.stats).toMatchObject({ modules: 5, dropped: 1, droppedBy: { anchor: 1 } });
    expect(r.boxes).toHaveLength(2); // the run is split in two by the gap
    expect(r.boxes.reduce((n, b) => n + b.modules, 0)).toBe(4);
    expect(buildTileColliders('h1', rows, ko({ discs: [{ x: 6.8, z: 3, r: 1.2, why: 'anchor x' }] })).stats.dropped).toBe(0);
    expect(buildTileColliders('h1', rows, ko({ discs: [{ x: 6.8, z: 1.5, r: 2, why: 'door d' }] })).stats.droppedBy).toEqual({ door: 1 });
    expect(buildTileColliders('h1', rows, ko({ discs: [{ x: 0, z: 0, r: 2, why: 'trigger t' }] })).stats.droppedBy).toEqual({ trigger: 2 });
  });

  it('drops modules within a lane half width of its centre line and keeps the rest', () => {
    const rows = line(8); // along x at z 0
    const lane = ko({ segments: [{ ax: 13.6, az: -20, bx: 13.6, bz: 20, r: 4, why: 'lane main' }] });
    const r = buildTileColliders('h2', rows, lane);
    // centre 13.6 is module 4; its ends are 1.7 off the centre line, neighbours reach 3.4 - 1.7 = 1.7 .. so modules 3, 4 and 5 are within 4 m
    expect(r.stats.droppedBy).toEqual({ lane: 3 });
    expect(r.boxes.map((b) => b.modules).sort()).toEqual([2, 3]);
    // the gap that is left is a walkable lane: at least its width
    const sorted = r.boxes.sort((a, b) => a.cx - b.cx);
    const free = sorted[1]!.cx - sorted[1]!.hx - (sorted[0]!.cx + sorted[0]!.hx);
    expect(free).toBeGreaterThanOrEqual(8);
  });

  it('keeps a chase corridor clear 1.5 m on each side', () => {
    const chase = ko({ segments: [{ ax: -10, az: 1.6, bx: 40, bz: 1.6, r: 1.5, why: 'chase chase.m10' }] });
    // a fence parallel to the line, 1.6 m off: its edge is 1.4 m away: dropped. At 2.0 m (edge 1.8 m) it stays.
    expect(buildTileColliders('h2', line(4, 0, 0), chase).stats.droppedBy).toEqual({ chase: 4 });
    expect(buildTileColliders('h2', line(4, 0, -0.4), chase).stats.dropped).toBe(0);
  });

  it('drops a box that overlaps a trigger box (rotated too) and keeps one beside it', () => {
    const trig = ko({ boxes: [{ cx: 10, cz: 0, hx: 3, hz: 6, yaw: 0, why: 'trigger trg.yard' }] });
    expect(buildTileColliders('h4', [{ id: 'handcart-a', x: 10, z: 0 }], trig).stats.droppedBy).toEqual({ trigger: 1 });
    expect(buildTileColliders('h4', [{ id: 'handcart-a', x: 15, z: 0 }], trig).stats.dropped).toBe(0);
    const turned = ko({ boxes: [{ cx: 0, cz: 0, hx: 0.5, hz: 8, yaw: Math.PI / 4, why: 'trigger t' }] });
    expect(buildTileColliders('h4', [{ id: 'handcart-a', x: 4, z: 4 }], turned).stats.dropped).toBe(1);
    expect(buildTileColliders('h4', [{ id: 'handcart-a', x: 4, z: -4 }], turned).stats.dropped).toBe(0);
  });

  it('reports the drop counts per reason and keeps non-colliding rows out of the count', () => {
    const rows = [...line(3), { id: 'barrel', x: 0, z: 0 }];
    const r = buildTileColliders('h1', rows, ko({ discs: [{ x: 0, z: 0, r: 5, why: 'anchor a' }] }));
    expect(r.stats.modules).toBe(3);
    expect(r.stats.droppedBy.anchor).toBe(r.stats.dropped);
  });

  it('has exact geometry helpers (point, segment, overlap)', () => {
    const rect = { cx: 0, cz: 0, hx: 2, hz: 1, yaw: 0 };
    expect(pointToRect(rect, 0, 0)).toBe(0);
    expect(pointToRect(rect, 5, 0)).toBeCloseTo(3, 6);
    expect(pointToRect(rect, 5, 5)).toBeCloseTo(Math.hypot(3, 4), 6);
    expect(segmentToRect(rect, -10, 3, 10, 3)).toBeCloseTo(2, 3);
    expect(segmentToRect(rect, -10, 0, 10, 0)).toBe(0);
    expect(rectsOverlap(rect, { cx: 3.9, cz: 0, hx: 2, hz: 1, yaw: 0 })).toBe(true);
    expect(rectsOverlap(rect, { cx: 4.1, cz: 0, hx: 2, hz: 1, yaw: 0 })).toBe(false);
    expect(keepOutHit(rect, EMPTY_KEEP_OUT)).toBeNull();
  });
});

describe('cells', () => {
  it('buckets boxes by the 64 m cell of their centre', () => {
    const boxes = buildTileColliders('h4', [{ id: 'handcart-a', x: 10, z: 10 }, { id: 'handcart-a', x: 70, z: 10 }, { id: 'handcart-a', x: -1, z: -1 }]).boxes;
    const map = bucketByCell(boxes);
    expect([...map.keys()].sort()).toEqual(['-1,-1', '0,0', '1,0']);
    expect(cellOf(63.9, 0)).toEqual([0, 0]);
    expect(cellOf(64, 0)).toEqual([1, 0]);
    expect(COLLIDER_CELL).toBe(64);
  });
});
