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
  // Gaffer Grimtooth, D02 (thread 3b, as the D01 row: plans/slice-2-grimtooth.md section 11).
  'gaffer-grimtooth': 260,
  // Hunt-Captain Thrandil Redmane, D03 (Act 2, A8; a reading, A16's headless run retunes).
  'thrandil-redmane': 300,
  // The Slagmaw, D04 (Act 2, A8; a reading, A16's headless run retunes).
  'the-slagmaw': 380,
  // Thread 5's kinds: R01 and the toll post pay through their quests; hounds and cutpurses are phase B.
  'ash-scarecrow': 0,
  'toll-post': 0,
  blightbloom: 15,
  'ember-hound': 25,
  'alley-cutpurse': 18,
  'guildhall-thug': 28,
  // M04's Toll Sergeant (Act 1 density pass): an elite Footman.
  'toll-sergeant': 70,
  // R02's sparring yard veterans (density pass, batch 3)
  'yard-veteran': 30,
  // Act 2 wyrms (A6a; A6b owns any retune).
  'ember-wyrm': 180,
  wyrmling: 15,
  // Act 2 ground enemies (A6b, provisional: A16's headless run is the authority; fox and sheep pay nothing).
  'hunter-spearman': 65,
  'hunter-harpooner': 80,
  // Act 2 (A4/A13): Grisel's steward guards (provisional, a Footman's worth).
  'steward-guard': 30,
  'slag-crawler': 60,
  'cinder-golem': 180,
  // Act 3 (K6b): stored divided by the Greyfen's kill XP region factor (1.8, set by the fen plugin), so a Greyfen kill pays
  // plan 6.1's 70 and 220 after the one rounding (39 x 1.8 = 70.2, 122 x 1.8 = 219.6). Coordinator ruling A.
  'fen-leech': 39,
  'peat-shambler': 122,
  // K6a: Skarl's drake is freed on either D06 outcome, never a kill reward.
  'skarl-drake': 0,
  // Murkjaw, D05 (K8): the same convention, so a Greyfen kill pays plan 6.2's about 600 (333 x 1.8 = 599.4, paid as 599).
  murkjaw: 333,
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

/**
 * `regionFactor` (v0.7 item 27, the `killXpRegionFactor` port) multiplies before the one rounding; a value that is not a
 * finite positive number reads as 1, so the default changes nothing.
 */
export function killXp(kind: string, enemyLevel: number, playerLevel: number, regionFactor = 1): number {
  const base = killXpBase(kind);
  if (base <= 0) return 0;
  const f = Number.isFinite(regionFactor) && regionFactor > 0 ? regionFactor : 1;
  return Math.round(base * levelScale(enemyLevel, playerLevel) * f);
}

export function baseMaxHealthForLevel(level: number, classId?: string | null): number {
  const row = classStats(classId);
  return row.health + row.healthPerLevel * (level - 1);
}

export function respecGold(level: number): number {
  return Math.min(RESPEC.goldCap, RESPEC.goldPerLevel * Math.max(1, Math.floor(level)));
}
