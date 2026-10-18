// The look of the corridor beyond Kettlewick: the Dead Road and the lane as dirt ribbons, verge posts and stones,
// the river and the Hollin Brook as draped water, and reeds on the river banks. Visual only: nothing here collides.
import * as THREE from 'three';
import { DEAD_ROAD_FULL, LANE_TRACK_DRAWN, LANE_WIDTH, ROAD_WIDTH } from './deadRoad';
import { ribbonGeometry, sampleStations, type HeightFn, type Station } from './ribbon';
import { BROOK_COURSE, BROOK_WIDTH, RIVER_COURSE, RIVER_WIDTH } from './water';

export interface SceneryHandle {
  object: THREE.Group;
  dispose(): void;
}

const ROAD_LIFT = 0.06;
const WATER_LIFT = 0.12;
export const VERGE_SPACING = 40;
export const VERGE_GAP_FRACTION = 0.2;
export const REED_COUNT = 700;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Verge props: a post or stone every VERGE_SPACING m on both sides, with ~20% gaps. Pure, seeded. */
export function vergePlacements(stations: readonly Station[], offset: number, seed = 3): Array<{ x: number; z: number; stone: boolean }> {
  const rand = mulberry32(seed);
  const out: Array<{ x: number; z: number; stone: boolean }> = [];
  let acc = 0;
  let prev = stations[0];
  for (const s of stations) {
    acc += Math.hypot(s.x - prev.x, s.z - prev.z);
    prev = s;
    if (acc < VERGE_SPACING) continue;
    acc = 0;
    for (const side of [-1, 1]) {
      if (rand() < VERGE_GAP_FRACTION) continue;
      out.push({ x: s.x + s.nx * offset * side, z: s.z + s.nz * offset * side, stone: rand() < 0.4 });
    }
  }
  return out;
}

export function buildCorridorScenery(heightAt: HeightFn): SceneryHandle {
  const group = new THREE.Group();
  group.name = 'corridor-scenery';
  const geoms: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const track = <T extends THREE.BufferGeometry>(g: T): T => (geoms.push(g), g);
  const mat = <T extends THREE.Material>(m: T): T => (mats.push(m), m);

  const dirt = mat(new THREE.MeshLambertMaterial({ color: 0x8a6d46, flatShading: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const water = mat(
    new THREE.MeshBasicMaterial({ color: 0x4a7d9c, transparent: true, opacity: 0.78, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
  );

  const roadStations = sampleStations(DEAD_ROAD_FULL, 2);
  const road = new THREE.Mesh(track(ribbonGeometry(roadStations, ROAD_WIDTH, heightAt, { lift: ROAD_LIFT })), dirt);
  road.name = 'dead-road';
  road.frustumCulled = false;
  const lane = new THREE.Mesh(track(ribbonGeometry(sampleStations(LANE_TRACK_DRAWN, 2), LANE_WIDTH, heightAt, { lift: ROAD_LIFT })), dirt);
  lane.name = 'lane-track';
  lane.frustumCulled = false;
  const river = new THREE.Mesh(track(ribbonGeometry(sampleStations(RIVER_COURSE, 3), RIVER_WIDTH, heightAt, { lift: WATER_LIFT, flat: true, monotone: true })), water);
  river.name = 'river';
  river.frustumCulled = false;
  const brook = new THREE.Mesh(track(ribbonGeometry(sampleStations(BROOK_COURSE, 3), BROOK_WIDTH, heightAt, { lift: WATER_LIFT, flat: true, monotone: true })), water);
  brook.name = 'hollin-brook';
  brook.frustumCulled = false;
  group.add(road, lane, river, brook);

  // Verge posts and stones.
  const verge = vergePlacements(roadStations, ROAD_WIDTH / 2 + 1.6);
  if (verge.length > 0) {
    const post = track(new THREE.BoxGeometry(0.2, 1, 0.2));
    post.translate(0, 0.5, 0);
    const stone = track(new THREE.DodecahedronGeometry(0.45));
    stone.translate(0, 0.3, 0);
    const wood = mat(new THREE.MeshLambertMaterial({ color: 0x6b4a2b, flatShading: true }));
    const rock = mat(new THREE.MeshLambertMaterial({ color: 0x84807a, flatShading: true }));
    const posts = verge.filter((v) => !v.stone);
    const stones = verge.filter((v) => v.stone);
    for (const [geometry, material, list] of [[post, wood, posts], [stone, rock, stones]] as const) {
      if (list.length === 0) continue;
      const mesh = new THREE.InstancedMesh(geometry, material, list.length);
      const m = new THREE.Matrix4();
      list.forEach((v, i) => {
        m.makeTranslation(v.x, heightAt(v.x, v.z), v.z);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      group.add(mesh);
    }
  }

  // Reeds on both banks of the river: crossed cards like the barley, standing at the water's edge.
  {
    const rand = mulberry32(11);
    const stations = sampleStations(RIVER_COURSE, 3);
    const card = track(new THREE.PlaneGeometry(0.35, 1.6));
    card.translate(0, 0.8, 0);
    const reedMat = mat(new THREE.MeshLambertMaterial({ color: 0x6f8a4a, side: THREE.DoubleSide, flatShading: true }));
    const reeds = new THREE.InstancedMesh(card, reedMat, REED_COUNT);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < REED_COUNT; i++) {
      const s = stations[Math.floor(rand() * stations.length)];
      const side = rand() < 0.5 ? -1 : 1;
      const off = RIVER_WIDTH / 2 + rand() * 4 - 1;
      const x = s.x + s.nx * off * side;
      const z = s.z + s.nz * off * side;
      q.setFromAxisAngle(up, rand() * Math.PI);
      const sc = 0.8 + rand() * 0.7;
      m.compose(new THREE.Vector3(x, heightAt(x, z), z), q, new THREE.Vector3(sc, sc, sc));
      reeds.setMatrixAt(i, m);
    }
    reeds.instanceMatrix.needsUpdate = true;
    reeds.frustumCulled = false;
    reeds.name = 'reeds';
    group.add(reeds);
  }

  let disposed = false;
  return {
    object: group,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.traverse((o) => {
        if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
      });
      geoms.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      group.removeFromParent();
      group.clear();
    },
  };
}
