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

/** Quadtree LOD terrain. Distances and sizes in metres. */
export const TERRAIN = {
  /** Smallest (most detailed) chunk edge length: the quadtree's leaf level. */
  minChunkSize: 100,
  /** Root chunk edge length. 3200 / 100 gives six LOD levels. */
  maxChunkSize: 3200,
  /** Grid cells along each chunk edge, at every LOD level (100 m chunk = 1.56 m spacing). */
  chunkSegments: 64,
  /** A node splits when the camera is closer than `size * lodSplitFactor` to its footprint. */
  lodSplitFactor: 1.6,
  /** Root tiles whose footprint lies within this horizontal radius of the camera are streamed. */
  viewDistance: 4800,
  /** Skirt depth as a fraction of chunk size, so coarse chunks get deeper skirts. */
  skirtDepthRatio: 0.04,
  /** Lower bound on skirt depth for the finest chunks. */
  minSkirtDepth: 2,
  /** Web Workers building chunk geometry (clamped to 1-4 and to hardwareConcurrency - 1). */
  workerCount: 2,
  /** Edge length of each square physics heightfield patch around the player. */
  colliderPatchSize: 200,
  /** Cells per patch edge: 1.5625 m spacing, matching the finest render LOD. */
  colliderPatchCells: 128,
  /** Patches kept around the player's patch in each direction (1 = a 3 x 3 block). */
  colliderPatchRadius: 1,
  /** Seed for the procedural placeholder heightmap. */
  seed: 1337,
} as const;

/** Player capsule and movement tuning (not in the spec; game-feel defaults). */
export const PLAYER = {
  /** Capsule radius and half-height of the cylindrical part; total height = 2 * (halfHeight + radius) = 1.8 m. */
  radius: 0.35,
  halfHeight: 0.55,
  walkSpeed: 4.5,
  sprintSpeed: 7.5,
  jumpSpeed: 6.5,
  /** Downward acceleration applied to the kinematic player, in m/s². */
  gravity: 20,
  /** Terminal fall speed, in m/s. */
  maxFallSpeed: 40,
} as const;

/** World gravity for dynamic rigid bodies, in m/s². */
export const WORLD_GRAVITY = { x: 0, y: -9.81, z: 0 } as const;

/** Third-person follow camera. */
export const CAMERA = {
  distance: 5,
  minDistance: 2,
  maxDistance: 12,
  /** Height above the player's feet the camera orbits around, in metres. */
  targetHeight: 1.5,
  minPitch: -1.2,
  maxPitch: 0.6,
  mouseSensitivity: 0.0025,
  /** Gap kept between the camera and any collider it would otherwise clip into. */
  collisionMargin: 0.2,
} as const;
