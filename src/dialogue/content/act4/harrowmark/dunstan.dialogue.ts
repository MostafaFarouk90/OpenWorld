import { buildTree } from '../../act2/build';
import { qActive } from '../../act2/cond';
import { R22_CHOICE, R22_SITES } from '../../../../quests/content/act4/harrowmark/r22.quest';
import { C, at, offer, voice } from './common';

const D = voice('dunstan');

/** Dunstan at his forge: R22 (brief, the materials brought, the choice of blade). Extends `npc-dunstan`. */
export const DUNSTAN_A4 = buildTree({
  id: 'npc-dunstan',
  start: [
    { when: at('r22', 'bring'), seg: 'a4-r22-bring' },
    { when: at('r22', 'choose'), seg: 'a4-r22-choose' },
    { when: offer('r22'), seg: 'a4-r22-brief' },
    { when: qActive('r22'), seg: 'a4-r22-wait' },
  ],
  segments: {
    'a4-r22-brief': {
      lines: [
        D('The boy carries a borrowed sword. His grandfather\'s, cut down twice and still too long for him. He trips on it on the stairs.'),
        D('A king should carry a blade made for his own hand. I have the drawing. I do not have the stuff to make it from.'),
        C('What does it need?'),
        D('Star-iron from the crags past Cinderford, where the old fall came down. Bog-oak from the Greyfen peat, for the grip. Rime-iron from the cairns on Rime Pass, for the edge.'),
        D('The waystones will take you near enough. Ask the locals, they know where it lies, and they know what guards it.'),
        D('Bring me all three and we will forge it together. I want your arm on the bellows. The boy should know a knight helped make it.'),
        {
          s: 'dunstan', t: 'Will you fetch them?',
          choices: [
            { id: 'accept', t: 'Star-iron, bog-oak, rime-iron. I will bring them.', go: null, fx: [{ startQuest: 'r22' }] },
            { id: 'later', t: 'Not yet.', go: null },
          ],
        },
      ],
    },
    'a4-r22-wait': { lines: [D('Cinderford, the Mireweather hut, Rime Pass. The waystones will take you. Then my anvil, and the bellows.')] },
    'a4-r22-bring': {
      lines: [
        D('Let me see. Star-iron, warm on the top side as they say. Bog-oak, black right through. Rime-iron. Cold enough to bite.', [
          { take: R22_SITES.map((s) => ({ itemId: s.item, count: 1 })) },
        ]),
        D('These are better than I hoped. Whoever led you to them knew their trade.'),
        C('Where do I stand?'),
        D('At the bellows, till the coals are white. Then on the anvil with me, in time, or the blade cracks in the quench.'),
        D('Two runs on the anvil: one to draw the blade, one to temper it. Keep the beat. I will keep the rest.'),
      ],
    },
    'a4-r22-choose': {
      lines: [
        D('There it is. Hilted, edged, and no name on it yet. It is the boy\'s, when he lifts it.'),
        D('One thing left, and it is not mine to decide. The drawing has two shapes. I can grind it either way.'),
        D('Slim and quick: it will never tire his arm, and he will be fast with it, if not strong.'),
        D('Broad and heavy: it will tire him in an hour, and it will cut through anything Vey puts in front of him.'),
        C('He is fourteen.'),
        D('He is a king. He will not be fourteen for long, but he will be a king the rest of his life. Choose.'),
        {
          s: 'dunstan', t: 'Which shape?',
          choices: [
            { id: 'light', t: 'Slim and quick. He should never be too tired to lift it.', go: 'a4-r22-done', fx: [{ setFlag: R22_CHOICE, value: 'light' }] },
            { id: 'heavy', t: 'Broad and heavy. He should never have to strike twice.', go: 'a4-r22-done', fx: [{ setFlag: R22_CHOICE, value: 'heavy' }] },
          ],
        },
      ],
    },
    'a4-r22-done': { lines: [D('Done. Take it to him yourself. He will want to hear it from you, not from an old man with soot in his beard.')] },
  },
});
