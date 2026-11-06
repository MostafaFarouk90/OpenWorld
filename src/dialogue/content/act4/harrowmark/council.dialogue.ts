// L10 PR 2: the betrayal and the flight (M38 to M41). Edric's tree is extended in front (node ids `a4-`); Gaut's and Rook's
// Act 4 lines are in friends.dialogue.ts and rook.dialogue.ts; the one-way talks (the case, Gaut's breath between the waves,
// Edric's three courage beats in the deep run) are scene trees. The sequencer scenes (the betrayal, Gaut's fall, the camp) are
// in council.scenes.ts. Prose is invented (Q6) and logged in design/changes-applied.md.
import { buildTree, type BuiltTree, type Line } from '../../act2/build';
import { all, any, flagIs, not, qActive } from '../../act2/cond';
import type { Condition } from '../../../../quests/types';
import { M36_DELEGATE, M36_HOUSES } from '../../../../quests/content/act4/harrowmark/m36.quest';
import { R23_CHOICE } from '../../../../quests/content/act4/harrowmark/r23.quest';
import { M38_CASE_SCENE, M38_SIDE_JOBS } from '../../../../quests/content/act4/harrowmark/m38.quest';
import { M39_BREATH_SCENE } from '../../../../quests/content/act4/harrowmark/m39.quest';
import { M40_JUNCTION_SCENE } from '../../../../quests/content/act4/harrowmark/m40.quest';
import { C, at, offer, voice, when } from './common';

const E = voice('edric');
const G = voice('gaut');
const R = voice('rook');
const W = voice('wystan');
const V = voice('vey');

/** The witness band M38's case reads (the director writes it on entering the chamber: 0, 1 to 3, 4 or more). */
export const M38_WITNESS_BAND = 'story.m38.witnessBand';
const band = (b: 'none' | 'few' | 'many'): Condition => flagIs(M38_WITNESS_BAND, b);
const won = (h: (typeof M36_HOUSES)[number]): Condition => flagIs(M36_DELEGATE(h), 'won');
const anyJobOpen: Condition = any(...M38_SIDE_JOBS.map(qActive));

const scene = (id: string, lines: Line[]): BuiltTree => buildTree({ id, start: [{ when: all(), seg: 'scene' }], segments: { scene: { lines } } });

/** Edric: M38's offer (with what the city closes on), the wait, and M41 at the camp. */
export const EDRIC_A4 = buildTree({
  id: 'npc-edric',
  start: [
    { when: at('m38', 'rally'), seg: 'a4-m38-rally' },
    { when: at('m39', 'edric'), seg: 'a4-m39-edric' },
    { when: at('m41', 'edric'), seg: 'a4-m41-edric' },
    { when: at('m41', 'ashgate'), seg: 'a4-m41-ashgate' },
    { when: offer('m38'), seg: 'a4-m38-brief' },
    { when: qActive('m38'), seg: 'a4-m38-wait' },
  ],
  segments: {
    'a4-m38-brief': {
      lines: [
        E('{name}. The Houses are in the chamber. Wystan says they are all there, and Vey too, with more men at his back than a Regent needs for a vote.'),
        E('I have the ledgers, the orders, the witnesses. Everything you brought me. Today I ask the Council to give me back my crown.'),
        when(E('Whatever work you still have in the city, finish it first. Once we go into that chamber I do not think we come out by the front door.'), anyJobOpen),
        E('And if it goes wrong, the inn, the stables and the Archive will all be shut to us. Aldith, Wace and Whitlock cannot follow us out.'),
        {
          s: 'edric', t: 'Will you stand with me in there?',
          choices: [
            { id: 'accept', t: 'Go now. I am at your shoulder.', go: 'a4-m38-go', fx: [{ startQuest: 'm38' }] },
            { id: 'later', t: 'Not yet. Give me a little time.', go: null },
          ],
        },
      ],
    },
    'a4-m38-rally': {
      lines: [
        E('They took my arm. In front of everyone. Like a thief at a market.'),
        C('Are you hurt?'),
        E('No. Yes. I do not know. Wystan is holding the east door with a chair leg. Merrin has a knife. I did not know Merrin had a knife.'),
        E('The Houses. Did you see them? Halvard stood up. Oswin did not move. My uncle\'s friend Aldous shook Vey\'s hand.'),
        C('We cannot stay here, Edric.'),
        E('I know. Behind the dais, the Keep stairs. Gaut is there. He said he would be.'),
        E('Then down. Down and out, and I will come back for my city when I have an army and not a box of papers.'),
        E('Lead, {name}. I will keep up.'),
      ],
    },
    'a4-m39-edric': {
      lines: [
        E('I heard it. All the way down the stairs, I heard it. Then it went quiet.'),
        C('He held them. Long enough.'),
        E('Is that his sword?'),
        C('He gave it to me. At the end.'),
        E('Then it is yours. He chose well. He always did, except with horses.'),
        E('He used to let me win at swords when I was small. Then one day he stopped letting me, and I cried, and he said that was the first real lesson.'),
        C('He taught me a few of those too.'),
        E('Rook says there is a way out under the city. Take me, {name}. I do not think I can find my own feet just now.'),
      ],
    },
    'a4-m38-go': { lines: [E('Then come. Through the chamber door, east of the hall. They are waiting.')] },
    'a4-m38-wait': { lines: [E('The chamber. Now, before I lose my nerve.')] },
    'a4-m41-edric': {
      lines: [
        E('He told me once that a king is just a man who cannot run away. Then he stood on the stairs so I could.'),
        C('He chose it. He would not have let you choose otherwise.'),
        E('I know. That is what makes it hard. I keep thinking I should have been the one on the stairs.'),
        E('I am fourteen. I have lost a city, a crown and my oldest knight in one night, and I am sitting in the mud by a fire.'),
        E('My grandfather would have known what to do. I only know what not to do now: I will not stop.'),
        C('Then do not. Everyone at this fire came out for you.'),
        E('I saw. Wystan with his arm in a sling. Merrin with the account books under her cloak. Wenna with half the miners of Oldsmoke.'),
        E('Look at the map. Rook says the road from here goes north-east, into the ash.'),
        C('Into the Waste.'),
        E('Into the Waste. Grandfather wrote about a gate there. I have his note somewhere. Let me find it.'),
        E('Talk to Rook. See to the fire. I need a moment with the map.'),
        C('Take the moment. I will be close.'),
        E('{name}. Thank you. For the stairs, and the dark, and the ladder.'),
        E('Go on. I will be here.'),
      ],
    },
    'a4-m41-ashgate': {
      lines: [
        E('Ashgate. Grandfather\'s note says it holds, whatever happens to the city. A fort on the edge of the ash, and people who owe the crown nothing and keep it anyway.'),
        C('Then that is where we go.'),
        E('That is where we go. Along the Ash Road, at first light. Tell the others.'),
        E('And {name}, keep the sword close. He would want it used.'),
      ],
    },
  },
});

/** M38's case, put from the podium: each part read from what Cael did; Q5, the vote it leads to is never counted. */
export const SCENE_M38_CASE = scene(M38_CASE_SCENE, [
  E('Lords of the three Houses. I am Edric, son of Aldwyn, and I come to ask for what is mine. Hear first what was done in my name.'),
  E('Here are the invoices from the Merchant Guild, every one paid by the Regent\'s clerk for a city that never saw the goods.'),
  E('Here are the heart ledgers from under the Smelter. Forty dragon hearts, bought and burned to feed an engine. One of the buyers sits in this hall.'),
  when(E('You heard the watch yard this morning. Five orders under the Regent\'s seal, read out to the men he struck off. They are outside these windows still.'), flagIs(R23_CHOICE, 'public')),
  when(E('The Council clerk holds five orders under the Regent\'s seal. He has the key to the case. Every House has read them.'), flagIs(R23_CHOICE, 'private')),
  when(voice('aldric-cole')('Halvard stands with the King. A dead man\'s debt does not buy my voice.'), won('halvard')),
  when(voice('aldric-cole')('Halvard will wait and see.'), not(won('halvard'))),
  when(voice('wilmot-penn')('Oswin\'s charter says the seat may vote by proxy. Oswin votes for the King.'), won('oswin')),
  when(voice('wilmot-penn')('Oswin abstains, by the charter as written.'), not(won('oswin'))),
  when(voice('grisel-steward')('Grisel stands with the King, whatever Lord Aldous says.'), won('grisel')),
  when(voice('grisel-steward')('Grisel follows its lord.'), not(won('grisel'))),
  when(E('I have no witnesses to bring you from the mountains. Only what is on this table.'), band('none')),
  when(E('There are men in this hall who were spared on the Dragonspine and came here to say what they saw. A few, but they came.'), band('few')),
  when(E('Look at the back of the hall. Hunters, wardens, men who were spared in Cinderreach and on the Dragonspine. They came to stand for the truth.'), band('many')),
  voice('wenna')('My father sits with the Regent. I sit with the King. Grisel can choose which of us it follows.'),
  voice('merrin')('The Counting-House books are open on the table for any House that wants to count what the Regent took. It is a great deal.'),
  E('I am fourteen. I know what you think of that. My grandfather was twelve when he took the oath, and he held it fifty years.'),
  E('I do not ask you to love me. I ask you to choose the crown over the man who stole it from a child.'),
  W('The case is made. Let the Houses vote.'),
  V('There will be no vote.'),
]);

/** Gaut between the second and third waves, at the barricade. */
export const SCENE_M39_BREATH = scene(M39_BREATH_SCENE, [
  G('Two down. They will come harder now; they have seen what is waiting.'),
  C('How long can we hold?'),
  G('As long as the King needs. Rook will have him at the bottom by now.'),
  G('Do you know, I held a bridge once, at Cinderford, in the old war. Three days. I was younger, and so was the bridge.'),
  C('Did you win?'),
  G('We lost the bridge. We won the war. Remember that, lad: you can lose the stairs and still win.'),
  C('We are not losing the stairs.'),
  G('No. Not today. Breathe. Drink. They are on the stair.'),
]);

/** Edric at each junction of the deep run (L4 stops the column; this talk with Rook as the lead walks it on). */
export const SCENE_M40_JUNCTIONS: readonly BuiltTree[] = [
  scene(M40_JUNCTION_SCENE(1), [
    E('Which way? I cannot see anything. Is that water?'),
    R('Left. The right fell in before your grandfather was born. Keep your hand on the wall, Majesty.'),
    E('I am not afraid of the dark. I am afraid of what is in it.'),
    C('So am I. Walk anyway.'),
    R('That is the whole secret, Majesty. Nobody brave ever felt brave.'),
    E('Then I am very brave just now.'),
  ]),
  scene(M40_JUNCTION_SCENE(2), [
    E('I can hear them behind us. Dogs. And men.'),
    C('Then we keep going. Rook?'),
    R('Straight on. The patrol hall is ahead. Keep low and quiet, or keep your sword out. Either way, keep moving.'),
    E('Gaut would say: one foot, then the other.'),
    R('He would. He said it to me once on the Dragonspine, carrying me.'),
    E('He carried you?'),
    R('Two miles. I never let him forget it, and he never let me thank him.'),
  ]),
  scene(M40_JUNCTION_SCENE(3), [
    R('Last turn. The ladder is beyond the cart. The air is better here; can you smell it?'),
    E('Ash. And outside. I thought I would never smell outside again.'),
    E('{name}, when we get to the top, I am going to be sick, and then I am going to be king again. In that order.'),
    C('Fair enough.'),
    R('Up the ladder first, Majesty. I go last. If anything follows us, it meets me.'),
    E('And if it meets you?'),
    R('Then it will wish it had stayed in the dark. Up.'),
  ]),
];

export const COUNCIL_SCENE_TREES: readonly BuiltTree[] = [SCENE_M38_CASE, SCENE_M39_BREATH, ...SCENE_M40_JUNCTIONS];
