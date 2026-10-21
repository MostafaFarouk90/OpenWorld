import { buildTree, type Line } from './build';
import { all, objDone, objOpen, qActive, step } from './cond';

const P = (t: string): Line => ({ s: 'pell', t });
const C = (t: string): Line => ({ s: 'cael', t });
const D = (t: string): Line => ({ s: 'osric', t });

export const PELL = buildTree({
  id: 'npc-pell',
  start: [
    { when: step('r05', 'tracks', 'boy'), seg: 'r05-boy' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'r05-boy': {
      lines: [
        P('I did not lose them. They went. The fog came down so fast I could not see my own hand.'),
        C('Where did you go?'),
        P('I hid in a hollow. I know it was foolish, but I thought if I stood still the fog would lift. It did not.'),
        P('Then I heard the bells. The wethers\' bells, going away from me, all in a line. And I saw something at the front.'),
        P('It was orange, like a coal, and it had a tail. It walked ahead and the flock came after it like it was the old ram.'),
        P('I am not afraid of it. I only did not want to get lost too. Look, it went toward the hounds, that way. Please tell my mam I did not run.'),
      ],
    },
    idle: { lines: [P('I am not crying. It is the ash.')] },
  },
});

export const OSRIC = buildTree({
  id: 'npc-osric',
  start: [
    { when: all(qActive('r07'), objDone('r07', 'brief'), objOpen('r07', 'shepherd')), seg: 'r07-shepherd' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'r07-shepherd': {
      lines: [
        D('Ketta sent you. Aye. I do not talk much about it.'),
        D('Three dogs, in three nights. Old Gref was the last. I heard him go, out beyond the fold, and I did not go after him. I should have.'),
        C('What did you see?'),
        D('Eyes, low to the ground, green in the dark. And a smell like a forge left to cool. Take that to the gully, and watch your feet.'),
      ],
    },
    idle: { lines: [D('The fold is half empty. So am I.')] },
  },
});
