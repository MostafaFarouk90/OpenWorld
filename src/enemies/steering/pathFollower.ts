import type { NavPort } from '../ports';

type P3 = { x: number; y: number; z: number };
type XZ = { x: number; z: number };

const REPATH_SECONDS = 0.5;
/** The target moving further than this since the last query forces a new one. */
const REPATH_MOVED = 2;
const ARRIVE = 0.6;
/** The path ended this far (or less) from the goal counts as arrived, not short. */
const SHORT_RADIUS = 2;
/** How long a follower must sit at a path end short of the goal before it reports `endedShort`. */
const SHORT_SECONDS = 0.5;
/** Default `nav.path` queries per fixed tick across every follower (the worst Guild Quarter query is about 13 ms). */
export const PATH_QUERIES_PER_TICK = 4;

/**
 * A shared per-tick cap on `nav.path` queries. The manager calls `reset()` at the start of every fixed tick;
 * each follower `take()`s before querying. A follower refused keeps its previous path and retries next tick.
 */
export class PathBudget {
  private used = 0;
  constructor(readonly limit: number = PATH_QUERIES_PER_TICK) {}
  reset(): void {
    this.used = 0;
  }
  take(): boolean {
    if (this.used >= this.limit) return false;
    this.used++;
    return true;
  }
}

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
  /** The goal lies outside every grid: past the last waypoint steer to it directly. */
  private goalOutside: XZ | null = null;
  /** Latched once the last waypoint was reached: the raw goal then holds until the goal moves or the grid is left. */
  private rawLatched = false;
  /** The last query returned no path (outdoor answer): wait for the timer instead of asking every tick. */
  private queriedEmpty = false;
  /** The goal lies in another grid: the path can only end short of it, and the raw goal cannot cross the wall. */
  private goalElsewhere = false;
  private shortFor = 0;
  private goalDistance = Infinity;

  constructor(
    private readonly nav: () => NavPort | undefined,
    private readonly warn: (message: string) => void,
    private readonly budget?: PathBudget,
  ) {}

  /** True once the follower has sat at the end of a path that stops short of a goal it cannot reach. */
  get endedShort(): boolean {
    return this.shortFor >= SHORT_SECONDS;
  }

  /** The waypoint to steer to this tick, or null for "no grid here, steer locally". */
  goalFor(dt: number, self: P3, goal: P3): XZ | null {
    const nav = this.nav();
    if (!nav || this.broken) return this.clear();
    this.sinceQuery += dt;
    try {
      if (!nav.hasGrid(self)) return this.clear();
      const moved = this.lastGoal ? Math.hypot(goal.x - this.lastGoal.x, goal.z - this.lastGoal.z) : Infinity;
      const due = this.sinceQuery >= REPATH_SECONDS || moved > REPATH_MOVED || (this.path.length === 0 && !this.queriedEmpty);
      if (due && (!this.budget || this.budget.take())) {
        this.sinceQuery = 0;
        this.lastGoal = { x: goal.x, z: goal.z };
        const points = nav.path(self, goal);
        if (!points || points.length === 0) {
          this.clear();
          this.queriedEmpty = true;
          this.sinceQuery = 0;
          this.lastGoal = { x: goal.x, z: goal.z };
          return null;
        }
        if (moved > REPATH_MOVED) this.rawLatched = false;
        this.path = points.map((p) => ({ x: p.x, z: p.z }));
        // Another grid (or none) at the goal: with `gridId` compare ids, otherwise fall back to `hasGrid`.
        const outside = nav.gridId ? nav.gridId(goal) !== nav.gridId(self) : !nav.hasGrid(goal);
        this.goalOutside = outside ? { x: goal.x, z: goal.z } : null;
        this.goalElsewhere = outside && nav.hasGrid(goal);
        if (!this.goalOutside) this.rawLatched = false;
        this.next = 0;
        this.queriedEmpty = false;
      } else if (due && this.path.length === 0) {
        return null; // denied with nothing to follow: steer locally, retry next tick
      }
    } catch (err) {
      this.broken = true;
      this.warn(`enemies: nav service failed, falling back to local steering (${String(err)})`);
      return this.clear();
    }
    while (this.next < this.path.length - 1 && Math.hypot(this.path[this.next]!.x - self.x, this.path[this.next]!.z - self.z) < ARRIVE) {
      this.next++;
    }
    const last = this.path.length - 1;
    const endPoint = this.path[last];
    this.goalDistance = Math.hypot(goal.x - self.x, goal.z - self.z);
    const atEnd = !!endPoint && this.next >= last && Math.hypot(endPoint.x - self.x, endPoint.z - self.z) < ARRIVE;
    const unreachable = !!endPoint && Math.hypot(endPoint.x - goal.x, endPoint.z - goal.z) > SHORT_RADIUS && (this.goalElsewhere || !this.goalOutside);
    this.shortFor = atEnd && unreachable && this.goalDistance > SHORT_RADIUS ? this.shortFor + dt : 0;
    if (this.goalOutside && !this.goalElsewhere && this.next >= last) {
      // Chasers and fleeing thieves must not stop at the block edge (contracts/interiors-and-nav.md, Underways).
      const end = this.path[last]!;
      if (this.rawLatched || Math.hypot(end.x - self.x, end.z - self.z) < ARRIVE) {
        this.rawLatched = true;
        return this.goalOutside;
      }
    }
    return this.path[this.next] ?? null;
  }

  private clear(): null {
    this.path = [];
    this.next = 0;
    this.lastGoal = null;
    this.goalOutside = null;
    this.rawLatched = false;
    this.queriedEmpty = false;
    this.goalElsewhere = false;
    this.shortFor = 0;
    this.sinceQuery = Infinity;
    return null;
  }
}
