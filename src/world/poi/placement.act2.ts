// Act 2 POI placement: 11 template sites, road-relative. Every position comes from A1's road polylines through
// roadPoint (no absolute coordinates); A3's keep-out and A1's plateaus are checked in placement.test.ts.
import { roadPoint, type Act2RoadId } from '../../terrain/shape/roadPoint';
import type { PoiParams, PoiSite } from './types';
import type { PoiPose } from './place';

export type PoiPhase = 'cinderreach' | 'oldsmoke';

export interface PoiPlacement {
  site: PoiSite;
  road: Act2RoadId;
  /** Arc length along the road (m). */
  s: number;
  /** Metres left of travel (negative is right). */
  side: number;
  /** Heading relative to the road direction, degrees (0 faces along the road). */
  facingDeg: number;
  phase: PoiPhase;
  /** Cluster key: the cluster's structures are built while the player is near it. */
  cluster: string;
}

const site = (id: string, template: PoiSite['template'], params?: PoiParams): PoiSite => ({ id, template, ...(params ? { params } : {}) });

export const ACT2_POI_PLACEMENTS: readonly PoiPlacement[] = [
  { site: site('camp-1', 'camp', { tint: 'traveller', chest: true }), road: 'cinder-road', s: 1775, side: 70, facingDeg: 180, phase: 'cinderreach', cluster: 'road-west' },
  { site: site('wyrm-nest-1', 'wyrm-nest', { amount: 0.4, ledge: true }), road: 'cinder-road', s: 3375, side: -45, facingDeg: 0, phase: 'cinderreach', cluster: 'road-west' },
  { site: site('ruin-1', 'ruin', { amount: 0.6 }), road: 'cinder-road', s: 4175, side: 30, facingDeg: 180, phase: 'cinderreach', cluster: 'm11' },
  { site: site('cave-1', 'cave', { ledge: true }), road: 'cinder-road', s: 5800, side: -30, facingDeg: 0, phase: 'cinderreach', cluster: 'road-mid' },
  { site: site('vista-1', 'vista', { amount: 0.8 }), road: 'cinder-road', s: 7975, side: 50, facingDeg: 180, phase: 'cinderreach', cluster: 'road-mid' },
  { site: site('hunter-pen-1', 'hunter-pen', { amount: 0.5 }), road: 'cinder-road', s: 9650, side: -65, facingDeg: 0, phase: 'cinderreach', cluster: 'road-east' },
  { site: site('camp-2', 'camp', { tint: 'hunter', size: 0.8, chest: true }), road: 'cinder-road', s: 10900, side: 45, facingDeg: 180, phase: 'cinderreach', cluster: 'road-east' },
  { site: site('cave-2', 'cave', { ledge: true }), road: 'stonefold-road', s: 75, side: 35, facingDeg: 90, phase: 'cinderreach', cluster: 'stonefold' },
  { site: site('wyrm-nest-2', 'wyrm-nest', { amount: 0.7 }), road: 'fellwalker-track', s: 500, side: -30, facingDeg: 0, phase: 'cinderreach', cluster: 'fellwalker' },
  { site: site('ruin-2', 'ruin', { amount: 0.8, ledge: true }), road: 'oldsmoke-pass', s: 1325, side: 40, facingDeg: 180, phase: 'oldsmoke', cluster: 'pass' },
  { site: site('lore-stone-1', 'lore-stone', { ledge: true }), road: 'oldsmoke-pass', s: 3650, side: -60, facingDeg: 0, phase: 'oldsmoke', cluster: 'pass' },
];

/** World pose of a placement. Yaw convention: 0 faces -Z, forward = (-sin yaw, -cos yaw). */
export function resolvePose(p: PoiPlacement): PoiPose {
  const r = roadPoint(p.road, p.s, p.side);
  const roadYaw = (Math.atan2(-r.dirX, -r.dirZ) * 180) / Math.PI;
  return { x: r.x, z: r.z, yawDeg: roadYaw + p.facingDeg };
}

/** Leap-gated spots owned by A3 (story ledges), counted into the act's total of 10. */
export const A3_LEDGE_IDS: readonly string[] = [
  'cinderreach.hushed-anvil.ledge.1',
  'cinderreach.hushed-anvil.ledge.2',
  'cinderreach.hushed-anvil.ledge.3',
  'cinderreach.den.ledge.1',
  'cinderreach.den.ledge.2',
];
