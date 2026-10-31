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
  dragonspine: 'lore.place.dragonspine',
  wyrmwatchLodge: 'lore.place.wyrmwatch-lodge',
  rimePass: 'lore.place.rime-pass',
  lastAnvil: 'lore.place.last-anvil',
  frostfangAerie: 'lore.place.frostfang-aerie',
  gliding: 'howto.gliding',
  summit: 'howto.summit',
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
  // PR 2: the Dragonspine and its summit. The bestiary (K6b), Ysmeryth (K6a) and the rubbings (K2 through K9) are theirs.
  codexEntry('lore', ACT3_CODEX_IDS.dragonspine, 'place-dragonspine'),
  codexEntry('lore', ACT3_CODEX_IDS.wyrmwatchLodge, 'place-wyrmwatch-lodge'),
  codexEntry('lore', ACT3_CODEX_IDS.rimePass, 'place-rime-pass'),
  codexEntry('lore', ACT3_CODEX_IDS.lastAnvil, 'place-last-anvil'),
  codexEntry('lore', ACT3_CODEX_IDS.frostfangAerie, 'place-frostfang-aerie'),
  codexEntry('howto', ACT3_CODEX_IDS.gliding, 'gliding'),
  codexEntry('howto', ACT3_CODEX_IDS.summit, 'summit'),
  codexEntry('howto', ACT3_CODEX_IDS.wading, 'wading'),
  codexEntry('howto', ACT3_CODEX_IDS.diving, 'diving'),
  codexEntry('howto', ACT3_CODEX_IDS.ferry, 'ferry'),
  codexEntry('howto', ACT3_CODEX_IDS.blockLevels, 'block-levels'),
  codexEntry('howto', ACT3_CODEX_IDS.shardGems, 'shard-gems'),
];
