import type { ActorId } from '../ports';

/** The thrown Cooling Draught (A6b owns aim, throw, consume and landing; A10 registers the item id). */
export const DRAUGHT = {
  itemId: 'cooling-draught',
  /** Targets this close (horizontal) can be thrown at. */
  range: 10,
  /** Seconds in the air. */
  flight: 0.5,
  /** It calms or cools anything this close (horizontal) to where it lands. */
  landRadius: 2,
  /** Apex of the arc above the straight line. */
  arc: 1.4,
} as const;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** What the thrower needs to know about a crawler. */
export interface DraughtTarget {
  readonly id: ActorId;
  readonly feet: Vec3;
}

export type LandResult = 'calmed' | 'cooled' | 'miss';

export interface ThrowDeps {
  /** Calm is unlocked. */
  unlocked(): boolean;
  count(): number;
  consume(): boolean;
  /** Open-to-Calm and coolable crawlers in the world. */
  targets(): Iterable<DraughtTarget>;
  /** Where the throw starts (the player's chest). */
  origin(out: Vec3): Vec3;
  /** Lands: Calm if it can, else a cooling hit, else a miss. The target position is where the flask came down. */
  land(at: Vec3, within: readonly DraughtTarget[]): LandResult;
  /** The flask in flight, for a visual; `p` is its position, null when it landed. */
  fly(p: Vec3 | null): void;
  /** Reports how the throw ended (strings, sound). */
  done?(result: LandResult, at: Vec3): void;
}

interface Flight {
  t: number;
  from: Vec3;
  to: Vec3;
}

/** One flask at a time. `pick` chooses the nearest target in range; `throw` is what the interactable runs. */
export class DraughtThrow {
  private flight: Flight | null = null;
  constructor(private readonly d: ThrowDeps) {}

  get airborne(): boolean {
    return this.flight !== null;
  }

  /** The nearest target within range of `from`, or null. */
  pick(from: Vec3): DraughtTarget | null {
    let best: DraughtTarget | null = null;
    let bestD: number = DRAUGHT.range;
    for (const t of this.d.targets()) {
      const dist = Math.hypot(t.feet.x - from.x, t.feet.z - from.z);
      if (dist <= bestD) {
        best = t;
        bestD = dist;
      }
    }
    return best;
  }

  /** Whether a throw can start: Calm unlocked, a flask in the pack, none in the air, a target in range. */
  can(from: Vec3): boolean {
    return !this.flight && this.d.unlocked() && this.d.count() > 0 && this.pick(from) !== null;
  }

  /** Starts a throw at the nearest target. The flask is consumed on release. False when it cannot start. */
  start(from: Vec3): boolean {
    if (!this.can(from)) return false;
    const target = this.pick(from)!;
    if (!this.d.consume()) return false;
    const a = this.d.origin({ x: 0, y: 0, z: 0 });
    this.flight = { t: 0, from: a, to: { x: target.feet.x, y: target.feet.y, z: target.feet.z } };
    return true;
  }

  update(dt: number): void {
    const f = this.flight;
    if (!f) return;
    f.t += dt;
    const k = Math.min(1, f.t / DRAUGHT.flight);
    this.d.fly({
      x: f.from.x + (f.to.x - f.from.x) * k,
      y: f.from.y + (f.to.y - f.from.y) * k + Math.sin(k * Math.PI) * DRAUGHT.arc,
      z: f.from.z + (f.to.z - f.from.z) * k,
    });
    if (k < 1) return;
    this.flight = null;
    this.d.fly(null);
    const within = [...this.d.targets()].filter((t) => Math.hypot(t.feet.x - f.to.x, t.feet.z - f.to.z) <= DRAUGHT.landRadius);
    this.d.done?.(this.d.land(f.to, within), f.to);
  }

  /** Drops a flask in the air (a load, a teardown). It is not refunded. */
  clear(): void {
    if (this.flight) this.d.fly(null);
    this.flight = null;
  }
}
