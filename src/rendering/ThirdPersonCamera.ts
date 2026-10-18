import * as THREE from 'three';
import type RAPIER_API from '@dimforge/rapier3d';
import { CAMERA } from '../config/constants';
import type { InputManager } from '../input/InputManager';
import type { PhysicsQueries } from '../physics/PhysicsWorld';

const LOCK_SMOOTHING = 8;
const LOCK_PITCH = -0.25;
const DEFAULT_BLEND = 0.6;

type Vec3Like = { x: number; y: number; z: number };

/** A scripted camera pose (cutscenes, set pieces). Function values are re-evaluated every update. */
export interface CameraShot {
  /** World-space camera position. */
  position: Vec3Like | (() => Vec3Like);
  /** World-space point to look at. */
  lookAt: Vec3Like | (() => Vec3Like);
  /** Degrees; omitted keeps the follow fov. */
  fov?: number;
  /** Seconds to blend in from the current pose; <= 0 snaps. Default 0.6. */
  blendIn?: number;
  /** Seconds to blend out when released without an argument; <= 0 snaps. Default 0.6. */
  blendOut?: number;
}

export interface CameraOverride {
  readonly active: boolean;
  /** Ends the override, blending over `blendOut` (default: the shot's) to the next override or the follow pose. */
  release(blendOut?: number): void;
}

interface Entry {
  shot: CameraShot;
  active: boolean;
  warned: boolean;
}

/** What a blend starts from or heads to: the follow pose, a live shot, or a pose frozen mid-blend. */
type Source =
  | { kind: 'follow' }
  | { kind: 'entry'; entry: Entry }
  | { kind: 'frozen'; position: THREE.Vector3; lookAt: THREE.Vector3; fov: number };

const smoothstep = (x: number): number => x * x * (3 - 2 * x);
const finite3 = (v: Vec3Like | undefined): v is Vec3Like =>
  !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

/**
 * Orbiting third-person camera. Mouse look updates yaw/pitch every rendered frame for
 * responsiveness; the simulation reads `yaw` when it samples input so movement is camera-relative.
 * A physics raycast pulls the camera in front of anything between it and the player.
 */
export class ThirdPersonCamera {
  yaw = 0;
  pitch = -0.3;
  /** Returns the lock-on target point (world space) while locked, else null. Set by the player controller. */
  lockTarget: (() => { x: number; y: number; z: number } | null) | null = null;
  /** Receives the frame's horizontal mouse delta in pixels while locked (feeds the lock-on swap gesture). */
  onLockLook: ((dx: number) => void) | null = null;
  private distance: number = CAMERA.distance;
  private readonly target = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();

  private readonly stack: Entry[] = [];
  private from: Source = { kind: 'follow' };
  private to: Source = { kind: 'follow' };
  private blendT = 0;
  private blendDur = 0;
  /** Follow fov captured when the first override began; null while no override is in play. */
  private baseFov: number | null = null;
  private readonly followPos = new THREE.Vector3();
  private readonly fromPos = new THREE.Vector3();
  private readonly fromLook = new THREE.Vector3();
  private readonly toPos = new THREE.Vector3();
  private readonly toLook = new THREE.Vector3();
  private readonly outPos = new THREE.Vector3();
  private readonly outLook = new THREE.Vector3();
  private outFov = 0;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly input: InputManager,
    private readonly physics: PhysicsQueries,
    private readonly ignore: RAPIER_API.Collider,
  ) {}

  /** Converts camera-relative strafe/forward axes into a world-space (x, z) direction. */
  toWorld(right: number, forward: number): { x: number; z: number } {
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // Yaw 0 looks down -Z; forward is the camera's horizontal view direction.
    return { x: right * cos - forward * sin, z: -right * sin - forward * cos };
  }

  /** True while any override is active (a released override still blending out does not count). */
  get overridden(): boolean {
    return this.stack.length > 0;
  }

  /**
   * Takes the camera over with `shot`. Overrides stack: the latest active one wins. While overridden,
   * mouse look, wheel and lock-on are suspended (input is discarded; yaw, pitch and lock target are kept).
   */
  override(shot: CameraShot): CameraOverride {
    const entry: Entry = { shot, active: true, warned: false };
    this.stack.push(entry);
    this.retarget({ kind: 'entry', entry }, shot.blendIn ?? DEFAULT_BLEND);
    return {
      get active() {
        return entry.active;
      },
      release: (blendOut) => this.release(entry, blendOut),
    };
  }

  private release(entry: Entry, blendOut?: number): void {
    if (!entry.active) return;
    entry.active = false;
    const i = this.stack.indexOf(entry);
    const wasTop = i === this.stack.length - 1;
    this.stack.splice(i, 1);
    if (!wasTop) return;
    const next = this.stack[this.stack.length - 1];
    this.retarget(next ? { kind: 'entry', entry: next } : { kind: 'follow' }, blendOut ?? entry.shot.blendOut ?? DEFAULT_BLEND);
  }

  /** Starts a blend towards `to`, continuing from the pose currently on screen. */
  private retarget(to: Source, duration: number): void {
    if (this.blendDur > 0 && this.blendT > 0 && this.blendT < this.blendDur) {
      this.from = {
        kind: 'frozen',
        position: this.outPos.clone(),
        lookAt: this.outLook.clone(),
        fov: this.outFov,
      };
    } else {
      this.from = this.to;
    }
    this.to = to;
    this.blendT = 0;
    this.blendDur = Number.isFinite(duration) ? duration : 0;
  }

  /** Writes the pose of `src` into the given vectors and returns its fov. */
  private poseOf(src: Source, pos: THREE.Vector3, look: THREE.Vector3): number {
    const base = this.baseFov ?? this.camera.fov;
    if (src.kind === 'frozen') {
      pos.copy(src.position);
      look.copy(src.lookAt);
      return src.fov;
    }
    if (src.kind === 'entry') {
      const { shot } = src.entry;
      const p = typeof shot.position === 'function' ? shot.position() : shot.position;
      const l = typeof shot.lookAt === 'function' ? shot.lookAt() : shot.lookAt;
      if (finite3(p) && finite3(l)) {
        pos.set(p.x, p.y, p.z);
        look.set(l.x, l.y, l.z);
        return shot.fov !== undefined && Number.isFinite(shot.fov) ? shot.fov : base;
      }
      if (!src.entry.warned) {
        src.entry.warned = true;
        console.warn('ThirdPersonCamera: camera shot has a non-finite position or lookAt; using the follow pose');
      }
    }
    pos.copy(this.followPos);
    look.copy(this.target);
    return base;
  }

  /** Mixes the blend sources into the camera; clears the override state once fully back on the follow pose. */
  private applyBlend(frameTime: number): void {
    const idle = this.to.kind === 'follow' && this.blendT >= this.blendDur;
    if (idle) {
      this.finishBlend();
      return;
    }
    // Captured here, not in override(): during update the camera effects' fov punch has been taken off
    // (they restore before the camera update), so this is the clean follow fov.
    if (this.baseFov === null) this.baseFov = this.camera.fov;
    this.blendT += Math.max(frameTime, 0);
    const done = this.blendDur <= 0 || this.blendT >= this.blendDur;
    const w = done ? 1 : smoothstep(this.blendT / this.blendDur);
    if (done && this.to.kind === 'follow') {
      this.finishBlend();
      return;
    }
    const fromFov = this.poseOf(this.from, this.fromPos, this.fromLook);
    const toFov = this.poseOf(this.to, this.toPos, this.toLook);
    this.outPos.lerpVectors(this.fromPos, this.toPos, w);
    this.outLook.lerpVectors(this.fromLook, this.toLook, w);
    this.outFov = fromFov + (toFov - fromFov) * w;
    this.camera.position.copy(this.outPos);
    this.camera.lookAt(this.outLook);
    this.setFov(this.outFov);
  }

  private finishBlend(): void {
    this.from = this.to = { kind: 'follow' };
    this.blendT = this.blendDur = 0;
    if (this.baseFov !== null) {
      this.setFov(this.baseFov);
      this.baseFov = null;
    }
  }

  private setFov(fov: number): void {
    if (this.camera.fov === fov) return;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  /** Places the camera behind `feet` (the interpolated player position). Call once per frame. */
  update(feet: THREE.Vector3, frameTime = 1 / 60): void {
    const { dx, dy } = this.input.consumeMouseDelta();
    // An override suspends mouse look, wheel and lock-on; input is consumed so it does not pile up.
    const overridden = this.stack.length > 0;
    const lock = overridden ? null : (this.lockTarget?.() ?? null);
    if (overridden) {
      this.input.consumeWheel();
    } else if (lock) {
      this.onLockLook?.(dx);
      this.easeToward(feet, lock, frameTime);
    } else {
      this.yaw -= dx * CAMERA.mouseSensitivity;
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * CAMERA.mouseSensitivity, CAMERA.minPitch, CAMERA.maxPitch);
    }
    if (!overridden) {
      this.distance = THREE.MathUtils.clamp(
        this.distance + this.input.consumeWheel() * 0.5,
        CAMERA.minDistance,
        CAMERA.maxDistance,
      );
    }

    this.target.set(feet.x, feet.y + CAMERA.targetHeight, feet.z);
    // While locked, aim a third of the way to the target so both stay in frame.
    if (lock) this.target.lerp(this.tmp.set(lock.x, lock.y, lock.z), 1 / 3);
    // Direction from the target back to the camera.
    this.offset.set(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      -Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );

    let dist = this.distance;
    const hit = this.physics.raycast(this.target, this.offset, dist + CAMERA.collisionMargin, this.ignore);
    if (hit) dist = Math.max(hit.distance - CAMERA.collisionMargin, 0.3);

    this.followPos.copy(this.target).addScaledVector(this.offset, dist);
    this.camera.position.copy(this.followPos);
    this.camera.lookAt(this.target);
    this.applyBlend(frameTime);
  }

  /** Eases yaw toward the target bearing (shortest arc, never overshooting) and pitch toward the lock pitch. */
  private easeToward(feet: THREE.Vector3, lock: { x: number; y: number; z: number }, frameTime: number): void {
    const k = 1 - Math.exp(-LOCK_SMOOTHING * frameTime);
    const hx = lock.x - feet.x;
    const hz = lock.z - feet.z;
    // Zero horizontal distance has no bearing: keep the previous yaw.
    if (Math.hypot(hx, hz) > 1e-6) {
      const desired = Math.atan2(-hx, -hz);
      const diff = Math.atan2(Math.sin(desired - this.yaw), Math.cos(desired - this.yaw));
      this.yaw += diff * k;
    }
    const pitchGoal = THREE.MathUtils.clamp(LOCK_PITCH, CAMERA.minPitch, CAMERA.maxPitch);
    this.pitch += (pitchGoal - this.pitch) * k;
  }
}
