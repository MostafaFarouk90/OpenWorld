/** Codex entry data (plan 2.2, amendments in section 7). Text lives in `strings.en.ts` under `codex.*`. */

export type CodexTab = 'bestiary' | 'lore' | 'howto';
export const CODEX_TABS: readonly CodexTab[] = ['bestiary', 'lore', 'howto'];

export interface CodexEntryDef {
  /** Unlock id. Bestiary entries use the enemy kind id; others are `howto.*` / `lore.*`. */
  id: string;
  tab: CodexTab;
  /** String keys: `codex.<tab>.<slug>.name` and `.body`. */
  nameKey: string;
  bodyKey: string;
}

function entry(tab: CodexTab, id: string, slug: string): CodexEntryDef {
  return { id, tab, nameKey: `codex.${tab}.${slug}.name`, bodyKey: `codex.${tab}.${slug}.body` };
}

/** Bestiary, keyed by kind id (src/enemies/types.ts; the Ashen Prior is the boss id). No scarecrow, no Blightbloom. */
export const BESTIARY_IDS = ['blighted-soldier', 'ash-wraith', 'ashen-prior'] as const;

export const HOWTO_IDS = {
  release: 'howto.release',
  spare: 'howto.spare',
  burnScars: 'howto.burn-scars',
  surgeLeap: 'howto.surge-leap',
  rallyCry: 'howto.rally-cry',
  warmthTier: 'howto.warmth-tier',
} as const;

/** Lore ids owned here; other threads call `codex.unlock(id)` with these strings. */
export const LORE_IDS = { leapA: 'lore.leap-a', leapB: 'lore.leap-b' } as const;

export const CODEX_ENTRIES: readonly CodexEntryDef[] = [
  ...BESTIARY_IDS.map((id) => entry('bestiary', id, id)),
  entry('lore', LORE_IDS.leapA, 'leap-a'),
  entry('lore', LORE_IDS.leapB, 'leap-b'),
  entry('howto', HOWTO_IDS.release, 'release'),
  entry('howto', HOWTO_IDS.spare, 'spare'),
  entry('howto', HOWTO_IDS.burnScars, 'burn-scars'),
  entry('howto', HOWTO_IDS.surgeLeap, 'surge-leap'),
  entry('howto', HOWTO_IDS.rallyCry, 'rally-cry'),
  entry('howto', HOWTO_IDS.warmthTier, 'warmth-tier'),
];

export function entriesOf(tab: CodexTab): CodexEntryDef[] {
  return CODEX_ENTRIES.filter((e) => e.tab === tab);
}

export function findEntry(id: string): CodexEntryDef | undefined {
  return CODEX_ENTRIES.find((e) => e.id === id);
}
