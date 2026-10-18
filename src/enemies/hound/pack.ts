import type { ActorId } from '../ports';

/**
 * Orders actor ids (`${kind}#${n}`) by their number, then by text, so `ember-hound#9` comes before
 * `ember-hound#12` (a plain string compare would put 12 first).
 */
export function compareActorIds(a: ActorId, b: ActorId): number {
  const na = trailingNumber(a);
  const nb = trailingNumber(b);
  if (na !== nb && Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a < b ? -1 : a > b ? 1 : 0;
}

function trailingNumber(id: ActorId): number {
  const m = /#(\d+)$/.exec(id);
  return m ? Number(m[1]) : Number.NaN;
}

/**
 * The pack leader of a spawner's living members: the lowest actor id (plans/slice-2-enemies.md section 7).
 * A dead leader is simply not in `livingIds`, so the next lowest takes over; null when nobody lives.
 */
export function pickPackLeader(livingIds: Iterable<ActorId>): ActorId | null {
  let best: ActorId | null = null;
  for (const id of livingIds) if (best === null || compareActorIds(id, best) < 0) best = id;
  return best;
}
