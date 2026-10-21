import { codexEntry, type CodexEntryDef } from '../../codex/entries';

/** The bestiary kinds A6b adds; each is unlocked on first sight (`codex.unlock('<kind>')`). */
export const GROUND_CODEX_KINDS = ['cinder-golem', 'slag-crawler', 'kindling-fox', 'hunter-spearman', 'hunter-harpooner'] as const;

export const GROUND_CODEX: readonly CodexEntryDef[] = GROUND_CODEX_KINDS.map((k) => codexEntry('bestiary', k, k, k === 'slag-crawler' ? 'mercy' : undefined));

/** First sight: within this many metres. */
export const CODEX_SIGHT = 22;
