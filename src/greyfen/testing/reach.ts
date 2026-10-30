// Test-only: a coarse reachability model of a Greyfen interior in local metres, for the soft-lock tests. A cell is a 0.5 m
// column with a floor (the room floor or a sunken depth, raised by a closed bridge blocker), a ceiling (the room height or a
// tunnel roof) and the solids of closed blockers and tall props. A player walks (step up at most 0.4 m, drop any height,
// water at most 1.2 m deep, 1.8 m headroom), jumps into a dive volume, swims through water columns that overlap by 1 m, and
// climbs out onto a floor at most 1.8 m under the surface (K7: the head-out line is 1.4 m under it, plus one step).
import type { FlagCondition } from '../../core/flagCondition';
import { flagConditionHolds } from '../../core/flagCondition';
import type { InteriorDef, LocalRect } from '../../interiors/types';
import { MAX_WALKABLE_PROP } from '../../interiors/layout';

export interface LocalWater {
  id: string;
  kind: 'wade' | 'deep' | 'dive';
  surface: number;
  box?: LocalRect;
  polygon?: readonly (readonly [number, number])[];
  activeWhen?: FlagCondition;
}

export interface ReachOptions {
  /** Flags set (sluice states). */
  flags?: readonly string[];
  /** Water volumes; omit for the water service being absent. */
  water?: readonly LocalWater[];
  /** Blockers closed right now (default: the def's startClosed ones). */
  closed?: ReadonlySet<string>;
}

const CELL = 0.5;
const STEP = MAX_WALKABLE_PROP;
const WADE_MAX = 1.2;
const HEADROOM = 1.8;
const SWIM_OVERLAP = 1;
const CLIMB_OUT = 1.8;

const inRect = (r: LocalRect, x: number, z: number) => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1;
function inPolygon(poly: readonly (readonly [number, number])[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!;
    const [xj, zj] = poly[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export interface ReachModel {
  /** Node id of standing at local (x, z), or -1 when nobody can stand there. */
  standNode(x: number, z: number): number;
  /** Node id of swimming at local (x, z), or -1. */
  swimNode(x: number, z: number): number;
  /** Every node reachable from `from`. */
  reach(from: number): Set<number>;
  /** Every node from which one of `targets` is reachable. */
  canReachAny(targets: readonly number[]): Set<number>;
  floorAt(x: number, z: number): number;
}

export function reachModel(def: InteriorDef, opts: ReachOptions = {}): ReachModel {
  const flags = new Set(opts.flags ?? []);
  const state = { getFlag: (k: string) => flags.has(k) };
  const water = (opts.water ?? []).filter((w) => !w.activeWhen || flagConditionHolds(w.activeWhen, state));
  const closed = opts.closed ?? new Set(def.blockers.filter((b) => b.startClosed).map((b) => b.id));
  const box = def.rooms.reduce(
    (r, room) => ({ x0: Math.min(r.x0, room.x0), z0: Math.min(r.z0, room.z0), x1: Math.max(r.x1, room.x1), z1: Math.max(r.z1, room.z1) }),
    { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity },
  );
  const cols = Math.round((box.x1 - box.x0) / CELL);
  const rows = Math.round((box.z1 - box.z0) / CELL);
  const n = cols * rows;
  const room = new Int8Array(n);
  const floor = new Float64Array(n);
  const ceil = new Float64Array(n);
  const solids: [number, number][][] = [];
  const surf = new Float64Array(n).fill(NaN);
  const kind: (LocalWater['kind'] | null)[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const x = box.x0 + (c + 0.5) * CELL;
      const z = box.z0 + (r + 0.5) * CELL;
      const rm = def.rooms.find((q) => inRect(q, x, z));
      const sk = def.sunken?.find((s) => inRect(s.rect, x, z));
      const sol: [number, number][] = [];
      let f = sk ? -sk.depth : 0;
      for (const b of def.blockers) {
        if (!closed.has(b.id) || !inRect(b.rect, x, z)) continue;
        const b0 = b.base ?? 0;
        // A closed blocker whose top is the floor level or below is a bridge: it raises the floor.
        if (b0 <= f + 1e-6 && b0 + b.height <= 1e-6) f = Math.max(f, b0 + b.height);
        else sol.push([b0, b0 + b.height]);
      }
      for (const p of def.pillars) if (inRect(p, x, z)) sol.push([-99, 99]);
      for (const p of def.props ?? []) {
        if (!inRect(p.rect, x, z)) continue;
        if (p.walkable) f = Math.max(f, p.height);
        else sol.push([0, p.height]);
      }
      room[i] = rm ? 1 : 0;
      floor[i] = f;
      ceil[i] = rm ? (sk?.roof ?? rm.height) : -99;
      solids.push(sol);
      const w = water.find((v) => (v.box ? inRect(v.box, x, z) : v.polygon ? inPolygon(v.polygon, x, z) : false));
      kind.push(w ? w.kind : null);
      if (w) surf[i] = w.surface;
    }
  }
  const blockedBetween = (i: number, y0: number, y1: number) => solids[i]!.some(([a, b]) => a < y1 && b > y0);
  const depth = (i: number) => (Number.isNaN(surf[i]) ? 0 : surf[i]! - floor[i]!);
  const canStand = (i: number) =>
    room[i] === 1 && depth(i) <= WADE_MAX && ceil[i]! - floor[i]! >= HEADROOM && !blockedBetween(i, floor[i]! + 0.05, floor[i]! + HEADROOM);
  /** The free water column a swimmer can use: from the floor to the surface (or roof), minus solids; its largest part. */
  const column = (i: number): [number, number] | null => {
    if (room[i] !== 1 || kind[i] !== 'dive' || depth(i) <= WADE_MAX) return null;
    const top = Math.min(surf[i]!, ceil[i]!);
    let parts: [number, number][] = [[floor[i]!, top]];
    for (const [a, b] of solids[i]!) parts = parts.flatMap(([p, q]) => (b <= p || a >= q ? [[p, q] as [number, number]] : ([[p, a], [b, q]] as [number, number][]).filter(([u, v]) => v - u > 0)));
    const best = parts.sort((u, v) => v[1] - v[0] - (u[1] - u[0]))[0];
    return best && best[1] - best[0] >= SWIM_OVERLAP ? best : null;
  };
  const cols4 = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  // Node ids: 2i is standing in cell i, 2i + 1 is swimming in it.
  const edges = (node: number): number[] => {
    const i = node >> 1;
    const swim = (node & 1) === 1;
    const c = i % cols;
    const r = (i - c) / cols;
    const out: number[] = [];
    if (!swim && column(i)) out.push(2 * i + 1);
    for (const [dc, dr] of cols4) {
      const cc = c + dc!;
      const rr = r + dr!;
      if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
      const j = rr * cols + cc;
      if (!swim) {
        if (canStand(j) && floor[j]! <= floor[i]! + STEP + 1e-6) out.push(2 * j);
        if (column(j) && floor[j]! < floor[i]!) out.push(2 * j + 1);
      } else {
        const a = column(i)!;
        const b = column(j);
        if (b && Math.min(a[1], b[1]) - Math.max(a[0], b[0]) >= SWIM_OVERLAP) out.push(2 * j + 1);
        if (canStand(j) && floor[j]! >= surf[i]! - CLIMB_OUT) out.push(2 * j);
      }
    }
    return out;
  };
  const valid = (node: number) => ((node & 1) === 1 ? column(node >> 1) !== null : canStand(node >> 1));
  const cellOf = (x: number, z: number) => {
    const c = Math.floor((x - box.x0) / CELL);
    const r = Math.floor((z - box.z0) / CELL);
    return c < 0 || r < 0 || c >= cols || r >= rows ? -1 : r * cols + c;
  };
  return {
    standNode(x, z) {
      const i = cellOf(x, z);
      return i >= 0 && canStand(i) ? 2 * i : -1;
    },
    swimNode(x, z) {
      const i = cellOf(x, z);
      return i >= 0 && column(i) ? 2 * i + 1 : -1;
    },
    floorAt(x, z) {
      const i = cellOf(x, z);
      return i >= 0 ? floor[i]! : NaN;
    },
    reach(from) {
      const seen = new Set<number>();
      if (from < 0 || !valid(from)) return seen;
      const queue = [from];
      seen.add(from);
      while (queue.length) for (const e of edges(queue.pop()!)) if (!seen.has(e)) (seen.add(e), queue.push(e));
      return seen;
    },
    canReachAny(targets) {
      // Reverse edges by a forward pass over every valid node.
      const rev = new Map<number, number[]>();
      for (let node = 0; node < 2 * n; node++) {
        if (!valid(node)) continue;
        for (const e of edges(node)) {
          const l = rev.get(e) ?? [];
          l.push(node);
          rev.set(e, l);
        }
      }
      const seen = new Set<number>(targets.filter((t) => t >= 0));
      const queue = [...seen];
      while (queue.length) for (const e of rev.get(queue.pop()!) ?? []) if (!seen.has(e)) (seen.add(e), queue.push(e));
      return seen;
    },
  };
}
