import { buildTree, type Line } from './build';
import { all, not, flagIs, qActive, step } from './cond';

const L = (s: string) => (t: string, fx?: Line['fx']): Line => (fx ? { s, t, fx } : { s, t });
const C = (t: string): Line => ({ s: 'cael', t });
const heardFx = (n: string): Line['fx'] => [
  { setFlag: `story.r06.heard.${n}`, value: true },
  { event: 'story.r06.heard', payload: { n } },
];

const h1 = L('household-1');
export const HOUSEHOLD_1 = buildTree({
  id: 'npc-household-1',
  start: [
    { when: step('r06', 'wellhouse', 'keeper'), seg: 'r06-keeper' },
    { when: qActive('r06'), seg: 'r06-early' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'r06-keeper': {
      lines: [
        h1('Edmer Holt. Thirty years I have kept this well, and my father before me. I know its moods like I know my own knees.'),
        h1('Seven days back I dropped the bucket and it came up with a skin on it. Grey, like cold porridge. I have never seen the like, and I said so to nobody for a day.'),
        C('Why wait a day?'),
        h1('Because a well-keeper who cries foul over nothing is a fool, and a well-keeper who is right is a harbinger. I did not fancy either.'),
        h1('I keep a tally on the wall of the well-house. A mark for every bucket drawn and a stroke through it when the water is sweet. The strokes stop on the ninth of the month.'),
        h1('That is when the water turned, and that is when I stopped drawing. Too late for some. I will carry that.'),
        h1('Now as for the Holts. We are not leaving. My wife Wynflaed wants to run, and I will not blame her for it, but this is our ground.'),
        h1('The Holts stay and fight, if it comes to that. A well is not something you abandon to the dark.'),
        C('Your wife thinks otherwise?'),
        h1('She has her reasons, and they are good ones. Ask her. I only ask that you do not make her feel foolish for them.', heardFx('1')),
      ],
    },
    'r06-early': { lines: [h1('Go to the well-house first, and see what the tally says. Then come and ask me what you like.')] },
    idle: { lines: [h1('The well sits quiet and so do I. Mind the rope, it is old.')] },
  },
});

const h2 = L('household-2');
export const HOUSEHOLD_2 = buildTree({
  id: 'npc-household-2',
  start: [
    { when: all(qActive('r06'), not(flagIs('story.r06.heard.2'))), seg: 'r06-heard' },
    { when: qActive('r06'), seg: 'r06-again' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'r06-heard': {
      lines: [
        h2('I am Wynflaed Holt, and I will say what my husband will not. The well is poisoned and no prayer will unpoison it.'),
        h2('I watched a girl fall asleep over her porridge and not wake. I want my children out of this town before they drink from anything again.'),
        C('Your husband wants to stay.'),
        h2('Edmer wants to be the well-keeper until the day he dies. I want him to live past it. Let the Council have the stones, I will take the road.', heardFx('2')),
      ],
    },
    'r06-again': { lines: [h2('I have said my piece. Run, or do not, but do not tell me that the water is fine.')] },
    idle: { lines: [h2('We keep our bundles by the door. Old habit now.')] },
  },
});

const h3 = L('household-3');
export const HOUSEHOLD_3 = buildTree({
  id: 'npc-household-3',
  start: [
    { when: all(qActive('r06'), not(flagIs('story.r06.heard.3'))), seg: 'r06-heard' },
    { when: qActive('r06'), seg: 'r06-again' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'r06-heard': {
      lines: [
        h3('Godwin Marsh. I plough clay and I mind my own. The well is bad, I will grant you that.'),
        h3('But Osgar has held this town through worse than a dirty bucket. If he says stay, I stay. If he says go, I will be carrying my own bundle before he finishes the sentence.'),
        C('And if he says nothing?'),
        h3('Then I wait for the Reeve, same as every harvest. A man who has a plan is better than ten who have opinions.', heardFx('3')),
      ],
    },
    'r06-again': { lines: [h3('Ask Osgar, if you want my mind. It is his town more than it is mine.')] },
    idle: { lines: [h3('Fields do not plough themselves, not even in a bad year.')] },
  },
});

const h4 = L('household-4');
export const HOUSEHOLD_4 = buildTree({
  id: 'npc-household-4',
  start: [
    { when: all(qActive('r06'), not(flagIs('story.r06.heard.4'))), seg: 'r06-heard' },
    { when: qActive('r06'), seg: 'r06-again' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'r06-heard': {
      lines: [
        h4('Aelswith Marsh. My husband trusts the Reeve, and I trust Mother Maud. Between the two of us we have most of the town sorted.'),
        h4('Maud sat up three nights with my sister\'s boy when the fever took him. When she says the well is sick, I believe her, and when she says what to do, I will do it.'),
        C('And if she says to leave?'),
        h4('Then I will pack. And if she says to stay, I will carry water to her ward myself. She has never once asked me for a thing she did not do first.', heardFx('4')),
      ],
    },
    'r06-again': { lines: [h4('Mother Maud knows best. Tell her I said so, she will pretend not to hear.')] },
    idle: { lines: [h4('The refuge is a good place. Quiet, and clean, and Maud runs it like a ship.')] },
  },
});
