// Cinderford's river fork: two draped ribbons from the spring head on the plateau's south edge down A1's falling slope. A1 has
// no channel feature (coordinator ruling), so the water sits on the ground like Act 1's river; the bridges span the ribbons
// where the ground has fallen a few metres. Visual only: nothing here collides.
import * as THREE from 'three';
import { drapedWaterGeometry, sampleStations, type HeightFn, type Pt } from '../region/ribbon';
import { RIVER_ARMS, RIVER_WIDTH } from './cinderford';

/** Above the ground, enough to clear coarse terrain LOD at the banks (Act 1's WATER_LIFT). */
export const WATER_LIFT = 0.2;

export interface WaterHandle {
  object: THREE.Group;
  dispose(): void;
}

/** The arm's x at a given z (linear along its polyline); null outside its z range. */
export function armXAtZ(course: readonly Pt[], z: number): number | null {
  for (let i = 1; i < course.length; i++) {
    const [x0, z0] = course[i - 1];
    const [x1, z1] = course[i];
    const lo = Math.min(z0, z1);
    const hi = Math.max(z0, z1);
    if (z >= lo && z <= hi && z0 !== z1) return x0 + ((x1 - x0) * (z - z0)) / (z1 - z0);
  }
  return null;
}

/** True when the bridge's footprint reaches both banks of the arm: its centre is on the arm and it is wider than the water. */
export function bridgeSpans(bridge: { x: number; z: number; footprint: readonly [number, number] }, course: readonly Pt[], width = RIVER_WIDTH): boolean {
  const x = armXAtZ(course, bridge.z);
  return x !== null && Math.abs(bridge.x - x) <= 1 && bridge.footprint[0] >= width + 1;
}

export function buildCinderfordWater(heightAt: HeightFn): WaterHandle {
  const group = new THREE.Group();
  group.name = 'cinderford-water';
  const material = new THREE.MeshBasicMaterial({ color: 0x4a7d9c, transparent: true, opacity: 0.78, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const geoms: THREE.BufferGeometry[] = [];
  for (const [name, course] of Object.entries(RIVER_ARMS)) {
    const g = drapedWaterGeometry(sampleStations(course as readonly Pt[], 3), RIVER_WIDTH, heightAt, WATER_LIFT, 3);
    geoms.push(g);
    const m = new THREE.Mesh(g, material);
    m.name = `cinderford-river-${name}`;
    m.frustumCulled = false;
    group.add(m);
  }
  return {
    object: group,
    dispose() {
      group.removeFromParent();
      group.clear();
      for (const g of geoms) g.dispose();
      material.dispose();
    },
  };
}
