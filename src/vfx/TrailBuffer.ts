import type { Vec3 } from './ports';
import { CAPS } from './tuning';

/** Ring buffer of hilt/tip pairs. Pure data: no three imports. */
export class TrailBuffer {
  private readonly hx = new Float32Array(CAPS.trailSegments);
  private readonly hy = new Float32Array(CAPS.trailSegments);
  private readonly hz = new Float32Array(CAPS.trailSegments);
  private readonly tx = new Float32Array(CAPS.trailSegments);
  private readonly ty = new Float32Array(CAPS.trailSegments);
  private readonly tz = new Float32Array(CAPS.trailSegments);
  private readonly time = new Float64Array(CAPS.trailSegments);
  private head = 0; // index of the oldest live segment
  private count = 0;
  private lastNow = 0;

  constructor(readonly tail: number) {}

  get length(): number {
    return this.count;
  }

  push(hilt: Vec3, tip: Vec3, now: number): void {
    if (!Number.isFinite(now)) return;
    if (
      !Number.isFinite(hilt.x) || !Number.isFinite(hilt.y) || !Number.isFinite(hilt.z) ||
      !Number.isFinite(tip.x) || !Number.isFinite(tip.y) || !Number.isFinite(tip.z)
    ) {
      return;
    }
    this.age(now);
    const cap = CAPS.trailSegments;
    if (this.count === cap) {
      this.head = (this.head + 1) % cap;
      this.count--;
    }
    const i = (this.head + this.count) % cap;
    this.hx[i] = hilt.x; this.hy[i] = hilt.y; this.hz[i] = hilt.z;
    this.tx[i] = tip.x; this.ty[i] = tip.y; this.tz[i] = tip.z;
    this.time[i] = now;
    this.count++;
  }

  /** Collapses segments older than `tail` seconds and remembers `now` for `write`. */
  age(now: number): void {
    if (!Number.isFinite(now)) return;
    if (now > this.lastNow) this.lastNow = now;
    const cap = CAPS.trailSegments;
    while (this.count > 0 && this.lastNow - this.time[this.head] > this.tail) {
      this.head = (this.head + 1) % cap;
      this.count--;
    }
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }

  /**
   * Writes live segments freshest-first, 2 vertices each (hilt then tip). `ages` gets the age
   * normalised to 0 (fresh) .. 1 (at the tail limit) per vertex. Returns the vertex count.
   */
  write(positions: Float32Array, ages: Float32Array): number {
    const cap = CAPS.trailSegments;
    const maxSeg = Math.min(this.count, Math.floor(positions.length / 6), Math.floor(ages.length / 2));
    const tail = this.tail > 0 ? this.tail : 1e-6;
    for (let s = 0; s < maxSeg; s++) {
      const i = (this.head + this.count - 1 - s) % cap;
      const p = s * 6;
      positions[p] = this.hx[i]; positions[p + 1] = this.hy[i]; positions[p + 2] = this.hz[i];
      positions[p + 3] = this.tx[i]; positions[p + 4] = this.ty[i]; positions[p + 5] = this.tz[i];
      const a = Math.min(1, Math.max(0, (this.lastNow - this.time[i]) / tail));
      ages[s * 2] = a;
      ages[s * 2 + 1] = a;
    }
    return maxSeg * 2;
  }
}
