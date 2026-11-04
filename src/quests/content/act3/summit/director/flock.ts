// M33's wyrmling flight (plans/act3-K13-pr2.md ruling 7): three wyrmlings, built by K6a's rig and flown along its `FlightPath` from the camp to the
// escape anchor, then removed. Not actors: nothing to fight or spare, no hurtboxes. K6a has no "spawn a free flier" service, so the rigs are driven here the
// way Ysmeryth's scene drives hers. If a rig cannot be built (or throws mid-flight) the fallback is a flock of lit points on the same paths, and with no
// scene at all (a headless boot) there is no flock, only the camera hold.
import * as THREE from 'three';
import { restPose, WyrmRig, type RootFrame, type WyrmPose } from '../../../../../enemies/wyrm/builder/rig';
import { WYRM_SHAPE, type WyrmParams } from '../../../../../enemies/wyrm/builder/params';
import { FlightPath, PathWalker, type PathPoint, type PathSample } from '../../../../../enemies/wyrm/large/flightPath';

/** The wyrmling build at a size that reads from the camp's distance. */
export const FLOCK_PARAMS: Readonly<Partial<WyrmParams>> = { scale: 0.8, segments: 15, palette: 'wyrmling', legs: 'small', spikes: false, seed: 33 };
export const FLOCK = {
  count: 3,
  /** Seconds the flight takes from the camp to the escape anchor, and the gap between one wyrmling and the next leaving. */
  seconds: 8,
  stagger: 0.5,
  /** Metres between neighbours, and the climb above the higher end at the middle of the path. */
  spread: 4,
  arc: 14,
  /** Points in the fallback flock. */
  points: 18,
} as const;

/** The seam tests use to make a wyrmling impossible to build (the fallback). */
export const flockPorts = { makeRig: (over: Partial<WyrmParams>): WyrmRig => new WyrmRig(over) };

export interface Flock {
  readonly kind: 'wyrmlings' | 'particles';
  /** Every flier has reached the escape anchor and been removed. */
  readonly done: boolean;
  /** How many fliers are still in the scene. */
  readonly alive: number;
  step(dt: number): void;
  dispose(): void;
}

const pathFor = (from: PathPoint, to: PathPoint, side: number): FlightPath => {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz) || 1;
  const ox = (-dz / len) * side;
  const oz = (dx / len) * side;
  return new FlightPath([
    { x: from.x + ox, y: from.y, z: from.z + oz },
    { x: (from.x + to.x) / 2 + ox, y: Math.max(from.y, to.y) + FLOCK.arc, z: (from.z + to.z) / 2 + oz },
    { x: to.x + ox, y: to.y + 6, z: to.z + oz },
  ]);
};

interface Flier {
  walker: PathWalker;
  delay: number;
  gone: boolean;
}

abstract class Base {
  protected readonly fliers: Flier[] = [];
  protected disposed = false;
  private time = 0;
  constructor(from: PathPoint, to: PathPoint) {
    for (let i = 0; i < FLOCK.count; i++) {
      const path = pathFor(from, to, (i - (FLOCK.count - 1) / 2) * FLOCK.spread);
      this.fliers.push({ walker: new PathWalker(path, path.length / FLOCK.seconds), delay: i * FLOCK.stagger, gone: false });
    }
  }
  get done(): boolean { return this.fliers.every((f) => f.gone); }
  get alive(): number { return this.fliers.filter((f) => !f.gone).length; }
  step(dt: number): void {
    if (this.disposed) return;
    const d = dt > 0 && Number.isFinite(dt) ? dt : 0;
    this.time += d;
    this.fliers.forEach((f, i) => {
      if (f.gone) return;
      if (this.time < f.delay) return this.place(i, f, null, d);
      const s = f.walker.step(d, this.sample);
      if (f.walker.done) { f.gone = true; return this.remove(i); }
      this.place(i, f, s, d);
    });
  }
  protected readonly sample: PathSample = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 };
  protected abstract place(i: number, f: Flier, s: PathSample | null, dt: number): void;
  protected abstract remove(i: number): void;
  abstract dispose(): void;
}

/** Three wyrmling rigs on K6a's builder. */
class WyrmlingFlock extends Base implements Flock {
  readonly kind = 'wyrmlings';
  private readonly rigs: Array<WyrmRig | null> = [];
  private readonly poses: WyrmPose[] = [];
  private readonly frames: RootFrame[] = [];
  private readonly heads: PathPoint[] = [];
  private readonly fresh: boolean[] = [];
  private clock = 0;
  constructor(private readonly scene: THREE.Object3D, from: PathPoint, to: PathPoint) {
    super(from, to);
    try {
      for (let i = 0; i < FLOCK.count; i++) {
        const rig = flockPorts.makeRig({ ...FLOCK_PARAMS, seed: 33 + i });
        rig.root.name = `m33-wyrmling-${i + 1}`;
        rig.root.visible = false;
        scene.add(rig.root);
        this.rigs.push(rig);
        this.poses.push(restPose());
        this.frames.push({ x: from.x, y: from.y, z: from.z, yaw: 0 });
        this.heads.push({ x: from.x, y: from.y, z: from.z });
        this.fresh.push(true);
      }
    } catch (err) {
      this.dispose();
      throw err;
    }
  }
  protected place(i: number, f: Flier, s: PathSample | null, dt: number): void {
    const rig = this.rigs[i];
    if (!rig) return;
    if (!s) return; // still waiting at the camp: hidden
    this.clock += dt / FLOCK.count;
    rig.root.visible = true;
    const frame = this.frames[i]!;
    frame.x = s.x; frame.y = s.y; frame.z = s.z; frame.yaw = s.yaw;
    const sc = FLOCK_PARAMS.scale ?? 1;
    const head = this.heads[i]!;
    const fwd = WYRM_SHAPE.headForward * sc;
    head.x = s.x - Math.sin(s.yaw) * fwd;
    head.z = s.z - Math.cos(s.yaw) * fwd;
    head.y = s.y + WYRM_SHAPE.headHeight * sc + Math.sin(s.pitch) * fwd;
    const p = this.poses[i]!;
    Object.assign(p, restPose());
    p.fold = 0; p.flap = 0.8 * Math.sin((this.clock + i * 0.3) * 9); p.legTuck = 1; p.billow = 1; p.roll = s.bank;
    rig.root.position.set(frame.x, frame.y, frame.z);
    rig.root.rotation.set(0, frame.yaw, 0);
    if (this.fresh[i]) { rig.spine.reset(head, { x: Math.sin(s.yaw), y: 0, z: Math.cos(s.yaw) }); this.fresh[i] = false; }
    rig.spine.step(dt, head, { speed: f.walker.speed, flying: true });
    rig.apply(frame, p, dt);
  }
  protected remove(i: number): void {
    const rig = this.rigs[i];
    if (!rig) return;
    this.scene.remove(rig.root);
    rig.dispose();
    this.rigs[i] = null;
  }
  dispose(): void {
    this.disposed = true;
    this.rigs.forEach((_r, i) => this.remove(i));
    for (const f of this.fliers) f.gone = true;
  }
}

/** The fallback: lit points (a few per flier) along the same three paths. */
class ParticleFlock extends Base implements Flock {
  readonly kind = 'particles';
  private readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly perFlier = FLOCK.points / FLOCK.count;
  constructor(private readonly scene: THREE.Object3D, private readonly from: PathPoint, to: PathPoint) {
    super(from, to);
    this.pos = new Float32Array(FLOCK.points * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffb070, size: 1.6, sizeAttenuation: true, transparent: true, depthWrite: false }));
    this.points.name = 'm33-flock';
    this.points.frustumCulled = false;
    this.hideAll();
    scene.add(this.points);
  }
  private hideAll(): void { for (let i = 0; i < FLOCK.points; i++) this.pos.set([this.from.x, this.from.y - 500, this.from.z], i * 3); }
  protected place(i: number, _f: Flier, s: PathSample | null): void {
    if (!s) return;
    for (let k = 0; k < this.perFlier; k++) {
      const j = (i * this.perFlier + k) * 3;
      const back = k * 0.7;
      this.pos[j] = s.x + Math.sin(s.yaw) * back + Math.sin(k * 2.1) * 0.5;
      this.pos[j + 1] = s.y + Math.sin(k * 1.3 + s.x) * 0.5;
      this.pos[j + 2] = s.z + Math.cos(s.yaw) * back + Math.cos(k * 2.1) * 0.5;
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
  protected remove(i: number): void {
    for (let k = 0; k < this.perFlier; k++) this.pos.set([this.from.x, this.from.y - 500, this.from.z], (i * this.perFlier + k) * 3);
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    if (this.done) this.dispose();
  }
  dispose(): void {
    this.disposed = true;
    for (const f of this.fliers) f.gone = true;
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

/** The flight: wyrmling rigs if they build, else a particle flock, else null (no scene). */
export function startFlock(scene: THREE.Object3D | undefined | null, from: PathPoint, to: PathPoint, warn: (m: string) => void = () => {}, particlesOnly = false): Flock | null {
  if (!scene) return null;
  if (!particlesOnly) try {
    return new WyrmlingFlock(scene, from, to);
  } catch (err) {
    warn(`summit: the wyrmlings could not be built (${String(err)}); flying a particle flock`);
  }
  try {
    return new ParticleFlock(scene, from, to);
  } catch (err) {
    warn(`summit: no flock this time (${String(err)})`);
    return null;
  }
}
