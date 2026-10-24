import { describe, expect, it } from 'vitest';
import { regionAt } from '../../region/regionMask';
import { MINE_DEFS } from './index';
import { MINE_DOOR_IDS, MINE_IDS, MINE_LANDINGS, MINE_LOCAL_BOUNDS, MINE_SITES, type MineId } from './kit';

const ids = Object.keys(MINE_IDS) as MineId[];
const def = (id: MineId) => MINE_DEFS.find((d) => d.id === MINE_IDS[id])!;
const extent = (id: MineId) => {
  const d = def(id);
  const xs = d.rooms.flatMap((r) => [r.x0, r.x1]);
  const zs = d.rooms.flatMap((r) => [r.z0, r.z1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
};

describe('the mine interiors', () => {
  it('registers five defs, one per mine, with their site, door and landing', () => {
    expect(MINE_DEFS.map((d) => d.id)).toEqual(ids.map((i) => MINE_IDS[i]));
    for (const id of ids) {
      const d = def(id);
      expect(d.site).toEqual(MINE_SITES[id]);
      expect(d.doors).toHaveLength(1);
      expect(d.doors[0]).toMatchObject({ doorId: MINE_DOOR_IDS[id], outside: 'oldsmoke.shaft.door', inside: MINE_LANDINGS[id], outsideInteractable: false });
      for (const a of [MINE_LANDINGS[id], `${MINE_LANDINGS[id]}.up`, `${MINE_LANDINGS[id]}.call`]) expect(d.anchors.some((x) => x.id === a)).toBe(true);
    }
  });

  it('keeps every footprint inside the local bounds, and the footprints apart', () => {
    const boxes = ids.map((id) => {
      const e = extent(id);
      const maxX = id === 'deepdelve' ? MINE_LOCAL_BOUNDS.deepdelveX1 : MINE_LOCAL_BOUNDS.x1;
      expect(e.x0).toBeGreaterThanOrEqual(MINE_LOCAL_BOUNDS.x0);
      expect(e.x1).toBeLessThanOrEqual(maxX);
      expect(e.z0).toBeGreaterThanOrEqual(MINE_LOCAL_BOUNDS.z0);
      expect(e.z1).toBeLessThanOrEqual(MINE_LOCAL_BOUNDS.z1);
      const s = MINE_SITES[id];
      return { id, x0: s.x + e.x0, x1: s.x + e.x1, z0: s.z + e.z0, z1: s.z + e.z1 };
    });
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
        expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it('floats every site inside the Oldsmoke region', () => {
    for (const id of ids) expect(regionAt(MINE_SITES[id].x, MINE_SITES[id].z)?.id).toBe('oldsmoke');
  });

  it('has no anchor id defined twice across the mines and Grisel Hall', () => {
    const seen = new Set<string>();
    for (const d of MINE_DEFS) {
      for (const a of d.anchors) {
        expect(seen.has(a.id), a.id).toBe(false);
        seen.add(a.id);
      }
    }
  });
});
