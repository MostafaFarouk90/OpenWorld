/**
 * A scripted path for a large dragon's set pieces (K6a, plans/act3-K6a.md 1): a centripetal Catmull-Rom curve through
 * world waypoints, walked at a constant speed by arc length, with a heading and a bank from the curve's turn. Pure maths
 * on float64 numbers (no three.js), so a set piece reads `sample(s)` and drives its rig root with it. Hathren's swim
 * out of the nets and dive use it; PR 2's flight between Ysmeryth's rounds will too.
 */
export interface PathPoint {
  x: number;
  y: number;
  z: number;
}

export interface PathSample extends PathPoint {
  /** Facing along the path (yaw 0 faces -Z, the game's rule). */
  yaw: number;
  /** Climb angle, + nose up (radians). */
  pitch: number;
  /** Roll into the turn, + banks left (radians), capped at `maxBank`. */
  bank: number;
}

export interface FlightPathOptions {
  /** Loop back to the first point. */
  closed?: boolean;
  /** Arc-length table resolution per span. */
  samplesPerSpan?: number;
  /** Bank limit (radians). */
  maxBank?: number;
  /** Bank per unit of turn rate (radians of roll per radian of heading change per metre, times speed squared). */
  bankGain?: number;
}

const DEFAULTS = { closed: false, samplesPerSpan: 24, maxBank: 0.6, bankGain: 6 } as const;

export class FlightPath {
  /** Total length in metres. */
  readonly length: number;
  readonly closed: boolean;
  private readonly pts: PathPoint[];
  private readonly table: { s: number; span: number; t: number }[] = [];
  private readonly maxBank: number;
  private readonly bankGain: number;

  constructor(points: readonly PathPoint[], opts: FlightPathOptions = {}) {
    const o = { ...DEFAULTS, ...opts };
    const pts: PathPoint[] = [];
    for (const p of points) {
      if (![p.x, p.y, p.z].every(Number.isFinite)) throw new Error('FlightPath: a point is not finite');
      const last = pts[pts.length - 1];
      if (last && Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z) < 1e-6) continue;
      pts.push({ x: p.x, y: p.y, z: p.z });
    }
    if (o.closed && pts.length > 2) {
      const a = pts[0]!;
      const b = pts[pts.length - 1]!;
      if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-6) pts.pop();
    }
    if (pts.length < 2) throw new Error('FlightPath: needs at least two distinct points');
    this.pts = pts;
    this.closed = !!o.closed && pts.length > 2;
    this.maxBank = o.maxBank;
    this.bankGain = o.bankGain;
    const spans = this.closed ? pts.length : pts.length - 1;
    let s = 0;
    let prev = this.point(0, 0);
    this.table.push({ s: 0, span: 0, t: 0 });
    for (let span = 0; span < spans; span++) {
      for (let k = 1; k <= o.samplesPerSpan; k++) {
        const t = k / o.samplesPerSpan;
        const p = this.point(span, t);
        s += Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z);
        this.table.push({ s, span, t });
        prev = p;
      }
    }
    this.length = s;
  }

  /** The waypoints (deduplicated). */
  get points(): readonly PathPoint[] {
    return this.pts;
  }

  /** The point `s` metres along (clamped on an open path, wrapped on a closed one), with heading, pitch and bank. */
  sample(s: number, out?: PathSample): PathSample {
    const r = out ?? { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 };
    const L = this.length;
    let d = Number.isFinite(s) ? s : 0;
    d = this.closed ? ((d % L) + L) % L : Math.min(L, Math.max(0, d));
    const { span, t } = this.locate(d);
    const p = this.point(span, t);
    const e = Math.min(1, Math.max(0.5, L * 0.002));
    const a = this.at(d - e);
    const b = this.at(d + e);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const flat = Math.hypot(dx, dz);
    r.x = p.x;
    r.y = p.y;
    r.z = p.z;
    r.yaw = flat > 1e-9 ? Math.atan2(-dx, -dz) : 0;
    r.pitch = Math.atan2(dy, Math.max(1e-9, flat));
    // Bank from the heading's rate of change per metre.
    const y0 = this.yawAt(d - e * 2, d);
    const y1 = this.yawAt(d, d + e * 2);
    let turn = y1 - y0;
    while (turn > Math.PI) turn -= 2 * Math.PI;
    while (turn < -Math.PI) turn += 2 * Math.PI;
    const bank = (turn / (e * 2)) * this.bankGain;
    r.bank = Math.max(-this.maxBank, Math.min(this.maxBank, Number.isFinite(bank) ? bank : 0));
    return r;
  }

  private yawAt(s0: number, s1: number): number {
    const a = this.at(s0);
    const b = this.at(s1);
    return Math.atan2(-(b.x - a.x), -(b.z - a.z));
  }

  private at(s: number): PathPoint {
    const L = this.length;
    const d = this.closed ? ((s % L) + L) % L : Math.min(L, Math.max(0, s));
    const { span, t } = this.locate(d);
    return this.point(span, t);
  }

  private locate(d: number): { span: number; t: number } {
    const tb = this.table;
    let lo = 0;
    let hi = tb.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (tb[mid]!.s <= d) lo = mid;
      else hi = mid;
    }
    const a = tb[lo]!;
    const b = tb[hi]!;
    const k = b.s - a.s > 1e-12 ? (d - a.s) / (b.s - a.s) : 0;
    if (a.span === b.span) return { span: a.span, t: a.t + (b.t - a.t) * k };
    // b starts a new span at t = 1 of a's span.
    return { span: b.span, t: b.t * k };
  }

  /** Centripetal Catmull-Rom point on span `i` (from point i to i + 1) at `t`. */
  private point(i: number, t: number): PathPoint {
    const n = this.pts.length;
    const get = (k: number): PathPoint => {
      if (this.closed) return this.pts[((k % n) + n) % n]!;
      if (k < 0) return reflect(this.pts[0]!, this.pts[1]!);
      if (k >= n) return reflect(this.pts[n - 1]!, this.pts[n - 2]!);
      return this.pts[k]!;
    };
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    const k = (a: PathPoint, b: PathPoint) => Math.max(1e-4, Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)));
    const t0 = 0;
    const t1 = t0 + k(p0, p1);
    const t2 = t1 + k(p1, p2);
    const t3 = t2 + k(p2, p3);
    const u = t1 + (t2 - t1) * t;
    const lerp = (a: PathPoint, b: PathPoint, ta: number, tb: number): PathPoint => {
      const w = (u - ta) / (tb - ta);
      return { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w, z: a.z + (b.z - a.z) * w };
    };
    const a1 = lerp(p0, p1, t0, t1);
    const a2 = lerp(p1, p2, t1, t2);
    const a3 = lerp(p2, p3, t2, t3);
    const b1 = lerp(a1, a2, t0, t2);
    const b2 = lerp(a2, a3, t1, t3);
    return lerp(b1, b2, t1, t2);
  }
}

function reflect(end: PathPoint, inner: PathPoint): PathPoint {
  return { x: 2 * end.x - inner.x, y: 2 * end.y - inner.y, z: 2 * end.z - inner.z };
}

/** Walks a path at a fixed speed; `step` returns the sample and whether an open path has reached its end. */
export class PathWalker {
  private s = 0;
  constructor(
    readonly path: FlightPath,
    public speed: number,
  ) {}

  get distance(): number {
    return this.s;
  }

  get done(): boolean {
    return !this.path.closed && this.s >= this.path.length;
  }

  step(dt: number, out?: PathSample): PathSample {
    if (dt > 0 && Number.isFinite(dt)) this.s += this.speed * dt;
    if (!this.path.closed) this.s = Math.min(this.s, this.path.length);
    return this.path.sample(this.s, out);
  }

  reset(s = 0): void {
    this.s = s;
  }
}
