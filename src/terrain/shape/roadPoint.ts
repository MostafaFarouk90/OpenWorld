// Act 2 thread A1: points along the Act 2 roads by arc length, for siblings placing things beside a road (A2's POIs,
// A3's waystone). Pure and import-free apart from data, so it runs in workers too.
import { ACT2_ROADS } from './act2';
import { ACT3_ROADS } from './act3';
import type { RoadPolyline } from './cinderRoad';

export type Act2RoadId = 'cinder-road' | 'stonefold-road' | 'fellwalker-track' | 'hushed-anvil-path' | 'scorchhold-road' | 'oldsmoke-pass';
/** v0.7 (Act 3, K1): the Act 3 roads and causeways (src/terrain/shape/greyfen.ts and dragonspine.ts). */
export type Act3RoadId =
  | 'fen-road'
  | 'fen-track'
  | 'causeway-reedgate-mere'
  | 'causeway-mere-greywatch'
  | 'causeway-mere-mireweather'
  | 'spine-road'
  | 'deepgate-track'
  | 'rime-pass'
  | 'skyhold-spur';
export type RoadId = Act2RoadId | Act3RoadId;

const POLYLINES: ReadonlyMap<string, RoadPolyline> = new Map(
  [...ACT2_ROADS, ...ACT3_ROADS].map((r) => [r.id, r.points.map((p) => [p.x, p.z] as const)]),
);

/** The polyline's length in metres. Throws on an unknown road. */
export function roadLength(roadId: RoadId): number {
  const pts = polyline(roadId);
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return len;
}

function polyline(roadId: string): RoadPolyline {
  const pts = POLYLINES.get(roadId);
  if (!pts) throw new Error(`roadPoint: unknown road "${roadId}"`);
  return pts;
}

/**
 * The point `s` metres along road `roadId` (clamped to its ends), moved `side` metres to the left of travel
 * (negative is right), with the unit direction of travel there. Yaw for something facing along the road is
 * atan2(-dirX, -dirZ) (yaw 0 faces -Z).
 */
export function roadPoint(roadId: RoadId, s: number, side = 0): { x: number; z: number; dirX: number; dirZ: number } {
  const pts = polyline(roadId);
  if (!Number.isFinite(s) || !Number.isFinite(side)) throw new Error('roadPoint: s and side must be finite');
  let arc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const len = Math.hypot(bx - ax, bz - az);
    if (s <= arc + len || i === pts.length - 1) {
      const t = Math.min(Math.max((s - arc) / len, 0), 1);
      const dirX = (bx - ax) / len;
      const dirZ = (bz - az) / len;
      // Left of travel is (-dirZ, dirX), the ribbon's convention (src/region/ribbon.ts).
      return { x: ax + (bx - ax) * t - dirZ * side, z: az + (bz - az) * t + dirX * side, dirX, dirZ };
    }
    arc += len;
  }
  throw new Error('roadPoint: unreachable');
}
