import type { Vec3 } from '../physics/PhysicsWorld';

/** The `interiors` service (contracts/interiors-and-nav.md section 1, thread 3a). Rejections carry an `InteriorError`. */
export interface InteriorsService {
  enter(interiorId: string, doorId: string): Promise<void>;
  /** Default: the door used to enter (else the interior's first door). */
  exit(doorId?: string): Promise<void>;
  /** Interior id, null outdoors; already set when `save.loaded` handlers run after a load into an interior. */
  readonly current: string | null;
  readonly transitioning: boolean;
  /** The interior whose 3D bounds contain `at`, or null. */
  interiorAt(at: Vec3): string | null;
  /** Live lock predicate for a door, read on every prompt and enter; returns the undo. */
  setDoorLock(doorId: string, locked: () => boolean): () => void;
  /** Closes or opens a named blocker (collider, mesh and nav cells together); false for an unknown id. */
  setBlocker(blockerId: string, closed: boolean): boolean;
}

declare module '../core/Services' {
  interface GameServices {
    interiors: InteriorsService;
  }
}
