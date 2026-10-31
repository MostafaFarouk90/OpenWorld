// The few anchors the Greyfen quests add to K3's places (plan section 2): each sits a fixed offset from one of K3's anchors, so it
// follows K3's fit. K3's layout is the only source of positions; the director defines these at setup, `pacing.ts` reads them here.
import { GREYFEN_LAYOUT } from '../../../../greyfen/greyfen.layout';
import type { LayoutData } from '../../../../region/layoutTypes';

export interface ExtraAnchor {
  id: string;
  /** one of K3's outdoor anchors */
  near: string;
  dx: number;
  dz: number;
  /** compass heading in degrees (0 north); the engine yaw is heading + 180 */
  heading?: number;
}

export const EXTRA_ANCHORS: readonly ExtraAnchor[] = [
  // M25: each herb is found where it grows (the note) and picked a few steps off (the prop), so the note never sits on the prop
  ...[1, 2, 3].map((n): ExtraAnchor => ({ id: `greyfen.m25.herb.${n}.pick`, near: `greyfen.m25.herb.${n}`, dx: 3.5, dz: 0 })),
  // M26: the shore's five readings, Gytha's stand at the Mere and the scale-bed note (a few steps from the bed's prop)
  { id: 'greyfen.m26.search.1', near: 'greyfen.mere.net.1', dx: -6, dz: -6 },
  { id: 'greyfen.m26.search.2', near: 'greyfen.mere.net.2', dx: -6, dz: -6 },
  { id: 'greyfen.m26.search.3', near: 'greyfen.mere.net.3', dx: 6, dz: -6 },
  { id: 'greyfen.m26.search.4', near: 'greyfen.mere.net.4', dx: 7, dz: -6 },
  { id: 'greyfen.m26.search.5', near: 'greyfen.m26.scale-bed', dx: 5, dz: -4 },
  { id: 'greyfen.m26.gytha', near: 'npc-post.leofa.mere', dx: -7, dz: 2, heading: 90 },
  // M27: the deserter's two stands, at the blinds and at the cages
  { id: 'greyfen.m27.ally.1', near: 'greyfen.m27.blind.1', dx: 5, dz: 1 },
  { id: 'greyfen.m27.ally.2', near: 'greyfen.spawn.m27.pack.2.1', dx: 11, dz: -3 },
  { id: 'greyfen.m27.keeper', near: 'greyfen.m27.brood.2', dx: 5, dz: 3, heading: 270 },
  // R13: Gytha waits by the chapel door
  { id: 'greyfen.r13.gytha', near: 'greyfen.chapel.door', dx: -6, dz: 4, heading: 90 },
  // D05: Gytha waits at the Deeps door
  { id: 'greyfen.d05.gytha', near: 'greyfen.deeps.door', dx: -5, dz: -4, heading: 90 },
];

const byId = new Map(GREYFEN_LAYOUT.anchors.map((a) => [a.id, a]));

/** An outdoor anchor's (x, z) in metres: K3's layout, or one of the extras above. */
export function greyfenXZ(id: string): { x: number; z: number } | undefined {
  const base = byId.get(id);
  if (base) return { x: base.x, z: base.z };
  const extra = EXTRA_ANCHORS.find((e) => e.id === id);
  const near = extra && byId.get(extra.near);
  return extra && near ? { x: near.x + extra.dx, z: near.z + extra.dz } : undefined;
}

/** K3's layout plus these extras, for the lints that resolve anchors (the note lint reads it); the game itself gets the extras from the director. */
export const GREYFEN_QUEST_LAYOUT: LayoutData = {
  ...GREYFEN_LAYOUT,
  anchors: [
    ...GREYFEN_LAYOUT.anchors,
    ...EXTRA_ANCHORS.map((e) => {
      const p = greyfenXZ(e.id)!;
      return { id: e.id, x: p.x, z: p.z, yawDeg: ((e.heading ?? 0) + 180) % 360 };
    }),
  ],
};
