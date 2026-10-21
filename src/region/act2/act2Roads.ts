// The Act 2 roads drawn as ash-gravel ribbons draped on the shaped ground (thread A1), like the Dead Road's dirt
// ribbon. Each road is cut into pieces of about 600 m whose vertices are local to the piece's centre: far from the
// origin a single world-space strip would lose float32 precision, and pieces also let the camera cull them.
import * as THREE from 'three';
import { ribbonGeometry, sampleStations, type HeightFn, type Station } from '../ribbon';
import { ACT2_ROAD_STRIPS } from './act2World';

export const ROAD_STATION_STEP = 3;
export const STATIONS_PER_PIECE = 200;
const ROAD_LIFT = 0.06;

/** The drawn width of a road: its flat bed's half width (the Dead Road's 6 m ribbon on a 12 m bed), at least 2.5 m. */
export const drawnWidth = (halfWidth: number): number => Math.max(2.5, halfWidth);

/** Consecutive slices of `stations`, each sharing its first station with the previous slice's last. Pure. */
export function pieces(stations: readonly Station[], per = STATIONS_PER_PIECE): Station[][] {
  const out: Station[][] = [];
  for (let i = 0; i < stations.length - 1; i += per) out.push(stations.slice(i, Math.min(i + per + 1, stations.length)));
  return out;
}

export interface Act2RoadsHandle {
  readonly object: THREE.Group;
  dispose(): void;
}

export function buildAct2Roads(heightAt: HeightFn): Act2RoadsHandle {
  const group = new THREE.Group();
  group.name = 'act2-roads';
  const gravel = new THREE.MeshLambertMaterial({ color: 0x4b4540, flatShading: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const geoms: THREE.BufferGeometry[] = [];
  for (const road of ACT2_ROAD_STRIPS) {
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
      const mesh = new THREE.Mesh(g, gravel);
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
      gravel.dispose();
    },
  };
}
