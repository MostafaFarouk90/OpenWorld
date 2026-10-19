// The Ashmare's visual behind one loader: the Quaternius rigged horse (glbHorse.ts) once it has loaded, else thread 5's
// procedural quadruped rig, both with the mount's own ember mane (`mount-mane`) and hoof dust (`mount-dust`).
import * as THREE from 'three';
import type { HurtboxDef } from '../combat/types';
import { GlbHorse, type HorseAsset } from './glbHorse';
import { HorseEffects } from './horseEffects';
import { HORSE, QuadrupedGait, QuadrupedRig, applyPose, modeOf, type GaitMode } from './rig';

export interface HorseVisual {
  /** Placed at the horse's feet (between the hooves) with its yaw; forward is -Z. */
  readonly root: THREE.Object3D;
  /** The rig (hurtbox bones hang from it). */
  readonly rig: THREE.Object3D;
  /** The rider's seat; its world position is where the rider's feet go. */
  readonly saddle: THREE.Object3D;
  /** Fore to hind feet, metres (for the slope pitch). */
  readonly length: number;
  /** Bone-local capsules on the spine, neck and head, so hits on the horse reach the rider. */
  readonly hurtboxDefs: HurtboxDef[];
  readonly mode: GaitMode;
  /** True for the glb horse (the procedural one stands in until it has loaded). */
  readonly glb?: boolean;
  /** One fixed tick: gait at `speed` (m/s), body pitch `slope` (radians). */
  update(speed: number, slope: number, dt: number): void;
  /** Mane flicker and dust, per rendered frame. */
  animate(frameTime: number): void;
  /** Back to idle (a load, a placement). */
  reset(): void;
  setVisible(on: boolean): void;
  dispose(): void;
}

class ProceduralHorse implements HorseVisual {
  readonly root = new THREE.Group();
  readonly rig: THREE.Object3D;
  readonly saddle: THREE.Object3D;
  readonly length: number;
  readonly hurtboxDefs: HurtboxDef[];
  private readonly gait: QuadrupedGait;
  private readonly slope = { value: 0 };
  private readonly effects: HorseEffects;
  private time = 0;
  private disposed = false;

  constructor() {
    this.root.name = 'ashmare';
    this.rig = QuadrupedRig.build(HORSE);
    this.root.add(this.rig);
    const d = QuadrupedRig.dims(this.rig);
    this.length = d.hipZBack - d.hipZFront;
    this.gait = new QuadrupedGait(d.legLen, QuadrupedGait.tuningFor(HORSE));
    const s = QuadrupedRig.sockets(this.rig);
    this.saddle = s.saddle;
    const h = d.headSize;
    this.hurtboxDefs = [
      { name: 'torso', bone: 'spine', start: { x: 0, y: 0, z: d.hipZFront }, end: { x: 0, y: 0, z: d.hipZBack }, radius: d.bodyRadius * 1.1 },
      { name: 'abdomen', bone: 'neck', start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 0, z: -d.neckLen }, radius: d.bodyRadius * 0.6 },
      { name: 'hips', bone: 'head', start: { x: 0, y: 0, z: -h * 0.2 }, end: { x: 0, y: -h * 0.05, z: -h * 1.1 }, radius: h * 0.4 },
    ];
    this.effects = new HorseEffects(s.mane, this.root, d.neckLen, this.length);
    this.reset();
  }

  get mode(): GaitMode {
    return modeOf(this.gait);
  }

  update(speed: number, slope: number, dt: number): void {
    if (this.disposed) return;
    this.gait.step(speed, dt);
    this.slope.value += (slope - this.slope.value) * Math.min(1, dt * 8);
    this.time += dt;
    applyPose(this.rig, this.gait.pose(this.time), this.slope.value);
    this.effects.step(this.mode, this.gait.phase);
  }

  animate(frameTime: number): void {
    if (this.disposed || !(frameTime > 0)) return;
    this.effects.animate(this.mode, frameTime);
  }

  reset(): void {
    this.gait.reset();
    this.time = 0;
    this.slope.value = 0;
    applyPose(this.rig, this.gait.pose(), 0);
    this.effects.reset();
    this.root.updateMatrixWorld(true);
  }

  setVisible(on: boolean): void {
    this.root.visible = on;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.effects.dispose();
    QuadrupedRig.dispose(this.rig);
    this.root.removeFromParent();
  }
}

/**
 * The one place the horse's look comes from: the glb horse once its asset has loaded (`asset`), else the procedural rig.
 * Synchronous on purpose; the mount preloads the glb and rebuilds its hurtboxes when the look swaps.
 */
export function loadHorseVisual(asset?: HorseAsset | null): HorseVisual {
  if (asset) {
    try {
      return new GlbHorse(asset);
    } catch (err) {
      if (!warnedGlb) console.warn('mount: the glb horse failed to build, using the procedural one', err);
      warnedGlb = true;
    }
  }
  return new ProceduralHorse();
}

let warnedGlb = false;
