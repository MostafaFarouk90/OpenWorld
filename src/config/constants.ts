// Reference constants from the approved technical spec (section 4).

/** Simulation loop: fixed timestep with interpolation accumulator. */
export const FIXED_TIMESTEP = 1 / 60;
/** Clamp for a single frame's elapsed time, so a stalled tab does not trigger a spiral of catch-up steps. */
export const MAX_FRAME_TIME = 0.25;

/** Rapier KinematicCharacterController settings. */
export const CHARACTER_CONTROLLER = {
  offset: 0.01,
  maxSlopeClimbAngle: (45 * Math.PI) / 180,
  minSlopeSlideAngle: (30 * Math.PI) / 180,
  snapToGround: 0.5,
  autoStep: { maxHeight: 0.4, minWidth: 0.2, includeDynamicBodies: false },
} as const;

/** Audio mixing and spatialization. */
export const AUDIO = {
  stemCrossfadeSeconds: 0.4,
  rolloffFactor: 1.5,
  distanceModel: 'exponential',
} as const;

/** Quadtree LOD terrain chunk size range in metres. */
export const TERRAIN = {
  minChunkSize: 100,
  maxChunkSize: 3200,
  workerCount: 2,
} as const;
