import type * as THREE from 'three';
import { lodDistances, restPose, WyrmRig, type RootFrame, type WyrmPose } from '../builder/rig';
import type { WyrmParams } from '../builder/params';
import { WYRM_SHAPE } from '../builder/params';
import { FlightPath, PathWalker, type PathPoint, type PathSample } from '../large/flightPath';
import { YSMERYTH } from './def';

/** Ysmeryth's build (design 10 "Dragon fallback"): 6x, cooled slag, a lit crest. The trial body uses the same row (body.ts). */
export const YSMERYTH_PARAMS: Readonly<Partial<WyrmParams>> = { scale: YSMERYTH.scale, palette: 'cooled-slag', crest: true, seed: 31 };

/** Her M32 and M34 poses at the Wyrm's Hearth (plans/act3-K6a-pr2.md 1.5). */
export type YsmerythPose = 'perch' | 'land' | 'reveal' | 'oath';
export const YSMERYTH_POSES: readonly YsmerythPose[] = ['perch', 'land', 'reveal', 'oath'];

export interface PoseMark {
  x: number;
  y: number;
  z: number;
  /** Radians (yaw 0 faces -Z). */
  yaw: number;
}

export interface YsmerythScenePorts {
  scene: THREE.Object3D;
  cameraPosition?(): { x: number; y: number; z: number } | null;
}

export const YSMERYTH_SCENE = {
  /** A flight between two marks takes about this long, arcing this high above the higher mark. */
  flightSeconds: 4,
  flightArc: 12,
} as const;

/** Head height (x the build's stance height) and pitch per pose: low over the keeper-stone, reared for the oath. */
const HEAD: Record<YsmerythPose, { height: number; pitch: number; fold: number; flap: number }> = {
  perch: { height: 0.7, pitch: -0.45, fold: 1, flap: -0.25 },
  land: { height: 1, pitch: 0.05, fold: 0.85, flap: -0.15 },
  reveal: { height: 0.5, pitch: -0.6, fold: 0.7, flap: -0.1 },
  oath: { height: 1.6, pitch: 0.7, fold: 0, flap: 0.6 },
};

/**
 * The scene Ysmeryth (not an actor): one rig that stands at a pose mark, idles in that pose, and flies between marks on
 * a FlightPath. Deterministic for a given sequence of `show` calls and ticks.
 */
export class YsmerythScene {
  readonly rig: WyrmRig;
  private readonly pose: WyrmPose = restPose();
  private readonly frame: RootFrame = { x: 0, y: 0, z: 0, yaw: 0 };
  private readonly head: PathPoint = { x: 0, y: 0, z: 0 };
  private readonly sample: PathSample = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 };
  private current: YsmerythPose;
  private mark: PoseMark;
  private walker: PathWalker | null = null;
  private time = 0;
  private disposed = false;

  constructor(
    private readonly ports: YsmerythScenePorts,
    pose: YsmerythPose,
    at: PoseMark,
  ) {
    this.rig = new WyrmRig(YSMERYTH_PARAMS);
    this.rig.root.name = 'ysmeryth';
    this.current = pose;
    this.mark = { ...at };
    this.placeAt(at);
    ports.scene.add(this.rig.root);
    this.headFor(pose, at.yaw, 0);
    this.rig.spine.reset(this.head, { x: Math.sin(at.yaw), y: 0, z: Math.cos(at.yaw) });
    this.update(0);
  }

  get currentPose(): YsmerythPose {
    return this.current;
  }

  /** In the air between two marks. */
  get flying(): boolean {
    return this.walker !== null;
  }

  get disposedYet(): boolean {
    return this.disposed;
  }

  /** Where the root stands now (tests). */
  get at(): Readonly<RootFrame> {
    return this.frame;
  }

  /** Go to `pose` at `at`: at once when `instant`, else a flight from where she is (a no-op when already there). */
  show(pose: YsmerythPose, at: PoseMark, instant = false): void {
    if (this.disposed) return;
    const same = Math.hypot(at.x - this.mark.x, at.z - this.mark.z) < 0.5 && Math.abs(at.y - this.mark.y) < 0.5;
    this.current = pose;
    if (same && !this.walker) {
      this.mark = { ...at };
      return;
    }
    this.mark = { ...at };
    if (instant) {
      this.walker = null;
      this.placeAt(at);
      this.headFor(pose, at.yaw, 0);
      this.rig.spine.reset(this.head, { x: Math.sin(at.yaw), y: 0, z: Math.cos(at.yaw) });
      return;
    }
    const top = Math.max(this.frame.y, at.y) + YSMERYTH_SCENE.flightArc;
    const path = new FlightPath([
      { x: this.frame.x, y: this.frame.y, z: this.frame.z },
      { x: (this.frame.x + at.x) / 2, y: top, z: (this.frame.z + at.z) / 2 },
      { x: at.x, y: at.y, z: at.z },
    ]);
    this.walker = new PathWalker(path, path.length / YSMERYTH_SCENE.flightSeconds);
  }

  update(dt: number): void {
    if (this.disposed) return;
    const d = dt > 0 && Number.isFinite(dt) ? dt : 0;
    this.time += d;
    Object.assign(this.pose, restPose());
    const p = this.pose;
    if (this.walker) {
      this.walker.step(d, this.sample);
      this.frame.x = this.sample.x;
      this.frame.y = this.sample.y;
      this.frame.z = this.sample.z;
      this.frame.yaw = this.sample.yaw;
      p.fold = 0;
      p.flap = 0.8 * Math.sin(this.time * 2.5);
      p.legTuck = 1;
      p.billow = 1;
      this.headFor('land', this.frame.yaw, 0);
      if (this.walker.done) {
        this.walker = null;
        this.placeAt(this.mark);
      }
    } else {
      const h = HEAD[this.current];
      p.fold = h.fold;
      p.flap = h.flap;
      p.headPitch = h.pitch;
      if (this.current === 'perch') p.headYaw = 0.35 * Math.sin(this.time * 0.3);
      if (this.current === 'oath') {
        // The crest and eyes blaze (the flash channel), the mouth glows.
        p.flash = 0.6 + 0.4 * Math.sin(this.time * 3);
        p.mouth = 0.6;
      }
      if (this.current === 'reveal') p.mouth = 0.2;
      this.headFor(this.current, this.frame.yaw, this.time);
    }
    this.rig.root.position.set(this.frame.x, this.frame.y, this.frame.z);
    this.rig.root.rotation.set(0, this.frame.yaw, 0);
    this.rig.spine.step(d, this.head, { speed: this.walker ? 10 : 0, flying: !!this.walker });
    const cam = this.ports.cameraPosition?.();
    if (cam) {
      const dist = Math.hypot(cam.x - this.frame.x, cam.y - this.frame.y, cam.z - this.frame.z);
      const [near, far] = lodDistances(YSMERYTH.scale);
      this.rig.lod = dist > far ? 2 : dist > near ? 1 : 0;
    }
    this.rig.apply(this.frame, p, d);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.rig.dispose();
  }

  private placeAt(at: PoseMark): void {
    this.frame.x = at.x;
    this.frame.y = at.y;
    this.frame.z = at.z;
    this.frame.yaw = at.yaw;
  }

  /** The head point for a pose: ahead of the root along its facing, at the pose's height, with a slow breath. */
  private headFor(pose: YsmerythPose, yaw: number, t: number): void {
    const s = YSMERYTH.scale;
    const h = HEAD[pose];
    const fwd = WYRM_SHAPE.headForward * s;
    this.head.x = this.frame.x - Math.sin(yaw) * fwd;
    this.head.z = this.frame.z - Math.cos(yaw) * fwd;
    this.head.y = this.frame.y + WYRM_SHAPE.headHeight * s * h.height + 0.15 * s * Math.sin(t * 0.8);
  }
}
