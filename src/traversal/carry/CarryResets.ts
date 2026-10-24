// The carry reset (plan 2.7, review finding 10; K7 PR 1): a carried object (a sled, an R18 egg, an R17 candle bundle)
// that ends more than 30 m off its route, more than 10 m below the route at that point, in deep water or outside the open
// area returns to its last reset point after a short fade. K7 persists every tracked object's progress; the owner (K7
// for sleds, K13 for eggs and bundles) supplies `place` and decides whether the item stays held (review B4). A reset
// never fails or rewinds an objective: it only moves the object.
import type { Vec3Like } from '../../core/events';
import type { CarryRouteDef, MovementMode } from '../../movement/types';

/** A carry route as K4 exports it: dense checkpoints (also the route's line) and the indices that count as reset points. */
export type CarryRoute = CarryRouteDef & { resetAt?: readonly number[] };

export type CarryResetReason = 'offRoute' | 'tooLow' | 'deepWater' | 'closed' | 'asked' | 'travel';

export interface TrackedCarry {
  route: CarryRoute;
  /** Where the object is now (held or lying); null while it is not in the world (not yet picked up, delivered). */
  position(): Vec3Like | null;
  /** The owner's callback: put the object at `p` (lying; the owner decides about the hold). */
  place(p: Vec3Like): void;
  held(): boolean;
}

export const CARRY_RULES = {
  /** A reset point counts as passed once the object comes this close (x, z) and within `passedRise` in height. */
  passedRadius: 8,
  passedRise: 10,
  /** Seconds between checks. */
  checkSeconds: 0.5,
  /** The fade runs when the player holds the object or stands this close to it. */
  fadeRadius: 30,
  fadeOutSeconds: 0.3,
  fadeInSeconds: 0.4,
} as const;

export interface CarryResetPorts {
  /** True when `p` is in deep or dive water, or a wading point deeper than 1.2 m. */
  deepAt(p: Vec3Like): boolean;
  /** Containment's open area (true when no containment service is up). */
  isOpen(x: number, z: number): boolean;
  playerFeet(): Vec3Like;
  fade(opacity: number, seconds: number): void;
  emit(type: 'carry.reset', p: { id: string; reason: CarryResetReason }): void;
  movementMode(): MovementMode;
  setMovementMode(mode: MovementMode): void;
  warn(message: string): void;
}

/** The nearest point of the route's line to `p` in (x, z), with the line's height there. */
export function nearestOnRoute(points: readonly Vec3Like[], p: Vec3Like): { dist: number; y: number } {
  if (points.length === 1) return { dist: Math.hypot(p.x - points[0].x, p.z - points[0].z), y: points[0].y };
  let best = { dist: Infinity, y: points[0].y };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2)) : 0;
    const qx = a.x + dx * t;
    const qz = a.z + dz * t;
    const d = Math.hypot(p.x - qx, p.z - qz);
    if (d < best.dist) best = { dist: d, y: a.y + (b.y - a.y) * t };
  }
  return best;
}

/** Why the object at `p` must go back, or null. Order: deep water, the closed area, off the route, below it. */
export function carryProblem(route: CarryRoute, p: Vec3Like, ports: Pick<CarryResetPorts, 'deepAt' | 'isOpen'>): CarryResetReason | null {
  if (ports.deepAt(p)) return 'deepWater';
  if (!ports.isOpen(p.x, p.z)) return 'closed';
  const n = nearestOnRoute(route.checkpoints, p);
  if (n.dist > route.corridorHalfWidth) return 'offRoute';
  if (n.y - p.y > route.maxDrop) return 'tooLow';
  return null;
}

/** The checkpoint indices that are reset points, ascending (every checkpoint by default). */
export function resetPoints(route: CarryRoute): number[] {
  const all = route.checkpoints.map((_, i) => i);
  if (!route.resetAt || route.resetAt.length === 0) return all;
  const ok = [...new Set(route.resetAt)].filter((i) => Number.isInteger(i) && i >= 0 && i < route.checkpoints.length);
  return ok.length ? ok.sort((a, b) => a - b) : all;
}

interface Pending {
  t: number;
  target: Vec3Like;
  reason: CarryResetReason;
}

export interface CarrySave {
  /** Per tracked id, the highest reset-point index passed. */
  progress: Record<string, number>;
}

function validRoute(r: CarryRoute): boolean {
  return (
    r.checkpoints.length > 0 &&
    r.checkpoints.every((c) => Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.z)) &&
    r.corridorHalfWidth > 0 &&
    r.maxDrop > 0
  );
}

export class CarryResets {
  private readonly tracked = new Map<string, TrackedCarry>();
  private readonly progress = new Map<string, number>();
  private readonly pending = new Map<string, Pending>();
  private sinceCheck = 0;

  constructor(private readonly ports: CarryResetPorts) {}

  /** Tracks an object for the reset; throws on a duplicate id or an empty route; returns the undo. */
  track(t: TrackedCarry): () => void {
    const id = t.route.id;
    if (this.tracked.has(id)) throw new Error(`carry: duplicate tracked id "${id}"`);
    if (!validRoute(t.route)) throw new Error(`carry: route "${id}" needs checkpoints and a positive corridor and drop`);
    this.tracked.set(id, t);
    return () => {
      if (this.tracked.get(id) !== t) return;
      this.tracked.delete(id);
      // A reset cut off in its fade still lifts the black (nothing else would).
      if (this.pending.delete(id)) this.ports.fade(0, CARRY_RULES.fadeInSeconds);
      this.syncMode();
    };
  }

  isTracked(id: string): boolean {
    return this.tracked.has(id);
  }

  /** The checkpoint index the object returns to now. */
  checkpointIndex(id: string): number {
    const t = this.tracked.get(id);
    const first = t ? resetPoints(t.route)[0] : 0;
    return this.progress.get(id) ?? first;
  }

  /** Where the object returns to now; null for an unknown id. */
  checkpoint(id: string): Vec3Like | null {
    const t = this.tracked.get(id);
    if (!t) return null;
    const c = t.route.checkpoints[this.checkpointIndex(id)] ?? t.route.checkpoints[0];
    return { x: c.x, y: c.y, z: c.z };
  }

  /** A reset in its fade: the point the object is going to (a save during the fade stores it there). */
  pendingTarget(id: string): Vec3Like | null {
    return this.pending.get(id)?.target ?? null;
  }

  /**
   * Sends the object back to its last reset point ("reset haul", Thorgar's dialogue, and fast travel). Returns false for
   * an unknown id or a reset already running. `immediate` skips the fade (fast travel has its own).
   */
  reset(id: string, reason: CarryResetReason, immediate = false): boolean {
    const t = this.tracked.get(id);
    if (!t || this.pending.has(id)) return false;
    const target = this.checkpoint(id)!;
    const at = t.position();
    const f = this.ports.playerFeet();
    const near = t.held() || (at !== null && Math.hypot(at.x - f.x, at.z - f.z) <= CARRY_RULES.fadeRadius);
    if (immediate || !near) {
      this.finish(id, t, target, reason);
      return true;
    }
    this.pending.set(id, { t: 0, target, reason });
    this.ports.fade(1, CARRY_RULES.fadeOutSeconds);
    return true;
  }

  fixedUpdate(dt: number): void {
    if (this.pending.size > 0) for (const [id, p] of [...this.pending]) {
      p.t += dt;
      if (p.t < CARRY_RULES.fadeOutSeconds) continue;
      const t = this.tracked.get(id);
      this.pending.delete(id);
      if (t) this.finish(id, t, p.target, p.reason);
      this.ports.fade(0, CARRY_RULES.fadeInSeconds);
    }
    this.syncMode();
    this.sinceCheck += dt;
    if (this.sinceCheck < CARRY_RULES.checkSeconds) return;
    this.sinceCheck = 0;
    for (const [id, t] of this.tracked) {
      if (this.pending.has(id)) continue;
      const p = t.position();
      if (!p) continue;
      this.markProgress(id, t, p);
      const why = carryProblem(t.route, p, this.ports);
      if (why) this.reset(id, why);
    }
  }

  /** Fast travel while holding: every held object goes back to its checkpoint (the rule's "allowed; the object returns"). */
  onTravel(): void {
    for (const [id, t] of this.tracked) if (t.held()) this.reset(id, 'travel', true);
  }

  serialize(): CarrySave {
    return { progress: Object.fromEntries(this.progress) };
  }

  load(data: unknown): void {
    this.progress.clear();
    if (this.pending.size > 0) this.ports.fade(0, CARRY_RULES.fadeInSeconds);
    this.pending.clear();
    const prog = (data as Partial<CarrySave> | null)?.progress;
    if (!prog || typeof prog !== 'object') return;
    for (const [id, v] of Object.entries(prog)) if (Number.isInteger(v) && (v as number) >= 0) this.progress.set(id, v as number);
  }

  private markProgress(id: string, t: TrackedCarry, p: Vec3Like): void {
    const cur = this.progress.get(id) ?? -1;
    for (const i of resetPoints(t.route)) {
      if (i <= cur) continue;
      const c = t.route.checkpoints[i];
      if (Math.hypot(c.x - p.x, c.z - p.z) <= CARRY_RULES.passedRadius && Math.abs(c.y - p.y) <= CARRY_RULES.passedRise) {
        this.progress.set(id, i);
      }
    }
  }

  private finish(id: string, t: TrackedCarry, target: Vec3Like, reason: CarryResetReason): void {
    try {
      t.place({ ...target });
    } catch (e) {
      this.ports.warn(`carry: placing "${id}" after a reset threw: ${String(e)}`);
    }
    this.ports.emit('carry.reset', { id, reason });
  }

  /** While anything tracked is held, the player is hauling (item 25); back to walk when nothing is. */
  private syncMode(): void {
    let held = false;
    for (const t of this.tracked.values()) if (t.held()) held = true;
    const mode = this.ports.movementMode();
    if (held && mode === 'walk') this.ports.setMovementMode('haul');
    else if (!held && mode === 'haul') this.ports.setMovementMode('walk');
  }
}
