/**
 * The carried-over Knight the hound packs are tuned against: the level and maximum health the headless chain measured when each
 * quest started (the census, act2Xp.ts). Phase C run A pins R05's row and Phase D run A pins M16's against the live census, so a
 * tuning change that moves the carried character fails there, and difficulty.test.ts reads the same table.
 */
export const CARRIED_KNIGHT: Record<'r05' | 'm16', { level: number; maxHealth: number }> = {
  r05: { level: 11, maxHealth: 163 },
  m16: { level: 14, maxHealth: 194 },
};
