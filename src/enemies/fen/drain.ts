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
