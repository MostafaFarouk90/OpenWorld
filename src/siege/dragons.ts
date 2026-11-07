// The dragons at the siege (plans/act5-N4.md section 9): scene rigs (not actors; nothing hits them) flown on a closed
// loop over the gate, arriving on their wave (F2), each with one breath strike a wave on a lane (a 1.0 s telegraph, then
// fire in a 6 m circle), the Hearthbound first-ram strike, and the R11 hill wyrm's strafe.
import * as THREE from 'three';
import { restPose, WyrmRig, lodDistances, type RootFrame, type WyrmPose } from '../enemies/wyrm/builder/rig';
import { WYRM_SHAPE, type WyrmParams } from '../enemies/wyrm/builder/params';
import { FlightPath, PathWalker, type PathPoint, type PathSample } from '../enemies/wyrm/large/flightPath';
import { YSMERYTH_PARAMS } from '../enemies/wyrm/ysmeryth/scene';
import { HATHREN_PARAMS } from '../enemies/wyrm/hathren/scene';
import { ORSK_PARAMS } from '../enemies/wyrm/orsk';
import { HAZE_FLAG } from '../caldera/lava';
import type { DragonId } from './roster';
import { DRAGON } from './tuning';

export const DRAGON_PARAMS: Readonly<Record<DragonId, Readonly<Partial<WyrmParams>>>> = {
  ysmeryth: YSMERYTH_PARAMS,
  hathren: HATHREN_PARAMS,
  orsk: ORSK_PARAMS,
  'hill-wyrm': { palette: 'ember', seed: 41 },
};

/** One dragon over the siege: a rig on a closed loop. Deterministic for a given tick sequence. */
export class SiegeDragon {
  readonly rig: WyrmRig;
  private readonly walker: PathWalker;
  private readonly pose: WyrmPose = restPose();
  private readonly frame: RootFrame = { x: 0, y: 0, z: 0, yaw: 0 };
  private readonly sample: PathSample = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 };
  private readonly head: PathPoint = { x: 0, y: 0, z: 0 };
  private time = 0;
  private breathLeft = 0;
  private readonly scale: number;

  constructor(
    readonly id: DragonId,
    scene: THREE.Object3D,
    loop: readonly PathPoint[],
    phase: number,
    private readonly cameraPosition: () => { x: number; y: number; z: number } | null,
  ) {
    const params = DRAGON_PARAMS[id];
    this.scale = params.scale ?? 1;
    this.rig = new WyrmRig(params);
    this.rig.root.name = `siege-dragon-${id}`;
    const path = new FlightPath(loop, { closed: true });
    this.walker = new PathWalker(path, DRAGON.loopSpeed);
    this.walker.reset(path.length * phase);
    scene.add(this.rig.root);
    this.walker.step(0, this.sample);
    this.copyFrame();
    this.headAt();
    this.rig.spine.reset(this.head, { x: Math.sin(this.frame.yaw), y: 0, z: Math.cos(this.frame.yaw) });
    this.update(0);
  }

  get position(): Readonly<RootFrame> {
    return this.frame;
  }

  /** The mouth blazes for `seconds` (the breath). */
  breathe(seconds: number): void {
    this.breathLeft = Math.max(this.breathLeft, seconds);
  }

  update(dt: number): void {
    const d = dt > 0 && Number.isFinite(dt) ? dt : 0;
    this.time += d;
    this.breathLeft = Math.max(0, this.breathLeft - d);
    this.walker.step(d, this.sample);
    this.copyFrame();
    Object.assign(this.pose, restPose());
    const p = this.pose;
    p.fold = 0;
    p.flap = 0.8 * Math.sin(this.time * 2.2 + this.scale);
    p.legTuck = 1;
    p.billow = 1;
    p.mouth = this.breathLeft > 0 ? 1 : 0;
    p.flash = this.breathLeft > 0 ? 0.8 : 0;
    this.headAt();
    this.rig.root.position.set(this.frame.x, this.frame.y, this.frame.z);
    this.rig.root.rotation.set(0, this.frame.yaw, 0);
    this.rig.spine.step(d, this.head, { speed: DRAGON.loopSpeed, flying: true });
    const cam = this.cameraPosition();
    if (cam) {
      const dist = Math.hypot(cam.x - this.frame.x, cam.y - this.frame.y, cam.z - this.frame.z);
      const [near, far] = lodDistances(this.scale);
      this.rig.lod = dist > far ? 2 : dist > near ? 1 : 0;
    }
    this.rig.apply(this.frame, p, d);
  }

  dispose(): void {
    this.rig.root.removeFromParent();
    this.rig.dispose();
  }

  private copyFrame(): void {
    this.frame.x = this.sample.x;
    this.frame.y = this.sample.y;
    this.frame.z = this.sample.z;
    this.frame.yaw = this.sample.yaw;
  }

  private headAt(): void {
    const fwd = WYRM_SHAPE.headForward * this.scale;
    this.head.x = this.frame.x - Math.sin(this.frame.yaw) * fwd;
    this.head.z = this.frame.z - Math.cos(this.frame.yaw) * fwd;
    this.head.y = this.frame.y + WYRM_SHAPE.headHeight * this.scale;
  }
}

/** The ground mark of a breath strike: a glow during the telegraph, then a fire column (haze-flagged for N3). */
export class BreathMark {
  readonly root = new THREE.Group();
  private readonly ringMat = new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.0, depthWrite: false });
  private readonly fireMat = new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.0, depthWrite: false });
  private readonly ring: THREE.Mesh;
  private readonly fire: THREE.Mesh;
  private t = 0;
  done = false;

  constructor(scene: THREE.Object3D, at: { x: number; y: number; z: number }, radius: number) {
    this.ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.8, radius, 32), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.1;
    this.fire = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.7, radius, 5, 16, 1, true), this.fireMat);
    this.fire.position.y = 2.5;
    this.fire.visible = false;
    this.fire.userData[HAZE_FLAG] = true;
    this.root.name = 'siege-breath';
    this.root.add(this.ring, this.fire);
    this.root.position.set(at.x, at.y, at.z);
    scene.add(this.root);
  }

  /** Returns true on the tick the fire lands (after the telegraph). */
  update(dt: number): boolean {
    if (this.done) return false;
    const before = this.t;
    this.t += dt;
    const tele = DRAGON.telegraphS;
    if (this.t < tele) this.ringMat.opacity = 0.3 + 0.5 * (this.t / tele);
    const landed = before < tele && this.t >= tele;
    if (this.t >= tele) {
      this.fire.visible = true;
      const k = Math.min(1, (this.t - tele) / 0.6);
      this.fireMat.opacity = 0.85 * (1 - k);
      this.ringMat.opacity = 0.8 * (1 - k);
      if (k >= 1) this.dispose();
    }
    return landed;
  }

  dispose(): void {
    if (this.done) return;
    this.done = true;
    this.root.removeFromParent();
    (this.ring.geometry as THREE.BufferGeometry).dispose();
    (this.fire.geometry as THREE.BufferGeometry).dispose();
    this.ringMat.dispose();
    this.fireMat.dispose();
  }
}

/** The loop over the gate from N1's sky marks, or a ring round the gate when they are missing (dev and tests). */
export function dragonLoop(marks: readonly PathPoint[], gate: { x: number; y: number; z: number }, k: number): PathPoint[] {
  if (marks.length >= 3) return marks.map((m) => ({ x: m.x, y: m.y + k * 6, z: m.z }));
  return Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2 + k * 2.1;
    const r = 70 + k * 15;
    return { x: gate.x + Math.cos(a) * r, y: gate.y + 45 + k * 8, z: gate.z - 20 + Math.sin(a) * r };
  });
}
