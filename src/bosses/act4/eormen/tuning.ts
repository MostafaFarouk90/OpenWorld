// Archwraith Eormen's numbers (D08, Act 4 L6 PR 2; plans/act4-L6.md "PR 2"). The design gives: an ancient priest-king wraith
// who summons husks; spirit blades (0.8 s, a blue-white flash and a hum) and a gong toll (1.2 s); three poise breaks, each by
// striking the Last Gong; Release at the last break (20 Burn, Ashwalkers +6, ledger D08); Rogue_Hooded at 1.4 with a crown and
// the dissolve shader. Plan 6.2 adds: struck within 4 s after his toll, husks rise in threes each phase, phase 2 darkens the nave
// and the gong's glow is the light, level 35, about 2,600 health, kill XP 750. Everything else is a reading (taste calls in
// design/changes-applied.md "Act 4 L6 PR 2") for the pacing test and L13's census.
import { ACT4_BOSS_BASE_LEVEL, ACT4_BOSS_IDS, ACT4_BOSS_RULES } from '../../act4Bosses';
import { act4BossLevel } from '../../../enemies/level';
import { HUSK_CATHEDRAL_ALTAR, HUSK_CATHEDRAL_ARENA, HUSK_CATHEDRAL_ARENA_GATE, HUSK_CATHEDRAL_DEF, HUSK_CATHEDRAL_GONG, HUSK_CATHEDRAL_ID } from '../../../waste/interiors/huskCathedral';

export const EORMEN_BOSS_ID = ACT4_BOSS_IDS.eormen;
export const EORMEN_KIND = 'eormen';
export const EORMEN_NAME_KEY = 'boss.eormen.name';
/** The Last Gong's struck actor kind (neutral, immortal; pays nothing). */
export const GONG_KIND = 'eormen-gong';
/** The structure-break part id of the Last Gong (`structure.struck` carries it; L8 plays `sfx.gong.last` by name). */
export const GONG_PART_ID = `${EORMEN_BOSS_ID}.gong`;
/** The husk skin of the Ash Wraith (L0's `EnemySkinId`; L5 gives it its look). */
export const HUSK_SKIN = 'wraith-husk' as const;

const P = 'waste.cathedral.nave';

/** L1's greybox prop at the far end of the nave (the gong's frame and the altar); the gong and the crown stand where they are. */
function prop(id: string): { x: number; z: number; front: number; top: number } {
  const p = HUSK_CATHEDRAL_DEF.props?.find((q) => q.id === id);
  if (!p) throw new Error(`eormen: L1's Husk Cathedral has no prop "${id}"`);
  return { x: (p.rect.x0 + p.rect.x1) / 2, z: (p.rect.z0 + p.rect.z1) / 2, front: p.rect.z0, top: p.height };
}

/**
 * L1's Husk Cathedral (src/waste/interiors/huskCathedral.ts), in its local metres from the door (the building runs along +Z: the
 * narthex, then the nave, which is the arena). Interiors are placed by translation only, so the entry anchor gives the offset.
 */
export const ARENA = {
  interiorId: HUSK_CATHEDRAL_ID,
  trigger: `trg.${P}`,
  centre: `${P}.eormen`,
  /** L1's inside-the-arena-gate anchor: its local position places the frame. */
  entry: `${P}.entry`,
  entryLocal: { x: 0, z: 11 },
  /** L1's mouth anchor in the narthex (outside the trigger): the reload rule and the gate's clearance. Defined here if missing. */
  mouth: `${P}.mouth`,
  mouthLocal: { x: 0, z: 6.5 },
  /** L1's stand-spot in front of the gong (F reaches the gong from it). */
  gong: `${P}.gong`,
  altar: `${P}.altar`,
  /** The gong hangs in L1's frame prop; the crown rests on the altar prop's top (local). */
  gongLocal: { ...prop('gong-frame'), standZ: HUSK_CATHEDRAL_GONG.z },
  altarLocal: { ...prop('altar'), standZ: HUSK_CATHEDRAL_ALTAR.z },
  /** L5's split: ash.1..3 are the phase husks' piles; ash.4..6 belong to L5's night husk group. */
  ash: [1, 2, 3].map((n) => `${P}.ash.${n}`) as readonly string[],
  gate: HUSK_CATHEDRAL_ARENA_GATE,
  /** The gate's nave side (local z) and the margin the player must be past it before it closes. */
  gateLocalZ: HUSK_CATHEDRAL_ARENA.z0,
  gateMargin: 1,
  gateClearance: 4,
  /** The nave floor (local), 30 by 40 m. */
  rect: HUSK_CATHEDRAL_ARENA,
  /** Where he drifts (local): inside the pillar rows (|x| 12.3 and out), 3 m in from the arena gate, 2.5 m short of the altar. */
  drift: { x0: -10.5, x1: 10.5, z0: HUSK_CATHEDRAL_ARENA.z0 + 3, z1: 44 },
  abandonSeconds: 3,
  veilWidth: 4.6,
  veilHeight: 5,
} as const;

export const EORMEN = {
  level: ACT4_BOSS_BASE_LEVEL[EORMEN_BOSS_ID],
  maxHealth: 2600,
  /** Health and damage scale this much per level away from 35, never below 0.5. */
  perLevel: 0.05,
  maxPoise: 100,
  phases: [0.66, 0.33] as readonly number[],
  breaksPerPhase: 1,
  /** The registry's default release window (4 s) at the last break. */
  releaseWindowSeconds: ACT4_BOSS_RULES[EORMEN_BOSS_ID].releaseWindowSeconds ?? 4,
  mercyVerb: ACT4_BOSS_RULES[EORMEN_BOSS_ID].mercyVerb ?? 'release',
  releaseBurnCost: ACT4_BOSS_RULES[EORMEN_BOSS_ID].releaseBurnCost ?? 20,
  healthFloor: 0.08,
  floorModifierOrder: 99,
  wardModifierOrder: 60,
  /** He drifts toward Cael (a hand above the floor) until within this far, and holds his ground when Cael closes in. */
  keepMax: 10,
  driftSpeed: 2.2,
  /** He turns toward Cael this fast (radians a second). */
  turnRate: (2 * Math.PI) / 3,
  /** Scale of the Rogue_Hooded body (design). */
  modelScale: 1.4,
  hover: 0.25,
} as const;

export const BLADES = {
  attackId: 'eormen.blades',
  telegraph: 'dodge' as const,
  /** Design: 0.8 s with a blue-white flash and a hum. */
  windup: 0.8,
  count: 4,
  /** The fan's spread (radians between neighbours) and the flight. */
  spread: 0.12,
  speed: 18,
  range: 12,
  radius: 0.45,
  damage: 20,
  poise: 12,
  recover: 0.5,
  /** Seconds between volleys by phase. */
  gap: [5.0, 4.2, 3.6] as readonly number[],
} as const;

export const TOLL = {
  attackId: 'eormen.toll',
  telegraph: 'dodge' as const,
  /** Design: 1.2 s. */
  windup: 1.2,
  /** The shock ring round him on the toll. */
  radius: 7,
  damage: 30,
  poise: 24,
  recover: 0.8,
  /** Seconds between tolls by phase, the first after the fight starts, and the early toll at a phase's floor. */
  gap: [14, 12, 10] as readonly number[],
  first: 6,
  atFloor: 1.5,
  /** Plan 6.2: the Last Gong is open this long after a toll. A toll during an open window extends it to this from the new toll. */
  windowSeconds: 4,
} as const;

/** Invented (taste call): a staff sweep when Cael stands close, so melee has a rhythm to read. */
export const SWIPE = {
  attackId: 'eormen.swipe',
  telegraph: 'block' as const,
  windup: 0.7,
  reach: 3,
  halfArc: (60 * Math.PI) / 180,
  damage: 26,
  poise: 22,
  recover: 0.6,
  cooldown: 2.5,
} as const;

/** A bar broke at the gong: he reels this long (taste call), nothing lands meanwhile. */
export const STAGGER = { seconds: 2.5 } as const;

export const HUSKS = {
  /** Three rise at the start of each phase (design). */
  perPhase: 3,
  /** The summon group ids (one per phase, so a phase's husks are their own group). */
  groups: ['eormen-husks-1', 'eormen-husks-2', 'eormen-husks-3'] as readonly string[],
  /** The husks' level: his, less this (adds, not a second boss). */
  levelBelow: 4,
} as const;

export const GONG = {
  interactRadius: 2.4,
  hurtRadius: 0.9,
  hurtHeight: 1.6,
  /** The pool light (the glow pool's provider), at rest and while open; the 0-light fallback is the rim shimmer and the decal. */
  lightIdle: 1.2,
  lightOpen: 3.2,
  decalRadius: 2.2,
} as const;

/** Phase 2 and 3: the nave's lights dim to this share of their value (the gong's glow is the light). */
export const DARK = { share: 0.15, fadeSeconds: 1.2 } as const;

export const PRESENTATION = {
  introSeconds: 3.5,
  introCueAt: 0.8,
  retrySeconds: 1.2,
  deathSeconds: 3,
} as const;

export const LOOK = {
  robe: 0x9aa0a8,
  ghost: 0x9fd8ff,
  crown: 0xc9a24a,
  blade: 0xd8f0ff,
  ring: 0x8fd0ff,
  gongBronze: 0x8a6a2a,
  gongGlow: 0xffc070,
  veil: 0x1a1c22,
  crownRest: 0xc9a24a,
} as const;

/** His level: 35, capped at the player's level + 3 (Q1). */
export function eormenLevel(playerLevel: number | undefined): number {
  return act4BossLevel(EORMEN.level, playerLevel);
}

/** Health and damage scale for a level: 1 at 35, 5 % a level either way, never below 0.5. */
export function eormenScale(level: number): number {
  const l = Number.isFinite(level) ? level : EORMEN.level;
  return Math.max(0.5, 1 + EORMEN.perLevel * (l - EORMEN.level));
}
