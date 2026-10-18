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

/** KayKit Knight avatar and animation blending (game-feel defaults, measured from Knight.glb where noted). */
export const KNIGHT = {
  /** Knight.glb is about 2.3 m tall; this brings it to the 1.8 m capsule. */
  modelScale: 0.78,
  /** Default crossfade between states, in seconds. */
  fadeSeconds: 0.2,
  /** Faster crossfades into reactive states. */
  fadeIntoJumpSeconds: 0.08,
  fadeIntoLandSeconds: 0.08,
  fadeIntoAttackSeconds: 0.1,
  fadeOutOfAttackSeconds: 0.25,
  /** Horizontal speed thresholds with hysteresis, in m/s (walk 4.5, sprint 7.5). */
  walkEnterSpeed: 0.5,
  walkExitSpeed: 0.3,
  runEnterSpeed: 6,
  runExitSpeed: 5.5,
  /** Upward speed that counts as a jump rather than leaving the ground on a slope, in m/s. */
  jumpDetectSpeed: 2,
  /** Ungrounded time before falling counts as airborne (ignores single-tick ground losses on slopes). */
  airborneDelay: 0.12,
  /** Playback rate range for walk and run loops, which follow the actual speed. */
  minLoopRate: 0.5,
  maxLoopRate: 1.5,
  /** A loop must weigh at least this much in the blend to emit footsteps. */
  footstepMinWeight: 0.5,
  /** Fall speed above which landing plays a heavier thud, in m/s. */
  hardLandingSpeed: 6,
  /** Volumes of the footstep and landing sounds. */
  footstepVolume: 0.6,
  landVolume: 0.8,
} as const;

/** Open-world scene. */
export const WORLD = {
  /** Spawn position on the flattened meadow (height comes from the terrain). */
  spawnX: 0,
  spawnZ: 0,
  /** Half-size of the sun's shadow camera box around the player, in metres. */
  shadowHalfSize: 40,
  /** Per-tick time budget for building terrain collider patches, in milliseconds. */
  colliderBuildBudgetMs: 2,
} as const;

/**
 * v0.5: the playable world box in engine metres (+Z north). It holds Brightwater and the whole Harrowmark region
 * box (x 6500..10500, z 0..4000); the map (thread 8) and the terrain shaping validator read it.
 */
export const WORLD_BOUNDS = { minX: -2000, maxX: 10500, minZ: -2000, maxZ: 4500 } as const;

/** Combat hit detection (game-feel defaults; not in the spec). */
export const COMBAT = {
  baseDamage: 10,
  /** Damage multiplier per hurtbox name (see HURTBOX_NAMES); unknown names use 1. */
  boneMultipliers: {
    head: 2.0,
    torso: 1.0,
    abdomen: 1.0,
    hips: 0.8,
    upperArmL: 0.75,
    upperArmR: 0.75,
    lowerArmL: 0.75,
    lowerArmR: 0.75,
    upperLegL: 0.6,
    upperLegR: 0.6,
    lowerLegL: 0.6,
    lowerLegR: 0.6,
  } as Readonly<Record<string, number>>,
  /** Capsule radial segments and rings per hemisphere of the low-poly hurtbox meshes. */
  hurtboxRadialSegments: 8,
  hurtboxHemisphereRings: 2,
  /** Seconds a struck hurtbox stays highlighted in the demo. */
  hitFlashSeconds: 0.2,
  /** Demo attack clip and its active window as normalised clip time (start, end), matching animation-events.md. */
  demoClip: '1H_Melee_Attack_Slice_Horizontal',
  demoWindow: { start: 0.15, end: 0.36 },
  /** Clip a struck training dummy plays before returning to Idle, and the crossfade into and out of it. */
  dummyReactionClip: 'Hit_A',
  dummyReactionFadeSeconds: 0.08,
  /** Training dummies in the world scene: offset from the spawn in metres, and yaw (they face the spawn). */
  dummies: [
    { x: 0, z: -2.2 },
    { x: 3.5, z: -3.5 },
  ] as ReadonlyArray<{ x: number; z: number }>,
  /** Floating damage numbers: lifetime, rise in metres, and the most shown at once. */
  damageNumberSeconds: 0.9,
  damageNumberRise: 1.2,
  maxDamageNumbers: 16,
  /** Volume of the positional hit clang. */
  hitSoundVolume: 0.8,
} as const;
