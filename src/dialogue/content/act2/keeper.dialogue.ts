import { buildTree } from './build';
import { all, flagIs, step } from './cond';

const K = (t: string) => ({ s: 'lantern-keeper', t });
const C = (t: string) => ({ s: 'cael', t });

/** The Hushed Anvil's lantern-keeper, plus the DIRECTOR-opened mural reflections and the Anvil's song. */
export const LANTERN_KEEPER = buildTree({
  id: 'npc-lantern-keeper',
  start: [
    { when: flagIs('story.m14.mural', 1), seg: 'mural-1' },
    { when: flagIs('story.m14.mural', 2), seg: 'mural-2' },
    { when: flagIs('story.m14.mural', 3), seg: 'mural-3' },
    { when: flagIs('story.m14.singsHold'), seg: 'sings' },
    { when: step('m14', 'murals', 'keeper'), seg: 'm14-keeper' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'mural-1': {
      lines: [
        C('The first mural shows the early smiths in a ring, hammers raised, their faces turned toward a single flame.'),
        { s: 'cael', t: 'They do not look like masters. They look like people who were glad to have a fire to share.', fx: [{ clearFlag: 'story.m14.mural' }] },
      ],
    },
    'mural-2': {
      lines: [
        C('The second mural is half scraped away. A dark shape lies across the anvil, and the smiths stand back with their hammers down.'),
        { s: 'cael', t: 'This is the Silencing. Nobody struck the Anvil. They simply stopped, and the forge understood.', fx: [{ clearFlag: 'story.m14.mural' }] },
      ],
    },
    'mural-3': {
      lines: [
        C('The third mural is painted in bright ochre. A small figure holds a coal to the cold iron, and the wall behind her glows.'),
        { s: 'cael', t: 'The First Rekindling. It was not a king or a smith who did it, but a keeper of ordinary hearths.', fx: [{ clearFlag: 'story.m14.mural' }] },
      ],
    },
    sings: {
      lines: [
        K('Listen. The iron has found its note again.'),
        { s: 'lantern-keeper', t: 'Forty years I have kept this lantern lit for a forge that would not speak. I did not think to hear it before I died.', fx: [{ clearFlag: 'story.m14.singsHold' }, { event: 'story.m14.set' }] },
      ],
    },
    'm14-keeper': {
      lines: [
        K('You have read the walls. Good. Few trouble to. I am the keeper of the lantern, as my teacher was, and hers before her.'),
        K('I have kept this flame for more than forty winters. It has not once gone out, though there were nights I wished it would, for the sake of my own rest.'),
        K('The Anvil asks little. It does not ask for strength, nor for wisdom, nor for the favour of any Council. It asks for a rhythm.'),
        C('How does a keeper learn the beat?'),
        K('By getting it wrong for a year. My teacher struck too fast and swore the iron forgave her. It did not. It only waited.'),
        C('Then I will strike slowly, and wait with it.'),
        K('Tempering needs a beat, steady and unhurried, and no two hands strike it alike. Set yours, {name}, and let the iron learn it.'),
      ],
    },
    idle: {
      lines: [
        K('The lantern needs trimming. Forgive me if I tend it while we speak. It is rude to let a flame wait.'),
        K('If you wish to learn the Anvil\'s history, the walls are better teachers than I am. I only keep the light by which to read them.'),
      ],
    },
  },
});
