// Act 3 placement (thread K2): the sites as data relative to K1's exports (a road's arc length and side through `roadPoint`, or
// an angle and radius from HATHRENS_MERE), never an absolute site position. The arcs and sides are frozen from the fit helper
// (fit.ts, run by placement.test.ts against the real ground). Anchors `<region>.poi.<id>.*`, triggers per region.
import type { AnchorSpec, LayoutData, StructureSpec, TriggerSpec } from '../../../region/layoutTypes';
import { HATHRENS_MERE } from '../../../terrain/shape/greyfen';
import { roadPoint, type RoadId } from '../../../terrain/shape/roadPoint';
import { toWorld, type PoiPose } from '../place';
import type { PoiPart } from '../types';
import { buildA3Piece } from './templates';
import { A3_TEMPLATES, type A3Params, type A3Piece, type A3Region, type A3Site, type A3Template } from './types';

export type A3Where =
  | { road: RoadId; s: number; side: number; facingDeg: number }
  /** Compass-free: angle in degrees from +X toward +Z about the Mere's centre, radius in metres. */
  | { mere: number; radius: number; facingDeg: number };

export interface A3Placement {
  site: A3Site;
  region: A3Region;
  where: A3Where;
  /** Cluster key: the cluster's structures are built while the player is near it. */
  cluster: string;
}

const site = (id: string, template: A3Template, params?: A3Params): A3Site => ({ id, template, ...(params ? { params } : {}) });

/**
 * The ten points of interest and three road caches. The arcs come from the fit helper over the stretches of plan section 3
 * (review fixes: the frozen camp is off M28's trailhead, the vista off the sixth wayside).
 */
export const ACT3_POI_PLACEMENTS: readonly A3Placement[] = [
  { site: site('drowned-church', 'drowned-church', { ledge: true }), region: 'greyfen', where: { road: 'fen-track', s: 1560, side: -92, facingDeg: 210 }, cluster: 'fen-track' },
  { site: site('stilt-camp', 'stilt-camp', { ledge: true }), region: 'greyfen', where: { road: 'fen-road', s: 8100, side: -70, facingDeg: 0 }, cluster: 'fen-road-west' },
  { site: site('peat-cutting', 'peat-cutting'), region: 'greyfen', where: { road: 'fen-road', s: 9000, side: 70, facingDeg: 0 }, cluster: 'fen-road-west' },
  { site: site('reed-island', 'reed-island'), region: 'greyfen', where: { mere: 54, radius: 364, facingDeg: 0 }, cluster: 'mere' },
  { site: site('greyfen-song-stone', 'song-stone'), region: 'greyfen', where: { mere: 110, radius: 420, facingDeg: 0 }, cluster: 'mere' },
  { site: site('hawk-nest', 'hawk-nest', { ledge: true, rubbing: 'spine-1' }), region: 'dragonspine', where: { road: 'spine-road', s: 5700, side: 40, facingDeg: 90 }, cluster: 'spine-east' },
  { site: site('hunter-cairn', 'hunter-cairn', { rubbing: 'spine-2' }), region: 'dragonspine', where: { road: 'deepgate-track', s: 7200, side: -70, facingDeg: 0 }, cluster: 'deepgate-west' },
  { site: site('frozen-camp', 'frozen-camp', { ledge: true, rubbing: 'spine-3' }), region: 'dragonspine', where: { road: 'rime-pass', s: 600, side: -110, facingDeg: 0 }, cluster: 'rime-low' },
  { site: site('glass-vein', 'glass-vein', { ledge: true, rubbing: 'spine-4' }), region: 'dragonspine', where: { road: 'rime-pass', s: 2400, side: -40, facingDeg: 0 }, cluster: 'rime-mid' },
  { site: site('spine-vista', 'vista', { rubbing: 'spine-5' }), region: 'dragonspine', where: { road: 'rime-pass', s: 3600, side: -40, facingDeg: 0 }, cluster: 'rime-high' },
  { site: site('fen-boundary-stone', 'leap-cache'), region: 'fenroad', where: { road: 'fen-road', s: 5400, side: 40, facingDeg: 0 }, cluster: 'fen-road-mid' },
  { site: site('spine-crag', 'leap-cache'), region: 'spineroad', where: { road: 'spine-road', s: 1800, side: 40, facingDeg: 270 }, cluster: 'spine-west' },
  { site: site('spine-ledge', 'leap-cache', { rubbing: 'spine-6' }), region: 'dragonspine', where: { road: 'deepgate-track', s: 6310, side: -40, facingDeg: 180 }, cluster: 'deepgate-west' },
];

/** World pose of a placement (yaw 0 faces -Z; forward = (-sin yaw, -cos yaw)). */
export function resolveA3Pose(w: A3Where): PoiPose {
  if ('mere' in w) {
    const a = (w.mere * Math.PI) / 180;
    return { x: HATHRENS_MERE.x + Math.cos(a) * w.radius, z: HATHRENS_MERE.z + Math.sin(a) * w.radius, yawDeg: w.facingDeg };
  }
  const r = roadPoint(w.road, w.s, w.side);
  const roadYaw = (Math.atan2(-r.dirX, -r.dirZ) * 180) / Math.PI;
  return { x: r.x, z: r.z, yawDeg: roadYaw + w.facingDeg };
}

export const a3AnchorPrefix = (region: A3Region, id: string): string => `${region}.poi.${id}.`;
/** Discovery triggers: under the reserved `trg.greyfen.` / `trg.dragonspine.` prefixes; the null-land caches under `trg.poi.a3.`. */
export const a3TriggerId = (region: A3Region, id: string): string =>
  region === 'greyfen' || region === 'dragonspine' ? `trg.${region}.poi.${id}.discover` : `trg.poi.a3.${id}.discover`;

export interface PlacedA3 {
  id: string;
  region: A3Region;
  template: A3Template;
  pose: PoiPose;
  radius: number;
  leap: boolean;
  piece: A3Piece;
  layout: LayoutData;
  parts: PoiPart[];
  cluster: string;
}

export function placeA3(p: A3Placement): PlacedA3 {
  const { site: s, region } = p;
  if (!A3_TEMPLATES.includes(s.template)) throw new Error(`poi a3: unknown template "${String(s.template)}"`);
  const pose = resolveA3Pose(p.where);
  if (![pose.x, pose.z, pose.yawDeg].every(Number.isFinite)) throw new Error(`poi a3 "${s.id}": pose must be finite`);
  const piece = buildA3Piece(s.id, s.template, s.params);
  const prefix = a3AnchorPrefix(region, s.id);
  const anchors: AnchorSpec[] = piece.anchors.map((a) => {
    const w = toWorld(pose, a.x, a.z);
    return { ...a, id: `${prefix}${a.id}`, x: w.x, z: w.z, yawDeg: (((a.yawDeg + pose.yawDeg) % 360) + 360) % 360 };
  });
  const structures: StructureSpec[] = piece.structures.map((st) => {
    const w = toWorld(pose, st.x, st.z);
    return { ...st, x: w.x, z: w.z, yawDeg: st.yawDeg + pose.yawDeg };
  });
  const triggers: TriggerSpec[] = [
    { id: a3TriggerId(region, s.id), x: pose.x, z: pose.z, shape: 'sphere', radius: Math.max(15, piece.radius + 4), who: 'player', once: false },
  ];
  const parts = piece.parts.map((pt) => {
    const w = toWorld(pose, pt.x, pt.z);
    return { ...pt, x: w.x, z: w.z, yawDeg: pt.yawDeg + pose.yawDeg };
  });
  return {
    id: s.id,
    region,
    template: s.template,
    pose,
    radius: piece.radius,
    leap: piece.leap,
    piece,
    layout: { anchors, triggers, structures, patrols: [], npcs: [], fields: [] },
    parts,
    cluster: p.cluster,
  };
}

export const ACT3_POI_PLACED: readonly PlacedA3[] = ACT3_POI_PLACEMENTS.map(placeA3);

/** All Act 3 POI anchors, triggers and structures as one layout (the lints, the docs and the plugin read it). */
export const ACT3_POI_LAYOUT: LayoutData = {
  anchors: ACT3_POI_PLACED.flatMap((p) => p.layout.anchors),
  triggers: ACT3_POI_PLACED.flatMap((p) => p.layout.triggers),
  structures: ACT3_POI_PLACED.flatMap((p) => p.layout.structures),
  patrols: [],
  npcs: [],
  fields: [],
};

export const ACT3_POI_DOC = { title: 'Act 3 points of interest (K2)', source: 'world/poi/act3/place.ts' } as const;

/** A placed site by id (throws on an unknown id). */
export function a3Placed(id: string): PlacedA3 {
  const p = ACT3_POI_PLACED.find((x) => x.id === id);
  if (!p) throw new Error(`poi a3: unknown site "${id}"`);
  return p;
}
