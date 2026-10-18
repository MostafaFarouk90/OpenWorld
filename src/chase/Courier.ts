import { CHASE } from './tuning';
import { type P3, Polyline, type RouteNode, courierPath } from './route';

/**
 * The courier on his route (design item 76): kinematic, no physics body and no `nav.path`. Pure state; the chase
 * plugin copies `position` onto his actor each tick.
 */
export class Courier {
  readonly line: Polyline;
  /** Arc length of each pause node (vault, drop) on his line, with its pause. */
  private readonly pauses: { at: number; seconds: number }[] = [];
  private s = 0;
  private pauseLeft = 0;
  private nextPause = 0;
  private burstLeft: number = CHASE.burstSeconds;
  /** Set when the burst runs dry; cleared once it has fully recharged (no flickering bursts). */
  private burstSpent = false;
  readonly position: P3 = { x: 0, y: 0, z: 0 };

  constructor(nodes: readonly RouteNode[]) {
    const path = courierPath(nodes);
    this.line = new Polyline(path.map((p) => p.position));
    path.forEach((p, i) => {
      const kind = p.node >= 0 ? nodes[p.node].kind : 'run';
      if (kind === 'vault') this.pauses.push({ at: this.line.cum[i], seconds: CHASE.courierVaultSeconds });
      else if (kind === 'drop') this.pauses.push({ at: this.line.cum[i], seconds: CHASE.courierDropSeconds });
    });
    this.reset();
  }

  /** Back to his head start (a chase start or restart). */
  reset(): void {
    this.s = Math.min(CHASE.courierHeadStart, this.line.length);
    this.pauseLeft = 0;
    this.burstLeft = CHASE.burstSeconds;
    this.burstSpent = false;
    this.nextPause = this.pauses.findIndex((p) => p.at > this.s);
    if (this.nextPause < 0) this.nextPause = this.pauses.length;
    this.line.sampleAt(this.s, this.position);
  }

  /** Cornered at the end of his route (`chase.m10.15`), waiting. */
  placeCornered(): void {
    this.s = this.line.length;
    this.nextPause = this.pauses.length;
    this.line.sampleAt(this.s, this.position);
  }

  get progress(): number {
    return this.s;
  }

  get cornered(): boolean {
    return this.s >= this.line.length;
  }

  get pausing(): boolean {
    return this.pauseLeft > 0;
  }

  /** The speed the rubber band picks for a gap (m) to the player; updates the burst budget. */
  private speedFor(gap: number, dt: number): number {
    if (gap > CHASE.slowGap) {
      this.recharge(dt);
      return CHASE.courierFloor;
    }
    if (gap < CHASE.nearGap && !this.burstSpent) {
      this.burstLeft = Math.max(0, this.burstLeft - dt);
      if (this.burstLeft === 0) this.burstSpent = true;
      return CHASE.courierBurst;
    }
    this.recharge(dt);
    return CHASE.courierRun;
  }

  private recharge(dt: number): void {
    this.burstLeft = Math.min(CHASE.burstSeconds, this.burstLeft + dt * 0.5);
    if (this.burstLeft >= CHASE.burstSeconds) this.burstSpent = false;
  }

  /** One fixed tick; `gap` is the straight-line distance to the player (Infinity or NaN count as far). */
  step(dt: number, gap: number): void {
    if (!(dt > 0) || this.cornered) return;
    const g = Number.isFinite(gap) ? gap : Infinity;
    if (this.pauseLeft > 0) {
      this.pauseLeft = Math.max(0, this.pauseLeft - dt);
      return;
    }
    const next = Math.min(this.line.length, this.s + this.speedFor(g, dt) * dt);
    const p = this.pauses[this.nextPause];
    if (p && next >= p.at) {
      this.s = p.at;
      this.pauseLeft = p.seconds;
      this.nextPause++;
    } else this.s = next;
    this.line.sampleAt(this.s, this.position);
  }
}
