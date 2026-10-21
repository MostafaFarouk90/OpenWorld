/**
 * The Weeping Bellows' routing (design 7.2). Valve `i` feeds brazier `i`, and its position names which of the bellows
 * feeds it, so a routing is the list of valve positions. The wall plaque shows the target list.
 */
export type Routing = readonly number[];

/** True when the routing equals the plaque on every valve. Lengths must agree. */
export function routingMatches(valves: Routing, plaque: Routing): boolean {
  return valves.length === plaque.length && valves.every((v, i) => v === plaque[i]);
}

/** How many valves are on their plaque position (for a hint line). */
export function routingCorrect(valves: Routing, plaque: Routing): number {
  let n = 0;
  for (let i = 0; i < plaque.length; i++) if (valves[i] === plaque[i]) n++;
  return n;
}

/** Valve turns still needed to reach the plaque from `valves` on wheels of `positions` notches (each turn adds one). */
export function turnsNeeded(valves: Routing, plaque: Routing, positions: number): number {
  let n = 0;
  for (let i = 0; i < plaque.length; i++) n += (((plaque[i] - valves[i]) % positions) + positions) % positions;
  return n;
}
