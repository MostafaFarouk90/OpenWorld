// v0.8 item 7: the companion ids and the top bond rank as light constants, so the quest and dialogue validators can check
// `setCompanionRank` without importing the companions plugin. Pinned to COMPANION_DEFS and MAX_RANK by companionIds.test.ts.
export const COMPANION_IDS = ['tobb', 'hrolf', 'aelfreda'] as const;
export type CompanionId = (typeof COMPANION_IDS)[number];
export const COMPANION_MAX_RANK = 5;

export function isCompanionId(v: unknown): v is CompanionId {
  return typeof v === 'string' && (COMPANION_IDS as readonly string[]).includes(v);
}
