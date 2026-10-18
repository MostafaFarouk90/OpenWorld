import type { Vec3 } from '../physics/PhysicsWorld';
import type { NavGrid } from './NavGrid';

/** Walking paths over flat-floored grids (interiors, yards); outside every grid callers steer directly. */
export interface NavService {
  /** Waypoints from `from` (excluded) to `to`; null when `from` is in no grid. Default radius 0.4 m. */
  path(from: Vec3, to: Vec3, opts?: { radius?: number }): Vec3[] | null;
  hasGrid(at: Vec3): boolean;
  floorAt(at: Vec3): number | null;
  /** Thread 3a only: add a grid; returns the undo. */
  addGrid(grid: NavGrid): () => void;
  /** Thread 3a only: open or close a named blocker. */
  setBlocker(blockerId: string, closed: boolean): boolean;
}

declare module '../core/Services' {
  interface GameServices {
    nav: NavService;
  }
}
