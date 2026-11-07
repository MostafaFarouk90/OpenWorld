// Ulthred, the Ash King: his numbers (D10, Act 5 N6 PR 2; plans/act5-N6.md section 3 and "PR 2 build notes"). Three phases at
// 66% and 33%, three bars each, no mercy. Phase 1 in N2's Hammer Hall: a hammer slam with a 1.2 s tell that leaves a lava line,
// poise landing only while the hammer is stuck after a slam, a sweep for anyone hugging him. At 66% the floor breaks and the fight
// drops to the Anvil of Ages (phase 2: turning platforms, crack-anvils, forge-fire). Phase 3 on the Anvil: Vey's armour (look
// only), the spirit-flames, the chain barrage, the Scar tax, and the Heartshard at the ninth break. The M55 hammer trial reuses
// his model and his slam. Everything not in the plan is a reading for the pacing test and N12's census (taste calls under
// "Act 5 N6" in design/changes-applied.md).
import { ACT5_BOSS_BASE_LEVEL, ACT5_BOSS_IDS, ACT5_BOSS_RULES } from '../../act5Bosses';
import { act5BossLevel } from '../../../enemies/level';
import { BLOCKERS, HAMMER_HALL_DROP_ANCHOR, HAMMER_HALL_FLOOR, HAMMER_HALL_ID, HAMMER_PIT, INT_ANCHOR, INT_TRIGGER } from '../../../caldera/interiors/sites';
import { HAMMER_ENTRY_Z } from '../../../caldera/interiors/hammerHall';
import { D10_STARTED_FLAG as REGION_D10_STARTED } from '../../../region/act5Regions';

export const ULTHRED_BOSS_ID = ACT5_BOSS_IDS.ulthred;
export const ULTHRED_KIND = 'ulthred-ash-king';
export const ULTHRED_NAME_KEY = 'boss.ulthred.name';
/** N11 writes it before the hall (it also opens `hole.caldera.anvil`). */
export const D10_STARTED_FLAG = REGION_D10_STARTED;
/** D09's outcome: Vey's body inside the armour (defeated) or the armour empty (spared). */
export const VEY_OUTCOME_FLAG = 'boss.vey.outcome';

const P = `${INT_ANCHOR}.hammer`;

/** N2's Hammer Hall (src/caldera/interiors/hammerHall.ts), local metres from the door; rooms run +Z. */
export const HALL = {
  interiorId: HAMMER_HALL_ID,
  trigger: `${INT_TRIGGER}.hammer.hall`,
  centre: `${P}.ulthred`,
  entry: `${P}.entry`,
  entryLocal: { x: 0, z: HAMMER_ENTRY_Z },
  /** Inside the hall gate (local z 36): the reload rule and the gate's clearance measure from it. */
  mouth: `${P}.mouth`,
  gate: BLOCKERS.hammerHallGate,
  gateLocalZ: 32.25,
  gateMargin: 1,
  gateClearance: 3,
  floorBlocker: BLOCKERS.hammerFloor,
  rect: HAMMER_HALL_FLOOR,
  pit: HAMMER_PIT,
  inset: 1.5,
  slams: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `${P}.slam.${n}`) as readonly string[],
  /** The trial's arena centre (the pit's centre, local). */
  centreLocal: { x: 0, z: 56 },
  abandonSeconds: 3,
  veilWidth: 8.4,
  veilHeight: 6,
} as const;

/** The drop anchor on the island (N1 PR 2 defines it; until then the greybox arena does). */
export const DROP_ANCHOR = HAMMER_HALL_DROP_ANCHOR;

export const ULTHRED = {
  level: ACT5_BOSS_BASE_LEVEL[ULTHRED_BOSS_ID],
  /** Plan 3 said about 4,800; 6,000 brings the pacing readings to the plan's 6 + 3 + 3 minutes (taste call). */
  maxHealth: 6000,
  /** Health and damage scale this much per level away from 40, never below 0.5. */
  perLevel: 0.05,
  /** Vey's measured value: a real swing's raw poise is about 10 (x 2 heavy, x 0.5 light). */
  maxPoise: 60,
  poiseRegenDelay: 5,
  phases: ACT5_BOSS_RULES[ULTHRED_BOSS_ID].phases ?? [0.66, 0.33],
  breaksPerPhase: ACT5_BOSS_RULES[ULTHRED_BOSS_ID].breaksPerPhase ?? 3,
  releaseWindowSeconds: ACT5_BOSS_RULES[ULTHRED_BOSS_ID].releaseWindowSeconds ?? 0,
  /**
   * The nine bars' floors (fractions of max health): health stops at a bar's floor until it breaks. A phase's third floor sits
   * just above its threshold, so the phase changes on the first hit after its third break. The ninth bar's floor is 1 HP (the
   * Heartshard), written here as 0.
   */
  floors: [0.89, 0.78, 0.67, 0.56, 0.45, 0.34, 0.23, 0.12, 0] as readonly number[],
  floorMargin: 0.01,
  floorModifierOrder: 99,
  poiseModifierOrder: 40,
  walkSpeed: 3.0,
  turnRate: 3.2,
  preferredDistance: 3.0,
  /** Relative to the KayKit Barbarian's own scale. */
  modelScale: 1.6,
  /** Seconds he is invulnerable while the floor gives way (the drop beat). */
  dropSeconds: 2.5,
  /** The drop's sub-beats: cracked at 0, broken at this, teleport at dropSeconds. */
  breakAt: 1.2,
  /** A drop teleport that has not answered this long after the drop resets the fight. */
  dropTimeoutSeconds: 6,
  /** He stands this far north of the drop anchor on the island. */
  anvilStand: 8,
} as const;

/** The hammer slam: a line ahead of him. Phase 1 leaves a lava line; phase 2 reaches the ring (no lava); phase 3 middling. */
export const SLAM = {
  attackId: 'ulthred.slam',
  telegraph: 'block' as const,
  windupSeconds: 1.2,
  /** The line's length by phase (1, 2, 3) and its half width. */
  length: [9, 24, 12] as readonly number[],
  halfWidth: 1.3,
  damage: 52,
  poise: 40,
  /** The hammer stays stuck this long after a slam: the only time phase 1 poise lands. */
  stuckSeconds: 1.6,
  recoverSeconds: 0.6,
  /** Seconds between moves when nothing else is due. */
  gapSeconds: 1.1,
} as const;

/** Phase 1's lava line along the slam: N3's lava (it never kills; it throws to a lip), gone after this long. */
export const LAVA_LINE = {
  seconds: 6,
  halfWidth: 0.9,
  /** Above the hall floor; feet below it are in the lava. */
  surface: 0.12,
  damagePctPerS: 15,
  /** Lips at this distance either side of the line, at its middle. */
  lipOffset: 2.6,
} as const;

/** The sweep: a close circle for anyone hugging him outside a stuck hammer. */
export const SWEEP = {
  attackId: 'ulthred.sweep',
  telegraph: 'dodge' as const,
  windupSeconds: 0.8,
  radius: 3.2,
  /** He sweeps when Cael is this close. */
  within: 2.6,
  damage: 36,
  poise: 30,
  recoverSeconds: 0.9,
} as const;

/** Phase 2's forge-fire: jets at the anvils' feet and one under Cael. Each hit +5 Burn and small damage. */
export const FORGEFIRE = {
  attackId: 'ulthred.forgefire',
  telegraph: 'dodge' as const,
  everySeconds: 7,
  windupSeconds: 1.0,
  radius: 2.4,
  damage: 14,
  burn: 5,
} as const;

/** Phase 3's chain barrage: three chains across the ring after a glow (dodge or jump). */
export const CHAINS = {
  attackId: 'ulthred.chains',
  telegraph: 'dodge' as const,
  everySeconds: 9,
  windupSeconds: 0.9,
  count: 3,
  halfWidth: 0.9,
  length: 60,
  /** Feet this far above the ground clear a chain (a jump). */
  jumpClear: 0.6,
  damage: 30,
  poise: 20,
} as const;

/** The crack-anvils of phase 2: a Surge Leap landing near one, then a swing, cracks it; a hold-F does the same, slower. */
export const ANVILS = {
  count: 3,
  /** A leap landing this close primes an anvil. */
  primeRadius: 2.5,
  /** A primed anvil cracks on Cael's next swing within this long and this close. */
  primeSeconds: 6,
  strikeRadius: 3.2,
  /** The fallback (ruling F): hold-F beside an intact anvil. */
  holdSeconds: 2.0,
  interactRadius: 2.5,
} as const;

export const SCAR_TAX = { scars: 12, burn: 20, source: 'ulthred.scars' } as const;

export const FLAMES = { cap: 10, bonus: 0.02 } as const;

export const HEARTSHARD = {
  attackId: 'heartshard.final',
  holdSeconds: 1.5,
  interactRadius: 3,
  interactId: 'heartshard:ulthred',
} as const;

export const PRESENTATION = {
  introSeconds: 4,
  introCueAt: 1.4,
  retrySeconds: 1.2,
  deathClipSeconds: 1.6,
  deathFadeSeconds: 2.0,
} as const;

/** Look (procedural tints on the Barbarian rig; taste call). */
export const LOOK = {
  ash: 0x26201c,
  ember: 0xff5a1a,
  hammerHot: 0xff7a2a,
  hammerWhite: 0xfff0d0,
  line: 0xff5010,
  chain: 0x8a8a90,
  fire: 0xff6a1a,
  armour: 0x2a2624,
  helmHollow: 0xffa040,
  soot: 0x1a1210,
} as const;

/** The trial (M55): three rounds of five slams aimed at Cael that miss him; 4 s between rounds. */
export const TRIAL = {
  id: 'ulthred-hammer',
  rounds: 3,
  slamsPerRound: 5,
  betweenRoundsSeconds: 4,
  /** A slam's reach in the trial (no lava). */
  length: 9,
  /** He walks to the slam site nearest Cael, then slams toward Cael. */
  walkSpeed: 3.2,
  /** He closes in until Cael is this much inside the slam's length. */
  reachMargin: 1.5,
  leaveDistance: 30,
} as const;

/** His level: 40, capped at the player's level + 3 (Q3). */
export function ulthredLevel(playerLevel: number | undefined): number {
  return act5BossLevel(ULTHRED.level, playerLevel);
}

/** Health and damage scale for a level: 1 at 40, 5 % a level either way, never below 0.5. */
export function ulthredScale(level: number): number {
  const l = Number.isFinite(level) ? level : ULTHRED.level;
  return Math.max(0.5, 1 + ULTHRED.perLevel * (l - ULTHRED.level));
}

/** Which phase (1, 2, 3) a global bar index (0..8) belongs to. */
export function phaseOfBar(bar: number): number {
  return Math.min(3, Math.floor(Math.max(0, bar) / 3) + 1);
}
