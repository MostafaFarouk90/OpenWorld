import * as THREE from 'three';
import type { CameraShot } from '../../../rendering/ThirdPersonCamera';
import type { WyrmParams } from '../builder/params';
import { lodDistances, restPose, WyrmRig, type RootFrame, type WyrmPose } from '../builder/rig';
import { FlightPath, type PathPoint, type PathSample } from '../large/flightPath';
import { crossed, headYFor, smooth, type WaterLevel } from '../large/surfacing';
import { CALM_BEATS, HATHREN, WAKE_BEATS, type HathrenBeat, type HathrenSequence } from './sequence';

/**
 * Hathren's look and choreography (K6a, plans/act3-K6a.md 2): the builder at 4.5x in the teal water form, four net lines
 * from the shore anchors to her neck and body, splash rings where her head breaks the surface, and the water breath. The
 * scene draws what `HathrenSequence` says; it never decides the story. Not an actor: no hurtboxes, no damage.
 */
export const HATHREN_PARAMS: Readonly<Partial<WyrmParams>> = {
  scale: HATHREN.scale,
  palette: 'hathren',
  form: 'water',
  breath: 'water',
  legs: 'none',
  spikes: true,
  wingspan: 0.5,
  seed: 29,
};

/** Choreography numbers (seconds and metres at her scale). */
export const HATHREN_MOVES = {
  /** Head loop radius in the nets, and its period at full thrash. */
  loopRadius: 9,
  loopSeconds: 10,
  /** Swimming lift (0.5 the brow at the surface) and the thrash peak. */
  swimLift: 0.58,
  thrashLift: 0.86,
  thrashSeconds: 1.6,
  /** The breath: how long it pours and how far. */
  sprayPour: 1.3,
  sprayReach: 26,
  /** The calm: rise by, quiet approach stops this short of the shore, dive swim length. */
  riseBy: 4,
  quietShort: 14,
  diveSwim: 70,
  /** Net lines drop this long into the rise. */
  netsDropAt: 2,
  /** Splash rings: pool size and life. */
  rings: 4,
  ringSeconds: 1.8,
} as const;

export interface HathrenScenePorts {
  scene: THREE.Object3D;
  /** The camera's world position (LOD); null headless. */
  cameraPosition?(): { x: number; y: number; z: number } | null;
  /** Freeze the player; returns the undo (the calm only). */
  freezePlayer(source: string): () => void;
  /** The cutscene input context; returns the undo (null when unavailable). */
  cutscene(source: string): (() => void) | null;
  /** The camera override, or null headless. */
  camera(shot: CameraShot): { release(blendOut?: number): void } | null;
  shake?(strength: number, seconds: number): void;
}

export interface HathrenPlace {
  /** Where her loop is centred (water deep enough to hide her). */
  centre: { x: number; z: number };
  /** The shore point the player stands at (the calm turns to it; the camera stands behind it). */
  shore: PathPoint;
  water: WaterLevel;
  /** The four net anchors on the shore, in net order 1..4 (world, ground level). */
  nets: readonly PathPoint[];
  /** Where the scale glints after `scale`. */
  scaleBed: PathPoint;
}

const SOURCE = 'wyrm.hathren';
const NET_JOINTS = ['neck', 'torso', 'belly', 'tail'] as const;

export class HathrenScene {
  readonly rig: WyrmRig;
  readonly glint: ScaleGlint;
  private readonly pose: WyrmPose = restPose();
  private readonly frame: RootFrame;
  private readonly head = { x: 0, y: 0, z: 0 };
  private readonly yawToShore: number;
  private readonly lines: THREE.Mesh[] = [];
  private readonly lineGeometry = new THREE.CylinderGeometry(0.06, 0.06, 1, 5, 1);
  private readonly lineMaterial = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.95 });
  private readonly rings: { mesh: THREE.Mesh; age: number }[] = [];
  private readonly ringGeometry = new THREE.RingGeometry(0.8, 1, 32, 1);
  private readonly ringMaterial = new THREE.MeshBasicMaterial({ color: 0xe8fff8, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  private readonly lock: Array<() => void> = [];
  private camera: { release(blendOut?: number): void } | null = null;
  private lastHeadY = -Infinity;
  /** Seconds since the last thrash and the last spray (Infinity before the first). */
  private sinceThrash = Infinity;
  private sinceSpray = Infinity;
  private dive: FlightPath | null = null;
  private quietFrom: PathPoint | null = null;
  private readonly sample: PathSample = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 };
  private disposed = false;
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly ports: HathrenScenePorts,
    readonly place: HathrenPlace,
  ) {
    this.rig = new WyrmRig(HATHREN_PARAMS);
    this.rig.root.name = 'hathren';
    const c = place.centre;
    this.yawToShore = Math.atan2(-(place.shore.x - c.x), -(place.shore.z - c.z));
    this.frame = { x: c.x, y: place.water.surface, z: c.z, yaw: this.yawToShore };
    this.rig.root.position.set(c.x, place.water.surface, c.z);
    this.rig.root.rotation.set(0, this.yawToShore, 0);
    ports.scene.add(this.rig.root);
    this.headAt(0, 0);
    this.rig.spine.reset(this.head, { x: Math.sin(this.yawToShore), y: 0, z: Math.cos(this.yawToShore) });
    this.rig.apply(this.frame, this.pose, 0);
    this.lastHeadY = this.head.y;
    for (let i = 0; i < HATHREN.nets; i++) {
      const m = new THREE.Mesh(this.lineGeometry, this.lineMaterial);
      m.name = `hathren-net-${i + 1}`;
      m.frustumCulled = false;
      ports.scene.add(m);
      this.lines.push(m);
    }
    for (let i = 0; i < HATHREN_MOVES.rings; i++) {
      const mesh = new THREE.Mesh(this.ringGeometry, this.ringMaterial.clone());
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.name = 'hathren-splash';
      ports.scene.add(mesh);
      this.rings.push({ mesh, age: Infinity });
    }
    this.glint = new ScaleGlint(ports.scene, place.scaleBed);
  }

  get disposedYet(): boolean {
    return this.disposed;
  }

  /** The head's world point now (the camera looks here; tests). */
  get headPoint(): Readonly<PathPoint> {
    return this.head;
  }

  /** A beat fired: the scene's own reactions (the lock, the camera, the glint, shake). */
  onBeat(beat: HathrenBeat): void {
    if (this.disposed) return;
    if (beat === 'thrash') this.sinceThrash = 0;
    else if (beat === 'spray') this.sinceSpray = 0;
    else if (beat === 'rise') this.beginCalm();
    else if (beat === 'roar') this.ports.shake?.(0.5, 1.2);
    else if (beat === 'quiet') this.quietFrom = { ...this.head };
    else if (beat === 'dive') this.planDive();
    else if (beat === 'scale') this.glint.show(true);
    else if (beat === 'wake') this.ports.shake?.(0.35, 0.8);
  }

  /** One fixed tick after the sequence stepped. */
  update(dt: number, seq: HathrenSequence): void {
    if (this.disposed) return;
    const d = dt > 0 && Number.isFinite(dt) ? dt : 0;
    this.sinceThrash += d;
    this.sinceSpray += d;
    Object.assign(this.pose, restPose());
    const p = this.pose;
    p.fold = 0.85;
    p.flap = -0.1 + 0.08 * Math.sin(seq.time * 2.1);
    if (seq.state === 'nets') this.netsPose(seq, p);
    else if (seq.state === 'calming') this.calmPose(seq.time, p);
    else this.headAt(0, seq.time);
    // The breath (any state): the shimmer before, then the pour.
    if (this.sinceSpray < HATHREN_MOVES.sprayPour) {
      p.breath = 1;
      p.breathReach = HATHREN_MOVES.sprayReach;
      p.jaw = Math.max(p.jaw, 0.9);
      p.headPitch = Math.max(p.headPitch, 0.55);
    }
    // The spine and the drawing.
    this.rig.spine.step(d, this.head, { speed: 3, flying: false });
    const cam = this.ports.cameraPosition?.();
    if (cam) {
      const dist = Math.hypot(cam.x - this.head.x, cam.y - this.head.y, cam.z - this.head.z);
      const [near, far] = lodDistances(HATHREN.scale);
      this.rig.lod = dist > far ? 2 : dist > near ? 1 : 0;
    }
    this.rig.apply(this.frame, p, d);
    this.splash(d);
    this.drawNets(seq);
    this.glint.update(d);
  }

  /** Releases the lock and the camera, removes everything. Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.endCalm();
    for (const l of this.lines) l.removeFromParent();
    for (const r of this.rings) {
      r.mesh.removeFromParent();
      (r.mesh.material as THREE.Material).dispose();
    }
    this.lineGeometry.dispose();
    this.lineMaterial.dispose();
    this.ringGeometry.dispose();
    this.ringMaterial.dispose();
    this.rig.dispose();
    // The glint outlives the scene (it waits for the pick-up); the plugin owns its disposal.
  }

  /** Releases the player and the camera (the end of the calm, or teardown). */
  endCalm(): void {
    this.camera?.release();
    this.camera = null;
    for (const u of this.lock.splice(0).reverse()) {
      try {
        u();
      } catch {
        // a torn-down service: nothing to restore
      }
    }
  }

  // ---- choreography ------------------------------------------------------------------------

  private netsPose(seq: HathrenSequence, p: WyrmPose): void {
    const t = seq.time;
    if (seq.phase === 'waiting') {
      this.headAt(0.05, t);
      return;
    }
    if (seq.phase === 'waking') {
      // Burst up through the nets by 1.5 s, hold high and roar, the shimmer and the spray (6 s), then settle into the loop.
      const up = smooth(t / 1.5);
      const settle = smooth((t - 8) / (HATHREN.wakeSeconds - 8));
      const lift = 0.05 + (0.92 - 0.05) * up - (0.92 - HATHREN_MOVES.swimLift) * settle;
      this.headAt(lift, t * 0.4);
      const sprayAt = WAKE_BEATS.find((b) => b.beat === 'spray')!.at;
      if (t > 2.5 && t < 4.5) p.jaw = 1;
      this.shimmer(p, sprayAt - t);
      p.headPitch = 0.35 * up - 0.2 * settle;
      p.headYaw = 0.4 * Math.sin(t * 5) * (1 - settle);
      return;
    }
    // The thrash loop, slower as nets are cut.
    const lift = HATHREN_MOVES.swimLift + (HATHREN_MOVES.thrashLift - HATHREN_MOVES.swimLift) * this.bump(this.sinceThrash) / seq.ease;
    this.headAt(lift, t / seq.ease);
    p.headYaw = (0.5 * Math.sin(t * 6) * this.bump(this.sinceThrash)) / seq.ease;
    p.jaw = 0.3 * this.bump(this.sinceThrash);
    this.shimmer(p, seq.untilSpray);
  }

  private calmPose(t: number, p: WyrmPose): void {
    const at = (b: HathrenBeat) => CALM_BEATS.find((x) => x.beat === b)!.at;
    const roar = at('roar');
    const spray = at('spray');
    const quiet = at('quiet');
    const dive = at('dive');
    if (t < quiet) {
      // Rise high, roar, the spray over the shore.
      const lift = HATHREN_MOVES.swimLift + (1 - HATHREN_MOVES.swimLift) * smooth(t / HATHREN_MOVES.riseBy);
      this.headAt(lift, 0);
      p.headPitch = 0.3;
      if (t >= roar && t < spray - HATHREN.shimmerSeconds + 0.2) {
        p.jaw = 1;
        p.headPitch = 0.6;
      }
      this.shimmer(p, spray - t);
      p.flap = 0.2 * Math.sin(t * 3);
      p.fold = 0.5;
      return;
    }
    if (t < dive) {
      // Quiet: she lowers her head toward Cael at the shore and stills; the eyes dim.
      const k = smooth((t - quiet) / 8);
      const from = this.quietFrom ?? this.head;
      const c = this.place.centre;
      const sx = this.place.shore.x - c.x;
      const sz = this.place.shore.z - c.z;
      const len = Math.hypot(sx, sz) || 1;
      const reach = Math.max(0, len - HATHREN_MOVES.quietShort);
      const tx = c.x + (sx / len) * reach;
      const tz = c.z + (sz / len) * reach;
      const ty = headYFor(0.68, HATHREN.scale, this.place.water);
      this.head.x = from.x + (tx - from.x) * k;
      this.head.z = from.z + (tz - from.z) * k;
      this.head.y = from.y + (ty - from.y) * k;
      p.headPitch = -0.25 * k;
      p.fold = 1;
      p.mouth = 0;
      return;
    }
    // Dive: turns away and swims out along the path, sinking under the bed.
    if (!this.dive) this.planDive();
    const u = Math.min(1, (t - dive) / (at('scale') - 1 - dive));
    this.dive!.sample(u * this.dive!.length, this.sample);
    const lift = 0.62 * (1 - smooth(Math.max(0, (u - 0.35) / 0.65)));
    this.head.x = this.sample.x;
    this.head.z = this.sample.z;
    this.head.y = headYFor(lift, HATHREN.scale, this.place.water);
    p.headPitch = -0.3 * u;
  }

  /** The loop's head point for a lift at loop time `t`. */
  private headAt(lift: number, t: number): void {
    const c = this.place.centre;
    const w = (2 * Math.PI) / HATHREN_MOVES.loopSeconds;
    const r = HATHREN_MOVES.loopRadius;
    this.head.x = c.x + Math.cos(t * w) * r;
    this.head.z = c.z + Math.sin(t * w) * r;
    this.head.y = headYFor(lift, HATHREN.scale, this.place.water);
  }

  /** 0..1 thrash envelope after a thrash beat. */
  private bump(since: number): number {
    if (!(since < HATHREN_MOVES.thrashSeconds)) return 0;
    return Math.sin((since / HATHREN_MOVES.thrashSeconds) * Math.PI);
  }

  /** The 1.0 s mouth shimmer before a spray that is `until` seconds away. */
  private shimmer(p: WyrmPose, until: number): void {
    if (until > 0 && until <= HATHREN.shimmerSeconds) {
      const k = 1 - until / HATHREN.shimmerSeconds;
      p.mouth = Math.max(p.mouth, k);
      p.jaw = Math.max(p.jaw, 0.4 * k);
      p.flash = Math.max(p.flash, 0.3 * k);
    }
  }

  private beginCalm(): void {
    if (this.lock.length > 0) return;
    this.lock.push(this.ports.freezePlayer(SOURCE));
    const ctxUndo = this.ports.cutscene(SOURCE);
    if (ctxUndo) this.lock.push(ctxUndo);
    // Behind and above Cael on the shore, looking at her head.
    const s = this.place.shore;
    const c = this.place.centre;
    const dx = s.x - c.x;
    const dz = s.z - c.z;
    const len = Math.hypot(dx, dz) || 1;
    const position = { x: s.x + (dx / len) * 9 + (dz / len) * 4, y: s.y + 4.5, z: s.z + (dz / len) * 9 - (dx / len) * 4 };
    this.camera = this.ports.camera({ position, lookAt: () => ({ x: this.head.x, y: this.head.y - 2, z: this.head.z }), blendIn: 0.8, blendOut: 1.0 });
  }

  private planDive(): void {
    const c = this.place.centre;
    const from = { x: this.head.x, y: this.head.y, z: this.head.z };
    // Away from the shore, curving a little so the body turns in view.
    const ax = c.x - this.place.shore.x;
    const az = c.z - this.place.shore.z;
    const len = Math.hypot(ax, az) || 1;
    const ux = ax / len;
    const uz = az / len;
    const swim = HATHREN_MOVES.diveSwim;
    this.dive = new FlightPath([
      from,
      { x: c.x - uz * 12, y: from.y, z: c.z + ux * 12 },
      { x: c.x + ux * swim * 0.6 - uz * 6, y: from.y, z: c.z + uz * swim * 0.6 + ux * 6 },
      { x: c.x + ux * swim, y: from.y, z: c.z + uz * swim },
    ]);
  }

  private splash(dt: number): void {
    const surface = this.place.water.surface;
    const dir = crossed(this.lastHeadY, this.head.y, surface);
    this.lastHeadY = this.head.y;
    if (dir !== 0) {
      const slot = this.rings.reduce((a, b) => (b.age > a.age ? b : a));
      slot.age = 0;
      slot.mesh.position.set(this.head.x, surface + 0.05, this.head.z);
      slot.mesh.visible = true;
    }
    for (const r of this.rings) {
      if (!(r.age < HATHREN_MOVES.ringSeconds)) {
        r.mesh.visible = false;
        continue;
      }
      r.age += dt;
      const k = Math.min(1, r.age / HATHREN_MOVES.ringSeconds);
      const radius = 2 + k * 3 * HATHREN.scale;
      r.mesh.scale.set(radius, radius, 1);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k);
    }
  }

  private drawNets(seq: HathrenSequence): void {
    const calmT = seq.state === 'calming' ? seq.time : -1;
    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i]!;
      const anchor = this.place.nets[i];
      const show = !!anchor && (seq.state === 'nets' || (calmT >= 0 && calmT < HATHREN_MOVES.netsDropAt)) && !seq.netsCut.has(i + 1);
      line.visible = show;
      if (!show) continue;
      const joint = this.rig.joints[NET_JOINTS[i]!];
      const to = joint.getWorldPosition(this.tmp);
      const from = new THREE.Vector3(anchor!.x, anchor!.y + 1, anchor!.z);
      const d = to.clone().sub(from);
      const len = d.length();
      line.position.copy(from).addScaledVector(d, 0.5);
      line.scale.set(1, Math.max(0.01, len), 1);
      line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), len > 1e-6 ? d.multiplyScalar(1 / len) : new THREE.Vector3(0, 1, 0));
    }
  }
}

/** The cooling scale on the bed: a pale disc that glints, shown from `scale` until the pick-up (the plugin hides it). */
export class ScaleGlint {
  readonly mesh: THREE.Mesh;
  private t = 0;
  private readonly material = new THREE.MeshStandardMaterial({ color: 0x7fe8e0, emissive: 0x3fb8b0, emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.25 });

  constructor(scene: THREE.Object3D, at: PathPoint) {
    const g = new THREE.CircleGeometry(0.35, 20);
    g.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.name = 'hathren-scale-glint';
    this.mesh.position.set(at.x, at.y + 0.04, at.z);
    this.mesh.rotation.z = 0.3;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  get visible(): boolean {
    return this.mesh.visible;
  }

  show(on: boolean): void {
    this.mesh.visible = on;
  }

  update(dt: number): void {
    if (!this.mesh.visible) return;
    this.t += dt > 0 ? dt : 0;
    this.material.emissiveIntensity = 0.4 + 0.5 * Math.max(0, Math.sin(this.t * 2.4)) ** 4;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
