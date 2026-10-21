import type { QuestPropSpec } from '../../../props';
import { M21_EVIDENCE, M21_LETTERS } from './m21.quest';

/** Interactable props of the Oldsmoke quests built so far. Anchors are A4's (`oldsmoke.*`) and Harrowmark's keep hall. */
export const OLDSMOKE_PROPS: QuestPropSpec[] = [
  // M16: the dead brazier in the forecourt (an untagged anchor: the quest lights it, a scripted rekindle)
  {
    interactableId: 'use:m16-brazier-1', anchorId: 'oldsmoke.m16.brazier.1', promptKey: 'quest.prompt.brazier',
    objective: ['m16', 'brazier'], usedFlag: 'story.m16.brazierLit', look: 'brazier',
  },
  // R10: post the ruling and return the keys (miners or stewards)
  {
    interactableId: 'use:r10-ruling', anchorId: 'oldsmoke.market.centre', promptKey: 'quest.prompt.ruling',
    objective: ['r10', 'ruling'], usedFlag: 'story.r10.ruled', look: 'stake',
  },
  {
    interactableId: 'use:r10-keys', anchorId: 'oldsmoke.r10.hall.stewards', promptKey: 'quest.prompt.keys',
    objective: ['r10', 'keys'], usedFlag: 'story.r10.keysReturned', look: 'box',
  },
  // M21: the proof of the sale (evidence) and, on the spy branch, the letters in the study
  ...M21_EVIDENCE.map((id, i): QuestPropSpec => ({
    interactableId: id, anchorId: `oldsmoke.m21.evidence.${i + 1}`, promptKey: 'quest.prompt.evidence',
    objective: ['m21', 'evidence'], usedFlag: `story.m21.ev.${i + 1}`, look: 'box', hideWhenUsed: true,
  })),
  ...M21_LETTERS.map((id, i): QuestPropSpec => ({
    interactableId: id, anchorId: `oldsmoke.hall.study.letter.${i + 1}`, promptKey: 'quest.prompt.letter',
    objective: ['m21', 'letters'], usedFlag: `story.m21.letter.${i + 1}`, look: 'box', hideWhenUsed: true,
  })),
  // M22: the House Pledge Banner on the dais of the Keep hall
  {
    interactableId: 'use:m22-banner', anchorId: 'm08.keep-hall', promptKey: 'quest.prompt.banner',
    objective: ['m22', 'banner'], usedFlag: 'story.m22.bannerUp', look: 'stake',
  },
];
