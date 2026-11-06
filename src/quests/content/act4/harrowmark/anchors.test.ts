// The Harrowmark quests' anchors on the city as built: every escort route walked on the city's nav grid (no node or segment
// inside a blocking footprint, with the clearance a walker needs), every world anchor on open ground, ids under the reserved
// prefix, and the near anchors resolving against the shipped bases.
import { describe, expect, it } from 'vitest';
import { HARROWMARK_LAYOUT } from '../../../../harrowmark/harrowmark.layout';
import { ACT4_LAYOUT_HM } from '../../../../harrowmark/act4/act4.layout';
import { blocksStreet, footprintRect } from '../../../../nav/city/blocks';
import { NavGrid } from '../../../../nav/NavGrid';
import { envNavObstacles } from '../../../../env/colliderNav';
import { TILTED_ANVIL_DEF } from '../../../../interiors/harrowmark/tiltedAnvil';
import { CRUCIBLE_DEF } from '../../../../interiors/harrowmark/act4/crucible';
import { M37_INN_ANCHORS, NEAR_ANCHORS, Q, QUEST_WORLD_ANCHORS, ROUTES } from './anchors';
import { HARROWMARK_A4_PROPS } from './props';
import { HARROWMARK_A4_NOTE_LIST } from './notes';
import { harrowmarkA4QuestLayout } from './layout';

const RECT = { x0: 7700, z0: 1150, x1: 9650, z1: 2700 };
const grid = new NavGrid({
  id: 'l10-routes', minX: RECT.x0, minZ: RECT.z0, maxX: RECT.x1, maxZ: RECT.z1, floorY: 0, cellSize: 1, walkable: [RECT], blocked: [],
  blockedOriented: [...HARROWMARK_LAYOUT.structures.filter(blocksStreet).map((s) => footprintRect(s)), ...envNavObstacles(RECT)], openEdges: true,
} as never);
/** The River Gate's passage is not on the city grid (the gate structure covers it); its 12 m round the gate centre is open road. */
const GATE = { x: 9231.2, z: 2166.9 };
const walk = (x: number, z: number, clearance: number): boolean => {
  if (Math.hypot(x - GATE.x, z - GATE.z) < 12) return true;
  const i = grid.cellIndex(x, z);
  return i >= 0 && grid.isWalkable(i) && grid.clearance(i) >= clearance;
};
const segmentClear = (a: readonly [number, number], b: readonly [number, number]): boolean => {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5));
  for (let k = 0; k <= n; k++) if (!walk(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n, 0.7)) return false;
  return true;
};

describe('the Harrowmark quest anchors', () => {
  it.each(Object.keys(ROUTES))('route %s is walkable node to node with 0.7 m clearance', (name) => {
    const pts = ROUTES[name]!;
    for (const [i, p] of pts.entries()) expect(walk(p[0], p[1], 0.7), `${name} node ${i + 1}`).toBe(true);
    for (let i = 0; i + 1 < pts.length; i++) expect(segmentClear(pts[i]!, pts[i + 1]!), `${name} ${i + 1} -> ${i + 2}`).toBe(true);
  });

  it('every city anchor a prop, note or post stands on is on open ground', () => {
    const bad: string[] = [];
    const used = new Set([...HARROWMARK_A4_PROPS.map((p) => p.anchorId), ...HARROWMARK_A4_NOTE_LIST.map((n) => n.anchorId)]);
    for (const a of QUEST_WORLD_ANCHORS) {
      if (!used.has(a.id) && !a.id.includes('.post.')) continue;
      if (!walk(a.x, a.z, 0)) bad.push(a.id);
    }
    expect(bad).toEqual([]);
  });

  it('the M36 roof anchors stand on a Rooftop Ward block, at that roof\'s height', () => {
    const roofs = QUEST_WORLD_ANCHORS.filter((a) => a.dy !== undefined);
    expect(roofs.map((a) => a.id).sort()).toEqual([
      ...['centre', 'end', 'mid', 'start'].map((r) => `${Q}.m36.roof.${r}`), ...[1, 2, 3, 4].map((n) => `${Q}.m36.hide.${n}`),
    ].sort());
    const blocks = HARROWMARK_LAYOUT.structures.filter((s) => s.id.startsWith('ward.b'));
    for (const a of roofs) {
      const on = blocks.find((b) => Math.abs(a.x - b.x) <= b.footprint[0] / 2 - 1 && Math.abs(a.z - b.z) <= b.footprint[1] / 2 - 1);
      expect(on, a.id).toBeDefined();
      expect(a.dy, a.id).toBe(on!.height);
    }
  });

  it('ids sit under the reserved prefix (R22 sites under their region\'s own quest prefix), with no clash', () => {
    const ids = [...QUEST_WORLD_ANCHORS, ...NEAR_ANCHORS].map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith(`${Q}.`) || /^(cinderreach|greyfen|dragonspine)\.q\.r22\./.test(id), id).toBe(true);
    const shipped = new Set([...HARROWMARK_LAYOUT.anchors, ...ACT4_LAYOUT_HM.anchors].map((a) => a.id));
    for (const id of ids) expect(shipped.has(id), id).toBe(false);
  });

  it('the inn anchors resolve against the Tilted Anvil and stand inside its rooms', () => {
    const base = new Map(TILTED_ANVIL_DEF.anchors.map((a) => [a.id, a]));
    for (const a of M37_INN_ANCHORS) {
      const b = base.get(a.near);
      expect(b, a.near).toBeDefined();
      const x = b!.x + a.dx, z = b!.z + a.dz;
      expect(TILTED_ANVIL_DEF.rooms.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1), a.id).toBe(true);
    }
  });

  it('every prop and note anchor resolves (a world, near, inn or Crucible anchor)', () => {
    const known = new Set([
      ...harrowmarkA4QuestLayout([...HARROWMARK_LAYOUT.anchors, ...ACT4_LAYOUT_HM.anchors]).anchors.map((a) => a.id),
      ...NEAR_ANCHORS.map((a) => a.id), ...CRUCIBLE_DEF.anchors.map((a) => a.id),
    ]);
    for (const id of [...HARROWMARK_A4_PROPS.map((p) => p.anchorId), ...HARROWMARK_A4_NOTE_LIST.map((n) => n.anchorId)]) expect(known.has(id), id).toBe(true);
  });
});
