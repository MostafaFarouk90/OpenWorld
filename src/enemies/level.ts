import { REGION_IDS, REGION_INFO } from '../region/regions';
import { LEVEL } from './tuning';
import type { EnemyDef, LevelBand } from './types';

export interface LevelContext {
  /** Warmth Tier 0..8 (design 5.9), used with `block` and `playerLevel`. */
  warmthTier?: number;
  playerLevel?: number;
  /** An Act 3 approach block and its design offset. */
  block?: { id: string; offset: number };
  /** A level fixed earlier (saved block level); wins over everything. */
  lockedLevel?: number;
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

export function bandForRegion(id: string): LevelBand | undefined {
  return Object.prototype.hasOwnProperty.call(REGION_BANDS, id) ? REGION_BANDS[id] : undefined;
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

  let level: number;
  if (isNum(ctx.lockedLevel)) {
    level = ctx.lockedLevel;
  } else if (ctx.block && warmth !== undefined && player !== undefined && offset !== undefined) {
    const raw = 18 + offset + 3 * (warmth - 3);
    const base = Math.min(player + LEVEL.abovePlayer, Math.max(player - LEVEL.belowPlayer, raw));
    level = base + Math.round(roll * (b.max - b.min));
  } else {
    level = b.min + Math.round(roll * (b.max - b.min));
  }
  return Math.min(LEVEL.cap, Math.max(1, Math.round(level)));
}

/** Health and damage scaling for a level; level 1 equals the def. */
export function scaleStats(def: EnemyDef, level: number): { maxHealth: number; damageScale: number } {
  const steps = Math.max(0, (isNum(level) ? level : 1) - 1);
  return {
    maxHealth: Math.round(def.maxHealth * (1 + LEVEL.healthPerLevel * steps)),
    damageScale: 1 + LEVEL.damagePerLevel * steps,
  };
}
