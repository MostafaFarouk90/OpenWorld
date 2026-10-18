import type { NavPort } from '../ports';

type P3 = { x: number; y: number; z: number };
type XZ = { x: number; z: number };

const REPATH_SECONDS = 0.5;
/** The target moving further than this since the last query forces a new one. */
const REPATH_MOVED = 2;
const ARRIVE = 0.6;

/**
 * Indoor path following (contracts/interiors-and-nav.md section 2): where `nav.hasGrid` says a grid covers
 * the enemy, `goalFor` returns the next waypoint towards the goal; everywhere else it returns null and the
 * caller keeps slice 1's local steering over the heightfield. A null path is the normal outdoor answer and
 * is silent; only a throwing nav service warns, once, and then stays off for this enemy.
 */
export class PathFollower {
  private path: XZ[] = [];
  private next = 0;
  private sinceQuery = Infinity;
  private lastGoal: XZ | null = null;
  private broken = false;

  constructor(
    private readonly nav: () => NavPort | undefined,
    private readonly warn: (message: string) => void,
  ) {}

  /** The waypoint to steer to this tick, or null for "no grid here, steer locally". */
  goalFor(dt: number, self: P3, goal: P3): XZ | null {
    const nav = this.nav();
    if (!nav || this.broken) return this.clear();
    this.sinceQuery += dt;
    try {
      if (!nav.hasGrid(self)) return this.clear();
      const moved = this.lastGoal ? Math.hypot(goal.x - this.lastGoal.x, goal.z - this.lastGoal.z) : Infinity;
      if (this.sinceQuery >= REPATH_SECONDS || moved > REPATH_MOVED || this.path.length === 0) {
        this.sinceQuery = 0;
        this.lastGoal = { x: goal.x, z: goal.z };
        const points = nav.path(self, goal);
        if (!points || points.length === 0) return this.clear();
        this.path = points.map((p) => ({ x: p.x, z: p.z }));
        this.next = 0;
      }
    } catch (err) {
      this.broken = true;
      this.warn(`enemies: nav service failed, falling back to local steering (${String(err)})`);
      return this.clear();
    }
    while (this.next < this.path.length - 1 && Math.hypot(this.path[this.next]!.x - self.x, this.path[this.next]!.z - self.z) < ARRIVE) {
      this.next++;
    }
    return this.path[this.next] ?? null;
  }

  private clear(): null {
    this.path = [];
    this.next = 0;
    this.lastGoal = null;
    this.sinceQuery = Infinity;
    return null;
  }
}
