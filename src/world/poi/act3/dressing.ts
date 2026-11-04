// Road dressing (thread K2): small roadside sets along the Fen Road, the Spine Road and the Deepgate Track, so a sight comes into
// view every 30 to 60 s of walking (design 4.3; the sight test in sight.test.ts). Visual sights with colliders for the solid
// pieces, no anchors, no triggers, no rewards. Road-relative, inside the road corridor (|side| <= 24 m), seeded decoration.
import type { StructureSpec } from '../../../region/layoutTypes';
import type { RoadId } from '../../../terrain/shape/roadPoint';
import { toWorld, type PoiPose } from '../place';
import { makeRng } from '../rng';
import type { PoiPart } from '../types';
import { resolveA3Pose } from './place';
import { A3_COLLIDER_KIND } from './templates';

export const DRESSING_KINDS = ['milestone', 'signpost', 'wreck', 'burnt-wagon', 'shrine', 'cairn', 'toll', 'dead-tree', 'camp-remains', 'fen-marker', 'boulders'] as const;
export type DressingKind = (typeof DRESSING_KINDS)[number];

export interface DressingSite {
  id: string;
  kind: DressingKind;
  road: RoadId;
  s: number;
  /** Metres left of travel (negative is right); the corridor is 40 m wide either side, so at most 24. */
  side: number;
}

/** Sets are built in clusters of 2 km of road. */
export const dressingCluster = (site: DressingSite): string => `dress:${site.road}:${Math.floor(site.s / 2000)}`;

/** How tall a set stands (its tallest piece, m), for the sight test. */
export const DRESSING_HEIGHT: Record<DressingKind, number> = {
  milestone: 1.1,
  signpost: 2.4,
  wreck: 2.2,
  'burnt-wagon': 2,
  shrine: 2.2,
  cairn: 1.6,
  toll: 2.2,
  'dead-tree': 8,
  'camp-remains': 1.6,
  'fen-marker': 1.8,
  boulders: 2.4,
};

const d = (id: string, kind: DressingKind, road: RoadId, s: number, side: number): DressingSite => ({ id, kind, road, s, side });

/** The sets, in road order. Frozen against the sight test (tools/k2-sight.ts prints the gaps). */
export const ACT3_DRESSING: readonly DressingSite[] = [
  d('fen-milestone-1', 'milestone', 'fen-road', 900, 16),
  d('fen-signpost-1', 'signpost', 'fen-road', 1300, -16),
  d('fen-wreck-1', 'wreck', 'fen-road', 2000, 18),
  d('fen-tree-1', 'dead-tree', 'fen-road', 2600, -20),
  d('fen-shrine-1', 'shrine', 'fen-road', 3300, 16),
  d('fen-cairn-1', 'cairn', 'fen-road', 4000, -16),
  d('fen-camp-1', 'camp-remains', 'fen-road', 4700, 18),
  d('fen-tree-2', 'dead-tree', 'fen-road', 6100, -20),
  d('fen-toll-1', 'toll', 'fen-road', 6800, 14),
  d('fen-milestone-2', 'milestone', 'fen-road', 7400, -16),
  d('fen-marker-1', 'fen-marker', 'fen-road', 7700, 16),
  d('spine-milestone-1', 'milestone', 'spine-road', 1100, -16),
  d('spine-wagon-1', 'burnt-wagon', 'spine-road', 2500, 18),
  d('spine-cairn-1', 'cairn', 'spine-road', 3200, -16),
  d('spine-tree-1', 'dead-tree', 'spine-road', 3900, 20),
  d('spine-signpost-1', 'signpost', 'spine-road', 4500, -16),
  d('spine-boulders-1', 'boulders', 'spine-road', 6500, 18),
  d('deep-milestone-1', 'milestone', 'deepgate-track', 900, 16),
  d('deep-cairn-1', 'cairn', 'deepgate-track', 1700, -16),
  d('deep-wreck-1', 'wreck', 'deepgate-track', 2500, 18),
  d('deep-tree-1', 'dead-tree', 'deepgate-track', 3300, -20),
  d('deep-cairn-2', 'cairn', 'deepgate-track', 4100, 16),
  d('deep-camp-1', 'camp-remains', 'deepgate-track', 4900, -18),
  d('deep-signpost-1', 'signpost', 'deepgate-track', 5800, 16),
  d('deep-boulders-1', 'boulders', 'deepgate-track', 8200, -18),
  d('fen-tree-3', 'dead-tree', 'fen-road', 4000, 16),
  d('fen-cairn-2', 'cairn', 'fen-road', 1475, 16),
  d('spine-tree-2', 'dead-tree', 'spine-road', 7025, -16),
  d('spine-tree-3', 'dead-tree', 'spine-road', 4825, -20),
  d('spine-tree-4', 'dead-tree', 'spine-road', 2500, -20),
  d('spine-tree-5', 'dead-tree', 'spine-road', 1200, 16),
  d('spine-tree-6', 'dead-tree', 'spine-road', 5725, -16),
  d('spine-tree-7', 'dead-tree', 'spine-road', 5125, 16),
  d('deep-cairn-3', 'cairn', 'deepgate-track', 8700, 16),
  d('deep-tree-2', 'dead-tree', 'deepgate-track', 850, 16),
  d('deep-tree-3', 'dead-tree', 'deepgate-track', 5025, 16),
  d('deep-tree-4', 'dead-tree', 'deepgate-track', 8000, 16),
  d('deep-tree-5', 'dead-tree', 'deepgate-track', 2575, 16),
  d('deep-tree-6', 'dead-tree', 'deepgate-track', 1775, 16),
  d('deep-wreck-2', 'wreck', 'deepgate-track', 4175, -16),
];

export interface PlacedDressing {
  site: DressingSite;
  pose: PoiPose;
  parts: PoiPart[];
  structures: StructureSpec[];
}

const part = (asset: string, x: number, z: number, yawDeg: number, scale: number): PoiPart => ({ asset, x, z, yawDeg, scale });

/** A set in site-local coordinates (the road runs along local Z; +X is away from the road on the left side). */
export function buildDressing(site: DressingSite): { parts: PoiPart[]; structures: StructureSpec[] } {
  const rng = makeRng(`${site.id}:dress`);
  const parts: PoiPart[] = [];
  const structures: StructureSpec[] = [];
  const solid = (n: string, x: number, z: number, yawDeg: number, w: number, dd: number, h: number) =>
    structures.push({ id: `poi-a3-dress-${site.id}-${n}`, kind: A3_COLLIDER_KIND, x, z, yawDeg, footprint: [w, dd], mode: 'solid', height: h });
  const yaw = rng.range(-20, 20);
  switch (site.kind) {
    case 'milestone':
      parts.push(part('env/milestone-a', 0, 0, 90 + yaw, 1), part('env/grass-clump-a', 0.8, 0.6, 0, 1.2));
      break;
    case 'signpost':
      parts.push(part('env/signpost-a', 0, 0, 90 + yaw, 1), part('env/stump-a', 1.4, -1, 0, 1));
      break;
    case 'wreck':
      parts.push(part('env/wagon-wreck-a', 0, 0, yaw, 1), part('env/crates-stacked-a', 2.6, 1.5, rng.range(0, 360), 0.8), part('env/log-fallen-a', -2.5, -2, rng.range(0, 360), 1));
      solid('wagon', 0, 0, yaw, 4, 2, 1.6);
      break;
    case 'burnt-wagon':
      parts.push(part('env/wagon-burnt', 0, 0, yaw, 1), part('env/charred-stump', 2.5, 2, 0, 1), part('proc:bones', -2, 1.5, rng.range(0, 360), 1));
      solid('wagon', 0, 0, yaw, 4, 2, 1.6);
      break;
    case 'shrine':
      parts.push(part('env/roadside-shrine-a', 0, 0, 90, 1), part('env/flower-patch-yellow', 1, 1, 0, 1), part('env/stump-a', -1.5, 1.2, 0, 1));
      solid('shrine', 0, 0, 0, 1.2, 1.2, 2.2);
      break;
    case 'cairn':
      parts.push(part('env/cairn-a', 0, 0, yaw, 1.2), part('env/cairn-a', 1.6, 1, rng.range(0, 360), 0.8), part('env/rock-cluster-a', -1.8, -1, rng.range(0, 360), 0.8));
      break;
    case 'toll':
      parts.push(part('env/toll-post', 0, 0, 0, 1), part('env/brazier-standing-a', 1.5, 1.5, 0, 1));
      break;
    case 'dead-tree':
      parts.push(part('env/ash-tree-dead-a', 0, 0, rng.range(0, 360), rng.range(0.9, 1.15)), part('env/log-fallen-a', 2.5, -1.5, rng.range(0, 360), 1));
      solid('trunk', 0, 0, 0, 0.8, 0.8, 4);
      break;
    case 'camp-remains':
      parts.push(part('env/campfire-ring', 0, 0, 0, 1), part('env/tent', 3, 2, 70 + yaw, 1), part('env/log-fallen-a', -2, 1, rng.range(0, 360), 0.9));
      break;
    case 'fen-marker':
      parts.push(part('env/greyfen-marker', 0, 0, 0, 1), part('env/reeds-a', 1, 0.8, 0, 1.2), part('env/reeds-b', -0.9, 1.1, 0, 1.2));
      break;
    case 'boulders':
      parts.push(part('env/boulder-large-a', 0, 0, rng.range(0, 360), 1), part('env/rock-cluster-a', 2.4, 1.6, rng.range(0, 360), 1), part('env/cairn-a', -2.2, 1.4, 0, 1));
      solid('boulder', 0, 0, 0, 2.6, 2.6, 2.2);
      break;
  }
  return { parts, structures };
}

export function placeDressing(site: DressingSite): PlacedDressing {
  // The set faces along the road; local +X is away from the road on the left side, toward it on the right.
  const pose = resolveA3Pose({ road: site.road, s: site.s, side: site.side, facingDeg: 0 });
  const { parts, structures } = buildDressing(site);
  return {
    site,
    pose,
    parts: parts.map((p) => {
      const w = toWorld(pose, p.x, p.z);
      return { ...p, x: w.x, z: w.z, yawDeg: p.yawDeg + pose.yawDeg };
    }),
    structures: structures.map((st) => {
      const w = toWorld(pose, st.x, st.z);
      return { ...st, x: w.x, z: w.z, yawDeg: st.yawDeg + pose.yawDeg };
    }),
  };
}

export const ACT3_DRESSING_PLACED: readonly PlacedDressing[] = ACT3_DRESSING.map(placeDressing);
