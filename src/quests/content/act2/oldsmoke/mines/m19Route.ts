// Wenna's route guide for M19 (plans/act2-A13.md section 3.7), pure: the walker over the route polyline and nothing else.
// The director (m18m19.director.ts) feeds it the player's position and acts on its events; no scene, no services.
import { Polyline, type P3 } from '../../../../../chase/route';
import { ROUTE_FOLLOW_MPS } from '../../../../../integration/timing';

export type { P3 };

export const GUIDE = {
  /** She walks at the route-follow pace the timing table counts. */
  walkMps: ROUTE_FOLLOW_MPS,
  /** ... and hurries when the player runs ahead of her. */
  hurryMps: 3,
  /** She advances only while the player is this close, unless the player is already ahead of her. */
  followRadius: 8,
  /** The player is "ahead" once their nearest route point is this many metres past hers. */
  hurryAhead: 3,
  /** A wait bark every this many seconds of standing still. */
  waitBarkS: 20,
  /** One update that moves the player further than max(this, jumpMps x dt) is a jump (teleport, door, respawn). */
  jumpMinM: 3,
  jumpMps: 40,
  /** The player further than this from the route is not on it (left the galleries): the walk pauses. */
  offRouteM: 30,
  /** She counts as arrived this close to the end. */
  endM: 0.3,
  /** She stops this far short of a limit (the sealed door). */
  limitMarginM: 2.5,
} as const;

export type GuideState = 'idle' | 'walk' | 'hurry' | 'wait' | 'hold' | 'away' | 'done';

export type GuideEvent =
  | { type: 'node'; index: number }
  | { type: 'waitBark'; reason: 'behind' | 'limit' }
  | { type: 'arrived' };

export interface GuideSave { node: number }

const horizontal = (a: P3, b: P3): number => Math.hypot(b.x - a.x, b.z - a.z);

export class WennaGuide {
  readonly line: Polyline;
  /** Arc length walked. */
  s = 0;
  state: GuideState = 'idle';
  yaw = 0;
  private limit: number | null = null;
  private waitS = 0;
  private last: P3 | null = null;
  private readonly tmp: P3 = { x: 0, y: 0, z: 0 };

  constructor(points: readonly P3[]) {
    this.line = new Polyline(points);
  }

  get length(): number {
    return this.line.length;
  }

  get done(): boolean {
    return this.state === 'done';
  }

  position(out: P3 = { x: 0, y: 0, z: 0 }): P3 {
    return this.line.sampleAt(this.s, out);
  }

  /** The last route node she has reached (the highest whose arc length is not past hers). */
  nodeIndex(): number {
    let n = 0;
    for (let i = 0; i < this.line.cum.length; i++) if (this.line.cum[i] <= this.s + 1e-6) n = i;
    return n;
  }

  /** The arc length of the node a bark or a stop sits at. */
  nodeArc(index: number): number {
    return this.line.cum[Math.max(0, Math.min(index, this.line.cum.length - 1))];
  }

  /** Stops her before this point of the route (the sealed door); null lifts the stop. */
  setLimit(arc: number | null): void {
    this.limit = arc === null ? null : Math.max(0, arc - GUIDE.limitMarginM);
    if (this.limit !== null && this.s > this.limit) this.s = this.reseatArc(this.limit);
  }

  /** The route node at or behind this arc length. */
  private reseatArc(arc: number): number {
    let at = 0;
    for (const c of this.line.cum) if (c <= arc + 1e-6) at = c;
    return at;
  }

  /** Puts her on a saved node (a load resumes there, never at the start). */
  restore(save: GuideSave | null | undefined): void {
    const n = save && Number.isInteger(save.node) ? save.node : 0;
    this.s = this.nodeArc(n);
    if (this.limit !== null && this.s > this.limit) this.s = this.reseatArc(this.limit);
    this.waitS = 0;
    this.last = null;
    this.state = this.state === 'done' ? 'idle' : this.state;
    if (this.s >= this.length - GUIDE.endM) this.state = 'done';
  }

  serialize(): GuideSave {
    return { node: this.nodeIndex() };
  }

  /**
   * Re-places her at the nearest route node behind the player (a teleport, a door, a respawn). A player who is not on
   * the route leaves her where she is. Returns whether she moved.
   */
  reseat(player: P3): boolean {
    const sp = this.line.project(player);
    if (this.offRoute(player, sp)) return false;
    let target = this.reseatArc(sp);
    if (this.limit !== null) target = Math.min(target, this.reseatArc(this.limit));
    this.waitS = 0;
    const moved = Math.abs(target - this.s) > 1e-6;
    this.s = target;
    return moved;
  }

  private offRoute(player: P3, sp: number): boolean {
    return horizontal(player, this.line.sampleAt(sp, this.tmp)) > GUIDE.offRouteM;
  }

  /** Forget the player's last position (a load or a pause) so the next update is not read as a jump. */
  settle(): void {
    this.last = null;
  }

  /** One fixed tick. `hold` freezes her without a bark (combat, a dialogue, the stealth section). */
  update(dt: number, player: P3, hold = false): GuideEvent[] {
    const events: GuideEvent[] = [];
    if (this.state === 'done' || !(dt > 0) || this.length <= 0) return events;
    const jumped = this.last !== null && horizontal(this.last, player) > Math.max(GUIDE.jumpMinM, GUIDE.jumpMps * dt);
    this.last = { x: player.x, y: player.y, z: player.z };
    if (jumped) this.reseat(player);
    const sp = this.line.project(player);
    if (this.offRoute(player, sp)) {
      this.state = 'away';
      return events;
    }
    if (hold) {
      this.state = 'hold';
      return events;
    }
    const here = this.position(this.tmp);
    const gap = horizontal(player, here);
    const ahead = sp - this.s;
    const cap = this.limit ?? this.length;
    if (this.s >= cap - 1e-6 && cap < this.length - GUIDE.endM) {
      this.state = 'wait';
      if ((this.waitS += dt) >= GUIDE.waitBarkS) {
        this.waitS = 0;
        events.push({ type: 'waitBark', reason: 'limit' });
      }
      return events;
    }
    if (ahead < 0 && gap > GUIDE.followRadius) {
      this.state = 'wait';
      if ((this.waitS += dt) >= GUIDE.waitBarkS) {
        this.waitS = 0;
        events.push({ type: 'waitBark', reason: 'behind' });
      }
      return events;
    }
    this.waitS = 0;
    const hurry = ahead > GUIDE.hurryAhead;
    this.state = hurry ? 'hurry' : 'walk';
    const before = this.nodeIndex();
    const prev = { x: here.x, z: here.z };
    this.s = Math.min(cap, this.s + (hurry ? GUIDE.hurryMps : GUIDE.walkMps) * dt);
    const now = this.position(this.tmp);
    if (horizontal(prev as P3, now) > 1e-6) this.yaw = Math.atan2(-(now.x - prev.x), -(now.z - prev.z));
    const arrived = this.s >= this.length - GUIDE.endM;
    if (arrived) this.s = this.length;
    for (let i = before + 1; i <= this.nodeIndex(); i++) events.push({ type: 'node', index: i });
    if (arrived) {
      this.state = 'done';
      events.push({ type: 'arrived' });
    }
    return events;
  }
}

/** The route as anchors give it: `<prefix>.0..n`, stopping at the first missing index. */
export function guidePoints(find: (id: string) => { position: P3 } | undefined, prefix: string): P3[] {
  const out: P3[] = [];
  for (let i = 0; ; i++) {
    const a = find(`${prefix}.${i}`);
    if (!a) break;
    out.push({ x: a.position.x, y: a.position.y, z: a.position.z });
  }
  return out;
}
