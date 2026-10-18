import { describe, expect, it } from 'vitest';
import { heightAt } from '../terrain/heightfield';
import { PHASE_A_PROTECTED } from '../terrain/shaping';
import { DEAD_ROAD } from '../terrain/shape/deadRoad';
import { HARROWMARK_LAYOUT } from '../harrowmark/harrowmark.layout';
import { BRIGHTWATER_LAYOUT } from './brightwater.layout';
import { CAMP_1, CAMP_2, CITY_CENTRE, DEADROAD_DOC, DEADROAD_LAYOUT, SOUTH_GATE, WALL_CLEARANCE } from './deadroad.layout';
import { footprintCorners } from './geometry';
import { renderAnchorsDoc } from './anchorsDoc';
import { readFileSync } from './testing/nodeFs';
import { regionAt } from './regionMask';
import { validateLayout } from './validateLayout';

const anchor = (id: string) => DEADROAD_LAYOUT.anchors.find((a) => a.id === id)!;

function distanceToRoad(x: number, z: number): number {
  let best = Infinity;
  const pts = DEAD_ROAD.points;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len2 = (b.x - a.x) ** 2 + (b.z - a.z) ** 2;
    const t = Math.min(1, Math.max(0, ((x - a.x) * (b.x - a.x) + (z - a.z) * (b.z - a.z)) / len2));
    best = Math.min(best, Math.hypot(x - (a.x + t * (b.x - a.x)), z - (a.z + t * (b.z - a.z))));
  }
  return best;
}

describe('DEADROAD_LAYOUT', () => {
  it('passes the layout validator without a tutorial spawn', () => {
    expect(validateLayout(DEADROAD_LAYOUT, heightAt, { spawnId: null })).toEqual([]);
  });

  it('is rejected by the default validator, which wants the tutorial spawn (so spawnId is opt-in)', () => {
    expect(validateLayout(DEADROAD_LAYOUT, heightAt)).toEqual(['missing anchor "brightwater.player-spawn"']);
  });

  it('reports an anchor placed inside a solid structure', () => {
    const house = DEADROAD_LAYOUT.structures.find((x) => x.id === 'farmring-house-1')!;
    const tampered = {
      ...DEADROAD_LAYOUT,
      anchors: [...DEADROAD_LAYOUT.anchors, { id: 'farmring.in-house', x: house.x, z: house.z, yawDeg: 0 }],
    };
    const errors = validateLayout(tampered, heightAt, { spawnId: null });
    expect(errors.join('\n')).toContain('anchor "farmring.in-house": inside a solid structure');
  });

  it('reports a camp sealed inside a ring of rock', () => {
    const ring = [
      { id: 'seal-n', x: CAMP_1.x, z: CAMP_1.z + 30, footprint: [70, 3] as [number, number] },
      { id: 'seal-s', x: CAMP_1.x, z: CAMP_1.z - 30, footprint: [70, 3] as [number, number] },
      { id: 'seal-w', x: CAMP_1.x - 35, z: CAMP_1.z, footprint: [3, 60] as [number, number] },
      { id: 'seal-e', x: CAMP_1.x + 35, z: CAMP_1.z, footprint: [3, 60] as [number, number] },
    ].map((r) => ({ ...r, kind: 'rock' as const, yawDeg: 0, mode: 'solid' as const, height: 4 }));
    const errors = validateLayout({ ...DEADROAD_LAYOUT, structures: [...DEADROAD_LAYOUT.structures, ...ring] }, heightAt, { spawnId: null });
    expect(errors.join('\n')).toContain('walled off');
  });

  it('shares no anchor, trigger or structure id with the Brightwater layout', () => {
    for (const key of ['anchors', 'triggers', 'structures'] as const) {
      const mine = new Set(DEADROAD_LAYOUT[key].map((x) => x.id));
      const theirs = BRIGHTWATER_LAYOUT[key].map((x) => x.id);
      expect(theirs.filter((id) => mine.has(id)), key).toEqual([]);
    }
  });

  it('shares no anchor, trigger or structure id with the Harrowmark city layout', () => {
    for (const key of ['anchors', 'triggers', 'structures'] as const) {
      const mine = new Set(DEADROAD_LAYOUT[key].map((x) => x.id));
      expect(HARROWMARK_LAYOUT[key].map((x) => x.id).filter((id) => mine.has(id)), key).toEqual([]);
    }
  });

  it('is not spread into the Brightwater layout (core regresses every one of those anchors on natural ground)', () => {
    const phaseA = new Set(BRIGHTWATER_LAYOUT.anchors.map((a) => a.id));
    for (const a of DEADROAD_LAYOUT.anchors) expect(phaseA.has(a.id), a.id).toBe(false);
  });

  it('puts every anchor east of the fog wall and outside the Phase A protected box', () => {
    for (const a of DEADROAD_LAYOUT.anchors) {
      expect(a.x, a.id).toBeGreaterThan(1100);
      expect(a.x > PHASE_A_PROTECTED.maxX || a.z > PHASE_A_PROTECTED.maxZ || a.z < PHASE_A_PROTECTED.minZ, a.id).toBe(true);
    }
  });

  it('keeps the camps out of the null corridor and clear of the road, and the farm-ring and South Gate in Harrowmark', () => {
    for (const a of DEADROAD_LAYOUT.anchors.filter((x) => x.id.includes('camp-'))) {
      const id = regionAt(a.x, a.z)?.id ?? null;
      expect(id, a.id).toBe('brightwater');
      expect(distanceToRoad(a.x, a.z), a.id).toBeGreaterThan(25);
    }
    for (const id of ['farmring.centre', 'waystone.farm-ring', 'waystone.harrowmark-gate', 'npc-post.gaut.south-gate']) {
      expect(regionAt(anchor(id).x, anchor(id).z)?.id, id).toBe('harrowmark');
    }
    for (const s of DEADROAD_LAYOUT.structures.filter((x) => x.id.startsWith('farmring') || x.id.startsWith('waystone'))) {
      expect(regionAt(s.x, s.z)?.id, s.id).toBe('harrowmark');
    }
  });

  it('has three Footman slots and one chest per camp with the names the other threads use', () => {
    for (const n of [1, 2]) {
      for (const i of [1, 2, 3]) expect(anchor(`spawn.deadroad.camp-${n}.${i}`).tags).toContain('spawn');
      expect(anchor(`chest.deadroad.camp-${n}`).tags).toContain('chest');
      expect(anchor(`deadroad.camp-${n}`)).toBeDefined();
    }
    expect(Math.hypot(CAMP_1.x - CAMP_2.x, CAMP_1.z - CAMP_2.z)).toBeGreaterThan(500);
  });

  it('keeps nothing within the city wall and the South Gate stone 3 m clear of the posts', () => {
    for (const a of DEADROAD_LAYOUT.anchors) expect(Math.hypot(a.x - CITY_CENTRE.x, a.z - CITY_CENTRE.z), a.id).toBeGreaterThan(WALL_CLEARANCE);
    for (const s of DEADROAD_LAYOUT.structures) {
      for (const [cx, cz] of footprintCorners(s)) expect(Math.hypot(cx - CITY_CENTRE.x, cz - CITY_CENTRE.z), s.id).toBeGreaterThan(WALL_CLEARANCE);
    }
    const stone = DEADROAD_LAYOUT.structures.find((s) => s.id === 'waystone-harrowmark-gate')!;
    expect(stone.z - SOUTH_GATE.z).toBeCloseTo(1.8, 5);
    expect(Math.hypot(anchor('npc-post.gaut.south-gate').x - stone.x, anchor('npc-post.gaut.south-gate').z - stone.z)).toBeGreaterThanOrEqual(3);
    // thread 17's gate anchor (8500, 1244) and its queue stay clear of the stand point.
    expect(Math.hypot(SOUTH_GATE.x - 8500, SOUTH_GATE.z - 1244)).toBeGreaterThanOrEqual(3);
  });

  it('declares only the waystone anchors the stone structures belong to, and every waystone anchor has a stone', () => {
    for (const a of DEADROAD_LAYOUT.anchors.filter((x) => x.tags?.includes('waystone'))) {
      const stone = DEADROAD_LAYOUT.structures.find((s) => s.id === a.id.replace('.', '-'));
      expect(stone, a.id).toBeDefined();
      expect(stone!.x).toBeCloseTo(a.x, 5);
      expect(stone!.z - a.z).toBeCloseTo(1.8, 5);
    }
  });

  it('stands on the shaped ground: the road end is the plateau height, the stand points are not under water-like dips', () => {
    expect(heightAt(8500, 1250)).toBeCloseTo(20, 3);
    for (const a of DEADROAD_LAYOUT.anchors) expect(Number.isFinite(heightAt(a.x, a.z)), a.id).toBe(true);
  });
});

describe('DEADROAD_ANCHORS.md', () => {
  it('matches the layout table exactly (regenerate with tools/gen-region-docs.ts)', () => {
    const doc = readFileSync('src/region/DEADROAD_ANCHORS.md', 'utf8');
    expect(doc).toBe(renderAnchorsDoc(DEADROAD_LAYOUT, DEADROAD_DOC));
  });
});
