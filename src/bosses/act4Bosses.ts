// v0.8 item 11: the Act 4 boss ids and the BossDef fields that make them what they are. L6 (the Bellows-Engine, D07) and
// L13 (Eormen, D08) spread these rules into their own defs; this file reserves the ids so no other thread takes them.
import type { BossDef } from '../actors/BossRegistry';

export const ACT4_BOSS_IDS = { bellowsEngine: 'bellows-engine', eormen: 'eormen' } as const;

export type Act4BossId = (typeof ACT4_BOSS_IDS)[keyof typeof ACT4_BOSS_IDS];

/** Design levels before the Q1 cap (`act4BossLevel`). */
export const ACT4_BOSS_BASE_LEVEL: { readonly [K in Act4BossId]: number } = { 'bellows-engine': 31, eormen: 35 };

/**
 * The Bellows-Engine is a machine: no mercy (release window 0), broken through its structure (structureBreak.ts).
 * Eormen is released, for 20 Burn.
 */
export const ACT4_BOSS_RULES: { readonly [K in Act4BossId]: Pick<BossDef, 'releaseWindowSeconds' | 'mercyVerb' | 'releaseBurnCost'> } = {
  [ACT4_BOSS_IDS.bellowsEngine]: { releaseWindowSeconds: 0 },
  [ACT4_BOSS_IDS.eormen]: { mercyVerb: 'release', releaseBurnCost: 20 },
};
