/** The Ashmare's numbers (plans/slice-2-ashmare.md section 2; design 4: canter 9 m/s, short gallop 12 m/s). */
export const MOUNT_TUNING = {
  mountId: 'ashmare',
  /** The story flag thread 6 sets when M10 awards the horse; thread 20 only reads it. */
  flag: 'story.m10.ashmare',
  /** Where an unplaced horse stands: thread 17's open yard north of Wace Carter's stable hall (stables.test.ts pins it). */
  stablesAnchor: 'harrowmark.stables.yard',

  walkSpeed: 3.5,
  canterSpeed: 9,
  gallopSpeed: 12,
  reverseSpeed: 2,
  /** Input more than this far from the heading (radians) at under `reverseBelow` m/s backs the horse up. */
  reverseAngle: (135 * Math.PI) / 180,
  reverseBelow: 3,
  acceleration: 5,
  braking: 12,
  /** Turn rate (rad/s) at a standstill and at the gallop, eased by speed between them. */
  turnRateSlow: (200 * Math.PI) / 180,
  turnRateFast: (70 * Math.PI) / 180,
  /** Above this speed a turn wider than `brakeTurnAngle` brakes first. */
  brakeTurnAbove: 6,
  brakeTurnAngle: (100 * Math.PI) / 180,

  staminaMax: 100,
  gallopDrain: 12,
  staminaRegen: 20,
  regenDelay: 1,
  /** An empty bar means exhausted until stamina is back to this. */
  exhaustedUntil: 35,

  /** Speed cap while the collider patch ahead is not resident (the player's sprint). */
  unresidentCap: 7.5,
  residentLookahead: 30,

  /** Forward and rear casts: a ball of this radius at the chest and at head height (under the capsule's 0.35, so a wall the capsule slides along is not a hit). */
  castRadius: 0.3,
  castChestHeight: 1.0,
  castHeadHeight: 2.8,
  /** Half the body length: how far the nose (and the rump) sit from the capsule centre. */
  noseReach: 1.2,
  rumpReach: 1.0,

  /** Mount when the horse is within this distance (3D) of the player's feet. */
  mountRadius: 3.5,
  whistleRange: 80,
  /** The whistle spawn behind the player, and the arrival spot beside. */
  spawnBehind: 12,
  arriveBeside: 2,
  /** A summoned horse runs at canter; it gives up and pops beside the player after this many seconds. */
  arriveTimeout: 12,
  /** Feet more than this above the ground under them: the horse waits at street level (rooftops, walls). */
  sameLevel: 1.5,
  /** Ground under a spawn candidate must be within this of the player's feet. */
  spawnLevel: 1.5,
  /** The canter-in path is sampled every metre; no step may be steeper than this. */
  pathMaxSlope: (45 * Math.PI) / 180,

  /** A tick whose feet move farther than this is a teleport and ends the ride. */
  teleportJump: 5,

  /** While mounted the horse is placed this far to the side for saves. */
  saveSideOffset: 1.6,
  /** A saved horse more than this from the ground is dropped (the contract's 200 m rule). */
  maxSavedHeight: 200,

  cameraLift: 1.1,
  cameraDistance: 1.5,
  cameraEase: 0.4,
} as const;
