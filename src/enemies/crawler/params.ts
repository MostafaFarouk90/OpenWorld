/**
 * Parameters of the Slag Crawler's procedural six-legged body (design 10 row 8). Pure data and arithmetic,
 * no three.js. Lengths are metres at `scale` 1; the model faces local -Z (yaw 0 faces -Z), the head is at -Z.
 */
export interface CrawlerParams {
  /** Uniform scale of the whole rig. */
  scale: number;
  /** Basalt colour (0xRRGGBB). */
  tint: number;
  /** Emissive base and seam colour (0xRRGGBB). */
  emissive: number;
  /** Offsets the object-space seam pattern so two crawlers do not look identical. */
  seed: number;
}

/** The Slag Crawler preset: dark basalt with glowing slag-orange seams. */
export const CRAWLER: Readonly<CrawlerParams> = Object.freeze({
  scale: 1,
  tint: 0x2b2724,
  emissive: 0x5a1800,
  seed: 0,
});

export interface CrawlerDims {
  bodyLength: number;
  bodyWidth: number;
  bodyHeight: number;
  /** Hip x offset from the body axis. */
  hipX: number;
  /** Hip z offsets, front to rear. */
  hipZ: readonly [number, number, number];
  upperLen: number;
  lowerLen: number;
  /** Outward angle of the upper segment from vertical at rest, radians. */
  restHip: number;
  /** Body pivot height above the feet at rest. */
  bodyY: number;
  /** Hip height relative to the body pivot. */
  hipY: number;
  headZ: number;
}

export function crawlerDims(): CrawlerDims {
  const upperLen = 0.25;
  const lowerLen = 0.32;
  const restHip = 0.9;
  const bodyY = 0.5;
  const drop = upperLen * Math.cos(restHip) + lowerLen;
  return {
    bodyLength: 1.4,
    bodyWidth: 0.7,
    bodyHeight: 0.6,
    hipX: 0.26,
    hipZ: [-0.4, 0, 0.4],
    upperLen,
    lowerLen,
    restHip,
    bodyY,
    hipY: drop - bodyY,
    headZ: -0.76,
  };
}
