// v0.7 item 13: the Act 3 boss ids and the BossDef fields that make them what they are. The encounters (K6a, K6b) spread
// these rules into their own defs; this file reserves the ids so no other thread takes them.
import type { BossDef } from '../actors/BossRegistry';

export const ACT3_BOSS_IDS = { murkjaw: 'murkjaw', corvinSkarl: 'corvin-skarl' } as const;

export type Act3BossId = (typeof ACT3_BOSS_IDS)[keyof typeof ACT3_BOSS_IDS];

/**
 * Murkjaw takes no mercy (no release window opens: `BossRegistry` accepts 0 since #137); Corvin Skarl is spared, not released.
 * Skarl's drake-chain forced break is `BossDef.acceptBreak` (the one forced-break hook).
 */
export const ACT3_BOSS_RULES: { readonly [K in Act3BossId]: Pick<BossDef, 'releaseWindowSeconds' | 'mercyVerb'> } = {
  [ACT3_BOSS_IDS.murkjaw]: { releaseWindowSeconds: 0 },
  [ACT3_BOSS_IDS.corvinSkarl]: { mercyVerb: 'spare' },
};
