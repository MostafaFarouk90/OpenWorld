// A plain flag test for data tables (region open rules, fog walls, phase holds). Not the quests' `Condition`
// (src/quests/types.ts), which is a richer tree; this one is three flat lists so gates can watch its keys.

export interface FlagCondition {
  /** Every flag truthy. */
  all?: readonly string[];
  /** At least one flag truthy (an empty or missing list is no constraint). */
  any?: readonly string[];
  /** Every flag falsy. */
  none?: readonly string[];
}

export interface FlagReader {
  getFlag(key: string): unknown;
}

/** True when `cond` holds for `state`. An empty condition always holds. */
export function flagConditionHolds(cond: FlagCondition, state: FlagReader): boolean {
  const on = (k: string) => Boolean(state.getFlag(k));
  if (cond.all && !cond.all.every(on)) return false;
  if (cond.any && cond.any.length > 0 && !cond.any.some(on)) return false;
  if (cond.none && cond.none.some(on)) return false;
  return true;
}

/** Every flag key the condition reads, once each (for `gates.watch` keys). */
export function conditionKeys(cond: FlagCondition): string[] {
  return [...new Set([...(cond.all ?? []), ...(cond.any ?? []), ...(cond.none ?? [])])];
}
