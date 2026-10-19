/**
 * Parameters of the shared procedural quadruped rig (Ember Hound, Ashmare). Pure data and arithmetic:
 * no three.js, so gait.ts can use the derived dimensions. All lengths are metres at `scale` 1; forward is -Z.
 */
export interface QuadrupedParams {
  /** Chest to rump along Z, including the rounded ends. */
  bodyLength: number;
  /** Body thickness (diameter of the torso capsule). */
  bodyHeight: number;
  /** Hip joint to ground with the legs straight (upper and lower segment are half each). */
  legLength: number;
  neckLength: number;
  /** Neck rise above horizontal at rest, radians (0 = straight ahead, PI/2 = straight up). */
  neckAngle: number;
  /** Head length scale: the skull is about this long, the snout adds half again. */
  headSize: number;
  /** Tail length; defaults to 0.6 x bodyLength. */
  tailLength?: number;
  /** Base colour of the hide (0xRRGGBB). */
  tint: number;
  /** Emissive colour at rest (0xRRGGBB); default black. */
  emissive?: number;
  /** Uniform scale of the whole rig (default 1). */
  scale?: number;
  /** Multiplies the gait speed thresholds (default 1; bigger animals switch gait at higher speeds). */
  gaitSpeedScale?: number;
  /** Absolute gait-change speeds (m/s, centre of each change) overriding the defaults; see `GaitTuning`. */
  gaitSpeeds?: { walkToTrot?: number; trotToCanter?: number; canterToGallop?: number };
}

/** Rig scale of Gaffer Grimtooth, the boss hound (thread 3b). */
export const GRIMTOOTH_SCALE = 1.8;
/** Rig scale of the R07 pup. */
export const PUP_SCALE = 0.5;

/** Ember Hound: a lean, low pack hunter. Walk 2.0 m/s, chase 5.5 m/s. */
export const HOUND: Readonly<QuadrupedParams> = Object.freeze({
  bodyLength: 0.95,
  bodyHeight: 0.38,
  legLength: 0.6,
  neckLength: 0.32,
  neckAngle: 0.55,
  headSize: 0.27,
  tailLength: 0.7,
  tint: 0x8a4a2a,
  emissive: 0x5a1800,
  scale: 1,
  gaitSpeedScale: 1,
});

/**
 * The Ashmare's full proportions at scale 1: a riding horse about 1.6 m to the saddle (the `saddle` socket sits on the
 * back at `legLength + 0.75 * bodyHeight`), 2.1 m of body, a raised neck and a long head. Gait changes are at the
 * horse's own speeds: it trots from about 4 m/s, canters at 9 and gallops at 12. Thread 20 adds only `tint` (and
 * `emissive`): `QuadrupedRig.build({ ...HORSE_PROPORTIONS, tint })`.
 */
export const HORSE_PROPORTIONS: Readonly<Omit<QuadrupedParams, 'tint' | 'emissive'>> = Object.freeze({
  bodyLength: 2.1,
  bodyHeight: 0.7,
  legLength: 1.07,
  neckLength: 0.75,
  neckAngle: 0.95,
  headSize: 0.55,
  tailLength: 0.95,
  scale: 1,
  // Walk below ~4, trot to ~7.5, then it canters at 9 m/s and gallops at 12 m/s.
  gaitSpeeds: Object.freeze({ walkToTrot: 4, trotToCanter: 7.5, canterToGallop: 10.5 }),
});

/** Derived rig-local dimensions (before `scale`); the rig builds from these and gait.ts grounds the pose with them. */
export interface QuadrupedDims {
  upperLen: number;
  lowerLen: number;
  legLen: number;
  /** Hip joint position relative to the spine joint. Front hips are at -Z. */
  hipY: number;
  hipX: number;
  hipZFront: number;
  hipZBack: number;
  /** Spine joint height with straight legs, feet at y = 0. */
  spineRestY: number;
  /** Torso capsule radius; the spine height when lying down. */
  bodyRadius: number;
  tailLen: number;
  neckLen: number;
  headSize: number;
  /** Neck and tail joint positions relative to the spine. */
  neckY: number;
  neckZ: number;
  tailY: number;
  tailZ: number;
  /** Rest rotations (radians about X): neck up, head counter-pitch, tail up. */
  restNeck: number;
  restHead: number;
  restTail: number;
}

/** @throws RangeError when a length is not a positive finite number. */
export function validateParams(p: QuadrupedParams): void {
  const positive = ['bodyLength', 'bodyHeight', 'legLength', 'neckLength', 'headSize'] as const;
  for (const k of positive) {
    const v = p[k];
    if (!(Number.isFinite(v) && v > 0)) throw new RangeError(`QuadrupedParams.${k} must be a positive finite number (got ${String(v)})`);
  }
  for (const k of ['tailLength', 'scale', 'gaitSpeedScale'] as const) {
    const v = p[k];
    if (v !== undefined && !(Number.isFinite(v) && v > 0)) throw new RangeError(`QuadrupedParams.${k} must be a positive finite number (got ${String(v)})`);
  }
  if (!Number.isFinite(p.neckAngle)) throw new RangeError('QuadrupedParams.neckAngle must be finite');
}

/** @throws RangeError for invalid params. */
export function quadrupedDims(p: QuadrupedParams): QuadrupedDims {
  validateParams(p);
  const bodyRadius = p.bodyHeight / 2;
  const hipY = -p.bodyHeight * 0.25;
  return {
    upperLen: p.legLength / 2,
    lowerLen: p.legLength / 2,
    legLen: p.legLength,
    hipY,
    hipX: p.bodyHeight * 0.36,
    hipZFront: -p.bodyLength * 0.3,
    hipZBack: p.bodyLength * 0.3,
    spineRestY: p.legLength - hipY,
    bodyRadius,
    tailLen: p.tailLength ?? p.bodyLength * 0.6,
    neckLen: p.neckLength,
    headSize: p.headSize,
    neckY: p.bodyHeight * 0.2,
    neckZ: -(p.bodyLength / 2 - bodyRadius * 0.6),
    tailY: p.bodyHeight * 0.15,
    tailZ: p.bodyLength / 2 - bodyRadius * 0.6,
    restNeck: p.neckAngle,
    restHead: -p.neckAngle * 0.7,
    restTail: 0.5,
  };
}
