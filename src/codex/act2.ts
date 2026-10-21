// Act 2 codex entries that no other Act 2 thread owns (A15): the two bosses, the places, Pickett and the nursery, and
// four how-tos. Creature rows (golems, crawlers, foxes, wyrms), the Hushed Anvil murals, POI lore stones, quest lore
// notes and class skill how-tos are registered by their own threads; a duplicate id is skipped with a warning, so none
// is repeated here (act2.test.ts checks the ids against the other registrations it can see).
import { codexEntry, type CodexEntryDef } from './entries';

export const ACT2_CODEX_IDS = {
  redmane: 'thrandil-redmane',
  slagmaw: 'the-slagmaw',
  cinderford: 'lore.place.cinderford',
  scorchhold: 'lore.place.scorchhold',
  deepgate: 'lore.place.deepgate',
  oldsmokeMines: 'lore.place.oldsmoke-mines',
  pickett: 'lore.pickett',
  nursery: 'lore.nursery',
  tempering: 'howto.tempering',
  hearthRite: 'howto.hearth-rite',
  spareRedmane: 'howto.spare-redmane',
  party: 'howto.party',
} as const;

export const ACT2_CODEX_ENTRIES: readonly CodexEntryDef[] = [
  codexEntry('bestiary', ACT2_CODEX_IDS.redmane, 'thrandil-redmane', 'mercy'),
  codexEntry('bestiary', ACT2_CODEX_IDS.slagmaw, 'the-slagmaw'),
  codexEntry('lore', ACT2_CODEX_IDS.cinderford, 'place-cinderford'),
  codexEntry('lore', ACT2_CODEX_IDS.scorchhold, 'place-scorchhold'),
  codexEntry('lore', ACT2_CODEX_IDS.deepgate, 'place-deepgate'),
  codexEntry('lore', ACT2_CODEX_IDS.oldsmokeMines, 'place-oldsmoke-mines'),
  codexEntry('lore', ACT2_CODEX_IDS.pickett, 'pickett'),
  codexEntry('lore', ACT2_CODEX_IDS.nursery, 'nursery'),
  codexEntry('howto', ACT2_CODEX_IDS.tempering, 'tempering', 'attack1'),
  codexEntry('howto', ACT2_CODEX_IDS.hearthRite, 'hearth-rite'),
  codexEntry('howto', ACT2_CODEX_IDS.spareRedmane, 'spare-redmane', 'mercy'),
  codexEntry('howto', ACT2_CODEX_IDS.party, 'party', 'party'),
];

/** Flags whose truthiness unlocks an entry (backfilled on load, like the Act 1 first-use flags). Quest flags are read, never written. */
export const ACT2_FLAG_UNLOCKS: readonly { flag: string; entry: string }[] = [
  { flag: 'story.d03.started', entry: ACT2_CODEX_IDS.scorchhold },
  { flag: 'story.m16.started', entry: ACT2_CODEX_IDS.deepgate },
  { flag: 'story.r08.started', entry: ACT2_CODEX_IDS.pickett },
  { flag: 'story.m19.complete', entry: ACT2_CODEX_IDS.nursery },
  { flag: 'place.oldsmoke.discovered', entry: ACT2_CODEX_IDS.oldsmokeMines },
];

/** Event-driven unlocks: `discover` place ids, and plain events. */
export const ACT2_DISCOVER_UNLOCKS: Readonly<Record<string, string>> = {
  'waystone.cinderford': ACT2_CODEX_IDS.cinderford,
  oldsmoke: ACT2_CODEX_IDS.oldsmokeMines,
};

export const ACT2_CODEX_STRINGS_EN: Record<string, string> = {
  'codex.bestiary.thrandil-redmane.name': 'Hunt-Captain Thrandil Redmane',
  'codex.bestiary.thrandil-redmane.body':
    'Redmane commands the dragon-hunters at Scorchhold. He charges with a lance, and he throws a net to pin you where you stand. Break his guard and he kneels: hold {key} to spare him and he will testify, or finish him and the hunters scatter without a word said.',
  'codex.bestiary.the-slagmaw.name': 'The Slagmaw',
  'codex.bestiary.the-slagmaw.body':
    'Something old and hungry sleeps under the Deepdelve, fed on cinder and slag. It burrows, and the floor erupts where it surfaces. Cold water from the cooling valves makes it stagger.',
  'codex.lore.place-cinderford.name': 'Cinderford',
  'codex.lore.place-cinderford.body':
    'A river town on black soil, three days from Harrowmark. Its barricade is new and its households are tired. An ember wyrm raids it at dusk.',
  'codex.lore.place-scorchhold.name': 'Scorchhold',
  'codex.lore.place-scorchhold.body':
    'The hunters\' fort on the hills above the Cinder Road. Its walls are scorched to the colour of old iron. Dragon-hide hangs from the gate.',
  'codex.lore.place-deepgate.name': 'Deepgate',
  'codex.lore.place-deepgate.body':
    'House Grisel\'s mining town at the head of the shaft. Everything here is paid for in ore, and the lift is the only road down.',
  'codex.lore.place-oldsmoke-mines.name': 'The Oldsmoke Mines',
  'codex.lore.place-oldsmoke-mines.body':
    'Rust-red rock, spoil heaps, and a pass the Regent\'s coin has kept open. The old galleries were sealed for a reason nobody at Deepgate will give.',
  'codex.lore.pickett.name': 'Wilfrid Pickett',
  'codex.lore.pickett.body':
    'A miner of the old shift crew who never came up. His lantern still burns in the Old Galleries, and so does his habit of finishing the work. A widow in Deepgate still has his pay chit.',
  'codex.lore.nursery.name': 'The Nursery',
  'codex.lore.nursery.body':
    'Chained wyrmlings, fed on slag, kept in the sealed galleries under Grisel Hall. This is where the dragon-heart trade begins.',
  'codex.howto.tempering.name': 'Tempering',
  'codex.howto.tempering.body':
    'Gear can be tempered up to +5 for gold and ore. At the Hushed Anvil, strike on the beat with {key}: a perfect bar may leave a mark on the piece. A smith can temper to +3 without the beat.',
  'codex.howto.hearth-rite.name': 'The Hearth Rite',
  'codex.howto.hearth-rite.body': 'Once each act, Sister Aelfreda can lift one Scar from you at a hearth. Burn costs you nothing for it.',
  'codex.howto.spare-redmane.name': 'Sparing a captain',
  'codex.howto.spare-redmane.body': 'Some foes can be spared rather than released. When Redmane kneels, hold {key}: a spared man can speak for you later.',
  'codex.howto.party.name': 'The party',
  'codex.howto.party.body': 'Rest at a waystone with companions in camp, then press {key} to choose who travels with you. The screen is read-only away from a waystone rest.',
};
