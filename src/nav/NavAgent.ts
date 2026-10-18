import type { Vec3 } from '../physics/PhysicsWorld';
import type { NavService } from './service';

export interface NavAgentOptions {
  /** Repath when the target moved this far since the last query (default 1 m). */
  repathDistance?: number;
  /** Repath at least this often (default 0.5 s). */
  repathSeconds?: number;
  /** A waypoint this close (horizontal) counts as reached (default 0.6 m). */
  arriveRadius?: number;
  /** Agent radius passed to the nav service (default 0.4 m). */
  radius?: number;
}

/**
 * Steering hook in front of `Steering.step`: turns "go to the target" into "go to the next waypoint"
 * while the agent is inside a nav grid, and passes the raw target through everywhere else.
 */
export class NavAgent {
  private readonly repathDistance: number;
  private readonly repathSeconds: number;
  private readonly arriveRadius: number;
  private readonly opts: { radius: number };
  private path: Vec3[] = [];
  private idx = 0;
  private queried = false;
  private timer = 0;
  private lastX = 0;
  private lastZ = 0;
  private warned = false;
  private grid = false;
  private readonly out = { x: 0, z: 0 };

  constructor(
    private readonly nav: () => Pick<NavService, 'path' | 'hasGrid'> | undefined,
    opts: NavAgentOptions = {},
  ) {
    this.repathDistance = opts.repathDistance ?? 1;
    this.repathSeconds = opts.repathSeconds ?? 0.5;
    this.arriveRadius = opts.arriveRadius ?? 0.6;
    this.opts = { radius: opts.radius ?? 0.4 };
  }

  /** The current path (waypoints before the cursor are already passed). */
  get waypoints(): readonly Vec3[] {
    return this.path;
  }

  /** True when the last `desired` call found the agent inside a nav grid. */
  get onGrid(): boolean {
    return this.grid;
  }

  /**
   * Next point to steer toward: the raw target outside any grid (or with no nav service), the next waypoint
   * inside one; null when target is null. The returned object is reused by the next call.
   */
  desired(self: Vec3, target: Vec3 | null, dt: number): { x: number; z: number } | null {
    if (!target) return null;
    let svc: ReturnType<typeof this.nav>;
    try {
      svc = this.nav();
      this.grid = !!svc && svc.hasGrid(self);
    } catch (err) {
      this.warn(err);
      this.grid = false;
    }
    if (!this.grid || !svc) {
      this.clear();
      return this.give(target.x, target.z);
    }
    this.timer += dt;
    const moved = Math.hypot(target.x - this.lastX, target.z - this.lastZ);
    if (!this.queried || moved > this.repathDistance || this.timer >= this.repathSeconds) {
      let p: Vec3[] | null = null;
      try {
        p = svc.path(self, target, this.opts);
      } catch (err) {
        this.warn(err);
      }
      this.path = p ?? [];
      this.idx = 0;
      this.queried = true;
      this.timer = 0;
      this.lastX = target.x;
      this.lastZ = target.z;
    }
    while (this.idx < this.path.length) {
      const w = this.path[this.idx]!;
      if (Math.hypot(w.x - self.x, w.z - self.z) > this.arriveRadius) break;
      this.idx++;
    }
    const w = this.path[this.idx];
    return w ? this.give(w.x, w.z) : this.give(target.x, target.z);
  }

  /** Forgets the path so the next call repaths. */
  reset(): void {
    this.clear();
    this.timer = 0;
  }

  private clear(): void {
    this.path = [];
    this.idx = 0;
    this.queried = false;
  }

  private give(x: number, z: number): { x: number; z: number } {
    this.out.x = x;
    this.out.z = z;
    return this.out;
  }

  private warn(err: unknown): void {
    if (this.warned) return;
    this.warned = true;
    console.warn('NavAgent: nav service failed, steering straight at the target', err);
  }
}
