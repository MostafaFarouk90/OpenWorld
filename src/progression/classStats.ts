import { DEFAULT_CLASS_ID } from './skills';

/** Level-1 and per-level numbers of a class (design 9). Only health is wired in this slice; stamina and Ember are data. */
export interface ClassBaseStats {
  health: number;
  healthPerLevel: number;
  stamina: number;
  ember: number;
}

export const KNIGHT_STATS: Readonly<ClassBaseStats> = { health: 120, healthPerLevel: 10, stamina: 100, ember: 30 };

const stats = new Map<string, ClassBaseStats>([[DEFAULT_CLASS_ID, { ...KNIGHT_STATS }]]);

export type RegisterStatsResult = { ok: true } | { ok: false; reason: 'duplicate' | 'bad-class' | 'bad-stats' };

const finitePositive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** Class threads register their row (design 9 table); the Knight's is built in. */
export function registerClassStats(classId: string, row: ClassBaseStats): RegisterStatsResult {
  if (typeof classId !== 'string' || classId.length === 0) return { ok: false, reason: 'bad-class' };
  if (stats.has(classId)) return { ok: false, reason: 'duplicate' };
  if (![row?.health, row?.healthPerLevel, row?.stamina, row?.ember].every(finitePositive)) return { ok: false, reason: 'bad-stats' };
  stats.set(classId, { ...row });
  return { ok: true };
}

/** The row for a class; an unknown or missing class plays as the Knight. */
export function classStats(classId: string | null | undefined): Readonly<ClassBaseStats> {
  return (classId ? stats.get(classId) : undefined) ?? stats.get(DEFAULT_CLASS_ID)!;
}

export function hasClassStats(classId: string): boolean {
  return stats.has(classId);
}

/** Test seam. */
export function resetClassStats(): void {
  stats.clear();
  stats.set(DEFAULT_CLASS_ID, { ...KNIGHT_STATS });
}
