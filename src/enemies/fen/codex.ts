import { codexEntry, type CodexEntryDef } from '../../codex/entries';

/** The Greyfen's bestiary kinds (K6b PR 1; K15 PR 1 shows them): each is unlocked on first sight (`codex.unlock('<kind>')`). */
export const GREYFEN_CODEX_KINDS = ['fen-leech', 'peat-shambler'] as const;

/** The leech's entry has no `{key}`; the shambler's names the Lay to rest key (the mercy action). */
export const GREYFEN_CODEX: readonly CodexEntryDef[] = GREYFEN_CODEX_KINDS.map((k) => codexEntry('bestiary', k, k, k === 'peat-shambler' ? 'mercy' : undefined));

/** First sight: within this many metres (the ground enemies' distance). */
export const GREYFEN_CODEX_SIGHT = 22;
