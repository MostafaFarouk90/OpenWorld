// The Waste quests' anchors as plain data for the lints (the note lint, the pacing rows, the director test rig). The game itself
// gets them from the director (installExtraAnchors); this file only resolves the same rows against L1's static layouts.
import type { AnchorSpec, LayoutData } from '../../../../region/layoutTypes';
import { WASTE_LAYOUT } from '../../../../waste/waste.layout';
import { ACT4_WORLD_LAYOUT } from '../../../../region/act4/act4World.layout';
import { WASTE_INTERIORS } from '../../../../waste/interiors';
import { NEAR_ANCHORS, QUEST_WORLD_ANCHORS, type NearAnchor } from './anchors';

const yawDeg = (heading?: number): number => ((heading ?? 0) + 180) % 360;
const STATIC = (): { id: string; x: number; z: number }[] => [...WASTE_LAYOUT.anchors, ...ACT4_WORLD_LAYOUT.anchors];

/** The world anchors, plus the near ones whose base is a static world anchor (resolved in rounds: a near may sit by a near). */
export function wasteA4QuestLayout(world: readonly { id: string; x: number; z: number }[] = STATIC()): LayoutData {
  const byId = new Map<string, { x: number; z: number }>(world.map((a) => [a.id, a]));
  for (const a of QUEST_WORLD_ANCHORS) byId.set(a.id, a);
  const near: AnchorSpec[] = [];
  let left = NEAR_ANCHORS.filter((n) => !n.interior);
  for (let round = 0; round < 4 && left.length; round++) {
    left = left.filter((n) => {
      const b = byId.get(n.near);
      if (!b) return true;
      const a = { id: n.id, x: b.x + n.dx, z: b.z + n.dz };
      byId.set(a.id, a);
      near.push({ ...a, yawDeg: yawDeg(n.heading) });
      return false;
    });
  }
  return {
    anchors: [...QUEST_WORLD_ANCHORS.map((a) => ({ id: a.id, x: a.x, z: a.z, yawDeg: yawDeg(a.heading) })), ...near],
    triggers: [], structures: [], patrols: [], npcs: [], fields: [],
  };
}

/** The interior extras in each interior's own coordinates (space = the interior id), for the note lint. */
export function wasteA4InteriorExtras(): { id: string; anchors: { id: string; x: number; z: number }[] }[] {
  const rows = NEAR_ANCHORS.filter((n): n is NearAnchor & { interior: true } => n.interior === true);
  return WASTE_INTERIORS.map((d) => {
    const base = new Map(d.anchors.map((a) => [a.id, a]));
    return { id: d.id, anchors: rows.flatMap((n) => { const b = base.get(n.near); return b ? [{ id: n.id, x: b.x + n.dx, z: b.z + n.dz }] : []; }) };
  }).filter((d) => d.anchors.length > 0);
}
