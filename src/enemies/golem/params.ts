/**
 * Parameters and fixed dimensions of the Cinder Golem rig. Pure data. All lengths are metres at `scale` 1
 * (3.2 m tall); the model faces local -Z (yaw 0), so its back, with the core, is +Z and its right is +X.
 */
export interface GolemParams {
  /** Uniform scale of the whole rig (1 = 3.2 m tall; the Emberwright capstone uses 2). */
  scale: number;
  /** Base colour of the stone (0xRRGGBB). */
  tint: number;
  /** Crack and core glow colour (0xRRGGBB). */
  emissive: number;
  /** Seeds the piece layout; the same seed builds the same golem. */
  seed: number;
}

/** The Cinder Golem preset. */
export const GOLEM: Readonly<GolemParams> = Object.freeze({
  scale: 1,
  tint: 0x4d423a,
  emissive: 0xff6a1a,
  seed: 1337,
});

/** Joint layout at scale 1 (rest pose). */
export const GOLEM_DIMS = Object.freeze({
  hipHeight: 1.2,
  thigh: 0.6,
  shin: 0.6,
  hipX: 0.38,
  shoulderX: 0.9,
  shoulderY: 1.3,
  headY: 1.5,
  armLength: 1.5,
  /** The core, in torso-local space: on the back (+Z). */
  core: Object.freeze({ x: 0, y: 0.9, z: 0.5, radius: 0.26 }),
  height: 3.2,
});
