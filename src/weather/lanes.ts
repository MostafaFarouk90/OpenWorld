// Act 4 L3 (plans/act4-L3.md 2.3): rope-lines and shelters as storm-safe places. Pure: the plugin passes L1's data
// (`RopeLineDef[]`, `ShelterDef[]`, L0's types) and the player's position; tests pass their own.
import { ROPE_SAFE_RADIUS, SHELTER_HYSTERESIS } from './tuning';

export interface XZ {
  x: number;
  z: number;
}

/** The parts of L0's `RopeLineDef` this reads. */
export interface RopeLike {
  id: string;
  points: readonly XZ[];
}

/** The parts of L0's `ShelterDef` this reads. */
export interface ShelterLike {
  id: string;
  at: XZ;
  radius: number;
}

interface Segment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

const CELL = 50;
const key = (cx: number, cz: number): string => `${cx},${cz}`;

/** Squared horizontal distance from (x, z) to segment ab, and the closest point. */
function closest(s: Segment, x: number, z: number): { d2: number; x: number; z: number } {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const len2 = dx * dx + dz * dz;
  const u = len2 > 0 ? Math.min(1, Math.max(0, ((x - s.ax) * dx + (z - s.az) * dz) / len2)) : 0;
  const px = s.ax + dx * u;
  const pz = s.az + dz * u;
  return { d2: (x - px) ** 2 + (z - pz) ** 2, x: px, z: pz };
}

export class RopeIndex {
  private readonly cells = new Map<string, Segment[]>();
  private readonly all: Segment[] = [];

  constructor(ropes: readonly RopeLike[], private readonly radius = ROPE_SAFE_RADIUS) {
    for (const r of ropes) {
      for (let i = 1; i < r.points.length; i++) {
        const a = r.points[i - 1];
        const b = r.points[i];
        if (![a.x, a.z, b.x, b.z].every(Number.isFinite)) continue;
        const s: Segment = { ax: a.x, az: a.z, bx: b.x, bz: b.z };
        this.all.push(s);
        const pad = radius;
        const x0 = Math.floor((Math.min(a.x, b.x) - pad) / CELL);
        const x1 = Math.floor((Math.max(a.x, b.x) + pad) / CELL);
        const z0 = Math.floor((Math.min(a.z, b.z) - pad) / CELL);
        const z1 = Math.floor((Math.max(a.z, b.z) + pad) / CELL);
        for (let cx = x0; cx <= x1; cx++) {
          for (let cz = z0; cz <= z1; cz++) {
            const k = key(cx, cz);
            const list = this.cells.get(k);
            if (list) list.push(s);
            else this.cells.set(k, [s]);
          }
        }
      }
    }
  }

  get segmentCount(): number {
    return this.all.length;
  }

  /** Within the safe radius (horizontal) of any rope. */
  onRope(x: number, z: number): boolean {
    const list = this.cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!list) return false;
    const r2 = this.radius * this.radius;
    for (const s of list) if (closest(s, x, z).d2 <= r2) return true;
    return false;
  }

  /** The closest point on any rope (null with no ropes). A linear scan: only a save off the rope with no shelter asks. */
  nearest(x: number, z: number): XZ | null {
    let best: { d2: number; x: number; z: number } | null = null;
    for (const s of this.all) {
      const c = closest(s, x, z);
      if (!best || c.d2 < best.d2) best = c;
    }
    return best ? { x: best.x, z: best.z } : null;
  }
}

/** Which shelter the player is in, with hysteresis; remembers the last one entered ("the last shelter passed"). */
export class ShelterTracker {
  private _current: string | null = null;
  private _last: string | null = null;
  private readonly byId = new Map<string, ShelterLike>();

  constructor(shelters: readonly ShelterLike[], private readonly hysteresis = SHELTER_HYSTERESIS) {
    for (const s of shelters) this.byId.set(s.id, s);
  }

  get current(): string | null {
    return this._current;
  }

  get last(): string | null {
    return this._last;
  }

  shelter(id: string | null): ShelterLike | null {
    return id ? this.byId.get(id) ?? null : null;
  }

  /** A loaded "last shelter" (unknown ids are dropped). */
  restoreLast(id: string | null): void {
    this._last = id && this.byId.has(id) ? id : null;
  }

  /** Clears the current shelter without an event (a load, or the player went indoors); the last one is kept. */
  reset(): void {
    this._current = null;
  }

  /** Updates from the player's position; returns the edge crossed, if any. */
  update(x: number, z: number): { entered?: string; left?: string } {
    const out: { entered?: string; left?: string } = {};
    const cur = this.shelter(this._current);
    if (cur) {
      const d = Math.hypot(x - cur.at.x, z - cur.at.z);
      if (d <= cur.radius + this.hysteresis) return out;
      out.left = cur.id;
      this._current = null;
    }
    for (const s of this.byId.values()) {
      if (Math.hypot(x - s.at.x, z - s.at.z) <= s.radius) {
        this._current = s.id;
        this._last = s.id;
        out.entered = s.id;
        break;
      }
    }
    return out;
  }
}
