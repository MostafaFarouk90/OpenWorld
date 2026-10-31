/**
 * Parameters of the Rime Hawk's procedural bird body. Pure data and arithmetic, no three.js. Lengths are metres at
 * `scale` 1; the model faces local -Z (the beak is at -Z, the tail at +Z), feet at y = 0.
 */
export interface HawkParams {
  /** Uniform scale of the whole rig. */
  scale: number;
  /** Tip to tip with the wings spread (m, scale 1). */
  wingspan: number;
  /** Beak-less body length, chest to tail root (m, scale 1). */
  bodyLength: number;
  /** Body and inner-wing colour (0xRRGGBB). */
  tint: number;
  /** Outer-wing (tip) colour. */
  wingTip: number;
  /** Beak and talon colour. */
  beak: number;
  /** Offsets idle motion so two hawks do not breathe in step. */
  seed: number;
}

/** The Rime Hawk preset: white-grey plumage, darker wing tips, yellow beak. */
export const HAWK: Readonly<HawkParams> = Object.freeze({
  scale: 1,
  wingspan: 1.6,
  bodyLength: 0.6,
  tint: 0xd8dde3,
  wingTip: 0x8a929c,
  beak: 0xc9a227,
  seed: 0,
});

export interface HawkDims {
  /** Body capsule radius. */
  bodyRadius: number;
  /** Straight part of the body capsule (between the end caps). */
  bodyStraight: number;
  /** Height of the body centre above the feet at rest. */
  bodyY: number;
  /** Shoulder offset from the centreline. */
  shoulderX: number;
  /** Length of the inner and the outer wing panel (equal). */
  panelLength: number;
  /** Wing chord (front to back). */
  chord: number;
  headRadius: number;
  beakLength: number;
  tailLength: number;
  /** Tip to tip when fully spread. */
  wingspan: number;
  /** Beak tip to tail tip. */
  length: number;
}

/** The hawk's proportions at the params' scale (the rig itself is built at scale 1 and scaled by the root). */
export function hawkDims(params: Pick<HawkParams, 'wingspan' | 'bodyLength'> = HAWK, scale = 1): HawkDims {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const bodyRadius = 0.1 * (params.bodyLength / 0.6);
  const bodyStraight = Math.max(0.05, params.bodyLength * 0.55 - 2 * bodyRadius);
  const shoulderX = bodyRadius * 0.85;
  const panelLength = Math.max(0.1, (params.wingspan / 2 - shoulderX) / 2);
  const headRadius = bodyRadius * 0.65;
  const beakLength = 0.09;
  const tailLength = params.bodyLength * 0.4;
  return {
    bodyRadius: bodyRadius * s,
    bodyStraight: bodyStraight * s,
    bodyY: bodyRadius * 2 * s,
    shoulderX: shoulderX * s,
    panelLength: panelLength * s,
    chord: panelLength * 0.75 * s,
    headRadius: headRadius * s,
    beakLength: beakLength * s,
    tailLength: tailLength * s,
    wingspan: (shoulderX + 2 * panelLength) * 2 * s,
    length: (params.bodyLength + beakLength) * s,
  };
}
