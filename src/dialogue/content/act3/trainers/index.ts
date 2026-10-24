// K10 (plans/act3-K10.md section 7, Q2): the Harrowmark trainers' master-book lines. From `story.gate.a3`, until the
// book is given, Gaut, Pennard, Gerta and Cenric Ashdown open with a short talk that ends in K11's
// `{ grantMasterBook: '<classId>' }` effect, then fall through to their trainer menu. K10 never writes `trainer.*`.
// Each trainer gives the book of the class it teaches, whoever asks: the book only opens that class's tiers 4 and 5.
import type { Condition, DialogueDef } from '../../../../quests/types';
import { buildTree, extendTree, type BuiltTree, type Line } from '../../act2/build';

export const ACT3_TRAINERS = [
  { npcId: 'npc-gaut', speaker: 'gaut', classId: 'knight' },
  { npcId: 'npc-pennard', speaker: 'pennard', classId: 'emberwright' },
  { npcId: 'npc-gerta', speaker: 'gerta', classId: 'ashblade' },
  { npcId: 'npc-ashdown', speaker: 'ashdown', classId: 'pathfinder' },
] as const;

const bookOpen = (classId: string): Condition => ({
  all: [{ flag: 'story.gate.a3', equals: true }, { not: { flag: `trainer.${classId}.masterBook`, equals: true } }],
});

const TEXT: Record<(typeof ACT3_TRAINERS)[number]['classId'], [string, string, string]> = {
  knight: [
    'The Greyfen and the Dragonspine. So the Council finally sends you where the maps run out.',
    'Then you will want what I was not taught until my beard was grey. Here: my master\'s book. The forms past the third, written in his hand.',
    'Read it at night, practise it at dawn. When you have it in your arms and not only your head, come and train.',
  ],
  emberwright: [
    'You are going north, and the fire up there is older than anything in my Archive.',
    'Take this. The master\'s book of our discipline: tiers four and five, copied twice and corrected three times.',
    'Do not lend it to Gerta. She sells things. Now, shall we begin?',
  ],
  ashblade: [
    'Dragons, is it? Then quick hands will not be enough. You will need clever ones.',
    'My master\'s book. Not stolen, before you ask. Well, not by me.',
    'The last pages are the good ones. Train when you are ready.',
  ],
  pathfinder: [
    'North, then. Leofa Hartley keeps the Greywatch posts; she would teach you the high forms if you reached her first.',
    'I will not make you walk the fen for it. Here is the master\'s book: tiers four and five, the bolt-work past anything I drill in this yard.',
    'Mind the wind up on the Spine. It pulls a bolt like a hand. Now, train.',
  ],
};

function trainerExtension(t: (typeof ACT3_TRAINERS)[number]): BuiltTree {
  const [a, b, c] = TEXT[t.classId];
  const L = (text: string): Line => ({ s: t.speaker, t: text });
  return buildTree({
    id: t.npcId,
    start: [{ when: bookOpen(t.classId), seg: 'a3-book' }],
    segments: {
      'a3-book': {
        lines: [L(a), { s: t.speaker, t: b, fx: [{ grantMasterBook: t.classId }] }, L(c)],
        // Back into the trainer's own menu (the Act 1 node), so `classes.trainer.open` keeps working.
        then: 'trainer-open',
      },
    },
  });
}

export const ACT3_TRAINER_EXTENSIONS: readonly BuiltTree[] = ACT3_TRAINERS.map(trainerExtension);

/** Swaps the four trainer trees in `defs` for their Act 3 extended versions (any tree not found is left alone). */
export function withAct3Trainers(defs: DialogueDef[]): DialogueDef[] {
  return defs.map((d) => {
    const ext = ACT3_TRAINER_EXTENSIONS.find((e) => e.def.id === d.id);
    return ext ? extendTree(d, ext).def : d;
  });
}

export const ACT3_TRAINER_STRINGS: Record<string, string> = Object.assign({}, ...ACT3_TRAINER_EXTENSIONS.map((e) => e.strings));
