import type { QuestNoteSpec } from '../notes';

/** Codex lore entries the notes unlock (registered by the quests plugin; text in strings.density.en.ts). */
export const NOTE_CODEX = {
  disgrace: 'lore.disgrace',
  regentOrder: 'lore.regent-order',
  wulfric: 'lore.wulfric',
  hearthkeepers: 'lore.hearthkeepers',
  tollLedger: 'lore.toll-ledger',
  mourningBox: 'lore.mourning-box',
  pilgrimJournal: 'lore.pilgrim-journal',
  roadDead: 'lore.road-dead',
  priorAldhelm: 'lore.prior-aldhelm',
} as const;

/** Readable notes, batch 1 (Brightwater). Anchors in src/region/density.layout.ts. */
export const QUEST_NOTES: QuestNoteSpec[] = [
  { interactableId: 'use:note-m02-badge', anchorId: 'm02.badge', codexId: NOTE_CODEX.disgrace },
  { interactableId: 'use:note-m02-order', anchorId: 'm02.order-board', codexId: NOTE_CODEX.regentOrder },
  // M03's two extra study points read only while that objective is being worked (they are Cael's own thoughts)
  {
    interactableId: 'use:note-m03-font', anchorId: 'chapel.font', promptKey: 'quest.prompt.study',
    when: { all: [{ quest: 'm03', state: 'active' }, { objective: ['m03', 'o2'], done: true }] },
  },
  {
    interactableId: 'use:note-m03-ember', anchorId: 'chapel.ember-study', promptKey: 'quest.prompt.study',
    when: { all: [{ quest: 'm03', state: 'active' }, { objective: ['m03', 'o2'], done: true }] },
  },
  { interactableId: 'use:note-m03-wulfric', anchorId: 'm03.grave-wulfric', codexId: NOTE_CODEX.wulfric },
  // the third M03 study; readable any time (it only counts while the studies are current)
  { interactableId: 'use:note-m03-record', anchorId: 'chapel.record', codexId: NOTE_CODEX.hearthkeepers },
  {
    // the toll box opens once the post is down
    interactableId: 'use:note-m04-toll-box', anchorId: 'm04.toll-box', codexId: NOTE_CODEX.tollLedger,
    when: { any: [{ flag: 'world.brightwater.tollPost', equals: true }, { quest: 'm04', state: 'completed' }] },
  },
  { interactableId: 'use:note-r01-shawl', anchorId: 'r01.shawl', codexId: NOTE_CODEX.mourningBox },

  // ---- batch 2: the Dead Road and the vault ----
  { interactableId: 'use:note-m05-journal', anchorId: 'm05.journal', codexId: NOTE_CODEX.pilgrimJournal },
  // road points of interest, readable any time (the reed-island ledge already has its own lore stone, content/poi.ts)
  { interactableId: 'use:note-deadroad-stone-1', anchorId: 'poi.deadroad.stone-1', codexId: NOTE_CODEX.roadDead },
  { interactableId: 'use:note-deadroad-stone-2', anchorId: 'poi.deadroad.stone-2', codexId: NOTE_CODEX.roadDead },
  { interactableId: 'use:note-deadroad-barrow', anchorId: 'poi.deadroad.barrow', codexId: NOTE_CODEX.roadDead },
  // Prior Aldhelm's prayer tablets in the vault corridor and ossuary
  ...[1, 2, 3, 4].map((n): QuestNoteSpec => ({
    interactableId: `use:note-d01-tablet-${n}`, anchorId: `d01.tablet-${n}`, codexId: NOTE_CODEX.priorAldhelm,
  })),
  // the Prior's censer, where he fell (Cael's reading), once the fight has an outcome
  { interactableId: 'use:note-d01-censer', anchorId: 'd01.censer', when: {
    any: [{ flag: 'boss.ashen-prior.outcome', equals: 'released' }, { flag: 'boss.ashen-prior.outcome', equals: 'defeated' }],
  } },

  // ---- batch 4: Harrowmark part 2 ----
  // M08: the carved screen behind the dais, where the Regent's private word carries once the audience is over
  {
    interactableId: 'use:note-m08-screen', anchorId: 'm08.screen', promptKey: 'quest.prompt.listen',
    when: { all: [{ quest: 'm08', state: 'active' }, { objective: ['m08', 'o3'], done: true }] },
  },
  // M09: the Regent's day-book on the entry cabinet, read once inside
  {
    interactableId: 'use:note-m09-daybook', anchorId: 'm09.daybook',
    when: { all: [{ quest: 'm09', state: 'active' }, { objective: ['m09', 'o2'], done: true }] },
  },
  // M10: the sealed orders, where the courier dropped them, once he is caught
  {
    interactableId: 'use:note-m10-orders', anchorId: 'm10.courier-orders',
    when: { all: [{ quest: 'm10', state: 'active' }, { objective: ['m10', 'o3'], done: true }] },
  },
  // D02: a smelter hand's tally chalked by the sluice valves, read once the kennels are behind
  {
    interactableId: 'use:note-d02-tally', anchorId: 'd02.tally',
    when: { all: [{ quest: 'd02', state: 'active' }, { objective: ['d02', 'o3'], done: true }] },
  },
  // D02: the crates in Grimtooth's den, once the fight has an outcome
  { interactableId: 'use:note-d02-crates', anchorId: 'd02.den-crates', when: {
    any: [{ flag: 'boss.gaffer-grimtooth.outcome', equals: 'released' }, { flag: 'boss.gaffer-grimtooth.outcome', equals: 'defeated' }],
  } },
];

/** The look drawn at each note's anchor. */
export const NOTE_LOOKS: Record<string, 'page' | 'grave' | 'box'> = {
  'use:note-m02-badge': 'box',
  'use:note-m02-order': 'page',
  'use:note-m03-wulfric': 'grave',
  'use:note-m03-record': 'page',
  'use:note-m04-toll-box': 'box',
  'use:note-r01-shawl': 'page',
  'use:note-m05-journal': 'page',
  'use:note-deadroad-stone-1': 'grave',
  'use:note-deadroad-stone-2': 'grave',
  'use:note-deadroad-barrow': 'grave',
  'use:note-d01-tablet-1': 'grave',
  'use:note-d01-tablet-2': 'grave',
  'use:note-d01-tablet-3': 'grave',
  'use:note-d01-tablet-4': 'grave',
  'use:note-d01-censer': 'box',
  'use:note-m09-daybook': 'page',
  'use:note-m10-orders': 'page',
  'use:note-d02-tally': 'grave',
  'use:note-d02-crates': 'box',
};
