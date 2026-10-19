import * as THREE from 'three';
import { prepareNpcModel } from '../npcs/npcModels';
import type { NpcDef, NpcModelLoader } from '../npcs/types';

/** The M10 courier's look: the Rogue from the KayKit Adventurers pack in dark leather (not the hooded one: that is Tobb's body). */
export const COURIER_DEF: NpcDef = {
  id: 'courier', nameKey: 'chase.courier', model: 'rogue', scale: 1, tint: 0x5a4630, dialogueId: '', idleClip: 'Idle',
};
export const COURIER_RUN_CLIP = 'Running_A';
/** Metres per second above which he counts as running (below it, or paused at a vault or drop, he idles). */
export const COURIER_RUN_SPEED = 0.6;
/** A move this long in one frame is a placement (restart, cornered, load), not travel: his top speed is about 7 m/s. */
const TELEPORT_DISTANCE = 3;
const SPEED_WINDOW = 0.15;
/** Seconds without movement before he idles (a render frame between two fixed steps sees none). */
const STILL_GRACE = 0.2;

/** A rigged courier: yaw follows his travel, Running_A while he moves, Idle while he waits. Pure but for the three.js objects. */
export class CourierBody {
  readonly root = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer;
  private readonly run: THREE.AnimationAction | null;
  private readonly idle: THREE.AnimationAction | null;
  private current: THREE.AnimationAction | null = null;
  private last: { x: number; z: number } | null = null;
  private yaw = 0;
  private disposed = false;
  private window = 0;
  private windowDist = 0;
  private stillFor = 0;

  constructor(model: THREE.Object3D, clips: readonly THREE.AnimationClip[]) {
    this.root.name = 'npc:courier';
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    const by = (name: string) => clips.find((c) => c.name === name);
    const runClip = by(COURIER_RUN_CLIP);
    const idleClip = by(COURIER_DEF.idleClip) ?? clips.find((c) => c.name.includes('Idle'));
    this.run = runClip ? this.mixer.clipAction(runClip) : null;
    this.idle = idleClip ? this.mixer.clipAction(idleClip) : null;
    this.play(this.idle);
  }

  get animation(): 'run' | 'idle' | 'none' {
    return this.current === this.run && this.run ? 'run' : this.current === this.idle && this.idle ? 'idle' : 'none';
  }
  get facing(): number { return this.yaw; }

  private setMoving(moving: boolean): void {
    this.play(moving ? (this.run ?? this.idle) : this.idle);
    if (this.window >= SPEED_WINDOW) { this.window = 0; this.windowDist = 0; }
  }

  private play(next: THREE.AnimationAction | null): void {
    if (!next || next === this.current) return;
    next.reset().play();
    if (this.current) next.crossFadeFrom(this.current, 0.15, false);
    this.current = next;
  }

  /** One frame: he is at (x, z) now. Turns to his travel direction (yaw 0 faces -Z) and picks the clip from his speed. */
  step(dt: number, x: number, z: number): void {
    if (this.disposed) return;
    if (this.last && dt > 0) {
      const dx = x - this.last.x;
      const dz = z - this.last.z;
      const moved = Math.hypot(dx, dz);
      if (moved > TELEPORT_DISTANCE) {
        this.window = 0; this.windowDist = 0; this.stillFor = 0;
      } else if (moved > 1e-6) {
        this.yaw = Math.atan2(-dx, -dz);
        // Position changes at the fixed step, so a render frame can see none: speed is measured over a short window.
        this.window += dt;
        this.windowDist += moved;
        if (this.window >= SPEED_WINDOW) this.setMoving(this.windowDist / this.window > COURIER_RUN_SPEED);
      } else {
        this.stillFor += dt;
        if (this.stillFor >= STILL_GRACE) { this.setMoving(false); this.window = 0; this.windowDist = 0; }
      }
      if (moved > 1e-6 && moved <= TELEPORT_DISTANCE) this.stillFor = 0;
    }
    this.last = { x, z };
    this.root.rotation.y = this.yaw;
    if (dt > 0) this.mixer.update(dt);
  }

  /** A move that is not travel (a restart, a catch placement): forget where he was so the jump does not read as a sprint. */
  resetTrack(): void { this.last = null; this.window = 0; this.windowDist = 0; this.stillFor = 0; }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mixer.stopAllAction();
    this.root.removeFromParent();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      // Geometry is shared with the loader's cached glb (clones reuse it), so only the private material clones go.
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat?.dispose?.();
    });
  }
}

/**
 * Loads the Rogue for the courier. Null (never a throw) when the loader is missing, the model fails to load or
 * prepare, so the caller keeps its capsule; the reason goes to `warn` once.
 */
export async function loadCourierBody(loader: NpcModelLoader | null | undefined, warn: (m: string) => void = () => {}): Promise<CourierBody | null> {
  if (!loader) return null;
  try {
    await loader.load(COURIER_DEF.model);
    const { model, clips } = prepareNpcModel(loader, COURIER_DEF);
    return new CourierBody(model, clips);
  } catch (err) {
    warn(`courier: the Rogue model could not be built, keeping the capsule (${String(err)})`);
    return null;
  }
}
