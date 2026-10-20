import type { QuestNoteSpec } from '../notes';

/** Codex lore entries the notes unlock (registered by the quests plugin; text in strings.density.en.ts). */
export const NOTE_CODEX = {
  disgrace: 'lore.disgrace',
  regentOrder: 'lore.regent-order',
  wulfric: 'lore.wulfric',
  hearthkeepers: 'lore.hearthkeepers',
  tollLedger: 'lore.toll-ledger',
  mourningBox: 'lore.mourning-box',
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
];

/** The look drawn at each note's anchor. */
export const NOTE_LOOKS: Record<string, 'page' | 'grave' | 'box'> = {
  'use:note-m02-badge': 'box',
  'use:note-m02-order': 'page',
  'use:note-m03-wulfric': 'grave',
  'use:note-m03-record': 'page',
  'use:note-m04-toll-box': 'box',
  'use:note-r01-shawl': 'page',
};
