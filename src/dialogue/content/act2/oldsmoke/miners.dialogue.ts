import { buildTree, type Line } from '../build';
import { all, step } from '../cond';
import { roundSegments, roundStart } from './stewards.dialogue';

const line = (s: string) => (t: string): Line => ({ s, t });
const O = line('miner-1');
const ODA = buildTree({
  id: 'npc-miner-1',
  start: [
    { when: step('r10', 'brief', 'miners'), seg: 'r10-hall' },
    { when: roundStart(1), seg: 'r10-round-1' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'r10-hall': {
      lines: [
        O('Oda Brennock, delegate of the Deepgate miners. Not elected: elected is a word for stewards. They said "you, you talk loud," and here I am.'),
        O('We went down the shaft at six every morning for three years, and we came up at six every evening, and the pay was late the whole time.'),
        O('Then it was not paid at all. A month. They said the coin was "pending" and then "diverted" and then, finally, "unavailable".'),
        O('We have wives and bairns. We have a widow\'s fund that has paid no widows. We have a pit cat that has eaten better than the second shift.'),
        { s: 'cael', t: 'The stewards say they hold the line on the Lord\'s orders.' },
        O('Then let the Lord come and say it to my face. He has not. He sends stewards, who are men with keys, and the keys are the whole of their argument.'),
        O('We are not unreasonable. We are owed.'),
        O('We would go down again tomorrow if the pay was paid. We will go down on Thursday if the widows are. We have a short list and it is not the stewards\' heads.'),
        O('Read what the stalls hold. The injury roll is the one that matters. Twelve men, no entry. Twelve.'),
        O('Halse is not a villain. I have said it before and I shall be hanged for saying it. He is a clerk, and clerks are the sort of men who make villains possible.'),
        O('If you find a third way, I will walk it. If you take a side, I will be loud about it either way.'),
        O('That is all I have to say. It took long enough.'),
      ],
    },
    ...roundSegments('miner-1', 1, ['Oda. Again. The foreman said you would come, and the foreman is usually right.', 'You have been through the stalls. The injury roll is the only page I would burn the rest for.']),
    idle: { lines: [O('We dig, we are paid. That is the whole of it.')] },
  },
});

const M = line('miner-2');
const MINER = buildTree({
  id: 'npc-miner-2',
  start: [
    { when: step('r09', 'clerk', 'miners'), seg: 'r09-miners' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'r09-miners': {
      lines: [
        M('The chests? The wages are in the chests. Four weeks, a hundred and fourteen men, and the stewards put them in a cellar.'),
        M('My brother went down the cellar stairs the first night. He is the one with the burn on his arm. He says the coin is still there. He says the crawlers are on it like hens.'),
        M('If the coin goes back to the stewards, we get paid at the shaft head, one week in four, from the House. If it comes to us, we share it out tonight.'),
        M('I will not tell you which. I have a wife and she has her own mind.'),
        M('The foreman will not say either. He says it is for the one who clears the cellar to say. Which is you.'),
        M('Whatever you choose, the nests first. Nobody is sharing anything with that thing sitting on it.'),
      ],
    },
    idle: { lines: [M('Down the shaft or up it, I am always about to ask for the same thing. My wages.')] },
  },
});

export const MINER_TREES = [ODA, MINER];
