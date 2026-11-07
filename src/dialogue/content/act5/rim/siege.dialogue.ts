// M52's talks (N10 PR 2): Wystan's brief at the camp, his word while the siege runs (the orders are N4's own tree at the war
// post), and his report, whose lines read what stood at the gate (`story.m52.stood.<row>`, written by the director from N4's
// roster on the M52 snapshot, so what he says matches who stood); the wounded companion at the aid tent (Q2 a: on their feet).
// Node ids `a5r-` (they go into shipped trees). Invented (Q6), logged under "Act 5 N10".
import type { buildTree, Line } from '../../act2/build';
import { M52_STOOD, M52_WOUNDED_STEP } from '../../../../quests/content/act5/rim/m52.quest';
import { C, accept, at, flagIs, offer, qActive, voice, when } from './common';

type Rule = Parameters<typeof buildTree>[0]['start'][number];
const WY = voice('wystan');

export const M52_WYSTAN_RULES: Rule[] = [
  { when: at('m52', 'report'), seg: 'a5r-m52-report' },
  { when: offer('m52'), seg: 'a5r-m52-brief' },
  { when: at('m52', 'gate'), seg: 'a5r-m52-gate' },
  { when: qActive('m52'), seg: 'a5r-m52-wait' },
];

export const M52_WYSTAN_SEGMENTS: Record<string, { lines: Line[] }> = {
  'a5r-m52-brief': {
    lines: [
      WY('Knight. The scouts are back. What is left of them.'),
      WY('Vey has stopped burning the plain. He is forming up at the foot of the stairs. Tonight, or at first light.'),
      C('Then we are ready.'),
      WY('We are as ready as we will be. Every House that came is on the wall, and every one of them is frightened.'),
      WY('Meet me at the war post by the gate, and look at what is coming before you say that again.'),
      accept('wystan', 'm52', 'Will you stand at the gate?', 'I will stand at the gate.'),
    ],
  },
  'a5r-m52-gate': {
    lines: [
      WY('Here is where I stand. The war post. From here I can see the stairs, the court and the walls, and none of them well.'),
      WY('This is how it goes. They come up in waves. We break a wave, and they fall back to the turn of the stair to form again.'),
      WY('Between the waves you come here and tell me what you want: brace the gate, loose the archers, whatever we have left.'),
      C('And during the waves?'),
      WY('During the waves you fight, and I shout. Come and look over the wall first. You should see them before they see you.'),
      WY('Go on. The edge, by the banner.'),
    ],
  },
  'a5r-m52-wait': {
    lines: [WY('Behind the gate, knight. When a wave breaks, come to the war post and tell me what to do with the next one.')],
  },
  'a5r-m52-report': {
    lines: [
      WY('It held. I have stood on a good many walls, and I did not think that one would hold.'),
      when(WY('Our pikes held the cut. Halvard will hear what they did, every name of it.'), flagIs(M52_STOOD('halvard'))),
      when(WY('Grisel\'s miners never left the court. I have never seen men so glad of a fight with a door.'), flagIs(M52_STOOD('grisel'))),
      when(WY('The walkers took the east wall, where the wind is worst. Nobody asked them. Nobody had to.'), flagIs(M52_STOOD('ashwalker'))),
      when(WY('And the dragons. I will not tell my grandchildren about the dragons. They would never believe me.'), flagIs(M52_STOOD('dragons'))),
      when(WY('Oswin\'s crates kept us on our feet. Tell Merrin I said so, once, and never again.'), flagIs(M52_STOOD('supply'))),
      C('What did it cost?'),
      WY('Count the banners on the wall tomorrow morning. That is the cost, and the price, and the bill.'),
      WY('Less than it would have. Every man who came up the stairs to the camp is still on his feet, or will be.'),
      WY('Vey watched from the plain. He did not come up himself. He will not make that mistake twice, and neither will we.'),
      WY('The Inner Gate is the next thing. Vey went in by the Foundry. We follow when you are ready, and not before.'),
      WY('Take this. Halvard\'s house gives a medal to the last man at the wall. Tonight that was you.'),
    ],
  },
};

const companionLine: Record<'hrolf' | 'aelfreda' | 'tobb', [string, string]> = {
  hrolf: ['They stitched my arm and told me to sit. I sat. I will not be sitting for the next one.', 'Then stand. But slowly.'],
  aelfreda: ['A spear across the ribs. Nothing broken; I checked, twice. I am a healer, I should know.', 'Then rest, healer. That is an order.'],
  tobb: ['I am up. I am up! The surgeon says I shout too much for a wounded man. I say the surgeon should hear me when I am well.', 'Glad you are shouting, Tobb.'],
};

export const M52_COMPANION_RULES = (id: 'hrolf' | 'aelfreda' | 'tobb'): Rule[] => [
  { when: at('m52', M52_WOUNDED_STEP(id)), seg: 'a5r-m52-wounded' },
];
export const M52_COMPANION_SEGMENTS = (id: 'hrolf' | 'aelfreda' | 'tobb'): Record<string, { lines: Line[] }> => ({
  'a5r-m52-wounded': { lines: [voice(id)(companionLine[id][0]), C(companionLine[id][1])] },
});
