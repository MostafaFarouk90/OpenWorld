/**
 * Parameters of the Fen Leech's procedural capsule-chain body. Pure data and arithmetic, no three.js. Lengths
 * are metres at `scale` 1; the model faces local -Z (yaw 0 faces -Z), the head is at -Z.
 */
export interface LeechParams {
  /** Uniform scale of the whole rig. */
  scale: number;
  /** Back colour (0xRRGGBB). */
  tint: number;
  /** Belly colour (0xRRGGBB). */
  belly: number;
  /** Offsets the wave phase so two leeches do not swim in step. */
  seed: number;
}

/** The Fen Leech preset: dark olive back, pale ochre belly. */
export const LEECH: Readonly<LeechParams> = Object.freeze({
  scale: 1,
  tint: 0x3b4a2a,
  belly: 0xb89a5a,
  seed: 0,
});

export interface LeechDims {
  /** Number of chain segments, head (0) to tail. */
  count: number;
  /** Radius of each segment, head to tail. */
  radii: number[];
  /** Distance between neighbouring segment centres. */
  spacing: number;
  /** Half length of each segment's ellipsoid along the chain. */
  halfLength: number;
  /** Total length, head tip to tail tip. */
  length: number;
}

const RADII = [0.2, 0.25, 0.29, 0.3, 0.28, 0.23, 0.16, 0.09];
const SPACING = 0.19;
const HALF_LENGTH = 0.15;

/** The leech's proportions at `scale` (default 1): 8 segments, about 1.6 m long at scale 1. */
export function leechDims(scale = 1): LeechDims {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const count = RADII.length;
  return {
    count,
    radii: RADII.map((r) => r * s),
    spacing: SPACING * s,
    halfLength: HALF_LENGTH * s,
    length: ((count - 1) * SPACING + 2 * HALF_LENGTH) * s,
  };
}
