/**
 * The wyrm's body line (design 10 "Dragon fallback"): the head lays a trail of points as it moves, a centripetal
 * Catmull-Rom curve runs through the trail, and the segments sit at fixed arc spacing on it, so the body follows the
 * path the head took. A travelling sine wave adds the gait on top (sideways on the ground, a smaller vertical wave in
 * flight), growing toward the tail. Pure maths in float64 world coordinates; the body converts to root-local space.
 * Stepped only on the fixed tick.
 */

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface SpineStep {
  /** Horizontal speed of the head, m/s (sets the gait's amplitude and rate). */
  speed: number;
  /** A vertical wave instead of most of the sideways one. */
  flying: boolean;
}

/** Share of a flying head's height change the whole body takes with it (the rest shows as pitch). */
const FLIGHT_CARRY = 0.85;
/** Per second, the share of the remaining pitch a flying body levels out. */
const FLIGHT_LEVEL_RATE = 0.8;
/** Seconds after landing during which the body still settles level with the head. */
const SETTLE_AFTER_FLIGHT = 1.5;
/** Per second, the levelling rate while it settles after landing (faster than in the air). */
const SETTLE_LEVEL_RATE = 3;

/** Control spans along the body; the trail commits a point every `length / CONTROL_SPANS` metres. */
const CONTROL_SPANS = 6;
/** Arc-length samples per curve span. */
const SAMPLES_PER_SPAN = 6;
/** Sideways gait amplitude at the tail, as a fraction of the body length. */
const GAIT_AMPLITUDE = 0.04;
/** Gait waves along the body. */
const GAIT_WAVES = 1.25;
/** Fraction of the moving amplitude kept at rest (the idle sway). */
const IDLE_SWAY = 0.3;

export class WyrmSpine {
  readonly count: number;
  readonly length: number;
  /** Segment centres, head first: x, y, z per segment (world, float64). */
  readonly positions: Float64Array;
  /** Unit tangents pointing toward the head, per segment. */
  readonly tangents: Float64Array;
  private readonly spacing: number;
  private readonly resetDistance: number;
  /** Committed trail points, newest first (world). */
  private trail: Vec3Like[] = [];
  private phase = 0;
  private readonly sample: Vec3Like = { x: 0, y: 0, z: 0 };
  /** Head height last tick (NaN before the first): in flight the trail rises and falls with it. */
  private lastHeadY = Number.NaN;
  /** Seconds since the head last flew (Infinity: never): a landed body keeps levelling briefly instead of hanging. */
  private sinceFlight = Number.POSITIVE_INFINITY;
  // Scratch for the curve: control points and samples.
  private ctrl: Vec3Like[] = [];
  private sx: number[] = [];
  private sy: number[] = [];
  private sz: number[] = [];
  private sa: number[] = [];

  constructor(count: number, length: number) {
    if (!Number.isInteger(count) || count < 2) throw new Error(`WyrmSpine: bad count ${count}`);
    if (!(length > 0) || !Number.isFinite(length)) throw new Error(`WyrmSpine: bad length ${length}`);
    this.count = count;
    this.length = length;
    this.spacing = length / CONTROL_SPANS;
    this.resetDistance = Math.max(6, length);
    this.positions = new Float64Array(count * 3);
    this.tangents = new Float64Array(count * 3);
  }

  /** The gait phase (radians), for tests. */
  get gaitPhase(): number {
    return this.phase;
  }

  /** Lays the body straight from `head` along `back` (any length; normalised here, -Z of the head when degenerate). */
  reset(head: Vec3Like, back: Vec3Like = { x: 0, y: 0, z: 1 }): void {
    let bx = back.x;
    let by = back.y;
    let bz = back.z;
    const len = Math.hypot(bx, by, bz);
    if (!(len > 1e-9) || !Number.isFinite(len)) {
      bx = 0;
      by = 0;
      bz = 1;
    } else {
      bx /= len;
      by /= len;
      bz /= len;
    }
    this.trail = [];
    this.lastHeadY = head.y;
    for (let i = 0; i <= CONTROL_SPANS + 1; i++) {
      const d = i * this.spacing;
      this.trail.push({ x: head.x + bx * d, y: head.y + by * d, z: head.z + bz * d });
    }
    this.solve(head, { speed: 0, flying: false }, false);
  }

  /** One fixed tick: the head is at `head` now. A jump of more than max(6 m, the body length) lays the body straight again. */
  step(dt: number, head: Vec3Like, s: SpineStep): void {
    if (!Number.isFinite(head.x) || !Number.isFinite(head.y) || !Number.isFinite(head.z)) return;
    if (this.trail.length === 0) {
      this.reset(head);
      return;
    }
    // In flight a climb or a drop carries most of the body with the head, so a wyrm taking off from a standstill rises
    // level instead of hanging from its head; on the ground the body follows the trail over every slope.
    const dy = head.y - this.lastHeadY;
    this.lastHeadY = head.y;
    if (s.flying) this.sinceFlight = 0;
    else if (Number.isFinite(dt) && dt > 0) this.sinceFlight += dt;
    if (s.flying || this.sinceFlight < SETTLE_AFTER_FLIGHT) {
      const carried = Number.isFinite(dy) ? dy * FLIGHT_CARRY : 0;
      // The pitch left over eases out, so a hovering wyrm levels off.
      const rate = s.flying ? FLIGHT_LEVEL_RATE : SETTLE_LEVEL_RATE;
      const level = dt > 0 && Number.isFinite(dt) ? Math.min(1, dt * rate) : 0;
      for (const p of this.trail) p.y += carried + (head.y - (p.y + carried)) * level;
    }
    const first = this.trail[0]!;
    const jump = Math.hypot(head.x - first.x, head.y - first.y, head.z - first.z);
    if (jump > this.resetDistance) {
      const second = this.trail[1] ?? first;
      this.reset(head, { x: second.x - first.x, y: second.y - first.y, z: second.z - first.z });
      return;
    }
    if (jump >= this.spacing) {
      this.trail.unshift({ x: head.x, y: head.y, z: head.z });
      // Keep enough trail to cover the body plus one span.
      let total = 0;
      let keep = 1;
      for (let i = 1; i < this.trail.length; i++) {
        const a = this.trail[i - 1]!;
        const b = this.trail[i]!;
        total += Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        keep = i + 1;
        if (total > this.length + this.spacing * 2) break;
      }
      this.trail.length = Math.max(2, keep);
    }
    const speed = Number.isFinite(s.speed) && s.speed > 0 ? s.speed : 0;
    if (dt > 0 && Number.isFinite(dt)) this.phase = (this.phase + dt * (2.2 + (speed / (this.length / 6)) * 0.9)) % (Math.PI * 2000);
    this.solve(head, { speed, flying: s.flying }, true);
  }

  /** Distance along the path from the head to segment `i` (equal spacing). */
  arcOf(i: number): number {
    return (i * this.length) / (this.count - 1);
  }

  private solve(head: Vec3Like, s: SpineStep, gait: boolean): void {
    // Control points: the live head, then the trail; extended straight if it is shorter than the body.
    const ctrl = this.ctrl;
    ctrl.length = 0;
    ctrl.push(head);
    const t0 = this.trail[0]!;
    // Skip a committed point that sits on the head (no zero-length first span).
    const startAt = Math.hypot(head.x - t0.x, head.y - t0.y, head.z - t0.z) < 1e-6 ? 1 : 0;
    for (let i = startAt; i < this.trail.length; i++) ctrl.push(this.trail[i]!);
    let total = 0;
    for (let i = 1; i < ctrl.length; i++) total += dist(ctrl[i - 1]!, ctrl[i]!);
    if (ctrl.length < 2 || total < this.length + 1e-6) {
      const a = ctrl[ctrl.length - 2] ?? head;
      const b = ctrl[ctrl.length - 1]!;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dz = b.z - a.z;
      const l = Math.hypot(dx, dy, dz);
      if (l > 1e-9) {
        dx /= l;
        dy /= l;
        dz /= l;
      } else {
        dx = 0;
        dy = 0;
        dz = 1;
      }
      const extra = this.length - total + this.spacing;
      ctrl.push({ x: b.x + dx * extra, y: b.y + dy * extra, z: b.z + dz * extra });
    }

    // Sample the curve and its arc length.
    const sx = this.sx;
    const sy = this.sy;
    const sz = this.sz;
    const sa = this.sa;
    sx.length = sy.length = sz.length = sa.length = 0;
    sx.push(head.x);
    sy.push(head.y);
    sz.push(head.z);
    sa.push(0);
    let arc = 0;
    for (let i = 0; i < ctrl.length - 1 && arc < this.length + 1e-6; i++) {
      const p0 = ctrl[i - 1] ?? mirror(ctrl[i]!, ctrl[i + 1]!);
      const p1 = ctrl[i]!;
      const p2 = ctrl[i + 1]!;
      const p3 = ctrl[i + 2] ?? mirror(p2, p1);
      for (let k = 1; k <= SAMPLES_PER_SPAN; k++) {
        const q = centripetal(p0, p1, p2, p3, k / SAMPLES_PER_SPAN, this.sample);
        const n = sx.length - 1;
        arc += Math.hypot(q.x - sx[n]!, q.y - sy[n]!, q.z - sz[n]!);
        sx.push(q.x);
        sy.push(q.y);
        sz.push(q.z);
        sa.push(arc);
      }
    }

    // Segments at equal arc spacing, then the gait.
    const moving = Math.min(1, s.speed / Math.max(0.5, this.length / 1.5));
    const amp = gait ? GAIT_AMPLITUDE * this.length * (IDLE_SWAY + (1 - IDLE_SWAY) * moving) : 0;
    const k = (GAIT_WAVES * Math.PI * 2) / (this.count - 1);
    let j = 0;
    for (let i = 0; i < this.count; i++) {
      const target = this.arcOf(i);
      while (j < sa.length - 2 && sa[j + 1]! < target) j++;
      const a0 = sa[j]!;
      const a1 = sa[j + 1] ?? a0;
      const f = a1 > a0 ? Math.min(1, Math.max(0, (target - a0) / (a1 - a0))) : 0;
      const j1 = Math.min(j + 1, sx.length - 1);
      const x = sx[j]! + (sx[j1]! - sx[j]!) * f;
      const y = sy[j]! + (sy[j1]! - sy[j]!) * f;
      const z = sz[j]! + (sz[j1]! - sz[j]!) * f;
      // Tangent toward the head along the sampled curve.
      let tx = sx[j]! - sx[j1]!;
      let ty = sy[j]! - sy[j1]!;
      let tz = sz[j]! - sz[j1]!;
      const tl = Math.hypot(tx, ty, tz);
      if (tl > 1e-9) {
        tx /= tl;
        ty /= tl;
        tz /= tl;
      } else {
        tx = 0;
        ty = 0;
        tz = -1;
      }
      const u = i / (this.count - 1);
      const w = amp * Math.pow(u, 1.3);
      const wave = Math.sin(this.phase - k * i);
      // Sideways direction (horizontal, perpendicular to the tangent).
      let px = -tz;
      let pz = tx;
      const pl = Math.hypot(px, pz);
      if (pl > 1e-9) {
        px /= pl;
        pz /= pl;
      } else {
        px = 1;
        pz = 0;
      }
      const side = s.flying ? 0.35 : 1;
      const up = s.flying ? 0.6 * Math.sin(this.phase * 0.8 - k * i * 0.7) : 0;
      this.positions[i * 3] = x + px * w * wave * side;
      this.positions[i * 3 + 1] = y + w * up;
      this.positions[i * 3 + 2] = z + pz * w * wave * side;
      this.tangents[i * 3] = tx;
      this.tangents[i * 3 + 1] = ty;
      this.tangents[i * 3 + 2] = tz;
    }
  }
}

function dist(a: Vec3Like, b: Vec3Like): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** The point `2a - b`: a phantom end control point. */
function mirror(a: Vec3Like, b: Vec3Like): Vec3Like {
  return { x: 2 * a.x - b.x, y: 2 * a.y - b.y, z: 2 * a.z - b.z };
}

/** Centripetal Catmull-Rom (alpha 0.5) between p1 and p2 at t in [0, 1]: no cusps or loops on uneven spacing. */
export function centripetal(p0: Vec3Like, p1: Vec3Like, p2: Vec3Like, p3: Vec3Like, t: number, out: Vec3Like = { x: 0, y: 0, z: 0 }): Vec3Like {
  // Barry and Goldman's pyramid, unrolled per axis so a tick allocates nothing.
  const t1 = Math.max(1e-6, Math.sqrt(dist(p0, p1)));
  const t2 = t1 + Math.max(1e-6, Math.sqrt(dist(p1, p2)));
  const t3 = t2 + Math.max(1e-6, Math.sqrt(dist(p2, p3)));
  const tt = t1 + (t2 - t1) * t;
  const w = (ta: number, tb: number) => (tt - ta) / (tb - ta);
  const w01 = w(0, t1);
  const w12 = w(t1, t2);
  const w23 = w(t2, t3);
  const w02 = w(0, t2);
  const w13 = w(t1, t3);
  const axis = (a: number, b: number, c: number, d: number): number => {
    const a1 = a + (b - a) * w01;
    const a2 = b + (c - b) * w12;
    const a3 = c + (d - c) * w23;
    const b1 = a1 + (a2 - a1) * w02;
    const b2 = a2 + (a3 - a2) * w13;
    return b1 + (b2 - b1) * w12;
  };
  out.x = axis(p0.x, p1.x, p2.x, p3.x);
  out.y = axis(p0.y, p1.y, p2.y, p3.y);
  out.z = axis(p0.z, p1.z, p2.z, p3.z);
  return out;
}
