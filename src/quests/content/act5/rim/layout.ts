// The Rim quests' anchors as plain data for the lints (the note lint, the pacing rows, the director test rig). The game itself
// gets them from the director (installExtraAnchors); this file only resolves the same rows against the static layouts.
import type { LayoutData } from '../../../../region/layoutTypes';
import { CALDERA_INTERIORS } from '../../../../caldera/interiors';
import { QUEST_WORLD_ANCHORS, NEAR_ANCHORS } from './anchors';

const yawDeg = (heading?: number): number => ((heading ?? 0) + 180) % 360;

/** My world anchors (every one is computed from N1's master positions; none sits by another anchor at runtime). */
export function rimA5QuestLayout(): LayoutData {
  return {
    anchors: QUEST_WORLD_ANCHORS.map((a) => ({ id: a.id, x: a.x, z: a.z, yawDeg: yawDeg(a.heading) })),
    triggers: [], structures: [], patrols: [], npcs: [], fields: [],
  };
}

/** The interior extras in each interior's own coordinates (space = the interior id), for the note lint and the pacing rows. */
export function rimA5InteriorExtras(): { id: string; anchors: { id: string; x: number; z: number }[] }[] {
  const rows = NEAR_ANCHORS.filter((n) => n.interior === true);
  return CALDERA_INTERIORS.map((d) => {
    const base = new Map(d.anchors.map((a) => [a.id, a]));
    return { id: d.id, anchors: rows.flatMap((n) => { const b = base.get(n.near); return b ? [{ id: n.id, x: b.x + n.dx, z: b.z + n.dz }] : []; }) };
  }).filter((d) => d.anchors.length > 0);
}
