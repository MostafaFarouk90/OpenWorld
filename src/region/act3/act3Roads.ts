// The Act 3 roads drawn as ribbons draped on the shaped ground (thread K1): packed earth in the fen and on the Spine
// Road, grey stone on the mountain roads. Pieces of about 600 m with vertices local to each piece's centre, as Act 2's
// gravel (act2Roads.ts): far from the origin a world-space strip loses float32 precision.
import * as THREE from 'three';
import { ribbonGeometry, sampleStations, type HeightFn } from '../ribbon';
import { drawnWidth, pieces, ROAD_STATION_STEP } from '../act2/act2Roads';
import { ACT3_ROAD_STRIPS, type Act3RoadSurface } from './act3World';

const ROAD_LIFT = 0.06;
export const ACT3_ROAD_COLOURS: Readonly<Record<Act3RoadSurface, number>> = { earth: 0x4a4334, stone: 0x5a5a5e };

export interface Act3RoadsHandle {
  readonly object: THREE.Group;
  dispose(): void;
}

export function buildAct3Roads(heightAt: HeightFn): Act3RoadsHandle {
  const group = new THREE.Group();
  group.name = 'act3-roads';
  const materials = Object.fromEntries(
    (Object.keys(ACT3_ROAD_COLOURS) as Act3RoadSurface[]).map((k) => [
      k,
      new THREE.MeshLambertMaterial({ color: ACT3_ROAD_COLOURS[k], flatShading: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    ]),
  ) as Record<Act3RoadSurface, THREE.MeshLambertMaterial>;
  const geoms: THREE.BufferGeometry[] = [];
  for (const road of ACT3_ROAD_STRIPS) {
    const stations = sampleStations(road.points, ROAD_STATION_STEP);
    pieces(stations).forEach((piece, k) => {
      const g = ribbonGeometry(piece, drawnWidth(road.halfWidth), heightAt, { lift: ROAD_LIFT });
      g.computeBoundingBox();
      const c = g.boundingBox!.getCenter(new THREE.Vector3());
      const cx = Math.round(c.x);
      const cz = Math.round(c.z);
      g.translate(-cx, 0, -cz);
      g.computeBoundingSphere();
      geoms.push(g);
      const mesh = new THREE.Mesh(g, materials[road.surface]);
      mesh.name = `${road.id}.${k}`;
      mesh.position.set(cx, 0, cz);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
    });
  }
  let disposed = false;
  return {
    object: group,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      geoms.forEach((g) => g.dispose());
      Object.values(materials).forEach((m) => m.dispose());
    },
  };
}
