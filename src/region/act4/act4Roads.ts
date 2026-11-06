// The Act 4 roads and tracks drawn as ribbons draped on the ground (thread L1, act4Strips.ts), on the Act 3 method:
// pieces of about 600 m with vertices local to each piece's centre, as Act 2's
// gravel (act2Roads.ts): far from the origin a world-space strip loses float32 precision.
import * as THREE from 'three';
import { ribbonGeometry, sampleStations, type HeightFn } from '../ribbon';
import { drawnWidth, pieces, ROAD_STATION_STEP } from '../act2/act2Roads';
import { ACT4_ROAD_STRIPS, type Act4RoadSurface } from './act4Strips';

const ROAD_LIFT = 0.06;
export const ACT4_ROAD_COLOURS: Readonly<Record<Act4RoadSurface, number>> = { earth: 0x4a4334, ash: 0x67625b };

export interface Act4RoadsHandle {
  readonly object: THREE.Group;
  dispose(): void;
}

export function buildAct4Roads(heightAt: HeightFn): Act4RoadsHandle {
  const group = new THREE.Group();
  group.name = 'act4-roads';
  const materials = Object.fromEntries(
    (Object.keys(ACT4_ROAD_COLOURS) as Act4RoadSurface[]).map((k) => [
      k,
      new THREE.MeshLambertMaterial({ color: ACT4_ROAD_COLOURS[k], flatShading: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    ]),
  ) as Record<Act4RoadSurface, THREE.MeshLambertMaterial>;
  const geoms: THREE.BufferGeometry[] = [];
  for (const road of ACT4_ROAD_STRIPS) {
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
