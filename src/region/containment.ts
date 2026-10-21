// Containment (contracts v0.6 item 4): the open area is the union of the region boxes whose open condition holds and
// the road corridors (polyline plus a half width) whose condition holds. Terrain has no edge and a fog wall only holds
// near itself, so this is what keeps an Act 1 player out of Cinderreach and everyone out of later acts' land.
// Conditions are read live from the state on every query: nothing is cached, so a load is right on its first tick.
import { WORLD_BOUNDS } from '../config/constants';
import { flagConditionHolds, type FlagCondition, type FlagReader } from '../core/flagCondition';
import { DEAD_ROAD_FULL } from './deadRoad';
import { REGION_IDS, REGION_INFO, engineBox, type RegionId } from './regions';

/** Metres inside an edge that a pushed-back player lands (box edges are exclusive, so never exactly on one). */
export const CONTAINMENT_INSET = 1;
export const CORRIDOR_HALF_WIDTH = 40;

export interface CorridorDef {
  id: string;
  /** Engine (x, z) polyline, at least two points. */
  points: readonly (readonly [number, number])[];
  /** Metres each side of the line; default CORRIDOR_HALF_WIDTH. */
  halfWidth?: number;
  openWhen: FlagCondition;
}

export interface XZ {
  x: number;
  z: number;
}

export interface ContainmentService {
  /** True when (x, z) lies in the open area for the current flags. */
  isOpen(x: number, z: number): boolean;
  /** The nearest point of the open area, CONTAINMENT_INSET inside its edge; the point itself when already open. */
  nearestOpen(x: number, z: number): XZ;
  /** `at` itself when open, else a copy moved to `nearestOpen` (y untouched: callers re-ground). */
  clamp<T extends XZ>(at: T): T;
  /** Adds a road corridor. Throws on a duplicate id or fewer than two points; returns the undo. */
  addCorridor(def: CorridorDef): () => void;
  /** The regions open right now, registry order. */
  openRegions(): RegionId[];
  /** Distance (m) from an open point to the nearest closed one, capped at `limit` (the mount's soft cap). */
  edgeDistance(x: number, z: number, limit: number): number;
}

declare module '../core/Services' {
  interface GameServices {
    /** v0.6: provided by the region plugin. */
    containment: ContainmentService;
  }
}

/** The Dead Road through the null strip between Brightwater and Harrowmark: open from the start. */
export const DEAD_ROAD_CORRIDOR: CorridorDef = { id: 'corridor.dead-road', points: DEAD_ROAD_FULL, openWhen: {} };

function inBounds(x: number, z: number): boolean {
  return x >= WORLD_BOUNDS.minX && x <= WORLD_BOUNDS.maxX && z >= WORLD_BOUNDS.minZ && z <= WORLD_BOUNDS.maxZ;
}

/** Closest point to p on segment ab, and its parameter. */
function closestOnSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): XZ {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0;
  return { x: ax + dx * t, z: az + dz * t };
}

export class Containment implements ContainmentService {
  private readonly corridors = new Map<string, CorridorDef>();

  constructor(
    private readonly state: FlagReader,
    corridors: readonly CorridorDef[] = [DEAD_ROAD_CORRIDOR],
  ) {
    for (const c of corridors) this.addCorridor(c);
  }

  addCorridor(def: CorridorDef): () => void {
    if (this.corridors.has(def.id)) throw new Error(`containment: corridor "${def.id}" is already registered`);
    if (def.points.length < 2) throw new Error(`containment: corridor "${def.id}" needs at least two points`);
    this.corridors.set(def.id, def);
    return () => {
      if (this.corridors.get(def.id) === def) this.corridors.delete(def.id);
    };
  }

  openRegions(): RegionId[] {
    return REGION_IDS.filter((id) => !REGION_INFO[id].reserved && flagConditionHolds(REGION_INFO[id].openWhen, this.state));
  }

  private openCorridors(): CorridorDef[] {
    return [...this.corridors.values()].filter((c) => flagConditionHolds(c.openWhen, this.state));
  }

  isOpen(x: number, z: number): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(z) || !inBounds(x, z)) return false;
    for (const id of this.openRegions()) {
      const b = engineBox(id);
      if (x >= b.x0 && x < b.x1 && z >= b.z0 && z < b.z1) return true;
    }
    for (const c of this.openCorridors()) {
      const hw = c.halfWidth ?? CORRIDOR_HALF_WIDTH;
      for (let i = 1; i < c.points.length; i++) {
        const [ax, az] = c.points[i - 1];
        const [bx, bz] = c.points[i];
        const q = closestOnSegment(x, z, ax, az, bx, bz);
        if (Math.hypot(x - q.x, z - q.z) <= hw) return true;
      }
    }
    return false;
  }

  nearestOpen(x: number, z: number): XZ {
    if (this.isOpen(x, z)) return { x, z };
    const px = Number.isFinite(x) ? x : 0;
    const pz = Number.isFinite(z) ? z : 0;
    let best: XZ | null = null;
    let bestD = Infinity;
    const consider = (q: XZ) => {
      const d = Math.hypot(px - q.x, pz - q.z);
      if (d < bestD) {
        bestD = d;
        best = q;
      }
    };
    const k = CONTAINMENT_INSET;
    for (const id of this.openRegions()) {
      const b = engineBox(id);
      consider({ x: Math.min(Math.max(px, b.x0 + k), b.x1 - k), z: Math.min(Math.max(pz, b.z0 + k), b.z1 - k) });
    }
    for (const c of this.openCorridors()) {
      const hw = Math.max(0, (c.halfWidth ?? CORRIDOR_HALF_WIDTH) - k);
      for (let i = 1; i < c.points.length; i++) {
        const [ax, az] = c.points[i - 1];
        const [bx, bz] = c.points[i];
        const q = closestOnSegment(px, pz, ax, az, bx, bz);
        const d = Math.hypot(px - q.x, pz - q.z);
        consider(d <= hw ? { x: px, z: pz } : { x: q.x + ((px - q.x) / d) * hw, z: q.z + ((pz - q.z) / d) * hw });
      }
    }
    // Brightwater is always open, so there is always a candidate; the spawn is the last resort.
    return best ?? { x: 0, z: 0 };
  }

  clamp<T extends XZ>(at: T): T {
    if (this.isOpen(at.x, at.z)) return at;
    const q = this.nearestOpen(at.x, at.z);
    return { ...at, x: q.x, z: q.z };
  }

  edgeDistance(x: number, z: number, limit: number): number {
    if (!this.isOpen(x, z)) return 0;
    // Probe eight directions at a few radii; precise enough for a soft speed cap.
    const steps = 4;
    for (let s = 1; s <= steps; s++) {
      const r = (limit * s) / steps;
      for (let a = 0; a < 8; a++) {
        const ang = (a * Math.PI) / 4;
        if (!this.isOpen(x + Math.cos(ang) * r, z + Math.sin(ang) * r)) return r;
      }
    }
    return limit;
  }
}
