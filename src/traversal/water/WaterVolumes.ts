// The registry of water volumes and dive routes (contracts v0.7 item 4; K7 PR 1). Pure: the plugin passes the ground
// probe and the world-state flags. `activeWhen` is read on every query, so D05's sluice sets swap the tick their flag
// changes and after a load, with nothing to re-register.
import type { Vec3Like } from '../../core/events';
import { flagConditionHolds, type FlagReader } from '../../core/flagCondition';
import { lintDiveRoute } from '../../water/airPockets';
import type { DiveRouteDef, WaterArea, WaterKind, WaterVolumeDef } from '../../water/types';
import type { DivePocketDef, DiveRouteStandsDef } from '../dive/types';

/** When volumes overlap, the higher kind wins (a D05 corridor reads `dive` over a shallow it crosses). */
export const KIND_RANK: Readonly<Record<WaterKind, number>> = { wade: 0, deep: 1, dive: 2 };

export interface WaterVolumesPorts {
  /** The ground (walkable surface) under (x, z), probed down from `fromY`; the terrain height when nothing is hit. */
  groundAt(x: number, z: number, fromY: number): number;
  flags: FlagReader;
}

export function inArea(area: WaterArea, x: number, z: number): boolean {
  if ('box' in area) {
    const b = area.box;
    return x >= Math.min(b.x0, b.x1) && x <= Math.max(b.x0, b.x1) && z >= Math.min(b.z0, b.z1) && z <= Math.max(b.z0, b.z1);
  }
  // Even-odd ray cast over the polygon's edges.
  const pts = area.polygon;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i];
    const [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function validArea(area: WaterArea): boolean {
  if ('box' in area) {
    const b = area.box;
    return [b.x0, b.x1, b.z0, b.z1].every(Number.isFinite) && b.x0 !== b.x1 && b.z0 !== b.z1;
  }
  return Array.isArray(area.polygon) && area.polygon.length >= 3 && area.polygon.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
}

const finite3 = (p: Vec3Like | undefined): boolean => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);

export class WaterVolumes {
  private readonly volumes = new Map<string, WaterVolumeDef>();
  private readonly routeDefs = new Map<string, DiveRouteStandsDef>();

  constructor(private readonly ports: WaterVolumesPorts) {}

  register(def: WaterVolumeDef): () => void {
    if (this.volumes.has(def.id)) throw new Error(`water: duplicate volume id "${def.id}"`);
    if (!(def.kind in KIND_RANK)) throw new Error(`water: volume "${def.id}" has an unknown kind "${String(def.kind)}"`);
    if (!Number.isFinite(def.surfaceY)) throw new Error(`water: volume "${def.id}" has no finite surfaceY`);
    if (!validArea(def.area)) throw new Error(`water: volume "${def.id}" has an empty or malformed area`);
    this.volumes.set(def.id, def);
    return () => {
      if (this.volumes.get(def.id) === def) this.volumes.delete(def.id);
    };
  }

  /**
   * Registers a dive route. It must carry K7's stand points (`entryStand`, and `stand` on every pocket: dry ledges the
   * loader can place a player on) and pass the 40 m lint; otherwise this throws, so bad route data fails its tests.
   */
  registerRoute(def: DiveRouteDef): () => void {
    if (this.routeDefs.has(def.id)) throw new Error(`water: duplicate dive route id "${def.id}"`);
    const problems = this.lintRoute(def);
    if (problems.length) throw new Error(`water: dive route "${def.id}" fails its lint: ${problems.join('; ')}`);
    const r = def as DiveRouteStandsDef;
    this.routeDefs.set(def.id, r);
    return () => {
      if (this.routeDefs.get(def.id) === r) this.routeDefs.delete(def.id);
    };
  }

  /** The route's problems: the 40 m spacing, a missing stand point, a stand inside dive or deep water. */
  lintRoute(def: DiveRouteDef): string[] {
    const out = lintDiveRoute(def);
    const r = def as Partial<DiveRouteStandsDef>;
    const stands: [string, Vec3Like | undefined][] = [
      ['entry', r.entryStand],
      ...def.airPockets.map((p) => [p.id, (p as Partial<DivePocketDef>).stand] as [string, Vec3Like | undefined]),
    ];
    for (const [name, s] of stands) {
      if (!finite3(s)) {
        out.push(`${def.id}: ${name} has no stand point (a dry ledge to load at)`);
        continue;
      }
      const v = this.volumeAtAll({ x: s!.x, y: s!.y + 0.1, z: s!.z });
      if (v && v.kind !== 'wade') out.push(`${def.id}: ${name}'s stand point is inside ${v.kind} water (${v.id})`);
    }
    return out;
  }

  get(id: string): WaterVolumeDef | undefined {
    return this.volumes.get(id);
  }

  isActive(def: WaterVolumeDef): boolean {
    return !def.activeWhen || flagConditionHolds(def.activeWhen, this.ports.flags);
  }

  /** The active volume whose area holds (x, z), the highest kind first; ties go to the higher surface. */
  surfaceAt(x: number, z: number): WaterVolumeDef | null {
    let best: WaterVolumeDef | null = null;
    for (const v of this.volumes.values()) {
      if (!this.isActive(v) || !inArea(v.area, x, z)) continue;
      if (!best || KIND_RANK[v.kind] > KIND_RANK[best.kind] || (KIND_RANK[v.kind] === KIND_RANK[best.kind] && v.surfaceY > best.surfaceY)) best = v;
    }
    return best;
  }

  /** The active volume containing `p` below its surface (the overlap winner), or null. */
  volumeAt(p: Vec3Like): WaterVolumeDef | null {
    return this.pick(p, true);
  }

  /** Like `volumeAt`, but over every registered volume, active or not (the stand-point lint checks every sluice set). */
  private volumeAtAll(p: Vec3Like): WaterVolumeDef | null {
    return this.pick(p, false);
  }

  private pick(p: Vec3Like, activeOnly: boolean): WaterVolumeDef | null {
    let best: WaterVolumeDef | null = null;
    for (const v of this.volumes.values()) {
      if ((activeOnly && !this.isActive(v)) || p.y >= v.surfaceY || !inArea(v.area, p.x, p.z)) continue;
      if (!best || KIND_RANK[v.kind] > KIND_RANK[best.kind] || (KIND_RANK[v.kind] === KIND_RANK[best.kind] && v.surfaceY > best.surfaceY)) best = v;
    }
    return best;
  }

  /** Water depth over the ground at (x, z) for the active volumes; 0 when dry. */
  depthAt(x: number, z: number): number {
    const v = this.surfaceAt(x, z);
    if (!v) return 0;
    return Math.max(0, v.surfaceY - this.ports.groundAt(x, z, v.surfaceY + 0.5));
  }

  /** The ground height under (x, z), probed down from `fromY`. */
  groundAt(x: number, z: number, fromY: number): number {
    return this.ports.groundAt(x, z, fromY);
  }

  /** Routes whose volume is registered and active now. */
  activeRoutes(): DiveRouteStandsDef[] {
    const out: DiveRouteStandsDef[] = [];
    for (const r of this.routeDefs.values()) {
      const v = this.volumes.get(r.volumeId);
      if (v && this.isActive(v)) out.push(r);
    }
    return out;
  }

  /** Every route, active or not. */
  routes(): DiveRouteStandsDef[] {
    return [...this.routeDefs.values()];
  }

  /** The pockets of the active routes. */
  activePockets(): DivePocketDef[] {
    return this.activeRoutes().flatMap((r) => r.airPockets);
  }
}
