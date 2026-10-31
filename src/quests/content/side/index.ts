// Act 1 side jobs (j01 to j11), one file per job: j01 to j04 (Brightwater and the Dead Road), j05 to j10 (Harrowmark) and j11
// (the Underways). Everything here is data the quests plugin spreads next to the Act 1 tables (src/quests/content/index.ts,
// props, notes, carry, objective flags, posts).
import type { QuestDef } from '../../types';
import type { QuestPropSpec } from '../../props';
import type { QuestNoteSpec } from '../../notes';
import type { ObjectiveFlag } from '../../objectiveFlags';
import type { PostRule } from '../../posts';
import type { CarryItemSpec } from '../carry';
import { j01 } from './j01.quest';
import { j02 } from './j02.quest';
import { j03 } from './j03.quest';
import { j04 } from './j04.quest';
import { j05 } from './j05.quest';
import { j06 } from './j06.quest';
import { j07 } from './j07.quest';
import { j08 } from './j08.quest';
import { j09 } from './j09.quest';
import { j10 } from './j10.quest';
import { j11 } from './j11.quest';
import { J03_BLUFF, J03_TABLET } from './dialogues';
import { J05_NOTICE, J06_NOTICE, J07_NOTICE, J11_WAYBILL } from './dialogues.hm';

export { questStringsSide, dialogueStringsSide } from './strings.side.en';
export { SIDE_DIALOGUES, withSideJobs } from './dialogues';
export { startingNote, boardNotice } from './boards';

export const SIDE_QUEST_DEFS: QuestDef[] = [j01, j02, j03, j04, j05, j06, j07, j08, j09, j10, j11];
export const SIDE_QUEST_IDS: readonly string[] = SIDE_QUEST_DEFS.map((d) => d.id);

export const SIDE_PROPS: QuestPropSpec[] = [
  // j02: the basket on the bakery step
  {
    interactableId: 'use:j02-basket', anchorId: 'j02.basket', promptKey: 'quest.prompt.basket', objective: ['j02', 'basket'],
    usedFlag: 'story.j02.basketTaken', look: 'box', hideWhenUsed: true,
  },
  // j04: the old fire ring (lit once used)
  {
    interactableId: 'use:j04-fire', anchorId: 'j04.fire-ring', promptKey: 'quest.prompt.fireRing', objective: ['j04', 'fire'],
    usedFlag: 'story.j04.fireLit', look: 'brazier',
  },
  // j07: the chandler's bundle, and a candle in each of the three chapel niches
  {
    interactableId: 'use:j07-candles', anchorId: 'j07.candles', promptKey: 'quest.prompt.candles', objective: ['j07', 'candles'],
    usedFlag: 'story.j07.candlesTaken', look: 'candle', hideWhenUsed: true,
  },
  ...[1, 2, 3].map((n): QuestPropSpec => ({
    interactableId: `use:j07-niche-${n}`, anchorId: `j07.niche-${n}`, promptKey: 'quest.prompt.niche', objective: ['j07', `niche${n}`],
    usedFlag: `story.j07.niche.${n}`, look: 'candle', lookOnlyUsed: true,
  })),
  // j10: the fire ring in the Tilted Anvil yard
  {
    interactableId: 'use:j10-fire', anchorId: 'j10.fire-ring', promptKey: 'quest.prompt.fireRing', objective: ['j10', 'fire'],
    usedFlag: 'story.j10.fireLit', look: 'brazier',
  },
];

/** The lambs: picked up at the site where they were found, carried one at a time to the fold; and j06's crate to the forge door. */
export const SIDE_CARRY: CarryItemSpec[] = [
  ...[1, 2, 3].map((n) => ({
    id: `lamb-${n}`, interactableId: `pickup:lamb-${n}`, homeAnchor: `j01.lamb-${n}`, deliveredFlag: `story.j01.lamb${n}.delivered`,
    questId: 'j01', objectiveId: 'lambs', destination: 'j01.fold', promptKey: 'quest.prompt.lamb', look: 'bundle' as const,
  })),
  {
    id: 'crate-j06', interactableId: 'pickup:crate-j06', homeAnchor: 'j06.crate', deliveredFlag: 'story.j06.crate.delivered',
    questId: 'j06', objectiveId: 'crate', destination: 'j06.forge', promptKey: 'quest.prompt.crate', look: 'bundle' as const,
  },
];

const NOTE_PARTS = [J03_BLUFF, J03_TABLET, J05_NOTICE, J06_NOTICE, J07_NOTICE, J11_WAYBILL];
export const SIDE_QUEST_NOTES: QuestNoteSpec[] = NOTE_PARTS.map((p) => p.note);
export const SIDE_NOTE_LOOKS: Record<string, 'page' | 'grave' | 'box'> = Object.fromEntries(NOTE_PARTS.map((p) => [p.look.id, p.look.look]));

/** Codex lore entries the jobs light (registered by the quests plugin; text in strings.side.en.ts). */
export const SIDE_CODEX = {
  waystones: 'lore.dead-road-waystones',
  niches: 'lore.chapel-niches',
  openBoard: 'lore.halvard-open-board',
  cartTracks: 'lore.cart-tracks',
} as const;
export const SIDE_NOTE_CODEX: string[] = Object.values(SIDE_CODEX);
/** A job's completion lights its codex entry (j03: finding both stones; j07: the niches; j09: Halvard's board; j11: the tracks). */
export const SIDE_QUEST_CODEX: Record<string, string> = {
  j03: SIDE_CODEX.waystones, j07: SIDE_CODEX.niches, j09: SIDE_CODEX.openBoard, j11: SIDE_CODEX.cartTracks,
};

export const SIDE_OBJECTIVE_FLAGS: ObjectiveFlag[] = [
  // Orla and the sexton are in the lanes once M02 is done (src/region/side.layout.ts presentWhen)
  { quest: 'm02', objective: 'hearth', flag: 'story.side.kettlewickOpen' },
  // j03: the barrow wraiths are armed once the quest has begun (either stone read)
  { quest: 'j03', flag: 'story.j03.started' },
  // Rook's sergeant takes the board once M06 ends (its last objective, the walk to the Anvil's sign, or the quest done)
  { quest: 'm06', objective: 'anvil', flag: 'story.side.boardOpen' },
  // j08: the cutpurse pair is in the alley once the second remark has been heard
  { quest: 'j08', objective: 'bark2', flag: 'story.j08.alleyWoke' },
];

/**
 * Conditional NPC posts of the jobs. Crumb waits at the last search point from Godric's brief until he is found, and goes home to
 * the stall after (no matching entry means home). Rook's sergeant needs none: he stands at the board once M06 is done.
 */
export const SIDE_POST_RULES: PostRule[] = [
  {
    npcId: 'crumb', home: 'npc-post.crumb.home',
    posts: [{
      when: { all: [{ quest: 'j05', state: 'active' }, { objective: ['j05', 'owner'], done: true }, { objective: ['j05', 'find'], done: false }] },
      anchorId: 'npc-post.crumb.wait',
    }],
  },
];
