// Crowd numbers (slice 2 thread 17b). Design row 84: about 200 instanced crowd members at 2 LODs; the rest are defaults
// chosen in plans/slice-2-harrowmark-crowds.md where the design is silent.
import type { QualityStep } from '../vfx/tuning';

export const CROWD_TUNING = {
  /** Body radius used for every clearance test (keep-out, structures, lane edges). */
  bodyRadius: 0.35,
  /** Walkers stay this far inside a lane's half-width. */
  laneEdgeMargin: 0.3,
  /** Lane sample spacing in metres. */
  sampleStep: 1,
  /** Free lateral space is intersected over this many samples either side, so walkers start dodging early. */
  smoothSamples: 2,
  /** Lateral slots as fractions of the free half-width on the walker's right. */
  slots: [0.3, 0.6, 0.9] as const,
  walkSpeed: [1.1, 1.5] as const,
  queueSpeed: [0.45, 0.6] as const,
  lateralSpeed: 1.2,
  endPause: [2, 6] as const,
  /** Player avoidance. */
  avoid: { ahead: 2.2, stop: 0.9, side: 1.4, slow: 0.3, verticalGate: 2.5, stuckTurn: 3 },
  idle: { ringRadius: 1.1, nudgeRadius: 1.2, nudgeMax: 0.8, driftSpeed: 0.5 },
  /** No figure appears or vanishes within this distance of the player; surplus figures nearer get `leaveGrace`. */
  noPopRadius: 30,
  leaveGrace: 3,
  /** Sleep when the player is this far from every lane sample and cluster. */
  sleepDistance: 170,
  /** LOD ranges from the camera; figures shrink to nothing between fadeStart and drawDistance. */
  lod0Range: 45,
  fadeStart: 125,
  drawDistance: 140,
  /** Keep-out radius by anchor tag, metres (door triggers are r 2 plus 1 m). */
  keepOut: {
    door: 3,
    quest: 2.5,
    pickup: 2.5,
    spawn: 2.5,
    trainer: 2.5,
    hide: 2.5,
    'npc-post': 2.5,
    shop: 2.5,
    chest: 2.5,
    chase: 2.5,
    drill: 2.5,
    brazier: 0.6,
    banner: 0.6,
  } as Record<string, number>,
  /** M06's stealth ground (checkpoint boxes and the M06 patrol), only enforced while the gate is guarded. */
  guardedKeepOut: { stealthHalf: 4, patrolPrefix: 'patrol.m06.', patrolRadius: 2.5 },
  /** While guarded, `main-street-south` walks only from here on (the stealth section box ends at z 1360). */
  guardedMainStreetStart: 70,
  quality: {
    low: { count: 0.5, lod0Range: 25 },
    medium: { count: 0.75, lod0Range: 35 },
    high: { count: 1, lod0Range: 45 },
  } as Record<QualityStep, { count: number; lod0Range: number }>,
  /** Muted tunic colours. */
  palette: [0x6b5a45, 0x5c6a4e, 0x7a4f3a, 0x4e5a6b, 0x8a7a5a, 0x6a4e5c, 0x5a5a5a, 0x7b6b4a, 0x4a5f58, 0x806048],
} as const;

/** Walkers per lane at full density (about one per 17 m, more on the busy streets). */
export const LANE_WALKERS: Record<string, number> = {
  'main-street-north': 40,
  'main-street-south': 24,
  'rooftop-ward-streets': 14,
  'market-ring': 14,
  'fountain-circuit': 14,
  'forge-row': 12,
  'bastion-edge': 9,
  'chapel-approach': 8,
  'guild-alley': 6,
  'gate-queue': 6,
};

/** Lanes whose walkers shuffle like a queue. */
export const QUEUE_LANES = new Set(['gate-queue']);
