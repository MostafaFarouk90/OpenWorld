import type { QuestPropSpec } from '../../../../props';
import { M19_DOORS } from './m19.quest';

/** Interactable props of M19: the three locks of the sealed door (anchors are A4's `oldsmoke.lower.sealed.1..3`). M18's readables are notes. */
export const M18M19_PROPS: QuestPropSpec[] = [
  ...M19_DOORS.map((id, i): QuestPropSpec => ({
    interactableId: id, anchorId: `oldsmoke.lower.sealed.${i + 1}`, promptKey: ['quest.prompt.m19lock', 'quest.prompt.m19seal', 'quest.prompt.m19key'][i],
    objective: ['m19', 'doors'], usedFlag: `story.m19.door${i + 1}`, look: ['chain', 'stake', 'box'][i] as 'chain' | 'stake' | 'box', hideWhenUsed: i === 2,
  })),
];
