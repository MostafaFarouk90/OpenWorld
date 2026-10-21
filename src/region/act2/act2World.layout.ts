// The Act 2 world's anchors (thread A1, prefix `cinderroad.`): the roads' ends and junctions, the M11 station and the
// fog wall faces. Plain data; ACT2_WORLD_ANCHORS.md is generated from it by tools/gen-region-docs.ts (drift-tested).
import { CINDER_ROAD_POINTS, FELLWALKER_TRACK_POINTS, HUSHED_ANVIL_PATH_POINTS, SCORCHHOLD_ROAD_POINTS, STONEFOLD_ROAD_POINTS } from '../../terrain/shape/cinderRoad';
import { OLDSMOKE_PASS_POINTS } from '../../terrain/shape/oldsmokePass';
import { roadPoint } from '../../terrain/shape/roadPoint';
import type { AnchorSpec, LayoutData } from '../layoutTypes';
import { M11_STATION_ARC } from './act2World';

export const ACT2_WORLD_DOC = { title: 'Act 2 world anchors (roads and fog walls)', source: 'act2/act2World.layout.ts' } as const;

const r2 = (n: number) => Math.round(n * 100) / 100;
const at = (id: string, p: readonly [number, number] | { x: number; z: number }, tags: string[] = []): AnchorSpec => {
  const [x, z] = Array.isArray(p) ? p : [(p as { x: number }).x, (p as { z: number }).z];
  return { id, x: r2(x), z: r2(z), yawDeg: 0, tags };
};
const first = (pts: readonly (readonly [number, number])[]) => pts[0];
const last = (pts: readonly (readonly [number, number])[]) => pts[pts.length - 1];

const anchors: AnchorSpec[] = [
  at('cinderroad.start', first(CINDER_ROAD_POINTS), ['road']),
  at('cinderroad.end', last(CINDER_ROAD_POINTS), ['road']),
  at('cinderroad.m11-station', roadPoint('cinder-road', M11_STATION_ARC), ['road']),
  at('cinderroad.junction.stonefold', first(STONEFOLD_ROAD_POINTS), ['road', 'junction']),
  at('cinderroad.junction.fellwalker', first(FELLWALKER_TRACK_POINTS), ['road', 'junction']),
  at('cinderroad.junction.hushed-anvil', first(HUSHED_ANVIL_PATH_POINTS), ['road', 'junction']),
  at('cinderroad.junction.scorchhold', first(SCORCHHOLD_ROAD_POINTS), ['road', 'junction']),
  at('cinderroad.pass.start', first(OLDSMOKE_PASS_POINTS), ['road']),
  at('cinderroad.pass.end', last(OLDSMOKE_PASS_POINTS), ['road']),
  // Fog wall faces (act2World.ts ACT2_FOG_WALLS): each 30 m or more inside the open area on its open side.
  at('cinderroad.fog.cinder-road', [10450, 2565], ['fog-wall']),
  at('cinderroad.fog.oldsmoke-pass', [21359.38, 5450], ['fog-wall']),
  at('cinderroad.fog.greyfen', [7800, 3970], ['fog-wall']),
  at('cinderroad.fog.ashen-waste', [9900, 3970], ['fog-wall']),
  at('cinderroad.fog.dragonspine', [17030, 11500], ['fog-wall']),
  at('cinderroad.fog.caldera', [15530, 4800], ['fog-wall']),
];

export const ACT2_WORLD_LAYOUT: LayoutData = { anchors, triggers: [], structures: [], patrols: [], npcs: [], fields: [] };
