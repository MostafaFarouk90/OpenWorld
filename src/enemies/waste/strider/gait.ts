// The Waste Strider's gait script (Act 4 L5, plans/act4-L5.md section 2): a slow stalking walk on four long two-segment legs
// where at most one foot is ever in the air, so three always hold the ground. Pure maths with no THREE, world space, metres.
//
// Each foot keeps its world contact point while planted. The cycle phase advances with the distance the hull travels
// (`stride` metres a cycle), so the feet never slide whatever the speed; standing still, the cycle stops and a foot that has
// drifted too far from its rest point takes a corrective step on its own turn. A swinging foot travels on a raised arc from
// where it left the ground to a target ahead of its rest point (half a stance's travel ahead, so it lands where the hull will
// be over it mid-stance). The legs are solved with an analytic two-bone IK whose knee bends up and out, like a harvestman's.
import { STRIDER_BUILD } from '../tuning';

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export type LegId = 'fl' | 'fr' | 'bl' | 'br';
export const LEG_IDS: readonly LegId[] = ['bl', 'fl', 'br', 'fr'];

/** Cycle phase at which each leg lifts: back left, front left, back right, front right, a quarter apart. */
export const LEG_PHASE: Readonly<Record<LegId, number>> = { bl: 0, fl: 0.25, br: 0.5, fr: 0.75 };
/** +1 for the right legs, -1 for the left (on the body's own right). */
export const LEG_SIDE: Readonly<Record<LegId, number>> = { fl: -1, bl: -1, fr: 1, br: 1 };
/** +1 for the front legs, -1 for the back. */
export const LEG_END: Readonly<Record<LegId, number>> = { fl: 1, fr: 1, bl: -1, br: -1 };

export interface GaitBuild {
  thigh: number;
  shin: number;
  hullHeight: number;
  hipX: number;
  hipZ: number;
  footX: number;
  footZ: number;
  stride: number;
  lift: number;
  swingFraction: number;
  bob: number;
}

export const DEFAULT_GAIT_BUILD: GaitBuild = { ...STRIDER_BUILD };

/** The hull's frame: where it stands (feet level, the root's position) and which way its forward points (yaw 0 faces -Z). */
export interface HullFrame {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export const forwardOf = (yaw: number): { x: number; z: number } => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });
/** The body's right (forward turned a quarter clockwise seen from above). */
export const rightOf = (yaw: number): { x: number; z: number } => ({ x: Math.cos(yaw), z: -Math.sin(yaw) });

/** A point in the hull frame (side metres to the right, along metres forward, up metres) in world space. */
export function framePoint(f: HullFrame, side: number, along: number, up: number): V3 {
  const fw = forwardOf(f.yaw);
  const rt = rightOf(f.yaw);
  return { x: f.x + rt.x * side + fw.x * along, y: f.y + up, z: f.z + rt.z * side + fw.z * along };
}

/** A leg's rest foot point on flat ground (no lead), world space; y is the frame's feet level. */
export function restFoot(f: HullFrame, leg: LegId, b: GaitBuild = DEFAULT_GAIT_BUILD): V3 {
  return framePoint(f, LEG_SIDE[leg] * b.footX, LEG_END[leg] * (b.hipZ + b.footZ), 0);
}

/** A leg's hip, world space, for a hull at `hullY` metres over the frame's feet level. */
export function hipPoint(f: HullFrame, leg: LegId, hullY: number, b: GaitBuild = DEFAULT_GAIT_BUILD): V3 {
  return framePoint(f, LEG_SIDE[leg] * b.hipX, LEG_END[leg] * b.hipZ, hullY);
}

/** True while `phase` (0..1, cyclic) is inside the leg's swing. */
export function inSwing(leg: LegId, phase: number, b: GaitBuild = DEFAULT_GAIT_BUILD): boolean {
  return swingProgress(leg, phase, b) !== null;
}

/** 0..1 through the leg's swing at `phase`, or null while it is planted. */
export function swingProgress(leg: LegId, phase: number, b: GaitBuild = DEFAULT_GAIT_BUILD): number | null {
  const u = (((phase - LEG_PHASE[leg]) % 1) + 1) % 1;
  return u < b.swingFraction ? u / b.swingFraction : null;
}

/** How many feet are in the air at `phase` (never more than one while `swingFraction` is under a quarter). */
export function feetInAir(phase: number, b: GaitBuild = DEFAULT_GAIT_BUILD): number {
  let n = 0;
  for (const leg of LEG_IDS) if (inSwing(leg, phase, b)) n++;
  return n;
}

export interface IkResult {
  knee: V3;
  /** The foot point actually reached (the target, or the nearest reachable point toward it). */
  foot: V3;
  /** True when the target was out of reach (too far or too close) and the foot was clamped. */
  clamped: boolean;
}

const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const mul = (a: V3, k: number): V3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a: V3): number => Math.hypot(a.x, a.y, a.z);
export const dist = (a: V3, b: V3): number => len(sub(a, b));

/**
 * Two-bone IK: hip, foot target, segment lengths and a pole (the side the knee bends toward). Returns the knee and the
 * reached foot. A target past `thigh + shin` (less a hair) is pulled in along the hip-to-target line; one closer than
 * `|thigh - shin|` is pushed out. The knee lies in the plane of the hip-to-foot line and the pole.
 */
export function solveLeg(hip: V3, target: V3, thigh: number, shin: number, pole: V3): IkResult {
  const eps = 1e-4;
  let d = sub(target, hip);
  let l = len(d);
  const maxL = thigh + shin - eps;
  const minL = Math.abs(thigh - shin) + eps;
  let clamped = false;
  if (l < 1e-6) {
    d = { x: 0, y: -1, z: 0 };
    l = 1;
  }
  const dir = mul(d, 1 / l);
  let reach = l;
  if (reach > maxL) {
    reach = maxL;
    clamped = true;
  } else if (reach < minL) {
    reach = minL;
    clamped = true;
  }
  const foot = add(hip, mul(dir, reach));
  // Law of cosines: the angle at the hip between the hip-to-foot line and the thigh.
  const cosA = Math.min(1, Math.max(-1, (thigh * thigh + reach * reach - shin * shin) / (2 * thigh * reach)));
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  // The pole's part across the hip-to-foot line: the knee's side. A pole along the line falls back to straight up.
  let across = sub(pole, mul(dir, dot(pole, dir)));
  if (len(across) < 1e-6) across = sub({ x: 0, y: 1, z: 0 }, mul(dir, dir.y));
  if (len(across) < 1e-6) across = { x: 1, y: 0, z: 0 };
  across = mul(across, 1 / len(across));
  const knee = add(hip, add(mul(dir, thigh * cosA), mul(across, thigh * sinA)));
  return { knee, foot, clamped };
}

/** The knee's pole for a leg: up and out to its own side (the harvestman stance). */
export function legPole(f: HullFrame, leg: LegId): V3 {
  const rt = rightOf(f.yaw);
  return { x: rt.x * LEG_SIDE[leg] * 0.4, y: 1, z: rt.z * LEG_SIDE[leg] * 0.4 };
}

export interface FootState {
  /** World contact point (planted) or current point (swinging). */
  at: V3;
  planted: boolean;
  from: V3;
  to: V3;
}

export interface GaitSample {
  phase: number;
  hullY: number;
  feet: Readonly<Record<LegId, Readonly<V3>>>;
}

/** Ground height at a point; defaults to the frame's feet level. */
export type GroundFn = (x: number, z: number) => number;

/**
 * The stateful gait. `step(frame, dt)` moves the cycle by the distance the hull travelled since the last step and places the
 * feet; `sample()` reads the result. `reset(frame)` plants every foot at its rest point (a spawn, a teleport).
 */
export class StriderGait {
  readonly build: GaitBuild;
  /** Starts between two swings (every foot down). */
  phase = 0.24;
  hullY: number;
  private readonly feet: Record<LegId, FootState>;
  private last: { x: number; z: number } | null = null;
  private ground: GroundFn | null;
  private time = 0;

  constructor(frame: HullFrame, build: GaitBuild = DEFAULT_GAIT_BUILD, ground: GroundFn | null = null) {
    this.build = build;
    this.ground = ground;
    this.hullY = build.hullHeight;
    this.feet = {} as Record<LegId, FootState>;
    for (const leg of LEG_IDS) {
      const at = this.onGround(restFoot(frame, leg, build));
      this.feet[leg] = { at, planted: true, from: { ...at }, to: { ...at } };
    }
    this.last = { x: frame.x, z: frame.z };
  }

  setGround(fn: GroundFn | null): void {
    this.ground = fn;
  }

  reset(frame: HullFrame): void {
    for (const leg of LEG_IDS) {
      const at = this.onGround(restFoot(frame, leg, this.build));
      this.feet[leg] = { at, planted: true, from: { ...at }, to: { ...at } };
    }
    this.last = { x: frame.x, z: frame.z };
  }

  foot(leg: LegId): Readonly<FootState> {
    return this.feet[leg];
  }

  sample(): GaitSample {
    return {
      phase: this.phase,
      hullY: this.hullY,
      feet: { fl: this.feet.fl.at, fr: this.feet.fr.at, bl: this.feet.bl.at, br: this.feet.br.at },
    };
  }

  /**
   * Advances the gait to the hull's new frame. `travel` defaults to the horizontal distance moved since the last step; a
   * jump of more than 6 m (a teleport, a respawn) re-plants every foot instead.
   */
  step(frame: HullFrame, dt: number): void {
    const b = this.build;
    this.time += Math.max(0, dt);
    const moved = this.last ? Math.hypot(frame.x - this.last.x, frame.z - this.last.z) : 0;
    this.last = { x: frame.x, z: frame.z };
    if (moved > 6) {
      this.reset(frame);
      return;
    }
    let advance = moved / b.stride;
    const walking = advance >= 1e-6;
    if (!walking) {
      // Standing: keep the cycle turning slowly only while a foot is far from its rest point (a turn on the spot), so it
      // steps round instead of twisting its legs.
      let worst = 0;
      for (const leg of LEG_IDS) {
        const r = restFoot(frame, leg, b);
        worst = Math.max(worst, Math.hypot(this.feet[leg].at.x - r.x, this.feet[leg].at.z - r.z));
      }
      const inSwingNow = LEG_IDS.some((leg) => inSwing(leg, this.phase, b));
      if (worst > b.stride * 0.35 || inSwingNow) advance = Math.max(0, dt) * 0.9;
    }
    // At most a fifth of a cycle per tick, so no swing is skipped.
    advance = Math.min(advance, 0.2);
    const before = this.phase;
    this.phase = (this.phase + advance) % 1;

    for (const leg of LEG_IDS) {
      const f = this.feet[leg];
      const u = swingProgress(leg, this.phase, b);
      const uBefore = swingProgress(leg, before, b);
      if (u !== null) {
        if (f.planted || (uBefore !== null && u < uBefore)) {
          // Lift off: from where it stands to a point ahead of its rest point by half a stance's travel.
          f.planted = false;
          f.from = { ...f.at };
        }
        const lead = walking ? (1 - b.swingFraction) * 0.5 * b.stride : 0;
        const fw = forwardOf(frame.yaw);
        const r = restFoot(frame, leg, b);
        f.to = this.onGround({ x: r.x + fw.x * lead, y: r.y, z: r.z + fw.z * lead });
        const k = smooth(u);
        const arc = Math.sin(Math.PI * u) * b.lift;
        f.at = {
          x: f.from.x + (f.to.x - f.from.x) * k,
          y: f.from.y + (f.to.y - f.from.y) * k + arc,
          z: f.from.z + (f.to.z - f.from.z) * k,
        };
      } else if (!f.planted) {
        // Touchdown.
        f.planted = true;
        f.at = { ...f.to };
      }
    }

    // The hull rides the planted feet: their mean ground level plus the build height, with a small bob on each step.
    let sum = 0;
    let n = 0;
    for (const leg of LEG_IDS) {
      if (!this.feet[leg].planted) continue;
      sum += this.feet[leg].at.y;
      n++;
    }
    const groundY = n > 0 ? sum / n : frame.y;
    const bob = Math.sin(this.phase * Math.PI * 8) * b.bob;
    this.hullY = groundY - frame.y + b.hullHeight + bob;
  }

  private onGround(p: V3): V3 {
    return this.ground ? { x: p.x, y: this.ground(p.x, p.z), z: p.z } : p;
  }
}

function smooth(u: number): number {
  const t = Math.min(1, Math.max(0, u));
  return t * t * (3 - 2 * t);
}
