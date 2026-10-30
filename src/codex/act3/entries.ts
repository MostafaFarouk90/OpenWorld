// Act 3 codex entries that K15 owns (PR 1): the Greyfen and its four places, and four how-tos for the new traversal and gear
// rules. The creature rows (leech, shambler: K6b; skarl-drake and Hathren: K6a; Murkjaw: K8; the rubbings: K9 and K2) are
// registered by their own threads. Ids here are checked against the other registrations by codexAct3.test.ts.
import { codexEntry, type CodexEntryDef } from '../entries';

export const ACT3_CODEX_IDS = {
  greyfen: 'lore.place.greyfen',
  reedgate: 'lore.place.reedgate',
  greywatch: 'lore.place.greywatch',
  mireweather: 'lore.place.mireweather',
  mere: 'lore.place.hathrens-mere',
  wading: 'howto.wading',
  diving: 'howto.diving',
  ferry: 'howto.ferry',
  blockLevels: 'howto.block-levels',
  shardGems: 'howto.shard-gems',
} as const;

export const ACT3_CODEX_ENTRIES: readonly CodexEntryDef[] = [
  codexEntry('lore', ACT3_CODEX_IDS.greyfen, 'place-greyfen'),
  codexEntry('lore', ACT3_CODEX_IDS.reedgate, 'place-reedgate'),
  codexEntry('lore', ACT3_CODEX_IDS.greywatch, 'place-greywatch'),
  codexEntry('lore', ACT3_CODEX_IDS.mireweather, 'place-mireweather'),
  codexEntry('lore', ACT3_CODEX_IDS.mere, 'place-hathrens-mere'),
  codexEntry('howto', ACT3_CODEX_IDS.wading, 'wading'),
  codexEntry('howto', ACT3_CODEX_IDS.diving, 'diving'),
  codexEntry('howto', ACT3_CODEX_IDS.ferry, 'ferry'),
  codexEntry('howto', ACT3_CODEX_IDS.blockLevels, 'block-levels'),
  codexEntry('howto', ACT3_CODEX_IDS.shardGems, 'shard-gems'),
];
