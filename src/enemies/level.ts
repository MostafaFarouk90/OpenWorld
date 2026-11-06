import type { FlagReader } from '../core/flagCondition';
import { REGION_IDS, REGION_INFO, regionBandNow, type RegionId } from '../region/regions';
import { LEVEL } from './tuning';
import type { EnemyDef, LevelBand } from './types';

export interface LevelContext {
  /** Warmth Tier 0..8 (design 5.9), used with `block` and `playerLevel`. */
  warmthTier?: number;
  playerLevel?: number;
  /** An Act 3 approach block and its design offset. */
  block?: { id: string; offset: number };
  /**
   * A base level fixed earlier (the saved block lock L). v0.7: the span is rolled on top (L + round(roll x span)); a
   * caller that passes no `span` gets exactly L, as before v0.7.
   */
  lockedLevel?: number;
  /** v0.7: levels rolled on top of the block base (the Act 3 block's own span, 5 or 2). Default: the band's span for the
   * block formula, 0 for a lock. */
  span?: number;
  /** 0..1 pick inside the band; default 0. */
  roll?: number;
}

export const DEFAULT_BAND: LevelBand = { min: 1, max: 1 };

/** Level band of every built region, from the region registry (v0.6; reserved regions have none yet). */
export const REGION_BANDS: Record<string, LevelBand> = Object.fromEntries(
  REGION_IDS.filter((id) => !REGION_INFO[id].reserved).map((id) => [id, { ...REGION_INFO[id].levelBand }]),
);

/** The Watch Guard's level band for spawner groups (inside the Brightwater and Harrowmark bands, where guards stand). */
export const WATCH_GUARD_BAND: LevelBand = { min: 4, max: 6 };

/**
 * A built region's band. v0.8: with a flag reader, the act-scoped band in force now (`bandWhen`: Harrowmark is 28 to 33
 * from `story.gate.a4`); without one, the static base band, as before v0.8.
 */
export function bandForRegion(id: string, flags?: FlagReader | null): LevelBand | undefined {
  if (!Object.prototype.hasOwnProperty.call(REGION_BANDS, id)) return undefined;
  return flags ? regionBandNow(id as RegionId, flags) : REGION_BANDS[id];
}

/**
 * v0.8, the one player-relative cap (shared by A1's lower Dragonspine lock, the summit's Q9 and Act 4's Q1):
 * `min(level, P + cap)`. A null cap or an unknown (non-finite) player level leaves the level as it is. Not clamped to
 * 1..cap: callers clamp.
 */
export function capAbovePlayer(level: number, player: number | undefined, cap: number | null): number {
  if (cap === null || !isNum(cap) || cap < 0 || !isNum(player)) return level;
  return Math.min(level, Math.round(player) + Math.round(cap));
}

let warnedConsole = false;

function isNum(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/**
 * Level of one enemy. Throws RangeError for an invalid band. Non-finite context numbers are ignored
 * with a warning (the `warn` callback, else one console.warn). Always an integer in [1, LEVEL.cap].
 */
export function enemyLevel(
  regionBand: LevelBand,
  ctx: LevelContext = {},
  warn?: (msg: string) => void,
): number {
  const b = regionBand;
  if (!b || !isNum(b.min) || !isNum(b.max) || b.min > b.max || b.min < 1) {
    throw new RangeError(`enemyLevel: invalid band ${JSON.stringify(b)}`);
  }
  const complain = (msg: string): void => {
    if (warn) warn(msg);
    else if (!warnedConsole) {
      warnedConsole = true;
      console.warn(msg);
    }
  };
  const bad: string[] = [];
  const clean = (name: string, v: unknown): number | undefined => {
    if (v === undefined) return undefined;
    if (isNum(v)) return v;
    bad.push(name);
    return undefined;
  };
  const warmth = clean('warmthTier', ctx.warmthTier);
  const player = clean('playerLevel', ctx.playerLevel);
  const offset = ctx.block ? clean('block.offset', ctx.block.offset) : undefined;
  if (bad.length) complain(`enemyLevel: ignoring non-finite ${bad.join(', ')}`);

  let roll = 0;
  if (ctx.roll !== undefined) roll = isNum(ctx.roll) ? Math.min(1, Math.max(0, ctx.roll)) : 0;

  const span = isNum(ctx.span) ? Math.max(0, Math.round(ctx.span)) : undefined;
  let level: number;
  if (isNum(ctx.lockedLevel)) {
    level = Math.round(ctx.lockedLevel) + Math.round(roll * (span ?? 0));
  } else if (ctx.block && warmth !== undefined && player !== undefined && offset !== undefined) {
    level = blockFormula(offset, warmth, player, blockCapOf(ctx.block.id)) + Math.round(roll * (span ?? b.max - b.min));
  } else {
    level = b.min + Math.round(roll * (b.max - b.min));
  }
  return Math.min(LEVEL.cap, Math.max(1, Math.round(level)));
}

/**
 * Design 5.9: L = clamp(18 + offset + 3 x (W - 3), P - 9, P + 5), before the cap. A block with `capAbovePlayer` then
 * takes `min(L, P + capAbovePlayer)` (the lower Dragonspine, see DRAGONSPINE_LOWER_CAP_ABOVE_PLAYER).
 */
function blockFormula(offset: number, warmth: number, player: number, cap: number | null = null): number {
  const raw = 18 + offset + 3 * (warmth - 3);
  const L = Math.min(player + LEVEL.abovePlayer, Math.max(player - LEVEL.belowPlayer, raw));
  return capAbovePlayer(L, player, cap);
}

// ---- v0.7 (Act 3, contracts/CHANGES-v0.7.md items 8 and 8b) ----

export type Act3BlockId = 'greyfen' | 'dragonspine-lower';

export interface Act3BlockDef {
  /** Design 5.9's fixed offset (Greyfen 0, lower Dragonspine +2). */
  offset: number;
  /** Levels rolled on top of L (L to L + span). */
  span: number;
  /** L_rec, the recommended-order level, for the reward scale (L / L_rec). */
  recommended: number;
  /** The block's first main quest: accepting it locks the block (K9's `warmth.lockBlock`). */
  lockQuest: string;
  /** The quests whose rewards scale (the approach block). */
  quests: readonly string[];
  /**
   * Optional: the base level L is never more than this many levels above the player level read when L is worked out
   * (the preview, so the lock at the lock quest's accept). `null` or absent keeps design 5.9's P + 5 window only.
   */
  capAbovePlayer?: number | null;
}

/**
 * A taste call Mostafa may veto (2026-11-05, the Act 3 playthrough's H1), the lower Dragonspine twin of Q9: the block
 * locks at `min(design 5.9 L, P + 3)` when M28 is accepted, so a player arriving from the Greyfen under-levelled meets
 * at most P + 3 (members still roll L to L + 2). `null` restores design 5.9's P + 5 window.
 */
export const DRAGONSPINE_LOWER_CAP_ABOVE_PLAYER: number | null = 3;

export const ACT3_BLOCKS: Readonly<Record<Act3BlockId, Act3BlockDef>> = {
  greyfen: { offset: 0, span: 5, recommended: 18, lockQuest: 'm23', quests: ['m23', 'm24', 'm25', 'm26', 'm27', 'd05', 'r12', 'r13', 'r14'] },
  'dragonspine-lower': {
    offset: 2,
    span: 2,
    recommended: 23,
    lockQuest: 'm28',
    quests: ['m28', 'm29', 'm30', 'r15', 'r16', 'r17', 'r18'],
    capAbovePlayer: DRAGONSPINE_LOWER_CAP_ABOVE_PLAYER,
  },
};

/** A block's cap above the player, or null for an unknown block, a block without one, or a non-finite or negative cap. */
function blockCapOf(block: string): number | null {
  if (!isAct3BlockId(block)) return null;
  const c = ACT3_BLOCKS[block].capAbovePlayer;
  return typeof c === 'number' && Number.isFinite(c) && c >= 0 ? Math.round(c) : null;
}

export function isAct3BlockId(v: unknown): v is Act3BlockId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(ACT3_BLOCKS, v);
}

/** A block's base level L for the live Warmth Tier W and player level P (design 5.9), in 1..cap. The preview and the lock use it. */
export function blockBaseLevel(block: Act3BlockId, warmth: number, player: number): number {
  const L = blockFormula(ACT3_BLOCKS[block].offset, Math.min(8, Math.max(0, Math.round(warmth))), player, blockCapOf(block));
  return Math.min(LEVEL.cap, Math.max(1, Math.round(L)));
}

/**
 * Q9 (a), a taste call Mostafa may veto: summit enemies are never more than this many levels above the player. Applied
 * after the design's 26 to 28 roll, `min(rolled, P + cap)`, at spawn time. `null` restores the design's fixed levels.
 */
export const SUMMIT_CAP_ABOVE_PLAYER: number | null = 3;

/**
 * The summit's level: the design's band rolled first, then capped by the live player level. The cap may drop a summit
 * enemy below the band's min (a player at 20 meets level 23s); a player at 25 or more sees every design level. Unknown P
 * (or a null cap) leaves the roll as it is. Always in 1..cap.
 */
export function summitLevel(band: LevelBand, roll: number, playerLevel: number | undefined, cap: number | null = SUMMIT_CAP_ABOVE_PLAYER): number {
  const r = isNum(roll) ? Math.min(1, Math.max(0, roll)) : 0;
  let level = band.min + Math.round(r * (band.max - band.min));
  level = capAbovePlayer(level, playerLevel, cap);
  return Math.min(LEVEL.cap, Math.max(1, level));
}

// ---- v0.8 (Act 4, contracts/CHANGES-v0.8.md item 4, Q1) ----

/**
 * Q1 (a), a taste call Mostafa may veto: no Act 4 enemy stands more than this many levels above the player. Applied to
 * every Act 4 spawn (Harrowmark from `story.gate.a4`, the `harrowmark-a4` interiors, the Ashen Waste) after the band
 * roll, at spawn time, fixed for the member's life. `null` restores the design's fixed bands.
 */
export const ACT4_CAP_ABOVE_PLAYER: number | null = 3;

/** First-arrival groups (M35's ambush and checkpoints, M42's first group: `SpawnerDef.firstArrival`) cap at P + 2. */
export const ACT4_FIRST_ARRIVAL_ABOVE_PLAYER = 2;

/** An Act 4 member's level: the band rolled first, then capped by the live player level (P + 2 for first arrivals). */
export function act4Level(band: LevelBand, roll: number, playerLevel: number | undefined, firstArrival = false, cap: number | null = ACT4_CAP_ABOVE_PLAYER): number {
  const r = isNum(roll) ? Math.min(1, Math.max(0, roll)) : 0;
  let level = band.min + Math.round(r * (band.max - band.min));
  const c = cap === null ? null : firstArrival ? Math.min(cap, ACT4_FIRST_ARRIVAL_ABOVE_PLAYER) : cap;
  level = capAbovePlayer(level, playerLevel, c);
  return Math.min(LEVEL.cap, Math.max(1, level));
}

/** An Act 4 boss's level (plan 6.2: the Bellows-Engine 31, Eormen 35), capped the same way as every Act 4 spawn. */
export function act4BossLevel(base: number, playerLevel: number | undefined, cap: number | null = ACT4_CAP_ABOVE_PLAYER): number {
  const b = isNum(base) ? Math.round(base) : 1;
  return Math.min(LEVEL.cap, Math.max(1, capAbovePlayer(b, playerLevel, cap)));
}

/** Health and damage scaling for a level; level 1 equals the def. */
export function scaleStats(def: EnemyDef, level: number): { maxHealth: number; damageScale: number } {
  const steps = Math.max(0, (isNum(level) ? level : 1) - 1);
  return {
    maxHealth: Math.round(def.maxHealth * (1 + LEVEL.healthPerLevel * steps)),
    damageScale: 1 + LEVEL.damagePerLevel * steps,
  };
}
