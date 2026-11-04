// Nothing the quests place outdoors (a prop, a note, a spawn, an NPC post, a scene stand) may sit inside one of K3's solid structures:
// a person standing in a wall cannot be reached. Found by the real-game check (Gytha's D05 post sat inside the monastery ruin).
import { describe, expect, it } from 'vitest';
import { GREYFEN_QUEST_LAYOUT } from './extraAnchors';
import { GREYFEN_PROPS } from './props';
import { GREYFEN_NOTE_LIST } from './notes';
import { GREYFEN_SPAWNERS } from './spawners';
import { GREYFEN_POST_RULES } from '../../../../greyfen/postRules';
import type { StructureSpec } from '../../../../region/layoutTypes';

const solids = GREYFEN_QUEST_LAYOUT.structures.filter((s) => s.mode === 'solid');
const anchors = new Map(GREYFEN_QUEST_LAYOUT.anchors.map((a) => [a.id, a]));

/** Is (x, z) within the structure's rotated footprint (plus `pad` metres)? */
function within(s: StructureSpec, x: number, z: number, pad: number): boolean {
  const r = (s.yawDeg * Math.PI) / 180;
  const dx = x - s.x, dz = z - s.z;
  const lx = dx * Math.cos(r) - dz * Math.sin(r), lz = dx * Math.sin(r) + dz * Math.cos(r);
  return Math.abs(lx) <= s.footprint[0] / 2 + pad && Math.abs(lz) <= s.footprint[1] / 2 + pad;
}

describe('quest placements stay out of solid structures', () => {
  const placed = new Set<string>();
  for (const p of GREYFEN_PROPS) placed.add(p.anchorId);
  for (const n of GREYFEN_NOTE_LIST) placed.add(n.anchorId);
  for (const s of GREYFEN_SPAWNERS) { placed.add(s.anchor); for (const m of s.memberAnchors ?? []) placed.add(m); }
  for (const r of GREYFEN_POST_RULES) { placed.add(r.home); for (const w of r.posts) placed.add(w.anchorId); }
  for (const a of ['greyfen.d05.gytha', 'greyfen.r13.gytha', 'greyfen.m26.gytha', 'greyfen.m27.keeper', 'greyfen.m27.ally.1', 'greyfen.m27.ally.2']) placed.add(a);

  it('resolves a good number of outdoor anchors', () => {
    expect([...placed].filter((id) => anchors.has(id)).length).toBeGreaterThan(80);
  });

  it('no outdoor placement is inside a solid structure', () => {
    const bad: string[] = [];
    for (const id of placed) {
      const a = anchors.get(id);
      if (!a) continue; // an interior's own anchor
      for (const s of solids) if (!s.inside && !s.id.startsWith('greyfen-jetty') && within(s, a.x, a.z, 0)) bad.push(`${id} is inside ${s.id}`);
    }
    expect(bad).toEqual([]);
  });
});
