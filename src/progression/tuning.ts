/** Progression numbers in one place; tuned later. */
import { classStats } from './classStats';

export const LEVEL_CAP = 40;
export const BAR_SLOTS = 6;
export const MERCY_XP_FRACTION = 0.6;

export const KNIGHT_BASE_HEALTH = 120;
export const KNIGHT_HEALTH_PER_LEVEL = 10;

/** Design 9: the first respec is free; later ones cost 25 gold x level, capped at 500. */
export const RESPEC = { goldPerLevel: 25, goldCap: 500 } as const;

export const KILL_XP_BASE: Readonly<Record<string, number>> = {
  'ash-wraith': 20,
  'blighted-soldier': 30,
  // The Ashen Prior (D01, slice 2). Thread 5's new kinds are added here when it sends them.
  'ashen-prior': 200,
  dummy: 0,
  scarecrow: 0,
};

/** Levels at which one skill point is granted: 2..14, then every third level from 17 to 38. */
export const POINT_LEVELS: readonly number[] = [
  2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 17, 20, 23, 26, 29, 32, 35, 38,
];

/** Total xp needed to reach level L (L1 = 0). */
export function xpForLevel(level: number): number {
  if (!(level > 1)) return 0;
  return Math.round(50 * Math.pow(level - 1, 2.2));
}

/** Level for a total xp amount, capped at LEVEL_CAP. */
export function levelForXp(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 1;
  let level = 1;
  while (level < LEVEL_CAP && xp >= xpForLevel(level + 1)) level++;
  return level;
}

/** Skill points granted by levelling alone, for a given level. */
export function levelPoints(level: number): number {
  let n = 0;
  for (const l of POINT_LEVELS) if (l <= level) n++;
  return n;
}

export function killXpBase(kind: string): number {
  return KILL_XP_BASE[kind] ?? 0;
}

export function levelScale(enemyLevel: number, playerLevel: number): number {
  const diff = Number.isFinite(enemyLevel) ? enemyLevel - playerLevel : 0;
  return Math.min(2, Math.max(0.25, 1 + 0.15 * diff));
}

export function killXp(kind: string, enemyLevel: number, playerLevel: number): number {
  const base = killXpBase(kind);
  if (base <= 0) return 0;
  return Math.round(base * levelScale(enemyLevel, playerLevel));
}

export function baseMaxHealthForLevel(level: number, classId?: string | null): number {
  const row = classStats(classId);
  return row.health + row.healthPerLevel * (level - 1);
}

export function respecGold(level: number): number {
  return Math.min(RESPEC.goldCap, RESPEC.goldPerLevel * Math.max(1, Math.floor(level)));
}
