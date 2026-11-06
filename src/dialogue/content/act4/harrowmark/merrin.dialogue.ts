import { buildTree } from '../../act2/build';
import type { Condition, Effect } from '../../../../quests/types';
import { all, any, flagIs, not, qActive } from '../../act2/cond';
import { M36_DELEGATE, M36_HOUSES } from '../../../../quests/content/act4/harrowmark/m36.quest';
import { R20_CHOICE, R20_FAVOUR, R20_WAYS, type R20Way } from '../../../../quests/content/act4/harrowmark/r20.quest';
import { C, at, offer, voice, when } from './common';

const M = voice('merrin');

const won = (h: (typeof M36_HOUSES)[number]): Condition => flagIs(M36_DELEGATE(h), 'won');
/** Exactly n of the three delegates won. */
const wonCount = (n: number): Condition => {
  const hs = [...M36_HOUSES];
  const sets: Condition[] = [];
  for (let mask = 0; mask < 8; mask++) {
    const bits = hs.map((_, i) => (mask >> i) & 1);
    if (bits.reduce((a, b) => a + b, 0) !== n) continue;
    sets.push(all(...hs.map((h, i) => (bits[i] ? won(h) : not(won(h))))));
  }
  return any(...sets);
};

const pick = (way: R20Way): Effect[] => [
  { setFlag: R20_CHOICE, value: way },
  ...(R20_FAVOUR[way].oswin ? [{ favour: 'oswin' as const, delta: R20_FAVOUR[way].oswin }] : []),
  ...(R20_FAVOUR[way].halvard ? [{ favour: 'halvard' as const, delta: R20_FAVOUR[way].halvard }] : []),
];

/** Merrin at the Counting-House: M35's Oswin delegation, M36 (brief, report) and R20 (brief with the way, report). Extends `npc-merrin`. */
export const MERRIN_A4 = buildTree({
  id: 'npc-merrin',
  start: [
    { when: at('m35', 'oswin'), seg: 'a4-m35-oswin' },
    { when: at('m36', 'report'), seg: 'a4-m36-report' },
    { when: at('r20', 'report'), seg: 'a4-r20-report' },
    // R20 begun but its way not chosen (the brief was cut off between accept and the choice): ask again
    { when: all(qActive('r20'), not(any(...R20_WAYS.map((w) => flagIs(R20_CHOICE, w))))), seg: 'a4-r20-way' },
    { when: offer('m36'), seg: 'a4-m36-brief' },
    { when: qActive('m36'), seg: 'a4-m36-wait' },
    { when: offer('r20'), seg: 'a4-r20-brief' },
    { when: qActive('r20'), seg: 'a4-r20-wait' },
  ],
  segments: {
    'a4-m35-oswin': {
      lines: [
        M('There you are. The Oswin delegation: Elder Osric, who has sat on four Councils and slept through two, and my own two guards.'),
        C('The checkpoint at the Counting-House steps. I will show the writ, then we walk.'),
        M('Walk slowly. Osric is eighty, and he will not be hurried by a Regent or a knight.'),
      ],
    },
    'a4-m36-brief': {
      lines: [
        M('The vote is close, {name}. Closer than Edric knows. Three delegates have not said which way they will go.'),
        M('Ser Aldric Cole for Halvard. He owes money, and the Regent has bought the debt. He is ashamed of it, which makes him dangerous.'),
        M('Wilmot Penn for Oswin. My own clerk, and he has a page of charter that says the Oswin seat may not vote at all in a regency.'),
        C('Does it say that?'),
        M('It says it on his copy. Read the Archive\'s copy before you speak to him.'),
        M('And Orrin for Grisel. Aldous has him by something. I do not know what.'),
        M('Vey\'s men will be watching you go between them. The Rooftop Ward is quieter than the streets, if you can keep off the skyline.'),
        M('Win them if you can. If you cannot, at least know which way they will fall. I would rather count true than hope.'),
        {
          s: 'merrin', t: 'Will you see the three of them?',
          choices: [
            { id: 'accept', t: 'Aldric first, then Wilmot, then Orrin.', go: null, fx: [{ startQuest: 'm36' }] },
            { id: 'later', t: 'Not yet.', go: null },
          ],
        },
      ],
    },
    'a4-m36-wait': { lines: [M('Aldric at the Bastion, Wilmot by the Archive, Orrin at the River Gate. When you have all three, chalk the count on the board out front.')] },
    'a4-m36-report': {
      lines: [
        M('I saw the board. Let me read it back to you.'),
        when(M('All three. All three, {name}. Edric walks into that hall with every undecided vote at his back.'), wonCount(3)),
        when(M('Two of three. It is enough, if no one else turns. It is a thin enough thread that I will not sleep.'), wonCount(2)),
        when(M('One of three. We are short. Edric will have to win the room himself, and he is fourteen.'), wonCount(1)),
        when(M('None. Every one of them is the Regent\'s, or afraid of him. Then we go in knowing it.'), wonCount(0)),
        C('There was a man on the rooftops with a satchel of blank writs. The undecided houses had a time beside each name.'),
        M('Tomorrow night. So Vey means to buy them or bury them before the vote. Either way, we are ahead of him now.'),
        M('The Oswin silver key. My vaults, if the city falls. You have earned the right to open them.'),
      ],
    },
    'a4-r20-brief': {
      lines: [
        M('Twelve chests of Oswin silver are sitting in my cellar, and Vey has a clerk drawing up the order to freeze them.'),
        M('If the order is signed before the silver is out of the city, my House is a name and nothing else.'),
        C('Where does it go?'),
        M('Down the river road to our farms. Out through the River Gate post, then past the two huts Vey has put on the farm-ring.'),
        M('Three posts. Three sergeants. There are three ways past a sergeant, and I am not proud of any of them.'),
        M('Pay them. It is quick and quiet, and Halvard will say Oswin buys its way out of everything.'),
        M('Slip past them. Harder, and no one will thank you, but no one will know.'),
        M('Or break the posts. Halvard will cheer, and my House will be the House that bled the Regent\'s men in the street.'),
        {
          s: 'merrin', t: 'Will you take the convoy out? And how?',
          choices: [
            { id: 'later', t: 'Not yet.', go: null },
            { id: 'accept', t: 'I will take it out.', go: 'a4-r20-way', fx: [{ startQuest: 'r20' }] },
          ],
        },
      ],
    },
    'a4-r20-way': {
      lines: [
        {
          s: 'merrin', t: 'Then choose. Whatever you choose holds for all three posts.',
          choices: [
            { id: 'bribe', t: 'We pay them. Coin is quieter than steel.', go: 'a4-r20-bribe', fx: pick('bribe') },
            { id: 'stealth', t: 'I will slip each post\'s watch.', go: 'a4-r20-stealth', fx: pick('stealth') },
            { id: 'force', t: 'We break the posts.', go: 'a4-r20-force', fx: pick('force') },
          ],
        },
      ],
    },
    'a4-r20-bribe': { lines: [M('A hundred and fifty a post. Less, if they know the House and what it is good for. Read the manifest, then load the cart.')] },
    'a4-r20-stealth': { lines: [M('Then the cart waits at each post until you have been through it unseen. Read the manifest, then load the cart.')] },
    'a4-r20-force': { lines: [M('Then the cart waits back from each post until it is broken. Read the manifest, then load the cart, and try not to enjoy it.')] },
    'a4-r20-wait': {
      lines: [
        M('The cart halts at every post until you have it through. Read the tally at each one: I want to know what Vey has been taking.'),
      ],
    },
    'a4-r20-report': {
      lines: [
        M('The carter came back alone, with a song and no cart, which means the silver is where it should be.'),
        C('The posts were taking tolls in silver, only in silver, and sending it to the Keep\'s lower door.'),
        M('The door his grandfather bricked up. So that is where the money goes. Into the ground.'),
        when(M('And you paid every sergeant. Halvard will make a song of it. Let them.'), flagIs(R20_CHOICE, 'bribe')),
        when(M('No one saw you. That is a gift I will not forget.'), flagIs(R20_CHOICE, 'stealth')),
        when(M('Three posts broken. The Regent will know whose silver went out, and so will every Oswin farmer. I hope they cheer.'), flagIs(R20_CHOICE, 'force')),
        M('Take the convoy writ. Show it to any Oswin factor and they will sell to you as if you were family.'),
      ],
    },
  },
});
