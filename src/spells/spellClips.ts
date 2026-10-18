/** Measured spellcast clips. `release` and `activeStart`/`activeEnd` are normalised clip time; `duration` is seconds. */
export const SPELLCAST_CLIPS: Record<string, { duration: number; release: number; activeStart: number; activeEnd: number; usedBy: string }> = {
  Spellcast_Raise: { duration: 2.1, release: 0.37, activeStart: 0.04, activeEnd: 0.94, usedBy: 'Heartshard Surge' },
  Spellcast_Long: { duration: 2.533, release: 0.54, activeStart: 0.02, activeEnd: 0.89, usedBy: 'test projectile spell' },
  Spellcast_Shoot: { duration: 0.933, release: 0.18, activeStart: 0.05, activeEnd: 0.25, usedBy: 'reserved' },
  Spellcasting: { duration: 0.667, release: 1.0, activeStart: 0.07, activeEnd: 0.95, usedBy: 'reserved' },
  // Release chosen by eye: the hands rise from 0.2 to a peak at 0.74.
  Cheer: { duration: 1.667, release: 0.45, activeStart: 0.0, activeEnd: 1.0, usedBy: 'Rally Cry' },
};
