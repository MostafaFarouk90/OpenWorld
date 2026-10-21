// Gaut's mounted column on the Cinder Road (M11; plans/act2-A5.md sections 1.7 and 8). Pure: positions along a route
// polyline. Gaut leads a little ahead of Cael at Cael's pace, never rides back along the road (so he waits while Cael
// is behind him), and two Halvard riders trail him. A jump (fast travel, a door, a respawn) or Cael coming back from
// far off the road re-places the column just behind Cael, out of his view, and Gaut rides up past him.
import type { Vec3 } from '../FollowModel';

export const ESCORT_TUNING = {
  /** Gaut keeps this far ahead of Cael along the road. */
  lead: 4,
  /** Gaut rides this far to the side of the road line. */
  side: 1.6,
  /** The riders ride this far behind Gaut. */
  riderGaps: [6, 9] as readonly number[],
  /** The column's top speed (a touch over the Ashmare's 12 m/s gallop, so a mounted Cael is kept) and its pace when Cael stands. */
  maxSpeed: 13,
  minSpeed: 1.2,
  /** A one-tick move this long is a jump. */
  jumpDistance: 8,
  /** Cael further than this from the road re-places the column when he comes back. */
  offRoad: 40,
  dismountSeconds: 1.5,
} as const;

export type EscortPhase = 'riding' | 'dismounting' | 'dismounted';

export interface ColumnPose {
  x: number;
  y: number;
  z: number;
  /** 0 faces -Z. */
  yaw: number;
  /** m/s, for the horse's gait. */
  speed: number;
}

interface Seg {
  a: Vec3;
  b: Vec3;
  start: number;
  length: number;
}

export class Route {
  private readonly segs: Seg[] = [];
  readonly length: number;

  constructor(points: readonly Vec3[]) {
    let s = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      if (!(length > 1e-6)) continue;
      this.segs.push({ a, b, start: s, length });
      s += length;
    }
    this.length = s;
  }

  get valid(): boolean {
    return this.segs.length > 0;
  }

  /** The distance along the road of the point nearest `p`, and how far `p` is from it. */
  project(p: { x: number; z: number }): { s: number; off: number } {
    let best = { s: 0, off: Infinity };
    for (const g of this.segs) {
      const dx = g.b.x - g.a.x;
      const dz = g.b.z - g.a.z;
      const t = Math.max(0, Math.min(1, ((p.x - g.a.x) * dx + (p.z - g.a.z) * dz) / (g.length * g.length)));
      const off = Math.hypot(g.a.x + dx * t - p.x, g.a.z + dz * t - p.z);
      if (off < best.off) best = { s: g.start + g.length * t, off };
    }
    return best;
  }

  /** The point at `s` along the road, shifted `side` m to the right of travel, and the travel yaw. */
  at(s: number, side = 0): ColumnPose {
    const g = this.segs.find((x) => s <= x.start + x.length) ?? this.segs[this.segs.length - 1];
    const t = Math.max(0, Math.min(1, (s - g.start) / g.length));
    const dx = (g.b.x - g.a.x) / g.length;
    const dz = (g.b.z - g.a.z) / g.length;
    // Right of travel: forward (dx, dz) turned a quarter clockwise seen from above is (-dz, dx).
    return {
      x: g.a.x + (g.b.x - g.a.x) * t - dz * side,
      y: g.a.y + (g.b.y - g.a.y) * t,
      z: g.a.z + (g.b.z - g.a.z) * t + dx * side,
      yaw: Math.atan2(-dx, -dz),
      speed: 0,
    };
  }
}

export class EscortColumn {
  /** Gaut's distance along the road. */
  private s = 0;
  private speed = 0;
  private last: { x: number; z: number } | null = null;
  private _phase: EscortPhase = 'riding';
  private dismountLeft = 0;
  private wasOff = false;

  constructor(
    readonly route: Route,
    player: { x: number; z: number },
    private readonly t = ESCORT_TUNING,
  ) {
    this.replace(player);
  }

  get phase(): EscortPhase {
    return this._phase;
  }

  get progress(): number {
    return this.s;
  }

  /** Puts Gaut on the road by Cael: just ahead at the start, just behind after a jump (he rides up past him). */
  replace(player: { x: number; z: number }, behind = false): void {
    const p = this.route.project(player);
    this.s = Math.max(0, Math.min(this.route.length, p.s + (behind ? -this.t.lead : this.t.lead)));
    this.speed = 0;
    this.last = { x: player.x, z: player.z };
  }

  dismount(): void {
    if (this._phase !== 'riding') return;
    this._phase = 'dismounting';
    this.dismountLeft = this.t.dismountSeconds;
    this.speed = 0;
  }

  remount(): void {
    this._phase = 'riding';
    this.dismountLeft = 0;
  }

  /** Advances the column; returns 'dismounted' on the tick the scripted dismount finishes. */
  tick(dt: number, player: { x: number; z: number }): 'dismounted' | null {
    if (!(dt > 0)) return null;
    const last = this.last;
    this.last = { x: player.x, z: player.z };
    const jumped = !!last && Math.hypot(player.x - last.x, player.z - last.z) >= this.t.jumpDistance;
    const p = this.route.project(player);
    const off = p.off > this.t.offRoad;
    // A jump, or coming back to the road after leaving it, puts the column by Cael again.
    if (jumped || (this.wasOff && !off)) this.replace(player, true);
    this.wasOff = off;
    if (this._phase !== 'riding') return this.finishDismount(dt);
    if (off || jumped) {
      this.speed = 0;
      return null;
    }
    const playerSpeed = last ? Math.hypot(player.x - last.x, player.z - last.z) / dt : 0;
    const target = Math.min(this.route.length, p.s + this.t.lead);
    // Never back along the road: he waits while Cael is behind him.
    if (target <= this.s) {
      this.speed = 0;
      return null;
    }
    const want = Math.min(this.t.maxSpeed, Math.max(this.t.minSpeed, playerSpeed + (target - this.s) * 0.8));
    this.speed = want;
    this.s = Math.min(target, this.s + want * dt);
    return null;
  }

  private finishDismount(dt: number): 'dismounted' | null {
    if (this._phase !== 'dismounting') return null;
    this.dismountLeft = Math.max(0, this.dismountLeft - dt);
    if (this.dismountLeft > 0) return null;
    this._phase = 'dismounted';
    return 'dismounted';
  }

  /** Gaut (index 0) and the riders behind him. */
  poses(): ColumnPose[] {
    const out: ColumnPose[] = [];
    const g = this.route.at(this.s, this.t.side);
    out.push({ ...g, speed: this.speed });
    for (const gap of this.t.riderGaps) {
      const r = this.route.at(Math.max(0, this.s - gap), this.t.side);
      out.push({ ...r, speed: this.speed });
    }
    return out;
  }
}
