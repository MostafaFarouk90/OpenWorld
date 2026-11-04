import { describe, expect, it } from 'vitest';
import { ARENA as DEEPS_ARENA, DEEPS_DEF } from '../../greyfen/deepsInterior';
import { ArenaFrame, distToSegment, LOCAL_CENTRE, nearestIndex } from './arenaGeometry';
import { WAVE } from './tuning';

// A frame far from the origin, as the Deeps float over the Greyfen.
const C = { x: 2272, z: 11944 };
const f = new ArenaFrame(C);
const w = (lx: number, lz: number) => ({ x: lx + f.ox, z: lz + f.oz });
const walk = (lx: number, lz: number, drop = true) => f.walkable(lx + f.ox, lz + f.oz, drop);
const anchor = (id: string) => DEEPS_DEF.anchors.find((a) => a.id === id)!;

/** Every walkable 0.5 m cell reachable from `start` (4-neighbour flood fill), as "i,j" keys. */
function flood(start: { x: number; z: number }, drop: boolean): Set<string> {
  const h = DEEPS_ARENA.hall;
  const key = (x: number, z: number) => `${Math.round((x - h.x0) / 0.5)},${Math.round((z - h.z0) / 0.5)}`;
  const snap = (v: number, o: number) => o + Math.round((v - o) / 0.5) * 0.5 + 0.25;
  const seen = new Set<string>();
  const q: [number, number][] = [[snap(start.x, h.x0), snap(start.z, h.z0)]];
  while (q.length) {
    const [x, z] = q.pop()!;
    const k = key(x, z);
    if (seen.has(k) || !walk(x, z, drop)) continue;
    seen.add(k);
    q.push([x + 0.5, z], [x - 0.5, z], [x, z + 0.5], [x, z - 0.5]);
  }
  return seen;
}

describe('Murkjaw arena geometry', () => {
  it('the frame puts the local centre on the centre anchor', () => {
    expect(f.ox + LOCAL_CENTRE.x).toBe(C.x);
    expect(f.oz + LOCAL_CENTRE.z).toBe(C.z);
    expect(anchor('greyfen.d05.arena.centre')).toMatchObject({ x: LOCAL_CENTRE.x, z: LOCAL_CENTRE.z });
  });

  it('the ring, the island, its pools and the crossings are walkable; channels and outside the hall are not', () => {
    expect(walk(-46, -56)).toBe(true); // west ring
    expect(walk(-10, -56)).toBe(true); // east ring
    expect(walk(-28, -56)).toBe(true); // island
    expect(walk(-31, -59)).toBe(true); // wading pool 1
    expect(walk(-28, -45)).toBe(true); // north crossing
    expect(walk(-28, -67)).toBe(true); // south crossing
    expect(walk(-39, -56)).toBe(true); // west crossing
    expect(walk(-37, -45)).toBe(false); // north channel
    expect(walk(-39, -52)).toBe(false); // west channel
    expect(walk(-17, -60)).toBe(false); // east channel
    expect(walk(-60, -56)).toBe(false); // outside
  });

  it('the drop crossing is walkable only while it stands', () => {
    expect(walk(-17, -56, true)).toBe(true);
    expect(walk(-17, -56, false)).toBe(false);
    expect(f.nearDrop(w(-17, -56).x, w(-17, -56).z, 0)).toBe(true);
    expect(f.nearDrop(w(-17, -53.5).x, w(-17, -53.5).z, 1)).toBe(true);
    expect(f.nearDrop(w(-17, -52).x, w(-17, -52).z, 1)).toBe(false);
  });

  it('every surface point lies over a channel and every beach, rack and walkway point on a walkway', () => {
    for (let n = 1; n <= 6; n++) {
      const s = anchor(`greyfen.d05.arena.surface.${n}`);
      const b = anchor(`greyfen.d05.arena.beach.${n}`);
      expect(walk(s.x, s.z), `surface ${n}`).toBe(false);
      expect(walk(b.x, b.z), `beach ${n}`).toBe(true);
      // Each beach is the walkway in front of its own surfacing point.
      expect(Math.hypot(b.x - s.x, b.z - s.z)).toBeLessThan(8);
    }
    for (let n = 1; n <= 4; n++) expect(walk(anchor(`greyfen.d05.arena.rack.${n}`).x, anchor(`greyfen.d05.arena.rack.${n}`).z)).toBe(true);
    for (let n = 1; n <= 8; n++) expect(walk(anchor(`greyfen.d05.arena.walkway.${n}`).x, anchor(`greyfen.d05.arena.walkway.${n}`).z)).toBe(true);
  });

  it('with the drop gone every walkway point, rack, beach and both doors stay connected', () => {
    const door = anchor('greyfen.d05.arena.door');
    for (const drop of [true, false]) {
      const reach = flood(door, drop);
      const h = DEEPS_ARENA.hall;
      const has = (p: { x: number; z: number }) =>
        reach.has(`${Math.round((p.x - h.x0 - 0.25) / 0.5)},${Math.round((p.z - h.z0 - 0.25) / 0.5)}`) ||
        reach.has(`${Math.floor((p.x - h.x0) / 0.5)},${Math.floor((p.z - h.z0) / 0.5)}`);
      const ids = [
        ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `greyfen.d05.arena.walkway.${n}`),
        ...[1, 2, 3, 4].map((n) => `greyfen.d05.arena.rack.${n}`),
        ...[1, 2, 3, 4, 5, 6].map((n) => `greyfen.d05.arena.beach.${n}`),
        'greyfen.d05.arena.player',
        'greyfen.d05.arena.exit-inside',
      ];
      for (const id of ids) expect(has(anchor(id)), `${id} (drop standing ${drop})`).toBe(true);
    }
  });

  it('the wave push stops short of a walkway edge, and a start off the walkway gets nothing', () => {
    // On the west crossing (z -58..-54), shoved south toward the west channel: room is the distance to the edge minus the margin.
    const from = w(-39, -56);
    const d = f.safePush(from, { x: 0, z: -1 }, 4.5, WAVE.edgeMargin, true);
    expect(d).toBeGreaterThan(1.4);
    expect(d).toBeLessThanOrEqual(2 - WAVE.edgeMargin + 1e-6);
    // Along the crossing toward the ring there is room for the whole shove.
    expect(f.safePush(from, { x: -1, z: 0 }, 4.5, WAVE.edgeMargin, true)).toBeCloseTo(4.5, 5);
    // Toward the dropped crossing from the island's east edge: blocked once it is gone.
    const island = w(-23, -56);
    expect(f.safePush(island, { x: 1, z: 0 }, 4.5, WAVE.edgeMargin, true)).toBeCloseTo(4.5, 5);
    expect(f.safePush(island, { x: 1, z: 0 }, 4.5, WAVE.edgeMargin, false)).toBeLessThan(1);
    expect(f.safePush(w(-37, -45), { x: 1, z: 0 }, 4.5, WAVE.edgeMargin, true)).toBe(0);
    expect(f.safePush(from, { x: 1, z: 0 }, 0, WAVE.edgeMargin, true)).toBe(0);
  });

  it('nearestIndex skips the excluded point unless it is the only one; distToSegment clamps', () => {
    const pts = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 20, z: 0 }];
    expect(nearestIndex(pts, { x: 1, z: 0 })).toBe(0);
    expect(nearestIndex(pts, { x: 1, z: 0 }, 0)).toBe(1);
    expect(nearestIndex([{ x: 0, z: 0 }], { x: 5, z: 0 }, 0)).toBe(0);
    expect(nearestIndex([], { x: 0, z: 0 })).toBe(-1);
    expect(distToSegment({ x: 5, z: 3 }, { x: 0, z: 0 }, { x: 10, z: 0 })).toBe(3);
    expect(distToSegment({ x: -4, z: 3 }, { x: 0, z: 0 }, { x: 10, z: 0 })).toBe(5);
    expect(distToSegment({ x: 1, z: 1 }, { x: 0, z: 0 }, { x: 0, z: 0 })).toBeCloseTo(Math.SQRT2);
  });
});
