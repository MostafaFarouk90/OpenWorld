// Neutral props that every attack must be able to strike: a boss arena's struck structures (contracts v0.8 item 11, the
// structure-break hook). A bolt with `hostileOnly` and the Emberwright's spells skip neutral actors except these kinds, so a
// bow or a spell can shut the Bellows-Engine's valves (Act 4 L6, the "every class can finish" principle). Eormen's Last Gong
// (L6 PR 2) joins the list.
export const STRUCK_PROP_KINDS: ReadonlySet<string> = new Set(['bellows-valve']);

/** A neutral struck prop (never a neutral person or creature). */
export function isStruckProp(a: { team: string; kind: string }): boolean {
  return a.team === 'neutral' && STRUCK_PROP_KINDS.has(a.kind);
}
