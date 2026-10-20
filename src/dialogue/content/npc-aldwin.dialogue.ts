import type { DialogueDef } from '../../quests/types';

const P = 'dialogue.npc-aldwin.';

/**
 * Miller Aldwin (density pass, M01): shut in the mill while four wraiths circle it. His `m01-safe` talk credits m01
 * `miller` and writes `story.m01.millerSafe`, which walks him to the chapel; back at the mill once M01 is done.
 */
export const npcAldwin: DialogueDef = {
  id: 'npc-aldwin',
  start: [
    {
      when: { all: [{ quest: 'm01', state: 'active' }, { objective: ['m01', 'mill'], done: true }, { objective: ['m01', 'miller'], done: false }] },
      node: 'm01-safe',
    },
    { when: { all: [{ quest: 'm01', state: 'active' }, { objective: ['m01', 'miller'], done: true }] }, node: 'idle-chapel' },
    { when: { quest: 'm01', state: 'active' }, node: 'm01-wait' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    { id: 'm01-safe', speaker: 'aldwin', textKey: P + 'm01-safe', next: 'm01-safe-2' },
    { id: 'm01-safe-2', speaker: 'aldwin', textKey: P + 'm01-safe-2', next: 'm01-safe-3' },
    { id: 'm01-safe-3', speaker: 'cael', textKey: P + 'm01-safe-3', next: 'm01-safe-4' },
    {
      id: 'm01-safe-4', speaker: 'aldwin', textKey: P + 'm01-safe-4',
      effects: [{ setFlag: 'story.m01.millerSafe', value: true }], next: null,
    },
    { id: 'm01-wait', speaker: 'aldwin', textKey: P + 'm01-wait', next: null },
    { id: 'idle-chapel', speaker: 'aldwin', textKey: P + 'idle-chapel', next: null },
    { id: 'idle', speaker: 'aldwin', textKey: P + 'idle', next: null },
  ],
};
