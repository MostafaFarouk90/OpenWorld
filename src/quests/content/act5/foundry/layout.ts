// The Foundry quests' anchors as plain data for the lints (the note lint, the pacing rows, the director test rig). The game
// itself gets them from the director (installExtraAnchors); this file resolves the same rows against N2's interior defs.
import type { AnchorSpec, LayoutData } from '../../../../region/layoutTypes';
import { ALL_INTERIORS } from '../../../../interiors/interiors.plugin';
import { NEAR_ANCHORS, QUEST_WORLD_ANCHORS } from './anchors';

const yawDeg = (heading?: number): number => ((heading ?? 0) + 180) % 360;

/** The world anchors (computed from N1's master positions). */
export function foundryA5QuestLayout(): LayoutData {
  const anchors: AnchorSpec[] = QUEST_WORLD_ANCHORS.map((a) => ({ id: a.id, x: a.x, z: a.z, yawDeg: yawDeg(a.heading) }));
  return { anchors, triggers: [], structures: [], patrols: [], npcs: [], fields: [] };
}

/** The interior extras in each interior's own coordinates (space = the interior id), for the note lint. */
export function foundryA5InteriorExtras(): { id: string; anchors: { id: string; x: number; z: number }[] }[] {
  return ALL_INTERIORS.map((d) => {
    const base = new Map(d.anchors.map((a) => [a.id, a]));
    return { id: d.id, anchors: NEAR_ANCHORS.flatMap((n) => { const b = base.get(n.near); return b ? [{ id: n.id, x: b.x + n.dx, z: b.z + n.dz }] : []; }) };
  }).filter((d) => d.anchors.length > 0);
}
