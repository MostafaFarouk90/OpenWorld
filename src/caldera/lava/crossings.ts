// N3 Surge-crossing lips (plan 2.7; plans/act5-N3.md 1.3): a marked pair of lips across a channel. A Leap pressed near one
// end, facing the other, is aimed at it (the spells plugin asks through the Leap's optional `aim` port). Pure.
import type { SurgeCrossingDef } from '../lava';
import { CROSSING } from './tuning';

export interface LeapAim {
  /** Radians about +Y, 0 = facing -Z. */
  yaw: number;
  distance: number;
  crossingId: string;
}

/** Yaw (0 = -Z) that faces from (ax, az) toward (bx, bz). */
export const yawToward = (ax: number, az: number, bx: number, bz: number): number => Math.atan2(-(bx - ax), -(bz - az));

/** Smallest difference of two angles, radians in [0, PI]. */
export function angleBetween(a: number, b: number): number {
  const d = (((a - b) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
  return Math.abs(d);
}

export const crossingSpan = (c: SurgeCrossingDef): number => Math.hypot(c.to.x - c.from.x, c.to.z - c.from.z);

/** Lint: why a crossing is refused, or null. */
export function crossingProblem(c: SurgeCrossingDef): string | null {
  const pts = [c.from.x, c.from.y, c.from.z, c.to.x, c.to.y, c.to.z];
  if (!pts.every(Number.isFinite)) return `crossing "${c.id}" has a non-finite lip`;
  const span = crossingSpan(c);
  if (span < CROSSING.minSpan || span > CROSSING.maxSpan) {
    return `crossing "${c.id}" spans ${span.toFixed(2)} m (must be ${CROSSING.minSpan} to ${CROSSING.maxSpan} m)`;
  }
  return null;
}

export class Crossings {
  private readonly defs = new Map<string, SurgeCrossingDef>();

  add(def: SurgeCrossingDef): () => void {
    if (this.defs.has(def.id)) throw new Error(`lava: crossing "${def.id}" is already registered`);
    const p = crossingProblem(def);
    if (p) throw new Error(`lava: ${p}`);
    this.defs.set(def.id, def);
    return () => {
      if (this.defs.get(def.id) === def) this.defs.delete(def.id);
    };
  }

  all(): SurgeCrossingDef[] {
    return [...this.defs.values()];
  }

  /** The aim for a Leap pressed at `feet` facing `yaw`, or null when no lip end is near and faced. Nearest end wins. */
  aim(feet: { x: number; z: number }, yaw: number): LeapAim | null {
    if (![feet.x, feet.z, yaw].every(Number.isFinite)) return null;
    const cone = (CROSSING.coneDeg * Math.PI) / 180;
    let best: LeapAim | null = null;
    let bestD = Infinity;
    for (const c of this.defs.values()) {
      for (const [near, far] of [[c.from, c.to], [c.to, c.from]] as const) {
        const d = Math.hypot(near.x - feet.x, near.z - feet.z);
        if (d > CROSSING.radius || d >= bestD) continue;
        const bearing = yawToward(feet.x, feet.z, far.x, far.z);
        if (angleBetween(bearing, yaw) > cone) continue;
        const span = Math.hypot(far.x - feet.x, far.z - feet.z);
        const distance = Math.min(CROSSING.maxDistance, Math.max(CROSSING.minDistance, span + CROSSING.overshoot));
        best = { yaw: bearing, distance, crossingId: c.id };
        bestD = d;
      }
    }
    return best;
  }
}
