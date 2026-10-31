// Act 1 side jobs (j01 to j11), one file per job. This round: j01 to j04 (Brightwater and the Dead Road); the Harrowmark jobs
// j05 to j10 and the Underways job j11 add their defs, props, notes and flags to the arrays below. Everything here is data the
// quests plugin spreads next to the Act 1 tables (src/quests/content/index.ts, props, notes, carry, objective flags, posts).
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
import { J03_BLUFF, J03_TABLET } from './dialogues';

export { questStringsSide, dialogueStringsSide } from './strings.side.en';
export { SIDE_DIALOGUES, withSideJobs } from './dialogues';
export { startingNote, boardNotice } from './boards';

export const SIDE_QUEST_DEFS: QuestDef[] = [j01, j02, j03, j04];
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
];

/** The lambs: picked up at the site where they were found, carried one at a time to the fold. */
export const SIDE_CARRY: CarryItemSpec[] = [1, 2, 3].map((n) => ({
  id: `lamb-${n}`, interactableId: `pickup:lamb-${n}`, homeAnchor: `j01.lamb-${n}`, deliveredFlag: `story.j01.lamb${n}.delivered`,
  questId: 'j01', objectiveId: 'lambs', destination: 'j01.fold', promptKey: 'quest.prompt.lamb', look: 'bundle' as const,
}));

export const SIDE_QUEST_NOTES: QuestNoteSpec[] = [J03_BLUFF.note, J03_TABLET.note];
export const SIDE_NOTE_LOOKS: Record<string, 'page' | 'grave' | 'box'> = Object.fromEntries([J03_BLUFF.look, J03_TABLET.look].map((l) => [l.id, l.look]));

/** Codex lore entries the jobs light (registered by the quests plugin; text in strings.side.en.ts). */
export const SIDE_CODEX = { waystones: 'lore.dead-road-waystones' } as const;
export const SIDE_NOTE_CODEX: string[] = Object.values(SIDE_CODEX);
/** A job's completion lights its codex entry (j03: finding both stones). Later rounds add j07, j09 and j11. */
export const SIDE_QUEST_CODEX: Record<string, string> = { j03: SIDE_CODEX.waystones };

export const SIDE_OBJECTIVE_FLAGS: ObjectiveFlag[] = [
  // Orla and the sexton are in the lanes once M02 is done (src/region/side.layout.ts presentWhen)
  { quest: 'm02', objective: 'hearth', flag: 'story.side.kettlewickOpen' },
  // j03: the barrow wraiths are armed once the quest has begun (either stone read)
  { quest: 'j03', flag: 'story.j03.started' },
];

/** Conditional NPC posts of the jobs (none yet; j05 to j08 move the guild hound and Rook's sergeant). */
export const SIDE_POST_RULES: PostRule[] = [];
