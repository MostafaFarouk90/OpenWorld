// Turns a site-local PoiPiece into world-frame layout data: anchors `poi.a2.<id>.*`, triggers `trg.poi.a2.<id>.*`, structures
// `poi-a2-<id>-*`. Rotation follows the layout convention (yaw 0 faces -Z; forward = (-sin yaw, -cos yaw)).
import type { AnchorSpec, LayoutData, StructureSpec, TriggerSpec } from '../../region/layoutTypes';
import { POI_TEMPLATES, type PoiPart, type PoiPiece, type PoiSite } from './types';
import { buildPiece } from './templates';
import type { PoiParams } from './types';

export interface PoiPose {
  x: number;
  z: number;
  yawDeg: number;
}

export interface PlacedPoi {
  id: string;
  template: PoiSite['template'];
  pose: PoiPose;
  radius: number;
  leap: boolean;
  piece: PoiPiece;
  layout: LayoutData;
  /** World-frame parts for the renderer. */
  parts: PoiPart[];
}

/** Local (x, z) to world: local -Z is the site's forward. */
export function toWorld(pose: PoiPose, x: number, z: number): { x: number; z: number } {
  const r = (pose.yawDeg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  // Rotating the local frame by yaw about +Y: forward (0,-1) maps to (-sin, -cos).
  return { x: pose.x + x * c + z * s, z: pose.z - x * s + z * c };
}

export function anchorId(poi: string, local: string): string {
  return `poi.a2.${poi}.${local}`;
}

export function placePiece(site: PoiSite, pose: PoiPose): PlacedPoi {
  if (!POI_TEMPLATES.includes(site.template)) throw new Error(`poi: unknown template "${String(site.template)}"`);
  if (![pose.x, pose.z, pose.yawDeg].every(Number.isFinite)) throw new Error(`poi "${site.id}": pose must be finite`);
  const piece = buildPiece(site.id, site.template, site.params as PoiParams | undefined);
  const anchors: AnchorSpec[] = piece.anchors.map((a) => {
    const w = toWorld(pose, a.x, a.z);
    return { ...a, id: anchorId(site.id, a.id), x: w.x, z: w.z, yawDeg: (a.yawDeg + pose.yawDeg) % 360 };
  });
  const structures: StructureSpec[] = piece.structures.map((s) => {
    const w = toWorld(pose, s.x, s.z);
    // Axis-aligned solids keep their footprint: a quarter turn swaps its sides, other angles are not used for solids.
    const quarter = Math.round(pose.yawDeg / 90) % 2 !== 0;
    return { ...s, x: w.x, z: w.z, yawDeg: s.yawDeg + pose.yawDeg, footprint: quarter ? [s.footprint[1], s.footprint[0]] : s.footprint };
  });
  const triggers: TriggerSpec[] = [
    // Discovery: stepping within 25 m of the main anchor.
    { id: `trg.poi.a2.${site.id}.discover`, x: pose.x, z: pose.z, shape: 'sphere', radius: Math.max(15, piece.radius + 4), who: 'player', once: false },
  ];
  const parts = piece.parts.map((p) => {
    const w = toWorld(pose, p.x, p.z);
    return { ...p, x: w.x, z: w.z, yawDeg: p.yawDeg + pose.yawDeg };
  });
  return {
    id: site.id,
    template: site.template,
    pose,
    radius: piece.radius,
    leap: piece.leap,
    piece,
    layout: { anchors, triggers, structures, patrols: [], npcs: [], fields: [] },
    parts,
  };
}
