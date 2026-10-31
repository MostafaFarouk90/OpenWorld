import { buildTree } from '../../act2/build';
import { all } from '../../act2/cond';
import { C, at, voice } from './common';

/** The causeway ranger, Reedgate's three folk, the herb-cutter, the Greywatch rangers, the deserter, the bell keeper, the brood keeper and the drowned monk. */
const idle = (s: string, t: string) => ({ idle: { lines: [voice(s)(t)] } });

const R = voice('causeway-ranger');
export const CAUSEWAY_RANGER = buildTree({
  id: 'npc-causeway-ranger',
  start: [{ when: at('m23', 'ranger'), seg: 'm23-ranger' }, { when: all(), seg: 'idle' }],
  segments: {
    'm23-ranger': {
      lines: [
        R('Captain Hartley said you would come. I am glad. I have counted the planks four times since dawn, and the number keeps changing.'),
        C('Leofa asked me to find your way-markers.'),
        R('They are down the causeway, one at a drowned cart, one at the first bridge, one at the pack I left behind. Read them in order and the fen will let you through.'),
        R('Burn the leech knots as you come on them. Do not wade; the water is deeper than it looks, and the planks are better than the mud.'),
      ],
    },
    ...idle('causeway-ranger', 'Keep to the planks, knight. The planks are the only honest thing out here.'),
  },
});

const folk = (n: 1 | 2 | 3, who: string, a: string, b: string, i: string) => buildTree({
  id: `npc-reedgate-folk-${n}`,
  start: [{ when: at('m23', `folk${n}`), seg: 'm23-folk' }, { when: all(), seg: 'idle' }],
  segments: { 'm23-folk': { lines: [voice(who)(a), voice(who)(b)] }, ...idle(who, i) },
});
export const FOLK1 = folk(1, 'reedgate-folk-1',
  'The Mere sings, sir. My mother heard it, and her mother. A low song, like the wind in a jug, and it went on all night.',
  'It has stopped. Two months now. The reeds are restless without it, and so are we.', 'Mind the water, sir.');
export const FOLK2 = folk(2, 'reedgate-folk-2',
  'I mend nets for the ferry. My needle goes through them and finds iron where there was only hemp. Somebody has been dipping nets in the Mere that were never ours.',
  'Lead-weighted ones. I have seen two. They do not float.', 'The nets are never finished.');
export const FOLK3 = folk(3, 'reedgate-folk-3',
  'I saw it, sir! A wing the size of a barn door, coming up out of the Mere! Nobody believes me.',
  'Mam says I dreamed it. I did not dream it. It was green.', 'It was green, sir. I swear.');

export const HERB_CUTTER = buildTree({
  id: 'npc-herb-cutter',
  start: [{ when: at('m25', 'herb-cutter'), seg: 'm25-cutter' }, { when: all(), seg: 'idle' }],
  segments: {
    'm25-cutter': {
      lines: [
        voice('herb-cutter')('Gytha sent you? Then you want the beds. Bog myrtle by the hut, sundew down the slope, mire lily at the far end where the water is deepest.'),
        voice('herb-cutter')('I would pick them for you, but a shambler took the sundew bed, and the leeches have the rest. Look for the mud that moves.'),
        C('I will mind it.'),
      ],
    },
    ...idle('herb-cutter', 'The beds are poor this year. Poor, and hungry.'),
  },
});

const GR = (n: 1 | 2 | 3, who: string, lines: [string, string, string, string]) => buildTree({
  id: `npc-greywatch-ranger-${n}`,
  start: [{ when: at('r14', `ranger${n}`), seg: 'r14-ranger' }, { when: all(), seg: 'idle' }],
  segments: {
    'r14-ranger': { lines: [voice(who)(lines[0]), C(lines[1]), voice(who)(lines[2]), voice(who)(lines[3])] },
    ...idle(who, 'Leofa will want to hear it from you. Go and tell her.'),
  },
});
export const GRANGER1 = GR(1, 'greywatch-ranger-1', [
  'Captain Hartley sent you. Thank the water. I have been on this post for nine days, and the only voice I have heard is my own.',
  'What happened to the patrol?',
  'We split at the second post. Wybert and I went east; the others stayed. Wybert said he knew a shorter way. He did not.',
  'He took the bolts and the food, and left me the post. I hold it still. Tell the captain.',
]);
export const GRANGER2 = GR(2, 'greywatch-ranger-2', [
  'Is that a friend I see? Or the water showing me a friend?',
  'A friend. Leofa sent me.',
  'Then I am in your debt. The hunters came on the third night. I hid in the platform, under the boards. They looked, and did not look hard.',
  'Wybert was with them. Not with them, with them. He was the one who showed them where we slept. I saw him, and he saw me.',
]);
export const GRANGER3 = GR(3, 'greywatch-ranger-3', [
  'Water. A swallow of it, knight, then a question.',
  'Ask.',
  'Wybert tied me here to stop me following. He was crying when he did it. He said he had a daughter in Stonefold and the buyers knew her name.',
  'I do not hate him. I did. I do not. Tell the captain he is at the last post, and that he is afraid.',
]);

const W = voice('deserter');
export const DESERTER = buildTree({
  id: 'npc-deserter',
  start: [
    { when: at('r14', 'choice'), seg: 'r14-choice' },
    { when: at('r14', 'deserter'), seg: 'r14-deserter' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'r14-deserter': {
      lines: [
        W('You have a ranger\'s cloak. Hartley\'s. I thought it was the buyers come back to finish.'),
        C('Wybert Fenn?'),
        W('That is my name. It will not be much longer. Do you know what they do to a man who leaves a post?'),
        C('You left three rangers and a hundred miles of fen behind you.'),
        W('I left a post that was already lost. I do not say that to excuse it. The buyers had my daughter\'s name and the name of the street. Do you know what that is, to a father?'),
        W('I gave them the post. I gave them the patrol\'s watch-times. I did not give them the men; I did not know they would be so thorough.'),
        C('The rangers are alive. Three of them.'),
        W('Alive. That is something. That is more than I deserve. Whatever you do with me, knight, do it quick. I have been awake for nine nights.'),
      ],
    },
    'r14-choice': {
      lines: [
        C('I have heard it all, Wybert. You took the buyers\' coin, and you betrayed the post.'),
        W('Every word of it is true. I have nothing to add.'),
        {
          s: 'deserter', t: 'Hartley will hang me, or put me in the stocks. Or you can let me walk, and I will go to Stonefold and never be seen again. What will it be?',
          choices: [
            { id: 'return', t: 'You will answer to Leofa at Greywatch.', go: 'r14-returned', fx: [{ setFlag: 'story.r14.choice', value: 'returned' }, { event: 'story.r14.chosen' }] },
            { id: 'release', t: 'Go to your daughter. Do not come back.', go: 'r14-released', fx: [{ setFlag: 'story.r14.choice', value: 'released' }, { event: 'story.r14.chosen' }] },
          ],
        },
      ],
    },
    'r14-returned': { lines: [W('Greywatch. The stocks, then. I will walk there myself, and I will not run. Tell her I am coming, and that I am sorry.')] },
    'r14-released': { lines: [W('I will go. I do not know how to thank you. Tell the captain I am sorry. Tell her I will pay it back, one way or another.')] },
    ...idle('deserter', 'Leofa will do what she will do. I have had my say.'),
  },
});

const B = voice('bell-keeper');
export const BELL_KEEPER = buildTree({
  id: 'npc-bell-keeper',
  start: [
    { when: at('r13', 'farewell'), seg: 'r13-farewell' },
    { when: at('r13', 'keeper'), seg: 'r13-keeper' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'r13-keeper': {
      lines: [
        B('Do not be alarmed. I am quite dead, and I have been for some time. I am the bell keeper. I keep the bell.'),
        C('Gytha told me you would help.'),
        B('Gytha. Little Gytha, who used to bring us herbs. She is old now, I imagine. We drowned when she was a girl.'),
        B('The song you want was sung at the altar, in four verses. The first is on the hymn board, the second in the font, the third on the bell rope, the fourth carved on the altar itself.'),
        C('And the ledger?'),
        B('The ledger tells you when the water rose, and by how much. It is not part of the song. It is the reason we sang.'),
        C('Why did the water rise?'),
        B('Because we asked it to, one dry summer, and it was a creature that took requests seriously. We never asked again.'),
        B('Find the verses, {name}. The fen will listen to the tune long before it listens to a person.'),
      ],
    },
    'r13-farewell': {
      lines: [
        B('It has worked. I can hear the Mere breathing, slow and long, the way it did before the water rose.'),
        C('You taught me the last verse.'),
        B('I am glad I could. Now I think I can rest. Ring the bell once for me, if you would, when you leave.'),
      ],
    },
    ...idle('bell-keeper', 'The bell is cold. I keep it all the same.'),
  },
});

const K = voice('brood-keeper');
export const BROOD_KEEPER = buildTree({
  id: 'npc-brood-keeper',
  start: [{ when: at('m27', 'keeper'), seg: 'm27-keeper' }, { when: all(), seg: 'idle' }],
  segments: {
    'm27-keeper': {
      lines: [
        K('Do not shoot. I am not one of them. I am the man who feeds them, which is not the same thing.'),
        C('You keep the brood for the hunters.'),
        K('I keep the brood for whoever pays. That is the trade. I did not choose the buyers, and I did not choose the dragons, and I did not choose the cages.'),
        K('There are thirty young in the reeds, caged by threes. Two packs guard them, and the reed blinds guard the packs. If you creep through the blinds, the first pack will not see you.'),
        C('And the second?'),
        K('The second sees everyone. Spearmen, a harpooner. They will not talk. They will not run. Take them if you can; the cages open from the inside with a pull on the pin.'),
      ],
    },
    ...idle('brood-keeper', 'Leave me out of it, knight. I have said what I will say.'),
  },
});

const E = voice('monk-echo');
export const MONK_ECHO = buildTree({
  id: 'npc-monk-echo',
  start: [{ when: at('d05', 'echo'), seg: 'd05-echo' }, { when: all(), seg: 'idle' }],
  segments: {
    'd05-echo': {
      lines: [
        E('You are the first to breathe here in a long while. Do not be afraid. I am only an echo of a man who stayed to keep the sluices.'),
        C('Gytha sent me. I am going to the arena.'),
        E('Then you will need the wheels. Two of them, one in each of the sluice rooms. Turn the first, and the second will answer. Turn both, and the arena drains.'),
        E('Murkjaw was our pet. We fed him bread, when we had bread, and he ate from our hands. When the water rose, he stayed. I do not know why.'),
        C('He is guarding something.'),
        E('He is keeping the monks. They are in the arena, all of them. He cannot let them go; he does not know that they are gone.'),
      ],
    },
    ...idle('monk-echo', 'The wheels, the arena. Go on.'),
  },
});

export const MINOR_TREES = [CAUSEWAY_RANGER, FOLK1, FOLK2, FOLK3, HERB_CUTTER, GRANGER1, GRANGER2, GRANGER3, DESERTER, BELL_KEEPER, BROOD_KEEPER, MONK_ECHO];
