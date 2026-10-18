// Test helpers: thread 17's real layout resolved on flat ground, and a sim built from it.
import { CROWD_LANES, HARROWMARK_LAYOUT } from '../harrowmark/harrowmark.layout';
import type { Anchor } from '../region/coreTypes';
import { resolveLayout } from '../region/resolveLayout';
import { CROWD_CLUSTERS, resolveClusters } from './clusters';
import { CrowdSim } from './CrowdSim';
import { anchorObstacles, buildLane, guardedObstacles, structureObstacles, type Obstacle } from './lanes';

export const FLAT = 20;
export const flat = (): number => FLAT;

export function cityAnchors(): Map<string, Anchor> {
  const resolved = resolveLayout(HARROWMARK_LAYOUT, flat);
  return new Map(resolved.anchors.map((a) => [a.id, { id: a.id, position: a.position, yaw: a.yaw, tags: a.tags }]));
}

export function cityWorld() {
  const anchors = cityAnchors();
  const withTag = (tag: string) => [...anchors.values()].filter((a) => a.tags?.includes(tag));
  const find = (id: string) => anchors.get(id);
  const statics: Obstacle[] = [...anchorObstacles(withTag), ...structureObstacles(HARROWMARK_LAYOUT.structures)];
  const guarded = guardedObstacles(withTag);
  const lanes = CROWD_LANES.map((d) => buildLane(d, find, statics, flat));
  const clusters = resolveClusters(CROWD_CLUSTERS, find, flat);
  return { anchors, withTag, find, statics, guarded, lanes, clusters };
}

export function citySim(seed = 0x17b) {
  const w = cityWorld();
  return { ...w, sim: new CrowdSim({ lanes: w.lanes, clusters: w.clusters, seed }) };
}

/** Distance from a point to an obstacle's edge (negative inside). */
export function clearance(o: Obstacle, x: number, z: number): number {
  if (o.kind === 'circle') return Math.hypot(x - o.x, z - o.z) - o.r;
  const c = Math.cos(o.yaw);
  const s = Math.sin(o.yaw);
  const dx = x - o.x;
  const dz = z - o.z;
  const px = Math.abs(dx * c - dz * s) - o.hx;
  const pz = Math.abs(dx * s + dz * c) - o.hz;
  if (px <= 0 && pz <= 0) return Math.max(px, pz);
  return Math.hypot(Math.max(px, 0), Math.max(pz, 0));
}
