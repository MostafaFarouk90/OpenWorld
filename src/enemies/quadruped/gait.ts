/**
 * Pure quadruped gait and pose math (no three.js). Angles are radians about the rig's X axis, as the rig's
 * joints use them: for legs a positive angle swings the foot forward (-Z) and a negative lower angle bends
 * the foot back; for the body a positive pitch lifts the nose; neck/head positive lift the nose; tail
 * positive raises it.
 *
 * Locomotion: `advancePhase` integrates a stride frequency that is a continuous function of speed, so the
 * phase never jumps when the speed changes; `locomotionPose` blends walk, trot and gallop by speed weights
 * (and fades to the idle pose near zero speed), so the leg angles are continuous too.
 */
import type { QuadrupedDims } from './params';

export type LegId = 'FL' | 'FR' | 'BL' | 'BR';
export const LEG_IDS: readonly LegId[] = ['FL', 'FR', 'BL', 'BR'];
export type GaitName = 'walk' | 'trot' | 'gallop';
export const GAIT_NAMES: readonly GaitName[] = ['walk', 'trot', 'gallop'];

const TAU = Math.PI * 2;

export interface LegAngles {
  /** Hip swing (positive = foot forward). */
  upper: number;
  /** Knee bend relative to the upper segment (negative = foot back). */
  lower: number;
}

export interface Pose {
  /** Extra height above the grounded stance, in leg lengths (leaps, gallop flight). */
  lift: number;
  /** 0..1: lies down; blends the grounded stance height to the torso resting on the ground. */
  fall: number;
  pitch: number;
  roll: number;
  neck: number;
  head: number;
  tail: number;
  tailSway: number;
  legs: Record<LegId, LegAngles>;
}

export function clonePose(p: Pose): Pose {
  return {
    lift: p.lift,
    fall: p.fall,
    pitch: p.pitch,
    roll: p.roll,
    neck: p.neck,
    head: p.head,
    tail: p.tail,
    tailSway: p.tailSway,
    legs: { FL: { ...p.legs.FL }, FR: { ...p.legs.FR }, BL: { ...p.legs.BL }, BR: { ...p.legs.BR } },
  };
}

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const num = (x: number): number => (Number.isFinite(x) ? x : 0);

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** `a` to `b` by `k` (clamped to 0..1) into `out` (a new pose when omitted). */
export function blendPose(a: Pose, b: Pose, k: number, out: Pose = clonePose(a)): Pose {
  const t = clamp01(num(k));
  out.lift = lerp(a.lift, b.lift, t);
  out.fall = lerp(a.fall, b.fall, t);
  out.pitch = lerp(a.pitch, b.pitch, t);
  out.roll = lerp(a.roll, b.roll, t);
  out.neck = lerp(a.neck, b.neck, t);
  out.head = lerp(a.head, b.head, t);
  out.tail = lerp(a.tail, b.tail, t);
  out.tailSway = lerp(a.tailSway, b.tailSway, t);
  for (const id of LEG_IDS) {
    out.legs[id].upper = lerp(a.legs[id].upper, b.legs[id].upper, t);
    out.legs[id].lower = lerp(a.legs[id].lower, b.legs[id].lower, t);
  }
  return out;
}

function makePose(partial: Partial<Omit<Pose, 'legs'>>, legs: Record<LegId, LegAngles>): Pose {
  return { lift: 0, fall: 0, pitch: 0, roll: 0, neck: 0, head: 0, tail: 0, tailSway: 0, ...partial, legs };
}

const REST_FORE: LegAngles = { upper: 0.04, lower: -0.04 };
const REST_HIND: LegAngles = { upper: 0.22, lower: -0.45 };
const restLegs = (): Record<LegId, LegAngles> => ({
  FL: { ...REST_FORE },
  FR: { ...REST_FORE },
  BL: { ...REST_HIND },
  BR: { ...REST_HIND },
});

// ---------------------------------------------------------------------------------------------- gaits

/** Phase offsets (fractions of a cycle) per leg. Walk: lateral sequence; trot: diagonal pairs; gallop: rotary-ish. */
export const GAIT_OFFSETS: Readonly<Record<GaitName, Readonly<Record<LegId, number>>>> = {
  walk: { FL: 0, BR: 0.25, FR: 0.5, BL: 0.75 },
  trot: { FL: 0, BR: 0, FR: 0.5, BL: 0.5 },
  gallop: { BL: 0, BR: 0.1, FL: 0.5, FR: 0.6 },
};

interface GaitShape {
  /** Metres travelled per gait cycle, in leg lengths. */
  stride: number;
  swing: number;
  knee: number;
  pitch: number;
  roll: number;
  bob: number;
  neck: number;
}
const SHAPES: Readonly<Record<GaitName, GaitShape>> = {
  walk: { stride: 2.2, swing: 0.34, knee: 0.55, pitch: 0.02, roll: 0.03, bob: 0.02, neck: 0.05 },
  trot: { stride: 3.5, swing: 0.5, knee: 0.75, pitch: 0.03, roll: 0.015, bob: 0.05, neck: 0.04 },
  gallop: { stride: 5.5, swing: 0.85, knee: 0.95, pitch: 0.16, roll: 0, bob: 0.2, neck: 0.12 },
};

export interface GaitTuning {
  /** Speed (m/s) at which walk gives way to trot, and trot to gallop; the change is spread over `blend`. */
  walkToTrot: number;
  trotToGallop: number;
  blend: number;
  /** Multiplies the thresholds (QuadrupedParams.gaitSpeedScale). */
  speedScale: number;
  /** The gait fades into the idle pose between these speeds (idle below `idleBelow`, full gait above `moveAbove`). */
  idleBelow: number;
  moveAbove: number;
}
export const DEFAULT_TUNING: Readonly<GaitTuning> = {
  walkToTrot: 2.8,
  trotToGallop: 4.8,
  blend: 1,
  speedScale: 1,
  idleBelow: 0.05,
  moveAbove: 0.5,
};

export type GaitWeights = Record<GaitName, number>;

/** Smooth weights of the three gaits at a speed; always sum to 1. Non-finite or negative speed counts as 0. */
export function gaitWeights(speed: number, tuning: Readonly<GaitTuning> = DEFAULT_TUNING): GaitWeights {
  const sc = tuning.speedScale > 0 ? tuning.speedScale : 1;
  const s = Number.isFinite(speed) && speed > 0 ? speed / sc : 0;
  const half = Math.max(1e-6, tuning.blend / 2);
  const t1 = smoothstep(tuning.walkToTrot - half, tuning.walkToTrot + half, s);
  const t2 = smoothstep(tuning.trotToGallop - half, tuning.trotToGallop + half, s);
  const gallop = t1 * t2;
  return { walk: 1 - t1, trot: t1 - gallop, gallop };
}

/** The gait with the largest weight at a speed. */
export function dominantGait(speed: number, tuning: Readonly<GaitTuning> = DEFAULT_TUNING): GaitName {
  const w = gaitWeights(speed, tuning);
  return w.gallop >= w.trot && w.gallop >= w.walk ? 'gallop' : w.trot >= w.walk ? 'trot' : 'walk';
}

/** Gait cycles per second at a speed: speed over the weighted stride length. Continuous in speed; 0 at rest. */
export function strideFrequency(speed: number, legLength: number, tuning: Readonly<GaitTuning> = DEFAULT_TUNING): number {
  if (!(Number.isFinite(speed) && speed > 0) || !(legLength > 0)) return 0;
  const w = gaitWeights(speed, tuning);
  const stride = (w.walk * SHAPES.walk.stride + w.trot * SHAPES.trot.stride + w.gallop * SHAPES.gallop.stride) * legLength;
  return speed / stride;
}

/** Wraps to [0, 1). */
export function wrapPhase(p: number): number {
  if (!Number.isFinite(p)) return 0;
  const w = p - Math.floor(p);
  return w >= 1 ? 0 : w;
}

/**
 * Advances the gait phase by `dt` at `speed`. A non-positive or non-finite `dt` or `speed` leaves it unchanged.
 * The phase is integrated, so a speed change alters only how fast it advances, never its value.
 */
export function advancePhase(phase: number, speed: number, dt: number, legLength: number, tuning: Readonly<GaitTuning> = DEFAULT_TUNING): number {
  if (!(dt > 0) || !Number.isFinite(dt)) return wrapPhase(phase);
  return wrapPhase(phase + dt * strideFrequency(speed, legLength, tuning));
}

/** Per-leg phase (0..1) of a gait at a body phase. */
export function legPhases(gait: GaitName, phase: number): Record<LegId, number> {
  const o = GAIT_OFFSETS[gait];
  return { FL: wrapPhase(phase + o.FL), FR: wrapPhase(phase + o.FR), BL: wrapPhase(phase + o.BL), BR: wrapPhase(phase + o.BR) };
}

function gaitPose(gait: GaitName, phase: number): Pose {
  const sh = SHAPES[gait];
  const legs = {} as Record<LegId, LegAngles>;
  const ph = legPhases(gait, phase);
  for (const id of LEG_IDS) {
    const a = ph[id] * TAU;
    const rest = id[0] === 'F' ? REST_FORE : REST_HIND;
    legs[id] = {
      upper: rest.upper * 0.5 + sh.swing * Math.sin(a),
      lower: rest.lower * 0.5 - sh.knee * Math.max(0, Math.cos(a)),
    };
  }
  // Two body bounces per cycle in the walk and trot, one flight phase per cycle in the gallop.
  const bounce = gait === 'gallop' ? Math.max(0, Math.sin(phase * TAU + 0.6)) : 0.5 - 0.5 * Math.cos(phase * TAU * 2);
  const pitch = sh.pitch * Math.sin(phase * TAU + (gait === 'gallop' ? 0.4 : 0));
  return makePose(
    {
      lift: sh.bob * bounce,
      pitch,
      roll: sh.roll * Math.sin(phase * TAU),
      neck: -pitch * 0.8 + sh.neck * Math.sin(phase * TAU * 2),
      head: pitch * 0.4,
      tail: 0.1 + (gait === 'gallop' ? 0.25 : 0),
      tailSway: 0.3 * Math.sin(phase * TAU),
    },
    legs,
  );
}

/**
 * The walking/trotting/galloping pose at a gait phase and speed: the three gaits blended by weight, faded
 * into the idle pose below `moveAbove`. Continuous in both arguments. `t` (seconds) animates the idle part.
 */
export function locomotionPose(phase: number, speed: number, tuning: Readonly<GaitTuning> = DEFAULT_TUNING, t = 0): Pose {
  const w = gaitWeights(speed, tuning);
  let pose: Pose | null = null;
  let acc = 0;
  for (const g of GAIT_NAMES) {
    const wg = w[g];
    if (wg <= 0) continue;
    const p = gaitPose(g, phase);
    if (!pose) {
      pose = p;
      acc = wg;
    } else {
      acc += wg;
      blendPose(pose, p, wg / acc, pose);
    }
  }
  const base = pose ?? gaitPose('walk', phase);
  const move = smoothstep(tuning.idleBelow, tuning.moveAbove, num(speed));
  return move >= 1 ? base : blendPose(idlePose(t), base, move);
}

// ---------------------------------------------------------------------------------------------- poses

/** Standing, breathing; `t` is seconds. */
export function idlePose(t = 0): Pose {
  const breathe = Math.sin(t * 2.1);
  return makePose(
    {
      lift: 0.004 * breathe,
      pitch: 0.004 * breathe,
      neck: 0.03 * Math.sin(t * 0.7),
      head: 0.02 * Math.sin(t * 0.7 + 1),
      tail: 0.05,
      tailSway: 0.18 * Math.sin(t * 1.3),
    },
    restLegs(),
  );
}

/** Pounce windup: 0 = standing, 1 = fully coiled (shoulders and hips low, head down, tail raised). */
export function crouchPose(k: number): Pose {
  const c = clamp01(num(k));
  const rest = restLegs();
  return makePose(
    { pitch: -0.1 * c, neck: -0.35 * c, head: 0.25 * c, tail: 0.1 + 0.35 * c, tailSway: 0.12 * Math.sin(c * 9) * c },
    {
      FL: { upper: lerp(rest.FL.upper, 0.75, c), lower: lerp(rest.FL.lower, -1.15, c) },
      FR: { upper: lerp(rest.FR.upper, 0.75, c), lower: lerp(rest.FR.lower, -1.15, c) },
      BL: { upper: lerp(rest.BL.upper, 1.0, c), lower: lerp(rest.BL.lower, -1.7, c) },
      BR: { upper: lerp(rest.BR.upper, 1.0, c), lower: lerp(rest.BR.lower, -1.7, c) },
    },
  );
}

/** Peak height of the leap arc, in leg lengths. */
export const POUNCE_PEAK_LIFT = 1.1;

/**
 * Leap arc, `u` 0 (takeoff, equals the full crouch) to 1 (landing, a half-crouch). Lift follows a parabola;
 * legs stretch fore and aft in flight, nose rises on takeoff and drops on landing.
 */
export function pouncePose(u: number): Pose {
  const x = clamp01(num(u));
  const air = makePose(
    { pitch: 0.32 * Math.cos(Math.PI * x), neck: -0.15 - 0.15 * x, head: 0.1, tail: 0.5, tailSway: 0 },
    {
      FL: { upper: 0.95, lower: -0.15 },
      FR: { upper: 0.9, lower: -0.2 },
      BL: { upper: -0.85, lower: -0.1 },
      BR: { upper: -0.8, lower: -0.15 },
    },
  );
  const takeoff = blendPose(crouchPose(1), air, smoothstep(0, 0.25, x));
  const out = blendPose(takeoff, crouchPose(0.5), smoothstep(0.8, 1, x));
  out.lift = POUNCE_PEAK_LIFT * 4 * x * (1 - x);
  return out;
}

/** Howl: head thrown up, chest lifted, tail raised; `k` 0..1 how far, `t` seconds for the tremble. */
export function howlPose(k: number, t = 0): Pose {
  const c = clamp01(num(k));
  const rest = restLegs();
  return makePose(
    { pitch: 0.16 * c, roll: 0.012 * c * Math.sin(t * 22), neck: 0.8 * c, head: 0.55 * c, tail: 0.05 + 0.5 * c, tailSway: 0.1 * c * Math.sin(t * 3) },
    {
      FL: { upper: lerp(rest.FL.upper, -0.1, c), lower: lerp(rest.FL.lower, -0.05, c) },
      FR: { upper: lerp(rest.FR.upper, -0.1, c), lower: lerp(rest.FR.lower, -0.05, c) },
      BL: { upper: lerp(rest.BL.upper, 0.3, c), lower: lerp(rest.BL.lower, -0.55, c) },
      BR: { upper: lerp(rest.BR.upper, 0.3, c), lower: lerp(rest.BR.lower, -0.55, c) },
    },
  );
}

/** Calm: head lowered towards the ground, tail low, relaxed legs; `k` 0..1. */
export function headLowerPose(k: number, t = 0): Pose {
  const c = clamp01(num(k));
  return makePose(
    { pitch: -0.06 * c, lift: 0.004 * Math.sin(t * 2.1) * c, neck: -0.8 * c, head: 0.35 * c, tail: 0.05 - 0.45 * c, tailSway: 0.08 * c * Math.sin(t * 1.1) },
    restLegs(),
  );
}

/** Knocked onto its side, legs stiff; `k` 0..1 (a fall that completes at 1 and then holds). */
export function knockdownPose(k: number): Pose {
  const c = clamp01(num(k));
  const rest = restLegs();
  return makePose(
    {
      fall: smoothstep(0.2, 1, c),
      roll: 1.45 * c,
      lift: 0.25 * Math.sin(Math.PI * Math.min(1, c * 1.4)),
      pitch: 0.1 * c,
      neck: 0.1 * c,
      head: -0.1 * c,
      tail: 0.1 - 0.2 * c,
    },
    {
      FL: { upper: lerp(rest.FL.upper, 0.55, c), lower: lerp(rest.FL.lower, -0.15, c) },
      FR: { upper: lerp(rest.FR.upper, 0.45, c), lower: lerp(rest.FR.lower, -0.2, c) },
      BL: { upper: lerp(rest.BL.upper, -0.35, c), lower: lerp(rest.BL.lower, -0.1, c) },
      BR: { upper: lerp(rest.BR.upper, -0.45, c), lower: lerp(rest.BR.lower, -0.15, c) },
    },
  );
}

/** Bite lunge, `u` 0..1: draws the head back, snaps it forward and down, recovers. */
export function bitePose(u: number): Pose {
  const x = clamp01(num(u));
  const draw = smoothstep(0, 0.3, x) * (1 - smoothstep(0.3, 0.45, x));
  const snap = smoothstep(0.3, 0.5, x) * (1 - smoothstep(0.6, 1, x));
  const p = makePose({ pitch: 0.05 * draw - 0.14 * snap, neck: 0.4 * draw - 0.6 * snap, head: 0.2 * draw + 0.1 * snap, tail: 0.1 + 0.2 * snap }, restLegs());
  p.legs.FL.upper += 0.5 * snap;
  p.legs.FR.upper += 0.4 * snap;
  p.legs.FL.lower -= 0.2 * snap;
  p.legs.FR.lower -= 0.2 * snap;
  return p;
}

/** Brief hit reaction, `u` 0..1. */
export function flinchPose(u: number): Pose {
  const x = clamp01(num(u));
  const s = Math.sin(Math.PI * x);
  return makePose({ pitch: -0.12 * s, neck: 0.25 * s, head: -0.2 * s, lift: -0.01 * s, tail: 0.1 + 0.2 * s }, restLegs());
}

// ---------------------------------------------------------------------------------------------- grounding

/**
 * Spine joint height that puts the lowest foot of a pose on y = 0 (pitch included, roll ignored), eased to
 * the torso resting on the ground by `pose.fall`, plus `pose.lift` leg lengths.
 */
export function spineHeight(pose: Pose, dims: QuadrupedDims): number {
  const cp = Math.cos(pose.pitch);
  const sp = Math.sin(pose.pitch);
  let lowest = Infinity;
  for (const id of LEG_IDS) {
    const hz = id[0] === 'F' ? dims.hipZFront : dims.hipZBack;
    const hipY = dims.hipY * cp - hz * sp;
    const a = pose.legs[id].upper + pose.pitch;
    const b = a + pose.legs[id].lower;
    lowest = Math.min(lowest, hipY - dims.upperLen * Math.cos(a) - dims.lowerLen * Math.cos(b));
  }
  const grounded = -lowest;
  return lerp(grounded, dims.bodyRadius * 1.05, clamp01(pose.fall)) + pose.lift * dims.legLen;
}
