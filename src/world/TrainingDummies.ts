import type * as THREE from 'three';
import type { Vec3 } from '../physics/PhysicsWorld';

export interface DummySpot {
  feet: Vec3;
  /** Radians about +Y; the Knight model faces +Z at yaw 0. */
  yaw: number;
}

/** Where the training dummies stand; thread 4 feeds the Practice Yard anchors (service 'dummies'). */
export interface DummiesService {
  place(spots: readonly DummySpot[]): void;
  readonly count: number;
}

/**
 * Remembers the requested spots and applies them to the dummy models once they exist (the Knight
 * loads asynchronously). Extra spots are ignored with a warning; dummies without a spot stay put.
 */
export class TrainingDummies implements DummiesService {
  private models: THREE.Object3D[] = [];
  private spots: DummySpot[] | null = null;

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
