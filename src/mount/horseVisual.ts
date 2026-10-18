// The Ashmare's visual behind one loader. Today: thread 5's procedural quadruped rig with the mount's own ember
// mane (`mount-mane`) and hoof dust (`mount-dust`). Later, if the assets thread's rigged horse is approved, a glb
// loader returns the same `HorseVisual` and nothing else in src/mount changes.
import * as THREE from 'three';
import type { HurtboxDef } from '../combat/types';
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
  /** One fixed tick: gait at `speed` (m/s), body pitch `slope` (radians). */
  update(speed: number, slope: number, dt: number): void;
  /** Mane flicker and dust, per rendered frame. */
  animate(frameTime: number): void;
  /** Back to idle (a load, a placement). */
  reset(): void;
  setVisible(on: boolean): void;
  dispose(): void;
}

const MANE_POINTS = 24;
const DUST_POOL = 24;
const DUST_LIFE = 0.6;

class ProceduralHorse implements HorseVisual {
  readonly root = new THREE.Group();
  readonly rig: THREE.Object3D;
  readonly saddle: THREE.Object3D;
  readonly length: number;
  readonly hurtboxDefs: HurtboxDef[];
  private readonly gait: QuadrupedGait;
  private readonly slope = { value: 0 };
  private readonly mane: THREE.Points;
  private readonly maneBase: Float32Array;
  private readonly dust: THREE.Points;
  private readonly dustAge = new Float32Array(DUST_POOL).fill(Infinity);
  private dustNext = 0;
  private lastPhase = 0;
  private maneTime = 0;
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

    // mount-mane: ember points along the neck, flickering, brighter at the gallop.
    const pos = new Float32Array(MANE_POINTS * 3);
    for (let i = 0; i < MANE_POINTS; i++) {
      const u = i / (MANE_POINTS - 1);
      pos[i * 3] = (Math.random() - 0.5) * 0.06;
      pos[i * 3 + 1] = 0.05 + Math.random() * 0.08;
      pos[i * 3 + 2] = d.neckLen * (0.5 - u * 1.1);
    }
    this.maneBase = pos.slice();
    const maneGeo = new THREE.BufferGeometry();
    maneGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mane = new THREE.Points(
      maneGeo,
      new THREE.PointsMaterial({ color: 0xff7a2a, size: 0.07, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.mane.name = 'mount-mane';
    s.mane.add(this.mane);

    // mount-dust: a small pool of puffs at the hooves, in world space under the root's parent.
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DUST_POOL * 3).fill(0), 3));
    this.dust = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({ color: 0x8a7a66, size: 0.35, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.dust.name = 'mount-dust';
    this.dust.frustumCulled = false;
    this.root.add(this.dust);
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
    // Two puffs per stride at canter and gallop, as the phase wraps and at half phase.
    const m = this.mode;
    if (m === 'canter' || m === 'gallop') {
      const p = this.gait.phase;
      if ((this.lastPhase < 0.5 && p >= 0.5) || p < this.lastPhase) this.puff();
    }
    this.lastPhase = this.gait.phase;
  }

  private puff(): void {
    const i = this.dustNext;
    this.dustNext = (i + 1) % DUST_POOL;
    const a = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
    a.setXYZ(i, (Math.random() - 0.5) * 0.6, 0.1, this.length * 0.5 + Math.random() * 0.3);
    a.needsUpdate = true;
    this.dustAge[i] = 0;
  }

  animate(frameTime: number): void {
    if (this.disposed || !(frameTime > 0)) return;
    this.maneTime += frameTime;
    const mode = this.mode;
    const gallop = mode === 'gallop' ? 1 : mode === 'canter' ? 0.6 : 0.25;
    const pa = this.mane.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < MANE_POINTS; i++) {
      const w = Math.sin(this.maneTime * 9 + i * 1.7);
      pa.setY(i, this.maneBase[i * 3 + 1] + 0.04 * gallop * (w + 1));
      pa.setZ(i, this.maneBase[i * 3 + 2] + 0.05 * gallop * Math.max(0, w));
    }
    pa.needsUpdate = true;
    (this.mane.material as THREE.PointsMaterial).opacity = 0.5 + 0.45 * gallop;
    const da = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
    let alive = 0;
    for (let i = 0; i < DUST_POOL; i++) {
      if (this.dustAge[i] === Infinity) continue;
      this.dustAge[i] += frameTime;
      if (this.dustAge[i] > DUST_LIFE) {
        this.dustAge[i] = Infinity;
        da.setY(i, -1000);
        continue;
      }
      alive++;
      da.setY(i, da.getY(i) + frameTime * 0.6);
      da.setZ(i, da.getZ(i) + frameTime * 1.5);
    }
    da.needsUpdate = true;
    this.dust.visible = alive > 0;
  }

  reset(): void {
    this.gait.reset();
    this.time = 0;
    this.slope.value = 0;
    this.lastPhase = 0;
    applyPose(this.rig, this.gait.pose(), 0);
    this.dustAge.fill(Infinity);
    this.dust.visible = false;
    this.root.updateMatrixWorld(true);
  }

  setVisible(on: boolean): void {
    this.root.visible = on;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const p of [this.mane, this.dust]) {
      p.geometry.dispose();
      (p.material as THREE.Material).dispose();
    }
    QuadrupedRig.dispose(this.rig);
    this.root.removeFromParent();
  }
}

/** The one place the horse's look comes from. */
export function loadHorseVisual(): HorseVisual {
  return new ProceduralHorse();
}
