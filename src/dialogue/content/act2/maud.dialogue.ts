import { buildTree, type Line } from './build';
import { all, flagIs, objDone, objOpen, qActive, qDone, qIdle, step } from './cond';

const M = (t: string, fx?: Line['fx']): Line => (fx ? { s: 'maud', t, fx } : { s: 'maud', t });
const C = (t: string): Line => ({ s: 'cael', t });

export const MAUD = buildTree({
  id: 'npc-maud',
  start: [
    { when: all(qActive('r06'), flagIs('story.r06.branch', 'cleanse'), objDone('r06', 'fire'), objDone('r06', 'rite'), objOpen('r06', 'cleansed')), seg: 'r06-cleansed' },
    { when: all(qActive('r06'), flagIs('story.r06.branch', 'seal'), objDone('r06', 'board'), objOpen('r06', 'sealed')), seg: 'r06-sealed' },
    { when: step('r06', 'households', 'choice'), seg: 'r06-choice' },
    { when: all(qActive('r06'), flagIs('story.r06.branch', 'seal')), seg: 'r06-wait-seal' },
    { when: all(qActive('r06'), flagIs('story.r06.branch', 'cleanse')), seg: 'r06-wait-cleanse' },
    { when: qActive('r06'), seg: 'r06-wait' },
    { when: all(qDone('m12'), qIdle('r06')), seg: 'r06-brief' },
    { when: qActive('m12'), seg: 'm12-talk' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'r06-cleansed': {
      lines: [
        M('Come and taste it, if you do not believe me. I have drawn three buckets and the water runs clear in every one.'),
        C('Then the sleepers will wake?'),
        M('Some already stir. The rest will, or they will not, and I will not lie to you about which. But the well will no longer feed the sickness.'),
        M('The refuge owes you more than I have the patience to say. Take my thanks, and the town\'s, such as it is.', [{ favour: 'oswin', delta: 4 }]),
      ],
    },
    'r06-sealed': {
      lines: [
        M('The boards are up and the well is shut. Half of Cinderford is already on the road with a bundle on its back.'),
        C('And you?'),
        M('I go with them. A healer does not stay behind with an empty well and a full town. Someone must walk beside the old ones.'),
        M('It was the harder choice, and the sounder. Halvard will hear that you made it with your eyes open.', [{ favour: 'halvard', delta: 4 }]),
      ],
    },
    'r06-choice': {
      lines: [
        M('You have been through the well-house and sat in every kitchen in the town. Now tell me plainly what you have learned.'),
        M('I have done my share of guessing. I would rather hear what you are sure of.'),
        {
          s: 'maud',
          t: 'The well is fouled by the blight and the water is making people sleep. I can see two roads. Which do you choose?',
          choices: [
            { id: 'cleanse', t: 'Cleanse the well.', go: 'r06-choice-cleanse', fx: [{ setFlag: 'story.r06.branch', value: 'cleanse' }, { event: 'story.r06.branched' }] },
            { id: 'seal', t: 'Seal it and evacuate.', go: 'r06-choice-seal', fx: [{ setFlag: 'story.r06.branch', value: 'seal' }, { event: 'story.r06.branched' }] },
          ],
        },
      ],
    },
    'r06-choice-cleanse': {
      lines: [
        M('Then it must be fire and rite together. An Emberwright can do it alone. If you are not one, Magister Pennard will ride out, and you must guard him while he works, for the well will not give up its dead quietly.'),
      ],
    },
    'r06-choice-seal': {
      lines: [
        M('Then I begin with the households\' bundles and the cart. Four families, and not one of them wants to go. Help me carry, and we shall put boards over that well before dark.'),
      ],
    },
    'r06-wait-seal': { lines: [M('The bundles, the cart, the boards. Do the three in that order and do not stop to argue with anyone.')] },
    'r06-wait-cleanse': { lines: [M('Light the well-fire, or see Magister Pennard through his rite. Either way, do not leave the well unguarded.')] },
    'r06-wait': { lines: [M('Samples from the blighted ground, a look at the well-house, a word with the keeper and each of the four households. Then come back to me.')] },
    'r06-brief': {
      lines: [
        M('Sit down, {name}, if you can find a place. I will not keep you long, I have a ward full of sleepers.'),
        M('Four days ago the water in the Cinderford well turned the colour of weak tea. By the third day the first of them would not wake.'),
        C('Sleepers? How many?'),
        M('Eleven so far. They breathe, they drink a little if I tip it into them, and they do not answer to their names. All of them drew from the well.'),
        M('The blight is in it. I have seen the same grey scum on a hundred stones since the Ember went quiet, but never in water we drink.'),
        M('There will be a choice to make in the end, and it will not be an easy one. Not yet, though. First we must know what we are choosing between.'),
        C('What do you need me to learn?'),
        M('Bring me three samples from the blighted ground, so I can see what the sickness is made of. Look over the well-house; the keeper keeps a tally and a few notes.'),
        M('Then speak to Edmer Holt, the keeper, and then to the four households. Each of them has a notion of what ought to be done, and each of them is a little right.'),
        M('Do that, and come back. I will tell you honestly what I think, and then you will tell me what you think.', [{ startQuest: 'r06' }]),
      ],
    },
    'm12-talk': {
      lines: [
        M('Do not stand there gawping, {name}. The refuge is full to the rafters, and the hill is about to come down on us.'),
        M('Every cot is taken. I have children in the chapel and old men on the floor, and I mean to keep every one of them breathing.'),
        C('Is there anything you need?'),
        M('Bandages, and a steady hand. Here, take this flask. I would rather it were used on the barricade than saved for tomorrow.', [
          { if: { not: { flag: 'story.m12.maudGift', equals: true } }, then: [{ give: [{ itemId: 'healing-flask', count: 1 }] }, { setFlag: 'story.m12.maudGift', value: true }] },
        ]),
      ],
    },
    idle: {
      lines: [
        M('The refuge is quiet at last, which I take for a kindness. Mind the sleepers by the north wall.'),
        M('If you are hurt, say so. If you are not, find something to do. Both are welcome here.'),
      ],
    },
  },
});
