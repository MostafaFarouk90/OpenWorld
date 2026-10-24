/**
 * The Fen Leech's drain bite: takes `n` stamina from the actor (the player), never below 0. A target without a stamina pool
 * (a test actor, a companion port) is left alone. Returns the stamina taken.
 */
export function drainStamina(actor: unknown, n: number): number {
  const a = actor as { stamina?: unknown } | null;
  if (!a || typeof a.stamina !== 'number' || !Number.isFinite(a.stamina) || !(n > 0)) return 0;
  const taken = Math.min(a.stamina, n);
  a.stamina = a.stamina - taken;
  return taken;
}

/**
 * The drain bite on the player: through the `combatVerbs` service's `drainStamina` (so the regen delay and exhaustion apply,
 * as a guard break's), else straight off the pool (test hosts without the player plugin).
 */
export function drainPlayer(verbs: { drainStamina?(n: number): void } | undefined, player: unknown, n: number): void {
  if (!(n > 0)) return;
  if (typeof verbs?.drainStamina === 'function') verbs.drainStamina(n);
  else drainStamina(player, n);
}
