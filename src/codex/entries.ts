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
  /**
   * Optional input action whose glyph fills `{key}` in the body (e.g. 'mercy'). Built-ins use the
   * view's table; a registered def supplies its own here.
   */
  action?: string;
}

/** Builds a def from the `codex.<tab>.<slug>.name|.body` convention; the caller registers those strings via `ctx.strings`. */
export function codexEntry(tab: CodexTab, id: string, slug: string, action?: string): CodexEntryDef {
  const def: CodexEntryDef = { id, tab, nameKey: `codex.${tab}.${slug}.name`, bodyKey: `codex.${tab}.${slug}.body` };
  if (action !== undefined) def.action = action;
  return def;
}
const entry = codexEntry;

/** Bestiary, keyed by kind id (src/enemies/types.ts; the Ashen Prior is the boss id). No scarecrow, no Blightbloom. */
export const BESTIARY_IDS = ['blighted-soldier', 'ash-wraith', 'ashen-prior'] as const;

export const HOWTO_IDS = {
  release: 'howto.release',
  spare: 'howto.spare',
  calm: 'howto.calm',
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
  entry('howto', HOWTO_IDS.calm, 'calm'),
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

/** What the view reads entries through: built-ins first, then registered ones in registration order. */
export interface CodexEntrySource {
  of(tab: CodexTab): readonly CodexEntryDef[];
  find(id: string): CodexEntryDef | undefined;
}

/** Built-in plus registered entries. Unlock state is not kept here (it is by id, independent of defs). */
export class CodexRegistry implements CodexEntrySource {
  private readonly extra: CodexEntryDef[] = [];

  constructor(
    private readonly builtins: readonly CodexEntryDef[] = CODEX_ENTRIES,
    private readonly warn: (msg: string) => void = () => {},
  ) {}

  of(tab: CodexTab): readonly CodexEntryDef[] {
    return [...this.builtins, ...this.extra].filter((e) => e.tab === tab);
  }

  find(id: string): CodexEntryDef | undefined {
    return this.builtins.find((e) => e.id === id) ?? this.extra.find((e) => e.id === id);
  }

  /** Adds valid, non-duplicate defs (others skipped with a warning). Returns an idempotent remover of exactly those added. */
  register(entries: readonly CodexEntryDef[]): () => void {
    const added: CodexEntryDef[] = [];
    const list = Array.isArray(entries) ? entries : [];
    if (!Array.isArray(entries)) this.warn('codex: register() needs an array of entries; ignored');
    for (const raw of list) {
      const e = raw as Partial<CodexEntryDef> | null | undefined;
      if (
        !e || typeof e.id !== 'string' || e.id === '' || !CODEX_TABS.includes(e.tab as CodexTab) ||
        typeof e.nameKey !== 'string' || e.nameKey === '' || typeof e.bodyKey !== 'string' || e.bodyKey === '' ||
        (e.action !== undefined && typeof e.action !== 'string')
      ) {
        this.warn(`codex: skipped invalid entry ${JSON.stringify(e?.id ?? null)}`);
        continue;
      }
      if (this.find(e.id)) {
        this.warn(`codex: skipped duplicate entry id '${e.id}'`);
        continue;
      }
      const def = { ...(e as CodexEntryDef) };
      this.extra.push(def);
      added.push(def);
    }
    return () => {
      for (const d of added.splice(0)) {
        const i = this.extra.indexOf(d);
        if (i >= 0) this.extra.splice(i, 1);
      }
    };
  }
}
