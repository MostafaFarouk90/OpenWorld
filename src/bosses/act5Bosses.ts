// v0.9 item 7: the Act 5 boss ids and the BossDef fields that make them what they are. N6 (Vey, D09; Ulthred, D10) spreads
// these rules into the defs; this file reserves the ids so no other thread takes them.
import type { BossDef } from '../actors/BossRegistry';

export const ACT5_BOSS_IDS = { vey: 'vey', ulthred: 'ulthred' } as const;

export type Act5BossId = (typeof ACT5_BOSS_IDS)[keyof typeof ACT5_BOSS_IDS];

/** Design levels before the Q3 cap (`act5BossLevel`). */
export const ACT5_BOSS_BASE_LEVEL: { readonly [K in Act5BossId]: number } = { vey: 38, ulthred: 40 };

/**
 * Vey can be spared (one phase of four breaks; outcome 'spared' or 'defeated'). Ulthred has no mercy (release window 0):
 * three phases at 66% and 33%, three breaks each; outcome 'defeated'.
 */
export const ACT5_BOSS_RULES: { readonly [K in Act5BossId]: Pick<BossDef, 'releaseWindowSeconds' | 'mercyVerb' | 'phases' | 'breaksPerPhase'> } = {
  [ACT5_BOSS_IDS.vey]: { mercyVerb: 'spare', phases: [], breaksPerPhase: 4 },
  [ACT5_BOSS_IDS.ulthred]: { releaseWindowSeconds: 0, phases: [0.66, 0.33], breaksPerPhase: 3 },
};

/** The outcome flags the boss registry writes (`boss.<id>.outcome`). */
export const ACT5_BOSS_OUTCOME_FLAGS: readonly string[] = Object.values(ACT5_BOSS_IDS).map((id) => `boss.${id}.outcome`);
