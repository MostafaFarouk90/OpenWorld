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
  // The Bellows-Engine, D07 (Act 4 L6): the Crucible floats inside Harrowmark, whose Act 4 kill XP factor is 2.4 (from
  // story.gate.a4), so it is stored divided by it and pays plan 6.2's 700 at an even level.
  'bellows-engine': 700 / 2.4,
  // The Crucible's struck steam valves (neutral, immortal) are never a kill.
  'bellows-valve': 0,
  // Archwraith Eormen, D08 (Act 4 L6 PR 2): the Husk Cathedral floats in the Ashen Waste, whose kill XP factor is 2.4, so 750 at an
  // even level; the Last Gong (a neutral struck prop) is never a kill.
  eormen: 750 / 2.4,
  'eormen-gong': 0,
  // Morcant Vey, D09 (Act 5 N6 PR 1): the Foundry floats over the Caldera, whose kill XP factor is 3.0, so plan 6.2's 900 at an
  // even level when he is struck down.
  'vey-reforged': 900 / 3,
  // Ulthred, D10 (Act 5 N6 PR 2): he dies on the Anvil of Ages inside the Caldera (factor 3.0), so plan 3's 1,200 at an even level;
  // M55's trial stand-in is never a kill.
  'ulthred-ash-king': 1200 / 3,
  'ulthred-trial': 0,
  // Corvin Skarl, D06 (K8 PR 2): the summit has no region factor; 650 at an even level (the level scale adjusts it as for any kill).
  'corvin-skarl': 650,
  // K6a: Skarl's drake is freed on either D06 outcome, never a kill reward.
  'skarl-drake': 0,
  // Murkjaw, D05 (K8): the same convention, so a Greyfen kill pays plan 6.2's about 600 (333 x 1.8 = 599.4, paid as 599).
  murkjaw: 333,
  // K6b PR 2: stored divided by the Dragonspine's factor (1.8, set by the peak plugin): 90 and 240 there (plan 6.1).
  'rime-hawk': 50,
  'crag-ogre': 133,
  // The trial is non-lethal: Ysmeryth is never a kill.
  ysmeryth: 0,
  // Act 4 L5: stored divided by the Waste's kill XP region factor (2.4, set by the waste plugin), so a Waste kill pays plan
  // 6.1's 160, 300 and 40 at an even level (67 x 2.4 = 160.8, 125 x 2.4 = 300, 17 x 2.4 = 40.8).
  'waste-strider': 67,
  'husk-knight': 125,
  'cinder-gnat-swarm': 17,
  // Act 5 (N5): stored at paid / 3.0 (the Caldera factor): 120 and 300 paid at an even level.
  'warhost-soldier': 40,
  'warhost-guard': 100,
  dummy: 0,
  scarecrow: 0,
};

/**
 * Spawn tags whose kills and spared foes pay no XP at all (sparring, where the job's own reward is the pay): the Act 1 side
 * job j09's yard bouts and the repeat bout Stane offers after it (plans/act1-side-content.md). Read by Progression.onKill and onMercy.
 */
export const NO_KILL_XP_TAGS: readonly string[] = ['j09.b1', 'j09.b2', 'j09.b3', 'j09.repeat'];

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
