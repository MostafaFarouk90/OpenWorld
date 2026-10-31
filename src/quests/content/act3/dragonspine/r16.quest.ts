import type { QuestDef } from '../../../types';
import { reads } from '../../act2/helpers';
/** K4's flags (src/dragonspine/flags.ts; a test pins the strings; not imported, as that file pulls in the jump and the quest registry). */
export const R16_STARTED_FLAG = 'story.r16.started';
export const R16_ROCKFALL_CLEARED_FLAG = 'story.r16.rockfallCleared';
export const R16_CHOICE = 'story.r16.choice';
/** Applied once: keep costs the dragons 4 favour. */
export const R16_FAVOURED = 'story.r16.favoured';
export const R16_KEEP_FAVOUR = -4;
export const R16_PACK_TAG = 'r16.pack';
export const R16_PACK_FLAG = 'story.r16.packOut';
export const R16_PACK_DOWN = 'story.r16.packDown';
export const R16_MOUTH = 'story.r16.mouth';
export const R16_MOUTH_TRIGGER = 'trg.dragonspine.cave.mouth';
/** Passage searches (before the rockfall) and chamber searches (past it). */
export const R16_PASSAGE_NOTES = ['note-r16-markers', 'note-r16-bones'];
export const R16_CHAMBER_NOTES = ['note-r16-scabbard', 'note-r16-scratch', 'note-r16-campfire', 'note-r16-initials'];
export const R16_ROCKFALL = 'use:r16-rockfall';
export const R16_AXE = 'use:r16-axe';
export const R16_AXE_FLAG = 'story.r16.axeTaken';
export const R16_AXE_ITEM = 'frostbrows-axe';
export const R16_CAVE_SCENE = 'scene-r16-cave';
export const R16_CAVE_NPC = 'scene.r16.cave';

/**
 * R16 Frostbrow's Lost Axe. Eadgyth sends Cael to the collapsed cave (accepting opens its door): the hunter at the mouth, the
 * mouth pack (an ogre and four hawks, killed or the ogre calmed), the passage searches, the rockfall, the chamber searches, the
 * axe and the cave lines; then Eadgyth's choice: give (the +6 dragons is paid in M32) or keep (dragons -4 at once, once).
 */
export const r16: QuestDef = {
  id: 'r16',
  titleKey: 'quest.r16.title',
  summaryKey: 'quest.r16.summary',
  sequential: true,
  startWhen: { quest: 'm29', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'eadgyth', textKey: 'quest.r16.brief' },
    { id: 'hunter', type: 'talk', target: 'lodge-hunter-cave', textKey: 'quest.r16.hunter' },
    { id: 'pack', type: 'event', target: R16_PACK_DOWN, textKey: 'quest.r16.pack', doneWhen: { flag: R16_PACK_DOWN, equals: true } },
    { id: 'mouth', type: 'event', target: R16_MOUTH, textKey: 'quest.r16.mouth', doneWhen: { flag: R16_MOUTH, equals: true } },
    reads('passage', 'quest.r16.passage', R16_PASSAGE_NOTES),
    { id: 'rockfall', type: 'event', target: 'interact', match: { interactableId: R16_ROCKFALL }, textKey: 'quest.r16.rockfall' },
    reads('chamber', 'quest.r16.chamber', R16_CHAMBER_NOTES),
    { id: 'axe', type: 'event', target: 'interact', match: { interactableId: R16_AXE }, textKey: 'quest.r16.axe' },
    { id: 'lines', type: 'talk', target: R16_CAVE_NPC, textKey: 'quest.r16.lines' },
    { id: 'choice', type: 'talk', target: 'eadgyth', textKey: 'quest.r16.choice' },
    { id: 'report', type: 'talk', target: 'eadgyth', textKey: 'quest.r16.report' },
  ],
  rewards: [{ xp: 500 }, { give: [{ itemId: 'rimewood-haft', count: 1 }] }],
};
