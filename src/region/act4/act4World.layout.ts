// The Act 4 world's anchors placed by L0 (prefixes `ashroad.`, `waste.`): the new fog wall faces. L1 adds the roads,
// places and the refuge. Plain data; ACT4_WORLD_ANCHORS.md is generated from it by tools/gen-region-docs.ts (drift-tested).
import type { AnchorSpec, LayoutData } from '../layoutTypes';
import { ACT4_FOG_FACE_ANCHORS, ACT4_FOG_FACE_POINTS } from './act4World';
import type { Act4FogFaceId } from '../act4Fog';

export const ACT4_WORLD_DOC = { title: 'Act 4 world anchors (fog walls)', source: 'act4/act4World.layout.ts' } as const;

const anchors: AnchorSpec[] = (Object.keys(ACT4_FOG_FACE_ANCHORS) as Act4FogFaceId[]).map((k) => ({
  id: ACT4_FOG_FACE_ANCHORS[k],
  x: ACT4_FOG_FACE_POINTS[k].x,
  z: ACT4_FOG_FACE_POINTS[k].z,
  yawDeg: 0,
  tags: ['fog-wall'],
}));

export const ACT4_WORLD_LAYOUT: LayoutData = { anchors, triggers: [], structures: [], patrols: [], npcs: [], fields: [] };
