// Act 4 codex entries that L9 owns (plans/act4-L9.md section 5): the two bosses, the Waste's places and the two Harrowmark
// interiors, the people of the act, the first dream, the chime and three how-tos. The Waste creature rows are L5's data
// (`WASTE_CODEX_ROWS`, src/enemies/waste/codex.ts), registered here too (see wasteRows.ts) so the ids live in one plugin.
import { codexEntry, type CodexEntryDef } from '../entries';
import { ACT4_BOSS_IDS } from '../../bosses/act4Bosses';

export const ACT4_CODEX_IDS = {
  bellowsEngine: ACT4_BOSS_IDS.bellowsEngine,
  eormen: ACT4_BOSS_IDS.eormen,
  waste: 'lore.place.ashen-waste',
  ashgate: 'lore.place.ashgate',
  walkerCamp: 'lore.place.walker-camp',
  cinderChapel: 'lore.place.cinder-chapel',
  glasslands: 'lore.place.glasslands',
  huskCathedral: 'lore.place.husk-cathedral',
  rimfoot: 'lore.place.rimfoot',
  councilChamber: 'lore.place.council-chamber',
  crucible: 'lore.place.crucible',
  gaut: 'lore.person.gaut',
  vey: 'lore.person.vey',
  wulfhild: 'lore.person.wulfhild',
  hild: 'lore.person.hild',
  ebba: 'lore.person.ebba',
  ashwalkers: 'lore.person.ashwalkers',
  dream: 'lore.dream.first',
  chime: 'lore.chime',
  storms: 'howto.ash-storms',
  mask: 'howto.ash-mask',
  escorts: 'howto.escorts',
} as const;

const ID = ACT4_CODEX_IDS;

export const ACT4_CODEX_ENTRIES: readonly CodexEntryDef[] = [
  codexEntry('bestiary', ID.bellowsEngine, 'bellows-engine'),
  codexEntry('bestiary', ID.eormen, 'eormen'),
  codexEntry('lore', ID.waste, 'place-ashen-waste'),
  codexEntry('lore', ID.ashgate, 'place-ashgate'),
  codexEntry('lore', ID.walkerCamp, 'place-walker-camp'),
  codexEntry('lore', ID.cinderChapel, 'place-cinder-chapel'),
  codexEntry('lore', ID.glasslands, 'place-glasslands'),
  codexEntry('lore', ID.huskCathedral, 'place-husk-cathedral'),
  codexEntry('lore', ID.rimfoot, 'place-rimfoot'),
  codexEntry('lore', ID.councilChamber, 'place-council-chamber'),
  codexEntry('lore', ID.crucible, 'place-crucible'),
  codexEntry('lore', ID.gaut, 'person-gaut'),
  codexEntry('lore', ID.vey, 'person-vey'),
  codexEntry('lore', ID.wulfhild, 'person-wulfhild'),
  codexEntry('lore', ID.hild, 'person-hild'),
  codexEntry('lore', ID.ebba, 'person-ebba'),
  codexEntry('lore', ID.ashwalkers, 'person-ashwalkers'),
  codexEntry('lore', ID.dream, 'dream-first'),
  codexEntry('lore', ID.chime, 'chime'),
  codexEntry('howto', ID.storms, 'ash-storms'),
  codexEntry('howto', ID.mask, 'ash-mask'),
  codexEntry('howto', ID.escorts, 'escorts'),
];
