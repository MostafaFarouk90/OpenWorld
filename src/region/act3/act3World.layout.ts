// The Act 3 world's anchors (thread K1, prefixes `fenroad.`, `spineroad.`, `greyfen.`, `dragonspine.`): the roads' ends
// and junctions, the fog wall faces and the camp hearth. Places, waystones and glide ledges are constants in
// act3Places.ts, so K3, K4 and K7 define their own anchors from them with no duplicate ids. `greyfen.fauna.*` and
// `dragonspine.fauna.*` are K6b's. Plain data; ACT3_WORLD_ANCHORS.md is generated from it by tools/gen-region-docs.ts.
import { DEEPGATE_TRACK_POINTS, RIME_PASS_POINTS, SKYHOLD_SPUR_POINTS, SPINE_ROAD_POINTS } from '../../terrain/shape/dragonspine';
import { FEN_ROAD_POINTS, FEN_TRACK_POINTS } from '../../terrain/shape/greyfen';
import type { AnchorSpec, LayoutData } from '../layoutTypes';
import { WYRMWATCH_HEARTH } from './act3Places';
import { FOG_FACE_ANCHORS, FOG_FACE_POINTS } from './act3World';

export const ACT3_WORLD_DOC = { title: 'Act 3 world anchors (roads, fog walls, camp hearth)', source: 'act3/act3World.layout.ts' } as const;

const r2 = (n: number) => Math.round(n * 100) / 100;
const at = (id: string, p: readonly [number, number] | { x: number; z: number }, tags: string[] = []): AnchorSpec => {
  const [x, z] = Array.isArray(p) ? p : [(p as { x: number }).x, (p as { z: number }).z];
  return { id, x: r2(x), z: r2(z), yawDeg: 0, tags };
};
const first = (pts: readonly (readonly [number, number])[]) => pts[0];
const last = (pts: readonly (readonly [number, number])[]) => pts[pts.length - 1];

const anchors: AnchorSpec[] = [
  at('fenroad.start', first(FEN_ROAD_POINTS), ['road']),
  at('fenroad.end', last(FEN_ROAD_POINTS), ['road']),
  at('fenroad.junction.fen-track', first(FEN_TRACK_POINTS), ['road', 'junction']),
  at('greyfen.fen-track.end', last(FEN_TRACK_POINTS), ['road']),
  at('spineroad.start', first(SPINE_ROAD_POINTS), ['road']),
  at('spineroad.end', last(SPINE_ROAD_POINTS), ['road']),
  at('dragonspine.track.start', first(DEEPGATE_TRACK_POINTS), ['road']),
  at('dragonspine.track.end', last(DEEPGATE_TRACK_POINTS), ['road']),
  at('dragonspine.pass.start', first(RIME_PASS_POINTS), ['road']),
  at('dragonspine.pass.end', last(RIME_PASS_POINTS), ['road']),
  at('dragonspine.spur.start', first(SKYHOLD_SPUR_POINTS), ['road', 'junction']),
  at('dragonspine.spur.end', last(SKYHOLD_SPUR_POINTS), ['road']),
  // Fog wall faces (act3World.ts ACT3_FOG_WALLS).
  ...(Object.keys(FOG_FACE_ANCHORS) as (keyof typeof FOG_FACE_ANCHORS)[]).map((k) => at(FOG_FACE_ANCHORS[k], FOG_FACE_POINTS[k], ['fog-wall'])),
  // K0's act-ending camp anchor (ACT_ENDINGS act 3 campAnchorId).
  at('dragonspine.wyrmwatch.hearth', WYRMWATCH_HEARTH, ['camp']),
];

export const ACT3_WORLD_LAYOUT: LayoutData = { anchors, triggers: [], structures: [], patrols: [], npcs: [], fields: [] };
