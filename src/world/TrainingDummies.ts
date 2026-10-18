import type * as THREE from 'three';
import type { Vec3 } from '../physics/PhysicsWorld';
import { BlockingDummies, type BlockingDummyHandle, type BlockingHost } from './BlockingDummies';
import './dummies.events';

export type { BlockingDummyHandle } from './BlockingDummies';

export interface DummySpot {
  feet: Vec3;
  /** Radians about +Y; the Knight model faces +Z at yaw 0. */
  yaw: number;
}

/** Where the training dummies stand; thread 4 feeds the Practice Yard anchors (service 'dummies'). */
export interface DummiesService {
  place(spots: readonly DummySpot[]): void;
  /**
   * Quest R02: dummies with a scripted guard cycle and swing (anchors `yard.blocking-dummy-1..n`).
   * Replaces the previous blocking dummies; invalid spots warn and are skipped. Returns [] (with a
   * warning) before the game is wired.
   */
  placeBlocking(spots: readonly DummySpot[]): BlockingDummyHandle[];
  readonly count: number;
}

/**
 * Remembers the requested spots and applies them to the dummy models once they exist (the Knight
 * loads asynchronously). Extra spots are ignored with a warning; dummies without a spot stay put.
 */
export class TrainingDummies implements DummiesService {
  private models: THREE.Object3D[] = [];
  private spots: DummySpot[] | null = null;
  private blocking: BlockingDummies | null = null;
  private blockingHost: BlockingHost | null = null;

  constructor(private readonly warn: (message: string) => void = (m) => console.warn(m)) {}

  get count(): number {
    return this.models.length;
  }

  place(spots: readonly DummySpot[]): void {
    const valid = spots.filter((s) => {
      const ok = [s.feet?.x, s.feet?.y, s.feet?.z, s.yaw].every((v) => typeof v === 'number' && Number.isFinite(v));
      if (!ok) this.warn(`TrainingDummies: invalid spot ${JSON.stringify(s)}`);
      return ok;
    });
    this.spots = valid.map((s) => ({ feet: { ...s.feet }, yaw: s.yaw }));
    this.apply();
  }

  /** Wires the blocking dummies to the game; startWorld calls this once the game exists. */
  configureBlocking(host: BlockingHost): void {
    this.blocking?.dispose();
    this.blocking = null;
    this.blockingHost = host;
  }

  placeBlocking(spots: readonly DummySpot[]): BlockingDummyHandle[] {
    if (!this.blockingHost) {
      this.warn('TrainingDummies: placeBlocking called before the game is wired; nothing placed');
      return [];
    }
    this.blocking ??= new BlockingDummies({ ...this.blockingHost, warn: this.warn });
    return this.blocking.place(spots);
  }

  /** Fixed-step driver for the blocking dummies' guard cycle and swings. */
  updateBlocking(dt: number): void {
    this.blocking?.update(dt);
  }

  /** Removes the blocking dummies, their listeners and modifier. */
  disposeBlocking(): void {
    this.blocking?.dispose();
    this.blocking = null;
  }

  /** Called once the dummy models are in the scene. */
  setModels(models: THREE.Object3D[]): void {
    this.models = [...models];
    this.apply();
  }

  private apply(): void {
    if (!this.spots || this.models.length === 0) return;
    if (this.spots.length > this.models.length) {
      this.warn(`TrainingDummies: ${this.spots.length} spots for ${this.models.length} dummies; extra spots ignored`);
    }
    this.spots.slice(0, this.models.length).forEach((s, i) => {
      const m = this.models[i];
      m.position.set(s.feet.x, s.feet.y, s.feet.z);
      m.rotation.y = s.yaw;
      m.updateMatrixWorld(true);
    });
  }
}
