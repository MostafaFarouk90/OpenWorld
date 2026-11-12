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

/** v0.9: an engine-space circle (centre and radius in metres; the edge itself is inside). */
export interface CircleXZ {
  x: number;
  z: number;
  r: number;
}

/**
 * v0.7: a closed sub-area inside an open region (the Dragonspine summit): while `openWhen` fails, the box is cut out of
 * the open area. Engine box, min inclusive, max exclusive. A hole never opens land outside the open regions.
 * v0.9: a hole is a box or (exclusive) a circle (the Caldera's bowl floor, `hole.caldera.floor`).
 */
export type ContainmentHoleDef =
  | { id: string; box: { x0: number; z0: number; x1: number; z1: number }; circle?: undefined; openWhen: FlagCondition }
  | { id: string; circle: CircleXZ; box?: undefined; openWhen: FlagCondition };

/**
 * v0.9: a keep-in (the siege's soft boundary): while `liveWhen` holds, every point outside the shape reads closed, so
 * the shipped push-back holds the player in, with `toastKey` as the toast. Re-derived from flags on every query (a load
 * is right on its first tick). Live keep-ins are a union: inside any live one is open (holes and regions still apply).
 */
export type ContainmentKeepInDef =
  | { id: string; box: { x0: number; z0: number; x1: number; z1: number }; circle?: undefined; liveWhen: FlagCondition; toastKey: string }
  | { id: string; circle: CircleXZ; box?: undefined; liveWhen: FlagCondition; toastKey: string };

type ShapeDef = { box?: { x0: number; z0: number; x1: number; z1: number }; circle?: CircleXZ };

function inShape(d: ShapeDef, x: number, z: number): boolean {
  if (d.circle) return Math.hypot(x - d.circle.x, z - d.circle.z) <= d.circle.r;
  const b = d.box!;
  return x >= b.x0 && x < b.x1 && z >= b.z0 && z < b.z1;
}

function validShape(d: ShapeDef): boolean {
  if (d.circle) {
    const c = d.circle;
    return !d.box && Number.isFinite(c.x) && Number.isFinite(c.z) && Number.isFinite(c.r) && c.r > 0;
  }
  const b = d.box;
  return !!b && b.x1 > b.x0 && b.z1 > b.z0;
}

export interface XZ {
  x: number;
  z: number;
}

/**
 * G4 (additive): an open circle that may lie outside WORLD_BOUNDS and every region (the Cinderlands expedition site),
 * open while `openWhen` holds. Live keep-ins still apply inside it.
 */
export interface ContainmentOpenAreaDef {
  id: string;
  circle: CircleXZ;
  openWhen: FlagCondition;
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
  /** v0.7: adds a closed hole. Throws on a duplicate id or an empty box; returns the undo. */
  addHole(def: ContainmentHoleDef): () => void;
  /** v0.7: the ids of the holes closed right now, registration order. */
  closedHoles(): string[];
  /** v0.9: adds a keep-in (box or circle). Throws on a duplicate id or an empty shape; returns the undo. */
  addKeepIn(def: ContainmentKeepInDef): () => void;
  /** v0.9: the ids of the keep-ins live right now, registration order. */
  liveKeepIns(): string[];
  /** G4: adds an open area (circle, may lie outside the world). Throws on a duplicate id or an empty circle; returns the undo. */
  addOpenArea(def: ContainmentOpenAreaDef): () => void;
  /**
   * v0.9: the toast for a push from (x, z): the first live keep-in's `toastKey` when the point is outside every live
   * keep-in, else null (the caller's generic toast).
   */
  pushToastKey(x: number, z: number): string | null;
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
  private readonly holes = new Map<string, ContainmentHoleDef>();
  private readonly keepIns = new Map<string, ContainmentKeepInDef>();
  private readonly openAreas = new Map<string, ContainmentOpenAreaDef>();

  constructor(
    private readonly state: FlagReader,
    corridors: readonly CorridorDef[] = [DEAD_ROAD_CORRIDOR],
    holes: readonly ContainmentHoleDef[] = [],
  ) {
    for (const c of corridors) this.addCorridor(c);
    for (const h of holes) this.addHole(h);
  }

  addHole(def: ContainmentHoleDef): () => void {
    if (this.holes.has(def.id)) throw new Error(`containment: hole "${def.id}" is already registered`);
    if (!validShape(def)) throw new Error(`containment: hole "${def.id}" has an empty box`);
    this.holes.set(def.id, def);
    return () => {
      if (this.holes.get(def.id) === def) this.holes.delete(def.id);
    };
  }

  closedHoles(): string[] {
    return this.closedHoleDefs().map((h) => h.id);
  }

  private closedHoleDefs(): ContainmentHoleDef[] {
    return [...this.holes.values()].filter((h) => !flagConditionHolds(h.openWhen, this.state));
  }

  private inClosedHole(x: number, z: number, closed: readonly ContainmentHoleDef[]): ContainmentHoleDef | null {
    for (const h of closed) if (inShape(h, x, z)) return h;
    return null;
  }

  addKeepIn(def: ContainmentKeepInDef): () => void {
    if (this.keepIns.has(def.id)) throw new Error(`containment: keep-in "${def.id}" is already registered`);
    if (!validShape(def)) throw new Error(`containment: keep-in "${def.id}" has an empty shape`);
    this.keepIns.set(def.id, def);
    return () => {
      if (this.keepIns.get(def.id) === def) this.keepIns.delete(def.id);
    };
  }

  addOpenArea(def: ContainmentOpenAreaDef): () => void {
    if (this.openAreas.has(def.id)) throw new Error(`containment: open area "${def.id}" is already registered`);
    if (!validShape(def)) throw new Error(`containment: open area "${def.id}" has an empty shape`);
    this.openAreas.set(def.id, def);
    return () => {
      if (this.openAreas.get(def.id) === def) this.openAreas.delete(def.id);
    };
  }

  private inLiveOpenArea(x: number, z: number): boolean {
    for (const a of this.openAreas.values()) if (inShape(a, x, z) && flagConditionHolds(a.openWhen, this.state)) return true;
    return false;
  }

  liveKeepIns(): string[] {
    return this.liveKeepInDefs().map((k) => k.id);
  }

  private liveKeepInDefs(): ContainmentKeepInDef[] {
    return [...this.keepIns.values()].filter((k) => flagConditionHolds(k.liveWhen, this.state));
  }

  /** Outside every live keep-in (false when none is live). */
  private outsideKeepIns(x: number, z: number, live: readonly ContainmentKeepInDef[]): boolean {
    return live.length > 0 && !live.some((k) => inShape(k, x, z));
  }

  pushToastKey(x: number, z: number): string | null {
    const live = this.liveKeepInDefs();
    return this.outsideKeepIns(x, z, live) ? live[0].toastKey : null;
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
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    if (this.openAreas.size > 0 && this.inLiveOpenArea(x, z)) return !this.outsideKeepIns(x, z, this.liveKeepInDefs());
    if (!inBounds(x, z)) return false;
    if (this.outsideKeepIns(x, z, this.liveKeepInDefs())) return false;
    if (this.inClosedHole(x, z, this.closedHoleDefs())) return false;
    return this.inOpenArea(x, z);
  }

  /** In an open region box or corridor, holes aside. */
  private inOpenArea(x: number, z: number): boolean {
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
    // v0.9: outside a live keep-in, the answer is the nearest open point inside one (inset k), when there is one.
    const live = this.liveKeepInDefs();
    if (this.outsideKeepIns(px, pz, live)) {
      for (const d of live) {
        let q: XZ;
        if (d.circle) {
          const c = d.circle;
          const dd = Math.hypot(px - c.x, pz - c.z) || 1;
          const rr = Math.max(0, c.r - k);
          q = { x: c.x + ((px - c.x) / dd) * rr, z: c.z + ((pz - c.z) / dd) * rr };
        } else {
          const b = d.box!;
          q = { x: Math.min(Math.max(px, b.x0 + k), b.x1 - k), z: Math.min(Math.max(pz, b.z0 + k), b.z1 - k) };
        }
        if (this.isOpen(q.x, q.z)) consider(q);
      }
      if (best) return best;
    }
    const closed = this.closedHoleDefs();
    // v0.7: a candidate inside a closed hole moves to that hole's nearest edge, just outside it, when that point is open.
    const considerOutsideHoles = (q: XZ) => {
      const h = this.inClosedHole(q.x, q.z, closed);
      if (!h) {
        consider(q);
        return;
      }
      if (h.circle) {
        // v0.9: a circle hole moves the candidate radially to just outside its edge.
        const c = h.circle;
        const dd = Math.hypot(q.x - c.x, q.z - c.z);
        const ux = dd > 0 ? (q.x - c.x) / dd : 1;
        const uz = dd > 0 ? (q.z - c.z) / dd : 0;
        const e = { x: c.x + ux * (c.r + k), z: c.z + uz * (c.r + k) };
        if (this.isOpen(e.x, e.z)) consider(e);
        return;
      }
      const b = h.box!;
      for (const e of [
        { x: b.x0 - k, z: q.z },
        { x: b.x1 + k, z: q.z },
        { x: q.x, z: b.z0 - k },
        { x: q.x, z: b.z1 + k },
      ]) {
        if (this.isOpen(e.x, e.z)) consider(e);
      }
    };
    for (const id of this.openRegions()) {
      const b = engineBox(id);
      considerOutsideHoles({ x: Math.min(Math.max(px, b.x0 + k), b.x1 - k), z: Math.min(Math.max(pz, b.z0 + k), b.z1 - k) });
    }
    for (const c of this.openCorridors()) {
      const hw = Math.max(0, (c.halfWidth ?? CORRIDOR_HALF_WIDTH) - k);
      for (let i = 1; i < c.points.length; i++) {
        const [ax, az] = c.points[i - 1];
        const [bx, bz] = c.points[i];
        const q = closestOnSegment(px, pz, ax, az, bx, bz);
        const d = Math.hypot(px - q.x, pz - q.z);
        considerOutsideHoles(d <= hw ? { x: px, z: pz } : { x: q.x + ((px - q.x) / d) * hw, z: q.z + ((pz - q.z) / d) * hw });
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
