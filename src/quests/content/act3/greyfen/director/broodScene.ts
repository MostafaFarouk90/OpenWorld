// The M27 brood-return set piece's visuals (K12 follow-up): three small teal hatchlings (K6a's builder, `hathren` palette, water
// form) leave the cages, fly low over the reeds to the Mere's shore and dive. Pure drawing: no actors, no hurtboxes, no spawner
// slots, so the only things this can leave behind are meshes, and `dispose` removes those. The story (the flag, the line) is the
// caller's.
import * as THREE from 'three';
import { restPose, WyrmRig, type RootFrame, type WyrmPose } from '../../../../../enemies/wyrm/builder/rig';
import { FlightPath, PathWalker, type PathPoint, type PathSample } from '../../../../../enemies/wyrm/large/flightPath';
import { crossed } from '../../../../../enemies/wyrm/large/surfacing';

export const BROOD = {
  count: 3,
  /** A wyrmling is 0.35; these are barely hatched. */
  scale: 0.6,
  /** Seconds between one leaving its cage and the next. */
  stagger: 0.7,
  /** Flight speed limits (m/s) and the time the crossing aims for. */
  minSpeed: 7,
  maxSpeed: 24,
  crossSeconds: 10,
  /** Height over the ground (and the water) while crossing the reeds, and the dive's depth under the surface. */
  cruise: 2.3,
  diveDepth: 3,
  /** Splash rings: life in seconds. */
  ringSeconds: 1.6,
} as const;

export interface BroodPlace {
  /** The cage points (world; y is the ground there), one per hatchling. */
  cages: readonly PathPoint[];
  /** The shore point they head for, and the unit direction from the shore into the water (x, z). */
  shore: PathPoint;
  toWater: { x: number; z: number };
  /** Water surface height. */
  surface: number;
  /** Ground height at (x, z). */
  heightAt(x: number, z: number): number;
}

/** One hatchling's route: up out of the cage, low over the reeds, skimming the shallows, then down through the surface. */
export function broodPath(place: BroodPlace, i: number): FlightPath {
  const c = place.cages[i]!;
  const w = place.toWater;
  const side = { x: -w.z, z: w.x };
  const lateral = (i - (place.cages.length - 1) / 2) * 6;
  const target = { x: place.shore.x + side.x * lateral, z: place.shore.z + side.z * lateral };
  const dx = target.x - c.x;
  const dz = target.z - c.z;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  const over = (x: number, z: number, lift: number): PathPoint => ({ x, y: Math.max(place.heightAt(x, z), place.surface) + lift, z });
  const pts: PathPoint[] = [over(c.x, c.z, 0.4)];
  const rise = Math.min(8, len * 0.2);
  pts.push(over(c.x + ux * rise, c.z + uz * rise, BROOD.cruise + 0.3));
  for (let d = 30; d < len - 14; d += 30) {
    const wig = Math.sin(d * 0.05 + i * 2) * 3;
    pts.push(over(c.x + ux * d - uz * wig, c.z + uz * d + ux * wig, BROOD.cruise));
  }
  pts.push({ x: target.x - ux * Math.min(8, len * 0.2), y: place.surface + 1.1, z: target.z - uz * Math.min(8, len * 0.2) });
  pts.push({ x: target.x, y: place.surface + 0.7, z: target.z });
  pts.push({ x: target.x + w.x * 7, y: place.surface - 0.3, z: target.z + w.z * 7 });
  pts.push({ x: target.x + w.x * 14, y: place.surface - BROOD.diveDepth, z: target.z + w.z * 14 });
  return new FlightPath(pts);
}

interface Flier {
  rig: WyrmRig;
  walker: PathWalker;
  sample: PathSample;
  frame: RootFrame;
  pose: WyrmPose;
  launchAt: number;
  prevY: number;
  dived: boolean;
  ring: { mesh: THREE.Mesh; age: number };
}

export class BroodFlight {
  private readonly fliers: Flier[] = [];
  private readonly ringGeometry = new THREE.RingGeometry(0.4, 0.55, 28, 1);
  private time = 0;
  private disposed = false;

  constructor(
    scene: THREE.Object3D,
    private readonly place: BroodPlace,
  ) {
    for (let i = 0; i < Math.min(BROOD.count, place.cages.length); i++) {
      const path = broodPath(place, i);
      const walker = new PathWalker(path, Math.min(BROOD.maxSpeed, Math.max(BROOD.minSpeed, path.length / BROOD.crossSeconds)));
      const sample = path.sample(0, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 });
      const rig = new WyrmRig({ scale: BROOD.scale, palette: 'hathren', form: 'water', breath: 'water', legs: 'none', spikes: true, wingspan: 0.7, seed: 31 + i });
      rig.root.name = `brood-hatchling-${i + 1}`;
      const frame: RootFrame = { x: sample.x, y: sample.y, z: sample.z, yaw: sample.yaw };
      rig.root.position.set(frame.x, frame.y, frame.z);
      rig.root.rotation.set(0, frame.yaw, 0);
      scene.add(rig.root);
      rig.spine.reset(sample, { x: Math.sin(sample.yaw), y: 0, z: Math.cos(sample.yaw) });
      const ring = new THREE.Mesh(this.ringGeometry, new THREE.MeshBasicMaterial({ color: 0xe8fff8, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      ring.name = 'brood-splash';
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      scene.add(ring);
      const pose = restPose();
      rig.apply(frame, pose, 0);
      this.fliers.push({ rig, walker, sample, frame, pose, launchAt: i * BROOD.stagger, prevY: sample.y, dived: false, ring: { mesh: ring, age: Infinity } });
    }
  }

  get count(): number {
    return this.fliers.length;
  }

  /** Every hatchling is under the water. */
  get done(): boolean {
    return this.fliers.length > 0 && this.fliers.every((f) => f.dived);
  }

  get seconds(): number {
    return this.time;
  }

  /** Where the camera looks: the first hatchling still in the air, else the last splash. */
  focus(out: PathPoint = { x: 0, y: 0, z: 0 }): PathPoint {
    const live = this.fliers.find((f) => !f.dived) ?? this.fliers[this.fliers.length - 1];
    if (!live) return Object.assign(out, this.place.shore);
    const s = live.sample;
    out.x = s.x;
    out.y = Math.max(s.y, this.place.surface + 0.5);
    out.z = s.z;
    return out;
  }

  /** The number of splash rings and rigs currently in the scene (tests). */
  get meshes(): number {
    return this.fliers.length * 2;
  }

  /** One fixed tick. */
  update(dt: number): void {
    if (this.disposed) return;
    const d = dt > 0 && Number.isFinite(dt) ? dt : 0;
    this.time += d;
    for (const f of this.fliers) {
      const flying = this.time >= f.launchAt && !f.dived;
      if (flying) {
        f.walker.step(d, f.sample);
        if (crossed(f.prevY, f.sample.y, this.place.surface) === -1) {
          f.ring.mesh.position.set(f.sample.x, this.place.surface + 0.05, f.sample.z);
          f.ring.age = 0;
          f.ring.mesh.visible = true;
        }
        f.prevY = f.sample.y;
        if (f.walker.done) {
          f.dived = true;
          f.rig.root.visible = false;
        }
      }
      Object.assign(f.pose, restPose());
      f.pose.fold = 0.25;
      f.pose.flap = 0.6 * Math.sin((this.time - f.launchAt) * 14);
      f.pose.headPitch = f.sample.pitch * 0.5;
      f.rig.lod = 0;
      if (!f.dived) f.rig.spine.step(d, f.sample, { speed: f.walker.speed, flying: true });
      f.rig.apply(f.frame, f.pose, d);
      if (f.ring.age < BROOD.ringSeconds) {
        f.ring.age += d;
        const k = Math.min(1, f.ring.age / BROOD.ringSeconds);
        f.ring.mesh.scale.setScalar(1 + k * 5);
        (f.ring.mesh.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k);
        if (k >= 1) f.ring.mesh.visible = false;
      }
    }
  }

  /** Removes every rig and ring. Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const f of this.fliers.splice(0)) {
      f.rig.dispose();
      f.ring.mesh.removeFromParent();
      (f.ring.mesh.material as THREE.Material).dispose();
    }
    this.ringGeometry.dispose();
  }
}
