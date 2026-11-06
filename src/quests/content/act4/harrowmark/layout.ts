// The Harrowmark quests' anchors as plain data for the lints (the note lint, the objective lint, anchors.test.ts). The game
// itself gets them from the director (installExtraAnchors); this file only resolves the same rows against the shipped layouts.
import type { AnchorSpec, LayoutData } from '../../../../region/layoutTypes';
import { HARROWMARK_LAYOUT } from '../../../../harrowmark/harrowmark.layout';
import { ACT4_LAYOUT_HM } from '../../../../harrowmark/act4/act4.layout';
import { ACT4_WORLD_LAYOUT } from '../../../../region/act4/act4World.layout';
import { TILTED_ANVIL_DEF, TILTED_ANVIL_ID } from '../../../../interiors/harrowmark/tiltedAnvil';
import { NEAR_ANCHORS, QUEST_WORLD_ANCHORS, type NearAnchor } from './anchors';

const yawDeg = (heading?: number): number => ((heading ?? 0) + 180) % 360;

/** The world anchors, plus the near ones whose base is a static world anchor (the waystones are placed by code at runtime). */
export function harrowmarkA4QuestLayout(world: readonly { id: string; x: number; z: number }[] = [...HARROWMARK_LAYOUT.anchors, ...ACT4_LAYOUT_HM.anchors, ...ACT4_WORLD_LAYOUT.anchors]): LayoutData {
  const byId = new Map(world.map((a) => [a.id, a]));
  const near = NEAR_ANCHORS.filter((n) => !n.interior).flatMap((n): AnchorSpec[] => {
    const b = byId.get(n.near);
    return b ? [{ id: n.id, x: b.x + n.dx, z: b.z + n.dz, yawDeg: yawDeg(n.heading) }] : [];
  });
  return {
    anchors: [...QUEST_WORLD_ANCHORS.map((a) => ({ id: a.id, x: a.x, z: a.z, yawDeg: yawDeg(a.heading), ...(a.dy === undefined ? {} : { dy: a.dy }) })), ...near],
    triggers: [], structures: [], patrols: [], npcs: [], fields: [],
  };
}

/** The interior extras in the interior's own coordinates (space = the interior id), for the note lint. */
export function harrowmarkA4InteriorExtras(): { id: string; anchors: { id: string; x: number; z: number }[] }[] {
  const inn = new Map(TILTED_ANVIL_DEF.anchors.map((a) => [a.id, a]));
  const rows = NEAR_ANCHORS.filter((n): n is NearAnchor & { interior: true } => n.interior === true);
  return [{ id: TILTED_ANVIL_ID, anchors: rows.flatMap((n) => { const b = inn.get(n.near); return b ? [{ id: n.id, x: b.x + n.dx, z: b.z + n.dz }] : []; }) }];
}
