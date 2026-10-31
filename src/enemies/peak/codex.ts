import { codexEntry, type CodexEntryDef } from '../../codex/entries';

/** The Dragonspine's bestiary kinds (K6b PR 2; K15 shows them): each is unlocked on first sight (`codex.unlock('<kind>')`). */
export const DRAGONSPINE_CODEX_KINDS = ['rime-hawk', 'crag-ogre'] as const;

/** Both entries name the mercy key (Calm). */
export const DRAGONSPINE_CODEX: readonly CodexEntryDef[] = DRAGONSPINE_CODEX_KINDS.map((k) => codexEntry('bestiary', k, k, 'mercy'));

/** First sight: within this many metres (a soaring hawk is seen farther off than a ground enemy). */
export const DRAGONSPINE_CODEX_SIGHT = 30;
