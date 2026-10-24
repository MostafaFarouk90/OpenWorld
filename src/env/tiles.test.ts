// Environment pass: every registered tile's rows name known ids, sit inside the tile, and stay off the frozen layout.
import { describe, expect, it } from 'vitest';
import { BRIGHTWATER_LAYOUT } from '../region/brightwater.layout';
import { pointInFootprint } from '../region/geometry';
import { resolveModel } from './resolve';
import targets from './targets.json';
import { TILES } from './tiles';

const known = new Set(Object.keys((targets as { objects: Record<string, unknown> }).objects));

describe('B1 placements', () => {
  const rows = TILES.b1!;

  it('is registered and large enough to matter', () => {
    expect(rows.length).toBeGreaterThan(700);
  });

  it('uses only ids from the scale table or the KayKit aliases', () => {
    const unknown = [...new Set(rows.map((r) => r.id))].filter((id) => !known.has(id) && resolveModel(id).source !== 'kaykit');
    expect(unknown).toEqual([]);
  });

  it('lies inside the tile core (band rows belong to the neighbour) and never inside a structure footprint', () => {
    for (const r of rows) {
      expect(r.x).toBeGreaterThanOrEqual(-100);
      expect(r.x).toBeLessThanOrEqual(160);
      expect(r.z).toBeGreaterThanOrEqual(-30);
      expect(r.z).toBeLessThanOrEqual(230);
      expect(Number.isFinite(r.x) && Number.isFinite(r.z), r.id).toBe(true);
    }
    for (const s of BRIGHTWATER_LAYOUT.structures) {
      if (s.mode === 'open') continue;
      for (const r of rows) expect(pointInFootprint(s, r.x, r.z, 0.4), `${r.id} in ${s.id}`).toBe(false);
    }
  });

  it('keeps clear of anchors the player stands on (1 m)', () => {
    for (const a of BRIGHTWATER_LAYOUT.anchors) {
      for (const r of rows) {
        if (r.id.startsWith('grass') || r.id.startsWith('flower')) continue;
        expect(Math.hypot(r.x - a.x, r.z - a.z), `${r.id} on ${a.id}`).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

// B4: the Quenchstone Shrine and the east road, x 700..1100, z -300..200.
describe('B4 placements', () => {
  const rows = TILES.b4!;
  const isGround = (id: string): boolean => /^(grass|flower)/.test(id);
  // The Cinderlands hub pad, provisional id rekindled-hearth: 28 x 28 m of empty flat ground east of the basin (centre 995,-168).
  const PAD = { x: 995, z: -168, half: 14 };
  const PAD_CLEAR = 2;

  it('is registered and rich (a sparse tile still has over a thousand rows)', () => {
    expect(rows.length).toBeGreaterThan(1000);
  });

  it('resolves every id to a model (no placeholders), dead trees included', () => {
    const placeholders = [...new Set(rows.map((r) => r.id))].filter((id) => resolveModel(id).source === 'placeholder');
    expect(placeholders).toEqual([]);
    for (const id of ['ash-tree-dead-a', 'ash-tree-dead-b']) expect(resolveModel(id).source).toBe('kaykit');
  });

  it('lies inside the tile core', () => {
    for (const r of rows) {
      expect(r.x).toBeGreaterThanOrEqual(700);
      expect(r.x).toBeLessThanOrEqual(1100);
      expect(r.z).toBeGreaterThanOrEqual(-300);
      expect(r.z).toBeLessThanOrEqual(200);
    }
  });

  it('keeps the 28 x 28 m hearth pad empty, with 2 m to spare (ground cover included)', () => {
    const inside = rows.filter((r) => Math.abs(r.x - PAD.x) <= PAD.half + PAD_CLEAR && Math.abs(r.z - PAD.z) <= PAD.half + PAD_CLEAR);
    expect(inside.map((r) => `${r.id} ${r.x},${r.z}`)).toEqual([]);
  });

  it('keeps the shrine trigger to ground cover and ferns, and the basin apron bare', () => {
    const t = BRIGHTWATER_LAYOUT.triggers.find((x) => x.id === 'trg.shrine.basin')!;
    expect(t.shape).toBe('sphere');
    for (const r of rows) {
      const d = Math.hypot(r.x - t.x, r.z - t.z);
      if (d < 10) expect(r.id, `${r.id} in the shrine trigger`).toMatch(/^(fern|flower|grass)/);
      expect(d, `${r.id} on the basin apron`).toBeGreaterThanOrEqual(6.5);
    }
  });

  it('keeps clear of structures, anchors and the road', () => {
    for (const s of BRIGHTWATER_LAYOUT.structures) {
      if (s.mode === 'open') continue;
      for (const r of rows) expect(pointInFootprint(s, r.x, r.z, 0.4), `${r.id} in ${s.id}`).toBe(false);
    }
    for (const a of BRIGHTWATER_LAYOUT.anchors) {
      if (a.x < 600 || a.x > 1150) continue;
      for (const r of rows) if (!isGround(r.id)) expect(Math.hypot(r.x - a.x, r.z - a.z), `${r.id} on ${a.id}`).toBeGreaterThanOrEqual(1);
    }
    for (const r of rows) if (!/^(post_lantern|milestone|signpost|crow-perch)/.test(r.id)) expect(Math.abs(r.z + 150), `${r.id} on the road at ${r.x}`).toBeGreaterThanOrEqual(3.59);
  });

  it('turns grey to the east: dead trees replace live ones', () => {
    expect(rows.filter((r) => r.x < 820 && /^(oak-[abc]|birch)/.test(r.id)).length).toBeGreaterThan(20);
    expect(rows.filter((r) => r.x > 1000 && r.id.startsWith('ash-tree-dead')).length).toBeGreaterThan(15);
    expect(rows.filter((r) => r.x > 1040 && /^(oak-[abc]$|birch)/.test(r.id)).length).toBe(0);
  });
});
