// N3 arena kit: platforms that turn (plans/act5-N3.md 1.6; spike plans/act5-N0-spike.md; v0.9 item 7b). Each platform is
// a kinematic body registered on the core `platforms` service with a spin about one pivot. They turn under the player by
// default (`pauseWhileStood` off, the Step 0 rule). Meshes are drawn every frame from `renderPose(id, alpha)`, never the
// body's pose, so the floor and the interpolated player move together.
// States: 'still' (holds its angle), 'turning' (the def's rate), 'turning:<degPerS>' (another rate). Reset: angle 0 and
// the start state.
import type RAPIER from '@dimforge/rapier3d';
import type * as THREE from 'three';
import type { ArenaPiece } from '../../bosses/arena';
import type { PlatformPath, PlatformPose } from '../../physics/platforms';

/** The parts of the core `platforms` service the kit uses. */
export interface PlatformsLike {
  register(id: string, body: RAPIER.RigidBody, path: PlatformPath): () => void;
  renderPose(id: string, alpha: number): PlatformPose | null;
  setSpinRate(id: string, degPerS: number): boolean;
  resetSpin(id: string): boolean;
}

export interface PlatformItem {
  /** Platform id on the core service (unique; `caldera.anvil.ring.1`). */
  id: string;
  /** A kinematicPositionBased body, its translation the rest pose (the pivot for a ring segment). */
  body: RAPIER.RigidBody;
  /** Drawn at the render pose (position and yaw), so its geometry carries the offset from the body's origin. */
  mesh?: THREE.Object3D;
}

export interface TurningPlatformsOptions {
  platforms: PlatformsLike;
  pivot: { x: number; y: number; z: number };
  /** 'turning''s rate, degrees a second (D10: 10). */
  degPerS: number;
  items: readonly PlatformItem[];
  /** The start (and reset) state; default 'still'. */
  start?: 'still' | 'turning';
  /** The accepted fallback, off by default (the spike: not needed). */
  pauseWhileStood?: boolean;
  warn?(message: string): void;
}

export class TurningPlatforms implements ArenaPiece {
  private readonly undos: Array<() => void> = [];
  private s = 'still';
  private rate = 0;
  private readonly warned = new Set<string>();

  constructor(private readonly opts: TurningPlatformsOptions) {
    if (!Number.isFinite(opts.degPerS)) throw new Error('TurningPlatforms: degPerS must be finite');
    for (const it of opts.items) {
      const t = it.body.translation();
      this.undos.push(
        opts.platforms.register(it.id, it.body, {
          stops: [{ x: t.x, y: t.y, z: t.z }],
          speed: 1,
          wait: 0,
          spin: { pivot: { ...opts.pivot }, degPerS: opts.degPerS, ...(opts.pauseWhileStood ? { pauseWhileStood: true } : {}) },
        }),
      );
    }
    this.toStart();
  }

  get state(): string {
    return this.s;
  }

  /** The rate now, degrees a second (0 while still). */
  get degPerS(): number {
    return this.rate;
  }

  apply(state: string): void {
    const r = this.rateFor(state);
    if (r === null) {
      if (!this.warned.has(state)) {
        this.warned.add(state);
        this.opts.warn?.(`TurningPlatforms: unknown state "${state}"`);
      }
      return;
    }
    this.setRate(r);
    this.s = state;
  }

  reset(): void {
    for (const it of this.opts.items) this.opts.platforms.resetSpin(it.id);
    this.toStart();
  }

  render(alpha: number): void {
    for (const it of this.opts.items) {
      if (!it.mesh) continue;
      const p = this.opts.platforms.renderPose(it.id, alpha);
      if (!p) continue;
      it.mesh.position.set(p.x, p.y, p.z);
      it.mesh.rotation.set(0, p.yaw, 0);
    }
  }

  dispose(): void {
    for (const u of this.undos.splice(0).reverse()) u();
  }

  private toStart(): void {
    const start = this.opts.start ?? 'still';
    this.setRate(start === 'turning' ? this.opts.degPerS : 0);
    this.s = start;
  }

  private rateFor(state: string): number | null {
    if (state === 'still') return 0;
    if (state === 'turning') return this.opts.degPerS;
    const m = /^turning:(-?\d+(?:\.\d+)?)$/.exec(state);
    return m ? Number(m[1]) : null;
  }

  private setRate(r: number): void {
    this.rate = r;
    for (const it of this.opts.items) {
      if (!this.opts.platforms.setSpinRate(it.id, r)) this.opts.warn?.(`TurningPlatforms: setSpinRate refused for "${it.id}"`);
    }
  }
}
