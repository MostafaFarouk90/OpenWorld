import * as THREE from 'three';
import type { CameraShot } from '../../rendering/ThirdPersonCamera';
import { restPose, WyrmRig, type RootFrame, type WyrmPose } from './builder/rig';

/**
 * Orsk's set piece in M20 (plans/act2-A6a.md 1.5; design row 28): the chained elder wyrm in the gallery breaks his
 * chains, roars, and bursts up through the roof. Not an enemy: a WyrmRig at 3x in the grey-blue palette, four wall
 * chains and a fixed timeline. A13 calls `wyrms.playOrsk`; A4 swaps the roof section on `roofBurst`.
 */
export type OrskBeat = 'started' | 'chainsBroken' | 'roar' | 'roofBurst' | 'gone';

export const ORSK_BEATS: readonly { beat: OrskBeat; at: number }[] = [
  { beat: 'started', at: 0 },
  { beat: 'chainsBroken', at: 2.2 },
  { beat: 'roar', at: 3.2 },
  { beat: 'roofBurst', at: 5.4 },
  { beat: 'gone', at: 6.4 },
];

export const ORSK = {
  scale: 3,
  /** Seconds of the inhale glow before the roar. */
  inhaleSeconds: 0.8,
  /** The launch starts here and reaches the roof at `roofBurst`. */
  launchAt: 4.6,
  /** Hidden this far above the roof (the void over a floating interior never shows). */
  hideAbove: 2,
} as const;

/** The pure timeline: `step` returns the beats crossed this tick, in order; `skip` returns every one left. */
export class OrskSequence {
  private t = 0;
  private next = 0;

  get time(): number {
    return this.t;
  }

  get done(): boolean {
    return this.next >= ORSK_BEATS.length;
  }

  step(dt: number): OrskBeat[] {
    if (this.done || !(dt > 0) || !Number.isFinite(dt)) return this.next === 0 && dt === 0 ? this.take(0) : [];
    // `started` fires on the first step even with t still 0.
    this.t += dt;
    return this.take(this.t);
  }

  skip(): OrskBeat[] {
    const out = ORSK_BEATS.slice(this.next).map((b) => b.beat);
    this.next = ORSK_BEATS.length;
    this.t = Math.max(this.t, ORSK_BEATS[ORSK_BEATS.length - 1]!.at);
    return out;
  }

  private take(t: number): OrskBeat[] {
    const out: OrskBeat[] = [];
    while (this.next < ORSK_BEATS.length && ORSK_BEATS[this.next]!.at <= t + 1e-9) out.push(ORSK_BEATS[this.next++]!.beat);
    return out;
  }
}

/** Orsk's pose at time `t` (seconds into the sequence) and his altitude above the floor. */
export function orskPose(t: number, roofHeight: number, out: WyrmPose = restPose()): { pose: WyrmPose; altitude: number } {
  Object.assign(out, restPose());
  const p = out;
  const [, broken, roar, burst] = ORSK_BEATS.map((b) => b.at) as [number, number, number, number, number];
  if (t < broken) {
    // Straining against the chains.
    const k = t / broken;
    p.headYaw = 0.35 * Math.sin(t * 7.5) * (0.4 + 0.6 * k);
    p.headPitch = 0.15 * Math.sin(t * 5.1);
    p.jaw = 0.3 + 0.2 * Math.sin(t * 9);
    p.fold = 0.7;
    p.flap = 0.1 * Math.sin(t * 6);
  } else if (t < roar) {
    // Free: rearing up as the mouth fills.
    const k = (t - (roar - ORSK.inhaleSeconds)) / ORSK.inhaleSeconds;
    p.headPitch = 0.35;
    p.fold = 0.4;
    p.flap = 0.3;
    p.mouth = Math.max(0, Math.min(1, k));
  } else if (t < ORSK.launchAt) {
    const u = (t - roar) / (ORSK.launchAt - roar);
    p.headPitch = 0.55;
    p.jaw = u < 0.85 ? 1 : 0.4;
    p.mouth = 0.9;
    p.fold = 0;
    p.flap = 0.55 * Math.sin(u * Math.PI);
    p.billow = 1;
  } else {
    p.fold = 0;
    p.billow = 1;
    p.flap = 0.15 + 0.6 * Math.sin(t * 9);
    p.headPitch = 0.9;
    p.legTuck = 1;
  }
  // The launch: from the floor to just under the roof at `roofBurst`, then on up through it.
  let altitude = 0;
  if (t >= ORSK.launchAt) {
    const climb = Math.max(0.5, roofHeight - 1);
    const u = (t - ORSK.launchAt) / (burst - ORSK.launchAt);
    altitude = u <= 1 ? climb * u * u : climb + (t - burst) * 14;
  }
  return { pose: p, altitude };
}

export interface OrskPorts {
  scene: THREE.Object3D;
  /** Freeze the player; returns the undo. */
  freezePlayer(source: string): () => void;
  /** The cutscene input context; returns the undo (null when unavailable). */
  cutscene(source: string): (() => void) | null;
  /** The camera override, or null headless. */
  camera(shot: CameraShot): { release(blendOut?: number): void } | null;
  beat(beat: OrskBeat): void;
  sfx?(key: string, at: { x: number; y: number; z: number }): void;
  shake?(strength: number, seconds: number): void;
}

export interface OrskRequest {
  position: { x: number; y: number; z: number };
  yaw: number;
  /** The gallery roof's height above `position.y`. */
  roofHeight: number;
}

const SOURCE = 'wyrm.orsk';
const DT = 1 / 60;

/** One playing of the set piece: built on start, torn down on `gone`, `skip` or `dispose`. */
export class OrskScene {
  readonly rig: WyrmRig;
  readonly done: Promise<void>;
  private readonly seq = new OrskSequence();
  private readonly chains: THREE.Mesh[] = [];
  private readonly chainGeometry = new THREE.CylinderGeometry(0.09, 0.09, 1, 6, 1);
  private readonly chainMaterial = new THREE.MeshStandardMaterial({ color: 0x4a4744, metalness: 0.8, roughness: 0.5 });
  private readonly undo: Array<() => void> = [];
  private readonly frame: RootFrame;
  private readonly pose = restPose();
  private resolve!: () => void;
  private finished = false;
  private camera: { release(blendOut?: number): void } | null = null;

  constructor(
    private readonly ports: OrskPorts,
    private readonly req: OrskRequest,
  ) {
    this.done = new Promise((r) => (this.resolve = r));
    this.rig = new WyrmRig({ scale: ORSK.scale, palette: 'orsk', seed: 28 });
    this.frame = { x: req.position.x, y: req.position.y, z: req.position.z, yaw: req.yaw };
    this.rig.root.position.set(req.position.x, req.position.y, req.position.z);
    this.rig.root.rotation.set(0, req.yaw, 0);
    this.rig.root.name = 'orsk';
    ports.scene.add(this.rig.root);
    this.rig.resetSpine(this.frame, 0, this.pose);
    this.rig.apply(this.frame, this.pose, 0);
    this.buildChains();
    this.undo.push(ports.freezePlayer(SOURCE));
    const ctxUndo = ports.cutscene(SOURCE);
    if (ctxUndo) this.undo.push(ctxUndo);
    // Low and in front, looking up: the roof hole and the debris fill the top of the frame at the end.
    const fx = -Math.sin(req.yaw);
    const fz = -Math.cos(req.yaw);
    const len = this.rig.spine.length;
    const position = { x: req.position.x + fx * len * 0.9 + fz * len * 0.35, y: req.position.y + 1.6, z: req.position.z + fz * len * 0.9 - fx * len * 0.35 };
    const lookAt = () => ({ x: req.position.x, y: req.position.y + Math.min(req.roofHeight, 2 + this.lastAltitude * 0.8), z: req.position.z });
    this.camera = ports.camera({ position, lookAt, blendIn: 0.5, blendOut: 0.8 });
  }

  private lastAltitude = 0;

  get time(): number {
    return this.seq.time;
  }

  get playing(): boolean {
    return !this.finished;
  }

  /** One fixed tick. */
  fixedUpdate(dt: number = DT): void {
    if (this.finished) return;
    const beats = this.seq.time === 0 ? [...this.seq.step(0), ...this.seq.step(dt)] : this.seq.step(dt);
    this.animate(dt);
    for (const b of beats) this.fire(b);
  }

  /** Jumps to the end: every remaining beat once, in order, then done. */
  skip(): void {
    if (this.finished) return;
    const beats = this.seq.time === 0 ? [...this.seq.step(0), ...this.seq.skip()] : this.seq.skip();
    for (const b of beats) this.fire(b);
  }

  /** Teardown without the remaining beats (scope teardown). Idempotent. */
  dispose(): void {
    this.finish();
  }

  private animate(dt: number): void {
    const t = this.seq.time;
    const { altitude } = orskPose(t, this.req.roofHeight, this.pose);
    this.lastAltitude = altitude;
    const head = this.rig.headWorld(this.frame, altitude, this.pose);
    this.rig.spine.step(dt, head, { speed: altitude > 0 ? 8 : 0, flying: altitude > 0.3 });
    this.rig.apply(this.frame, this.pose, dt);
    // Hidden once past the roof: the floating interior has nothing above it.
    if (altitude > this.req.roofHeight + ORSK.hideAbove) this.rig.root.visible = false;
  }

  private fire(beat: OrskBeat): void {
    const at = { x: this.req.position.x, y: this.req.position.y + 4, z: this.req.position.z };
    if (beat === 'chainsBroken') {
      for (const c of this.chains) c.visible = false;
      this.ports.sfx?.('sfx.wyrm.screech', at);
    } else if (beat === 'roar') {
      this.ports.sfx?.('sfx.wyrm.roar', at);
      this.ports.shake?.(0.6, 1.2);
    } else if (beat === 'roofBurst') {
      this.ports.shake?.(0.9, 0.8);
    }
    this.ports.beat(beat);
    if (beat === 'gone') this.finish();
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.camera?.release();
    this.camera = null;
    for (const u of this.undo.splice(0).reverse()) {
      try {
        u();
      } catch {
        // an undo of a torn-down service: nothing left to restore
      }
    }
    for (const c of this.chains) c.removeFromParent();
    this.chainGeometry.dispose();
    this.chainMaterial.dispose();
    this.rig.dispose();
    this.resolve();
  }

  /** Four chains from the neck and the hips out to the gallery walls. */
  private buildChains(): void {
    const len = this.rig.spine.length;
    const j = this.rig.joints;
    for (const [joint, side] of [
      [j.neck, -1],
      [j.neck, 1],
      [j.belly, -1],
      [j.belly, 1],
    ] as const) {
      const from = joint.position.clone();
      const to = from.clone().add(new THREE.Vector3(side * len * 0.35, 1.5, 0));
      const mesh = new THREE.Mesh(this.chainGeometry, this.chainMaterial);
      const d = to.clone().sub(from);
      mesh.position.copy(from).addScaledVector(d, 0.5);
      mesh.scale.set(1, d.length(), 1);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      mesh.name = 'orsk-chain';
      this.rig.owner.add(mesh);
      this.chains.push(mesh);
    }
  }
}
