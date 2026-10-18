import type { Vec3 } from '../physics/PhysicsWorld';
import type { NavGrid } from './NavGrid';
import { findPath } from './pathfind';

/** Default agent radius in metres. */
export const DEFAULT_NAV_RADIUS = 0.4;

const finite = (v: Vec3): boolean => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

/** All registered grids; queries go to the grid that contains the start point. */
export class NavRegistry {
  private readonly grids = new Map<string, NavGrid>();

  /** Registers a grid (duplicate id throws). Returns the undo. */
  add(grid: NavGrid): () => void {
    if (this.grids.has(grid.id)) throw new Error(`NavRegistry: duplicate grid "${grid.id}"`);
    this.grids.set(grid.id, grid);
    return () => {
      if (this.grids.get(grid.id) === grid) this.grids.delete(grid.id);
    };
  }

  /** The first grid containing the point, or null. */
  gridAt(at: Vec3): NavGrid | null {
    if (!finite(at)) return null;
    for (const g of this.grids.values()) if (g.contains(at)) return g;
    return null;
  }

  hasGrid(at: Vec3): boolean {
    return this.gridAt(at) !== null;
  }

  /** Id of the grid containing the point, or null. */
  gridId(at: Vec3): string | null {
    return this.gridAt(at)?.id ?? null;
  }

  floorAt(at: Vec3): number | null {
    return this.gridAt(at)?.floorY ?? null;
  }

  /**
   * Waypoints from `from` (excluded) to `to` inside from's grid; on an open-edged grid a goal in no grid or another grid is
   * appended after the edge cell. Null when from is in no grid or an input is not finite. */
  path(from: Vec3, to: Vec3, opts?: { radius?: number }): Vec3[] | null {
    if (!finite(from) || !finite(to)) return null;
    const grid = this.gridAt(from);
    if (!grid) return null;
    const path = findPath(grid, from, to, opts?.radius ?? DEFAULT_NAV_RADIUS);
    // Off an open-edged grid the path walks on to the goal (Tobb and chasers follow the player out of a city block).
    if (grid.openEdges && path.length > 0 && this.gridAt(to) !== grid) path.push({ x: to.x, y: to.y, z: to.z });
    return path;
  }

  /** Opens or closes the named blocker in whichever grid has it; false when none does. */
  setBlocker(blockerId: string, closed: boolean): boolean {
    let found = false;
    for (const g of this.grids.values()) if (g.setBlocker(blockerId, closed)) found = true;
    return found;
  }
}
