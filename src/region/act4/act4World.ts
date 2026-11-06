// Act 4 world data (contracts v0.8 item 3, plan Part 3.4): where the new fog faces stand. `fog.waste-edge` stands across
// the Ash Road's end, 30 m inside the corridor north of Ashgate; the four Caldera rim faces stand 30 m outside the
// Caldera's box on the Waste side (the south one at Rimfoot). L1 may move them with the real road; the anchors are
// defined by the act4-world plugin from act4World.layout.ts.
import { WALL_CULL } from '../act2/act2World';
import { ASHGATE_POINT } from '../act4Containment';
import { act4FogFace, type Act4FogFaceId } from '../act4Fog';
import type { FogWallDef } from '../fogWall';
import { engineBox } from '../regions';

const CALDERA = engineBox('caldera');
/** Faces stand this far inside the open area of the state they stand in (Act 2's rule). */
export const ACT4_FACE_INSET = 30;
/** How far behind an Act 4 face the push-back reaches: past it containment holds. */
export const ACT4_FACE_PUSH_DEPTH = 100;

export const ACT4_FOG_FACE_POINTS: Readonly<Record<Act4FogFaceId, { x: number; z: number }>> = {
  'fog.waste-edge': { x: ASHGATE_POINT.x, z: ASHGATE_POINT.z + 20 },
  /** L1: beside the shipped fog.wyrmwatch-waste (x 11500 to 15000), mirroring it on the Dragonspine side, x 10000 to 11500. */
  'fog.waste-north': { x: 10750, z: 11050 },
  'fog.caldera-rim.n': { x: (CALDERA.x0 + CALDERA.x1) / 2, z: CALDERA.z1 + ACT4_FACE_INSET },
  'fog.caldera-rim.s': { x: (CALDERA.x0 + CALDERA.x1) / 2, z: CALDERA.z0 - ACT4_FACE_INSET },
  'fog.caldera-rim.e': { x: CALDERA.x1 + ACT4_FACE_INSET, z: (CALDERA.z0 + CALDERA.z1) / 2 },
  'fog.caldera-rim.w': { x: CALDERA.x0 - ACT4_FACE_INSET, z: (CALDERA.z0 + CALDERA.z1) / 2 },
};

export const ACT4_FOG_FACE_ANCHORS: Readonly<Record<Act4FogFaceId, string>> = {
  'fog.waste-edge': 'ashroad.fog.waste-edge',
  'fog.waste-north': 'waste.fog.waste-north',
  'fog.caldera-rim.n': 'waste.fog.caldera-rim.n',
  'fog.caldera-rim.s': 'waste.fog.caldera-rim.s',
  'fog.caldera-rim.e': 'waste.fog.caldera-rim.e',
  'fog.caldera-rim.w': 'waste.fog.caldera-rim.w',
};

const RIM_HALF = (CALDERA.x1 - CALDERA.x0) / 2 + ACT4_FACE_INSET;

const face = (id: Act4FogFaceId, axis: 'x' | 'z', halfLength: number, blockedSide: 1 | -1): FogWallDef => ({
  ...act4FogFace(id),
  anchorId: ACT4_FOG_FACE_ANCHORS[id],
  axis,
  halfLength,
  blockedSide,
  pushBackTo: 1,
  cullBeyond: WALL_CULL,
  pushDepth: ACT4_FACE_PUSH_DEPTH,
});

/** The six new faces (plan 3.4); the shipped Waste faces keep their Act 2 and Act 3 placement with Act 4's rules. */
export const ACT4_FOG_WALLS: readonly FogWallDef[] = [
  face('fog.waste-edge', 'z', 400, 1),
  face('fog.waste-north', 'z', 760, -1),
  face('fog.caldera-rim.n', 'z', RIM_HALF, -1),
  face('fog.caldera-rim.s', 'z', RIM_HALF, 1),
  face('fog.caldera-rim.e', 'x', RIM_HALF, -1),
  face('fog.caldera-rim.w', 'x', RIM_HALF, 1),
];
