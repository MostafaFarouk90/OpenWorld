import type { QuestPropSpec } from '../../../../props';
import { M17_PARTS, M17_SWARM_FLAG, M17_VENTS, M17_WINCH } from './m17.quest';
import { R08_BELL_FLAG, R08_BELL_GATE, R08_TASKS } from './r08.quest';

/** Interactable props of M17 and R08 (anchors are A4's: the shaft head on the surface, the shaft floor and the Old Galleries below). */
export const M17R08_PROPS: QuestPropSpec[] = [
  // M17: three winch parts around the shaft head, then the winch itself
  ...M17_PARTS.map((id, i): QuestPropSpec => ({
    interactableId: id, anchorId: `oldsmoke.shaft.winch.part.${i + 1}`, promptKey: 'quest.prompt.part',
    objective: ['m17', 'parts'], usedFlag: `story.m17.part${i + 1}`, look: 'box', hideWhenUsed: true,
  })),
  {
    interactableId: M17_WINCH, anchorId: 'oldsmoke.shaft.winch', promptKey: 'quest.prompt.winch',
    objective: ['m17', 'winch'], usedFlag: 'story.m17.winchMended', look: 'chain',
  },
  // M17: the first vent (its own objective) wakes the swarm, the other three follow. A hold-to-clear is the plugin's to add.
  {
    interactableId: M17_VENTS[0], anchorId: 'oldsmoke.shaft.vent.1', promptKey: 'quest.prompt.vent',
    objective: ['m17', 'vent1'], usedFlag: M17_SWARM_FLAG, look: 'rubble', hideWhenUsed: true,
  },
  ...M17_VENTS.slice(1).map((id, i): QuestPropSpec => ({
    interactableId: id, anchorId: `oldsmoke.shaft.vent.${i + 2}`, promptKey: 'quest.prompt.vent',
    objective: ['m17', 'vents'], usedFlag: `story.m17.vent${i + 2}`, look: 'rubble', hideWhenUsed: true,
  })),
  // R08: the four shift tasks. The bell waits for the other three (a `when` on the prop, so the order is enforced at the prop).
  ...R08_TASKS.map((id, i): QuestPropSpec => {
    const name = id.slice('use:r08-'.length);
    return {
      interactableId: id, anchorId: `oldsmoke.old.task.${name}`, promptKey: `quest.prompt.r08${name}`,
      objective: ['r08', 'tasks'], usedFlag: i === 3 ? R08_BELL_FLAG : `story.r08.${name}`,
      look: (['bucket', 'box', 'stake', 'chain'] as const)[i], ...(i === 3 ? { when: R08_BELL_GATE } : {}),
    };
  }),
];
