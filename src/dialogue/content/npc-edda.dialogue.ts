import type { Condition, DialogueDef, DialogueNode } from '../../quests/types';

const tone = (t: string): Condition => ({ flag: 'tutorial.t04.tone', equals: t });
const D = 'dialogue.npc-edda.';

/**
 * Cael's reaction, three tone variants. Exactly one shows; the others are skipped via `when`
 * (a skipped node falls through to its `next`). The chain ends at `after`.
 */
function toneChain(base: string, after: string): DialogueNode[] {
  return [
    {
      id: `${base}-earnest`, speaker: 'cael', textKey: `${D}${base}-earnest`,
      when: { not: { any: [tone('wry'), tone('humble')] } }, next: `${base}-wry`,
    },
    { id: `${base}-wry`, speaker: 'cael', textKey: `${D}${base}-wry`, when: tone('wry'), next: `${base}-humble` },
    { id: `${base}-humble`, speaker: 'cael', textKey: `${D}${base}-humble`, when: tone('humble'), next: after },
  ];
}

export const npcEdda: DialogueDef = {
  id: 'npc-edda',
  start: [
    { when: { quest: 't12', state: 'active' }, node: 'bakery' },
    { when: { all: [{ quest: 't03', state: 'active' }, { not: { flag: 'quest.t03.eddaGift', equals: true } }] }, node: 'gift' },
    // M02: at the granary once the stone is out; the story waits for the reeve's man at the door (o3 after `garrick`)
    { when: { all: [{ quest: 'm02', state: 'active' }, { objective: ['m02', 'o3'], done: true }] }, node: 'hearth-remind' },
    { when: { all: [{ quest: 'm02', state: 'active' }, { objective: ['m02', 'garrick'], done: true }] }, node: 'granary' },
    { when: { all: [{ quest: 'm02', state: 'active' }, { objective: ['m02', 'o2'], done: true }] }, node: 'granary-wait' },
    { when: { quest: 'm02', state: 'active' }, node: 'fetch-reminder' },
    { when: { all: [{ any: [{ objective: ['m01', 'o1'], done: true }, { quest: 'm01', state: 'completed' }] }, { quest: 'm02', state: 'inactive' }] }, node: 'offer' },
    { when: { all: [{ quest: 'm02', state: 'completed' }, { not: { flag: 'quest.m02.farewellSeen', equals: true } }] }, node: 'farewell' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    // T03: the hearth gift
    { id: 'gift', speaker: 'edda', textKey: `${D}gift`, next: 'gift-2' },
    {
      id: 'gift-2', speaker: 'edda', textKey: `${D}gift-2`,
      effects: [
        { give: [{ itemId: 'hearth-bread', count: 1 }, { itemId: 'hearth-token', count: 1 }] },
        { setFlag: 'quest.t03.eddaGift', value: true },
      ],
      next: 'gift-3',
    },
    { id: 'gift-3', speaker: 'edda', textKey: `${D}gift-3`, next: 'gift-4' },
    { id: 'gift-4', speaker: 'cael', textKey: `${D}gift-4`, next: null },

    // T12: the bakery lesson
    { id: 'bakery', speaker: 'edda', textKey: `${D}bakery`, next: 'bakery-2' },
    { id: 'bakery-2', speaker: 'edda', textKey: `${D}bakery-2`, next: 'bakery-3' },
    { id: 'bakery-3', speaker: 'edda', textKey: `${D}bakery-3`, next: 'bakery-4' },
    { id: 'bakery-4', speaker: 'cael', textKey: `${D}bakery-4`, next: null },

    // M02 offer
    { id: 'offer', speaker: 'edda', textKey: `${D}offer`, next: 'offer-2' },
    {
      id: 'offer-2', speaker: 'edda', textKey: `${D}offer-2`,
      choices: [
        { id: 'accept', textKey: `${D}offer-2.accept`, effects: [{ startQuest: 'm02' }], next: 'offer-yes' },
        { id: 'later', textKey: `${D}offer-2.later`, next: 'offer-later' },
      ],
    },
    { id: 'offer-yes', speaker: 'edda', textKey: `${D}offer-yes`, next: null },
    { id: 'offer-later', speaker: 'edda', textKey: `${D}offer-later`, next: null },

    { id: 'fetch-reminder', speaker: 'edda', textKey: `${D}fetch-reminder`, next: null },

    { id: 'granary-wait', speaker: 'edda', textKey: `${D}granary-wait`, next: null },
    { id: 'hearth-remind', speaker: 'edda', textKey: `${D}hearth-remind`, next: null },

    // M02 at the granary: what it was, then the disgrace conversation (hub)
    { id: 'granary', speaker: 'edda', textKey: `${D}granary`, next: 'granary-2' },
    { id: 'granary-2', speaker: 'edda', textKey: `${D}granary-2`, next: 'granary-3' },
    { id: 'granary-3', speaker: 'edda', textKey: `${D}granary-3`, next: 'disgrace' },
    { id: 'disgrace', speaker: 'edda', textKey: `${D}disgrace`, effects: [{ setFlag: 'quest.m02.learnedDisgrace', value: true }], next: 'disgrace-2' },
    { id: 'disgrace-2', speaker: 'edda', textKey: `${D}disgrace-2`, next: 'hub' },
    {
      id: 'hub', speaker: 'edda', textKey: `${D}hub`,
      choices: [
        { id: 'why', textKey: `${D}hub.why`, next: 'why-1' },
        { id: 'regent', textKey: `${D}hub.regent`, next: 'regent-1' },
        { id: 'gaut', textKey: `${D}hub.gaut`, next: 'gaut-1' },
        { id: 'leave', textKey: `${D}hub.leave`, next: 'hearth-ask' },
      ],
    },
    { id: 'why-1', speaker: 'edda', textKey: `${D}why-1`, next: 'why-2' },
    { id: 'why-2', speaker: 'edda', textKey: `${D}why-2`, next: 'why-cael-earnest' },
    ...toneChain('why-cael', 'hub'),
    { id: 'regent-1', speaker: 'edda', textKey: `${D}regent-1`, next: 'regent-2' },
    { id: 'regent-2', speaker: 'edda', textKey: `${D}regent-2`, next: 'regent-cael-earnest' },
    ...toneChain('regent-cael', 'hub'),
    { id: 'gaut-1', speaker: 'edda', textKey: `${D}gaut-1`, next: 'gaut-2' },
    { id: 'gaut-2', speaker: 'edda', textKey: `${D}gaut-2`, next: 'gaut-cael-earnest' },
    ...toneChain('gaut-cael', 'hub'),
    { id: 'hearth-ask', speaker: 'edda', textKey: `${D}hearth-ask`, next: 'hearth-ask-2' },
    { id: 'hearth-ask-2', speaker: 'edda', textKey: `${D}hearth-ask-2`, next: null },
    { id: 'farewell', speaker: 'edda', textKey: `${D}farewell`, effects: [{ setFlag: 'quest.m02.farewellSeen', value: true }], next: null },

    { id: 'idle', speaker: 'edda', textKey: `${D}idle`, next: null },
  ],
};
