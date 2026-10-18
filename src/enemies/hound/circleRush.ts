import { HOUND } from './tuning';

export interface XZ {
  x: number;
  z: number;
}

export interface CircleSenses {
  self: XZ;
  targetPos: XZ;
  /** Horizontal distance to the target. */
  distance: number;
  /** Living packmates within `HOUND.packRadius` (0 when alone). */
  packNearby: number;
}

export interface CircleStep {
  goal: XZ;
  speed: number;
}

/**
 * The `circle-rush` behaviour (plans/slice-2-enemies.md 3.2), one per hound, driven by the Brain while it chases.
 * With a packmate in range the hound circles the target at 4 to 5 m for 1.5 to 3 s (drawn per engagement), alone
 * for 1 s; then it rushes (the Brain's ordinary chase and move choice take over). The pounces of a pack are
 * spaced by the attack-token stagger in the manager. Pure: no clock, no scene.
 */
export class CircleRush {
  private elapsed = 0;
  private rushing = false;
  private packSeconds: number;
  private dir: 1 | -1;

  constructor(
    private readonly rng: () => number,
    private readonly speeds: { circle: number; approach: number },
  ) {
    this.packSeconds = this.drawPackSeconds();
    this.dir = rng() < 0.5 ? -1 : 1;
  }

  /** A new engagement (entering the chase): circle again with a fresh duration and direction. */
  reset(): void {
    this.elapsed = 0;
    this.rushing = false;
    this.packSeconds = this.drawPackSeconds();
    this.dir = this.rng() < 0.5 ? -1 : 1;
  }

  get isRushing(): boolean {
    return this.rushing;
  }

  /** Seconds of circling still needed given the pack right now (0 once rushing). */
  seconds(packNearby: number): number {
    return packNearby > 0 ? this.packSeconds : HOUND.aloneCircleSeconds;
  }

  /**
   * Circling this tick: the goal and speed on the ring, or null once the circle is over (the rush).
   * Time only counts while the hound is on the ring (within `HOUND.ringJoinDistance`); a hound that
   * is far away just approaches it.
   */
  step(dt: number, s: CircleSenses): CircleStep | null {
    if (this.rushing) return null;
    if (s.distance <= HOUND.ringJoinDistance && dt > 0) this.elapsed += dt;
    if (this.elapsed >= this.seconds(s.packNearby)) {
      this.rushing = true;
      return null;
    }
    return this.ringStep(s);
  }

  /** A point on the ring a little ahead of the hound, and the speed to go there. */
  ringStep(s: CircleSenses): CircleStep {
    let ax = s.self.x - s.targetPos.x;
    let az = s.self.z - s.targetPos.z;
    let d = Math.hypot(ax, az);
    if (!(d > 1e-3)) {
      ax = 1;
      az = 0;
      d = 1;
    }
    const r = d < HOUND.circleMin || d > HOUND.circleMax ? (HOUND.circleMin + HOUND.circleMax) / 2 : d;
    const a = this.dir * HOUND.circleLeadRadians;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const ux = ax / d;
    const uz = az / d;
    return {
      goal: { x: s.targetPos.x + (ux * cos - uz * sin) * r, z: s.targetPos.z + (ux * sin + uz * cos) * r },
      speed: d > HOUND.circleMax + 0.5 ? this.speeds.approach : this.speeds.circle,
    };
  }

  private drawPackSeconds(): number {
    return HOUND.packCircleMin + this.rng() * (HOUND.packCircleMax - HOUND.packCircleMin);
  }
}
