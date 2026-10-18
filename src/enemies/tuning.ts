/**
 * Enemy AI tuning (thread 2's tuning file; src/config/constants.ts is shared and not edited).
 * Design sources: section 10 "Creature behaviours and AI states", 9.6 (poise), 11.0 (reactions), 5.9 (levels).
 */
export const AI = {
  /** Sight cone (full angle, degrees) and range; line of sight is required. Design: "cone of sight". */
  sightConeDegrees: 120,
  sightRange: 18,
  /** Tuning choice on top of the design's "20 m sound radius": heard at 20 m while sprinting or attacking, 6 m always. */
  hearingLoud: 20,
  hearingQuiet: 6,
  /** Eye height above the feet for line-of-sight rays; aimed at the target's chest. */
  eyeHeight: 1.5,
  chestHeight: 1.1,
  /** Seconds spent turning to face before the chase starts. */
  noticeSeconds: 0.4,
  /** Pack members of the same spawner within this distance notice together. */
  packShareRadius: 15,
  /** At most this many enemies attack one target at once; the rest circle. */
  attackersPerTarget: 2,
  circleRadius: 3,
  /** Facing within this many degrees of the target is needed to start a move. */
  attackFacingDegrees: 30,
  /** Leash: give up when the target is further than this from the home anchor, or unseen this long. */
  leashRadius: 30,
  lostSightSeconds: 5,
  /** Turn rate, radians per second. */
  turnRate: 6,
  /** Light hit that does not break poise. */
  flinchSeconds: 0.3,
  /** A hit dealing at least this much poise without breaking it: 0.8 s stagger with knockback (design 11.0). */
  heavyPoise: 30,
  heavyStaggerSeconds: 0.8,
  knockbackMetres: 1.2,
  knockbackSeconds: 0.2,
  /** Poise break (design 9.6). */
  breakStaggerSeconds: 1.2,
  poiseRegenDelay: 4,
  /** Soldier yield: under this health fraction a poise break kneels (only while Spare is unlocked). */
  yieldBelowHealth: 0.5,
  yieldSeconds: 2,
  /** Spared enemies walk this far off, then despawn. */
  sparedWalkMetres: 15,
  /** Corpse: death clip, then a dissolve (vfx) or fade of this length, then despawn. */
  deathFadeSeconds: 1.2,
  releaseDissolveSeconds: 1.2,
  /** Wraith rise (Lie_StandUp) length cap; the clip's own length is used when shorter. */
  riseSeconds: 2.0,
  /** Patrol: arrive within this radius of a waypoint, then wait. */
  waypointRadius: 1.0,
  waypointWaitSeconds: 2.0,
  idleSeconds: 3.0,
} as const;

export const STEERING = {
  arriveRadius: 0.6,
  slowRadius: 2.0,
  separationRadius: 1.2,
  separationWeight: 1.5,
  /** Feelers at 0 and plus or minus this angle, this long. */
  feelerDegrees: 35,
  feelerLength: 1.5,
  /** Cliff probe this far ahead on the heightfield. */
  probeDistance: 1.0,
  maxDrop: 1.2,
  maxSlopeDegrees: 40,
  /** Less than this fraction of the wanted progress over `stuckSeconds` counts as stuck. */
  stuckProgress: 0.1,
  stuckSeconds: 1.0,
  sideStepSeconds: 1.0,
  giveUpSeconds: 3.0,
} as const;

export const MERCY = {
  holdSeconds: 0.5,
  radius: 3,
  /** Half-angle, as Interactable.coneDegrees takes it: the design's 90 degree cone. */
  coneDegrees: 45,
  /** Release pulse radius (design section 3). */
  pulseRadius: 4,
  /** Priority bonus for the lock-on target, so it wins over a nearer creature. */
  lockOnPriority: 100,
  flags: { release: 'enemies.mercy.release', spare: 'enemies.mercy.spare' },
  /** Burn per completed Release hold; a pulse that frees a boss costs the boss rate (design 3, 9.7). */
  releaseBurn: 10,
  bossReleaseBurn: 20,
} as const;

/** The Charred Footman's guard (design 10 row 2). */
export const GUARD = {
  /** Chance per roll that the shield is up; rolled every `rollSeconds` while advancing or recovering. */
  chance: 0.5,
  rollSeconds: 1.5,
  /** A blocked hit keeps this fraction of its damage and poise. */
  damageScale: 0.15,
  poiseScale: 0.5,
  /** A hit with at least this much poise (before scaling) breaks the guard instead of being blocked. */
  heavyPoise: 30,
  brokenSeconds: 1.0,
  /** Half-angle of the shield arc in front, and of the open back. */
  arcDegrees: 100,
  backDegrees: 70,
  backDamageScale: 1.25,
  /** Defender-band modifier order (actors-and-damage.md section 4: -100..-1). */
  modifierOrder: -50,
} as const;

/** Footmen advance in pairs on opposite flanks, and start their swings at least this far apart. */
export const PAIR = {
  maxPartnerDistance: 8,
  flankMetres: 2,
  closeIn: 4,
  attackStaggerSeconds: 0.4,
} as const;

/** Boss mercies by bossId (actors-and-damage.md section 7). Amount is the uncapped ledger value. */
export const BOSS_MERCY: Readonly<Record<string, { verb: 'release'; track: 'ashwalkers'; amount: number; burn: number }>> = {
  'ashen-prior': { verb: 'release', track: 'ashwalkers', amount: 4, burn: 20 },
};

export const ASH_GRAB = { speedScale: 0.6, seconds: 2 } as const;

export const LEVEL = {
  cap: 40,
  /** Per level above 1 (placeholders for thread 5 to tune with XP). */
  healthPerLevel: 0.15,
  damagePerLevel: 0.1,
  /** Warmth Tier formula window around the player level (design 5.9), used only when playerLevel is passed. */
  belowPlayer: 9,
  abovePlayer: 5,
} as const;

export const WORLD_AI = {
  /** Beyond this distance from the player an enemy is dormant (no perception, mixer or tracing). */
  dormantDistance: 120,
  /** Awake kinematic movers at most; extra enemies stay dormant. */
  maxAwake: 24,
  /** Wake only this much nearer than `dormantDistance`, and this many ranks inside `maxAwake`. */
  wakeMargin: 10,
  wakeRankMargin: 2,
  /** Lift on wake, as the player controller does after a teleport. */
  wakeLift: 0.02,
  /** Spawn ring radius when several enemies share one anchor, and patrol slot ring. */
  ringRadius: 1.5,
} as const;
