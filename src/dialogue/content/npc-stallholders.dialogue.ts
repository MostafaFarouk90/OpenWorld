import type { Condition, DialogueDef, DialogueNode } from '../../quests/types';

const asking: Condition = { all: [{ quest: 'm07', state: 'active' }, { not: { objective: ['m07', 'ask'], done: true } }] };

function stallholder(n: 1 | 2): DialogueDef {
  const P = `dialogue.npc-stallholder-${n}.`;
  const say = (id: string, next: string | null = null, speaker = `stallholder-${n}`): DialogueNode => ({ id, speaker, textKey: P + id, next });
  return {
    id: `npc-stallholder-${n}`,
    start: [
      { when: asking, node: 'saw' },
      { when: { all: [] }, node: 'idle' },
    ],
    nodes: [say('saw', 'saw-2'), say('saw-2', 'saw-3'), say('saw-3', 'saw-4', 'cael'), say('saw-4'), say('idle')],
  };
}

/** M07's Guild Quarter stallholders (density pass): Godric the pie-man saw the thieves run, Wenna heard where they count. */
export const npcStallholder1 = stallholder(1);
export const npcStallholder2 = stallholder(2);
