import { buildTree } from './build';
import { all, flagIs } from './cond';

const H = (t: string) => ({ s: 'hrolf', t });
const C = (t: string) => ({ s: 'cael', t });

/** DIRECTOR scene at the wyrm's den above the pasture. */
export const SCENE_R11_DEN = buildTree({
  id: 'scene-r11-den',
  start: [{ when: all(), seg: 'scene' }],
  segments: {
    scene: {
      lines: [
        H('This is the Shelf. The stone is black to the lip, and nothing grows on it.'),
        C('The scorch runs a long way back. It has been burning for years.'),
        H('Not burning. It has gone cold, and the cold is worse. A den should smell of smoke and meat. This one smells of nothing at all.'),
        C('Is there anything of your brother here? A buckle, a boot?'),
        H('Only the scorch and the silence. I looked before you spoke, and I will not look again.'),
        C('Then we go in together, and we leave the silence behind us.'),
      ],
    },
  },
});

/** DIRECTOR scene at the axe, after the wyrm. */
export const SCENE_R11_AXE = buildTree({
  id: 'scene-r11-axe',
  start: [
    { when: flagIs('story.r11.choice', 'slain'), seg: 'slain' },
    { when: flagIs('story.r11.choice', 'spared'), seg: 'spared' },
  ],
  segments: {
    slain: {
      lines: [
        C('The wyrm lies dead behind me, its breath gone out of the cave at last.'),
        C('The axe stands upright in a crack of the floor, the haft clean and the edge unmarred.'),
        C('It is full-edged, and it gleams like a thing that was never abandoned, only waiting.'),
        C('I take it up. It is heavier than it looks, and warm from the stone beneath.'),
      ],
    },
    spared: {
      lines: [
        C('The wyrm sleeps on, its flank rising and falling in the dark like a bellows.'),
        C('The axe leans in a crack of the floor, the haft grey with ash.'),
        C('The edge is dull and notched, as if it had been used for something other than fighting.'),
        C('I take it up carefully. Hrolf will know what to make of it.'),
      ],
    },
  },
});
