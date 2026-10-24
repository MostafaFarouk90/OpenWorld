import type { MoveDef } from '../../enemies/types';
import { BOSS_MERCY } from '../../enemies/tuning';

/**
 * Hunt-Captain Thrandil Redmane's numbers (plans/act2-A8.md). The design gives the 0.8 s lance couch with a red tabard flash and
 * a horn, the 0.6 s net arm swing, two phases with three breaks each, dodge counters that deal double, and the Spare at the last
 * break (design 10 row 19); everything else is a reading for A16's headless run to retune.
 */

export const REDMANE_BOSS_ID = 'thrandil-redmane';
export const REDMANE_KIND = 'thrandil-redmane';
export const REDMANE_NAME_KEY = 'boss.thrandil-redmane.name';

/** The mercy verb comes from the one table, so the registry def and the hold cannot drift apart. */
export const REDMANE_MERCY_VERB = BOSS_MERCY[REDMANE_BOSS_ID].verb === 'spare' ? 'spare' : 'release';

/** The flag A12's D03 sets when the hunters' fort is stormed; the keep door lock reads it and so does the arena's arming. */
export const D03_STARTED_FLAG = 'story.d03.started';

/** Anchors, trigger and blocker from A3's Scorchhold keep (src/cinderreach/scorchholdKeep.ts). The arena is 26 x 26 m. */
export const ARENA = {
  interiorId: 'scorchhold-keep',
  arenaTrigger: 'trg.scorchhold.keep.arena',
  arenaDoor: 'scorchhold.keep.arena.door',
  centre: 'scorchhold.keep.arena.centre',
  gate: 'scorchhold.keep.arena.gate',
  /** He and his charge stay inside this half-extent around the centre (the two caged prisoners stand at x +-11.5). */
  arenaHalfExtent: 12,
  /** Traps stay clear of the cages and the walls. */
  trapHalfExtent: 9,
  /** A load inside this rectangle (the trigger's 13 m half-extent) puts the player back at the door; the entry hall is left alone. */
  reloadHalfExtent: 13,
  /** The trigger edge (z -14) sits inside the gate rect (z -14.5 to -13.5), so the gate closes only once the player is 3.5 m past the door. */
  gateClearance: 3.5,
  veilOffset: 2,
} as const;

export const REDMANE = {
  /** The top of the Cinderreach band (levels 8 to 14), as Grimtooth tops Act 1's. */
  level: 14,
  maxHealth: 1100,
  maxPoise: 80,
  poiseRegenDelay: 4,
  /** Two phases (the second below half health), three breaks each. The sixth break opens the Spare window. */
  phases: [0.5] as readonly number[],
  breaksPerPhase: 3,
  releaseWindowSeconds: 6,
  /** Until the `last` break, health never drops below this fraction; after it (and after a lapsed window) he can die. */
  healthFloor: 0.08,
  floorModifierOrder: 99,
  walkSpeed: 3.4,
  turnRate: 4,
  /** He walks in toward this distance between moves. */
  preferredDistance: 3.2,
  approachSecondsMin: 0.5,
  approachSecondsMax: 1.2,
  breakSeconds: 1.2,
  campSeconds: 10,
  campDistance: 2.5,
  backstepMetres: 6,
  backstepSeconds: 0.5,
  /** Phase 2 multiplies every cooldown by this. */
  phase2Cooldown: 0.75,
  /** Phase 2 only: a charge may be followed by a feint (he wheels) and a second charge. */
  feintSeconds: 0.4,
} as const;

/** Dodge counters (design 10 row 19): the next player hit within this long of a dodged swing deals double damage and poise. */
export const COUNTER = {
  seconds: 1,
  scale: 2,
  /** Attacker band, after weapon scaling, before the defender's block. */
  modifierOrder: -101,
} as const;

export type RedmaneMoveId = 'charge' | 'thrust' | 'net' | 'trap';

export interface RedmaneMoveDef {
  id: RedmaneMoveId;
  attackId: string;
  telegraph: 'block' | 'dodge';
  windup: number;
  recover: number;
  cooldown: number;
  /** Distance band (m, feet to feet) in which the move may start. */
  range: readonly [number, number];
  damage: number;
  poise: number;
  /** Selection weight among the moves that are ready. */
  weight: number;
}

export const MOVES: Readonly<Record<RedmaneMoveId, RedmaneMoveDef>> = {
  /** Lance charge: 0.8 s couch with a red tabard flash and a horn (design), then a straight run. Dodge only. */
  charge: { id: 'charge', attackId: 'redmane.charge', telegraph: 'dodge', windup: 0.8, recover: 1.2, cooldown: 6, range: [4, 11], damage: 36, poise: 40, weight: 3 },
  /** Lance thrust: a blockable close filler (never parried: a script hit has no attack window). */
  thrust: { id: 'thrust', attackId: 'redmane.thrust', telegraph: 'block', windup: 0.45, recover: 0.7, cooldown: 1.6, range: [0, 2.6], damage: 16, poise: 14, weight: 3 },
  /** Net throw: a 0.6 s arm swing (design); the net itself is `NET_MOVE`. Blockable. */
  net: { id: 'net', attackId: 'redmane.net', telegraph: 'block', windup: 0.6, recover: 0.9, cooldown: 7, range: [5, 14], damage: 8, poise: 10, weight: 2 },
  /** Harpoon trap: he plants a barbed trap at the player's feet; it springs after `TRAP.armSeconds`. Dodge only. */
  trap: { id: 'trap', attackId: 'redmane.trap', telegraph: 'dodge', windup: 0.7, recover: 0.8, cooldown: 9, range: [2, 14], damage: 22, poise: 15, weight: 2 },
};

export const CHARGE = {
  speed: 9,
  maxMetres: 11,
  /** Distance from the swept line that still hits. */
  radius: 1.1,
  /** The lane locks this long before take-off, so a late side-step dodges it. */
  aimLockBefore: 0.15,
  /** A charge that ends against the wall leaves him open this much longer. */
  wallExtraRecover: 0.5,
} as const;

/** The net is a `MoveDef` on A6b's projectile adapter: `attackId` is `ranged:redmane.net`, root only on an outcome `hit`, never parried. */
export const NET_MOVE: MoveDef = {
  id: 'redmane.net',
  clip: 'Throw',
  activeStart: 0.4,
  activeEnd: 0.57,
  windup: MOVES.net.windup,
  telegraph: 'block',
  weapon: 'right',
  damage: MOVES.net.damage,
  poise: MOVES.net.poise,
  range: MOVES.net.range,
  cooldown: MOVES.net.cooldown,
  recover: MOVES.net.recover,
  weight: 0,
  ranged: { shape: 'net', speed: 14, maxRange: 14, radius: 0.7, originHeight: 1.4, root: 1.5 },
  parryable: false,
};

export const THRUST = {
  reach: 2.8,
  /** Half-angle of the hit cone (radians). */
  halfAngle: Math.PI / 4,
} as const;

export const TRAP = {
  radius: 1.6,
  armSeconds: 1,
  /** The spikes stay up this long after springing, then drop. */
  spikeSeconds: 1.5,
  rootSeconds: 1,
  rootStatusId: 'redmane.trap.root',
  /** Live (unsprung or standing) traps allowed per phase. */
  maxLive: [1, 3] as readonly number[],
} as const;

/** Presentation timings (sim seconds). */
export const PRESENTATION = {
  introSeconds: 4,
  introHornAt: 1.5,
  retrySeconds: 1.2,
  /** Spared: the lance drops, he kneels, then fades. */
  spareKneelSeconds: 2,
  spareFadeSeconds: 1.5,
  deathClipSeconds: 1.2,
  deathFadeSeconds: 1.4,
} as const;

/** Look (design 10 row 19: the Barbarian scaled 1.15 in a red tabard; the lance is procedural). */
export const LOOK = {
  scale: 1.15,
  tint: 0xd8806a,
  emissive: 0x2a0a06,
  /** The tabard flash colour and intensity at full telegraph. */
  flash: 0xff2a10,
  lanceScale: 1.35,
  /** The staff standing in for the lance: size inside the lance group and how far up the grip sits (metres per model unit). */
  staffScale: 0.85,
  staffGrip: 0.35,
  soot: 0x4a3028,
  laneColor: 0xff2a10,
  trapColor: 0x9aa0a8,
  trapGlow: 0xff5a1f,
} as const;
