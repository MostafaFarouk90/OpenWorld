import { buildTree } from '../../act2/build';
import { all, qActive, qDone } from '../../act2/cond';
import { C, at, offer, voice } from './common';

const G = voice('gytha');
const K = voice('crow');

/**
 * Gytha Mireweather, the peat-witch. M25 (brief 16, herb lore 12 with her crow's four lines, warning 6, hand-in 4), R13 (brief 8,
 * hand-in 8), M26 (brief 10, at the Mere 8, hand-in 9 with the scale) and D05 (brief 8). The post rules move her: the hut,
 * the chapel while R13 runs, the Mere while M26 runs, the Deeps door for D05.
 */
export const GYTHA = buildTree({
  id: 'npc-gytha',
  start: [
    { when: at('m25', 'report'), seg: 'm25-report' },
    { when: at('m25', 'warning'), seg: 'm25-warning' },
    { when: at('m25', 'lore'), seg: 'm25-lore' },
    { when: at('r13', 'report'), seg: 'r13-report' },
    { when: at('m26', 'report'), seg: 'm26-report' },
    { when: at('m26', 'mere'), seg: 'm26-mere' },
    { when: offer('d05'), seg: 'd05-brief' },
    { when: all(offer('m26'), offer('r13')), seg: 'offers' },
    { when: offer('m26'), seg: 'm26-brief' },
    { when: offer('r13'), seg: 'r13-brief' },
    { when: offer('m25'), seg: 'm25-brief' },
    { when: qActive('m25'), seg: 'm25-wait' },
    { when: qActive('r13'), seg: 'r13-wait' },
    { when: qActive('m26'), seg: 'm26-wait' },
    { when: qActive('d05'), seg: 'd05-wait' },
    { when: qDone('d05'), seg: 'after-d05' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    offers: {
      lines: [
        {
          s: 'gytha', t: 'Two things want doing, {name}, and I have only the one pair of old hands. Which first?',
          choices: [
            { id: 'mere', t: 'Hathren, at the Mere.', go: 'm26-brief' },
            { id: 'song', t: 'The lullaby, at the chapel.', go: 'r13-brief' },
          ],
        },
      ],
    },
    'm25-brief': {
      lines: [
        G('Stop there. Do not step on the doorstone; it has been blessed and it does not like iron.'),
        C('I am looking for Gytha Mireweather.'),
        G('You have found her. Do not look so surprised. I am old, I am small, and I smell of peat. All of those are on purpose.'),
        G('You have the Burn on you. I can smell it from here, like a hearth that has not been swept. How long?'),
        C('Since the Cinderreach. It grows.'),
        G('It grows because you feed it. Every fire you call, every spell you cast, a little more of the old flame settles in your bones. It does not leave. It waits.'),
        C('Is there a cure?'),
        G('There is a salve. Not a cure; a salve. It takes the edge off for a time, the way a cold cloth takes the heat out of a fever.'),
        G('I used to make it for the monks. They are all drowned now, and I have forgotten the recipe, or half of it. The rest is in my shelf and in my beds.'),
        C('What do you need?'),
        G('Three herbs. Bog myrtle, sundew, mire lily. They grow in the beds round the hut, and they grow badly, because something is feeding on them.'),
        G('Shamblers and leeches, mostly. The peat itself has turned. Clear the beds and I will teach you what each herb is for.'),
        G('The herb-cutter at the gate knows where they are. Ask him before you wade in; he has lost fingers to the sundew.'),
        G('And read my shelf. Old salves, old labels, in a hand I do not like to remember. It will tell you what I cannot.'),
        C('And in return?'),
        G('In return you will drink what I brew, and you will not complain about the taste. Go on.', [{ startQuest: 'm25' }]),
      ],
    },
    'm25-wait': { lines: [G('The beds first. Bog myrtle, sundew, mire lily. Shambler and leeches, and then the cauldron.')] },
    'm25-lore': {
      lines: [
        G('Bog myrtle first. It grows in the wet, where the water is tea-brown. The leaf is bitter and the smoke is sweet. It draws heat out of a wound.'),
        K('Kraa. Heat. Kraa.'),
        G('Hush, Cinder. Sundew next. It looks like a trap because it is one: a red hand with a dew-drop in every finger. It eats flies, and it will eat a thumb if you let it.'),
        K('Thumb. Kraa. Thumb.'),
        C('Is the crow always so helpful?'),
        G('Always. He was a monk\'s crow once. He still thinks he is one.'),
        G('The mire lily last. White as a candle in the black mud, and as rare. Its root is the heart of the salve; the other two only carry it.'),
        K('Candle. Kraa. Candle.'),
        G('You will pick them one by one, and you will pick them well. A torn root is a spoiled salve, and I do not have another season.'),
        G('When you have all three, come to the cauldron. I will teach you the stirring.'),
        C('Is there anything I should not do?'),
        G('Do not hurry. Do not curse. And do not drink it until it has stopped steaming.'),
      ],
    },
    'm25-warning': {
      lines: [
        G('It has worked, then. I can see it in your face, the line between the brows that was not there.'),
        C('The Burn is quieter. I did not think it could be.'),
        G('It is quieter. It is not gone. Remember that, {name}, when you call the flame again. Old fires have long memories.'),
        G('The fire in you is older than you are. It remembers what it burned, and it will remember what you burn.'),
        C('I will remember.'),
        G('See that you do. Come back to me when your hands stop shaking.'),
      ],
    },
    'm25-report': {
      lines: [
        G('Three herbs, a shambler, a handful of leeches, and a salve. That is a fair day\'s work for an old woman and her guest.'),
        C('Will you teach me the recipe?'),
        G('I will write it down. You cannot read my hand, but your cook can, and she will do it better than I.'),
        G('I will sell the salve at the hut when you have the herbs. Fifteen crowns, no haggling. I have a crow to feed.'),
      ],
    },
    'r13-brief': {
      lines: [
        G('You have an hour to spare for an old woman, {name}? The Sunken Chapel is south of Greywatch, and the monks that built it are still singing in it.'),
        C('Singing?'),
        G('A lullaby. They sang it to Hathren, the dragon in the Mere, to keep her sleeping when the water got restless. It is the only thing that ever worked.'),
        G('The song is in the chapel, in pieces: a hymn board, a font, a bell rope, a carving, a ledger. The monks drowned with the nave. Their keeper rings the bell still.'),
        C('I need to dive?'),
        G('Four pockets of air in the nave, one at the altar. You hold your breath, you swim, you come up. It is not difficult. It is only cold.'),
        G('And the leeches. They have made the nave their nest. Clear them out before you sing.'),
        G('I will meet you at the chapel door. The keeper will speak to you; be kind to him. He is dead, and he is lonely.', [{ startQuest: 'r13' }]),
      ],
    },
    'r13-wait': { lines: [G('The nave, the pockets, the altar. Sing it right, {name}, or do not sing it at all.')] },
    'r13-report': {
      lines: [
        G('Listen. Do you hear it?'),
        C('The fen. It has gone quiet.'),
        G('Not quiet. Calm. There is a difference, and the difference is the song. Hathren is sleeping again, and the reeds are not leaning.'),
        G('I have not heard the fen like this since I was a girl.'),
        C('It was the keeper who taught me the last verse.'),
        G('Then he is a better monk than he thinks. Take this. A reed pipe, carved by the monks for the water-song. You can play it, if you have the breath.'),
        G('It will not calm the fen by itself. But it will remind the fen that it was once calm.'),
        G('Thank you, {name}. I mean it.'),
      ],
    },
    'm26-brief': {
      lines: [
        G('You will have heard the horn at the Mere, and the shouting. It was not the water.'),
        C('The hunters.'),
        G('The buyers\' hunters, with nets. Lead-weighted, iron-strung. They dropped them at night on the shallows, and they have been dragging a very large thing toward the shore ever since.'),
        G('Hathren. She sleeps lightly in her bed, and she woke to find herself tangled. She has not yet struck back. She will.'),
        C('Why has she not?'),
        G('Because she is a dragon who has not been angry in a thousand years, and she has forgotten how. Do not count on that forgetting.'),
        G('Cut the nets. Four of them, round the shallows. There are hunters on the shore, spearmen and a harpooner, and leeches in the water.'),
        G('Then there is the rite. A dragon wakes; a dragon must be quieted, or she will burn the fen to the water-line. The rite is old and simple. I will tell you at the stone.'),
        G('Meet me at the Mere. I will go ahead; I am old but I know the short ways.'),
        G('And take care. If you hurt her, even by accident, I will not be able to hold her.', [{ startQuest: 'm26' }]),
      ],
    },
    'm26-mere': {
      lines: [
        G('There. You see how she lies? She is the shape of the island. The island is her back.'),
        C('She is enormous.'),
        G('She is old. Old things are large, and large things are patient. But patience runs out.'),
        G('The nets are lead and iron. They will hold a dragon only because she lets them. The longer she lets them, the angrier she becomes.'),
        C('And the rite?'),
        G('At the stone, once the nets are cut. You will light the shrine and speak her name. The rest is hers to answer.'),
        G('Leofa is at the post by the shore. She will help you with the hunters. I will stay behind the stone, and I will not be seen.'),
        G('Go. Cut. Light. Speak.'),
      ],
    },
    'm26-wait': { lines: [G('The hunters, the nets, the stone. In that order. I will stay behind the stone.')] },
    'm26-report': {
      lines: [
        G('She is gone under the water, and the Mere is quiet. I did not think I would live to see it.'),
        C('She left something on the shore.'),
        G('A scale. Of course she did. Look at it, {name}. It has not the sheen of a fire-wyrm\'s scale; it is cold, and green, and it smells of the deep.'),
        G('Keep it. It is a gift, and a debt. She has given you something that her kin gave to no knight in a thousand years.'),
        C('Why me?'),
        G('Because you cut the nets. Because you spoke her name without fear. Because the Burn on you, for all its heat, did not flinch.'),
        C('The dragons will remember it.'),
        G('The dragons remember everything. That is what makes them dangerous, and what makes them worth knowing.'),
        G('Go and find Leofa. She has been waiting for you, and she has news about the hunters.'),
      ],
    },
    'd05-brief': {
      lines: [
        G('We have come to it, {name}. The Mirewater Deeps, under the old monastery. Nobody has gone in and come out since the monks drowned.'),
        C('What is inside?'),
        G('Cells. A reliquary. Two sluice-gates that keep the water out of the arena. And Murkjaw, in the arena, who keeps everything else out.'),
        G('He is an eel the size of a house, and he was a monk\'s pet once. The monks fed him; the monks drowned; he stayed. He is not evil. He is hungry, and alone.'),
        C('And I must kill him.'),
        G('You must pass him. I do not see how you will pass him without killing him.'),
        G('Dive the pockets, turn the sluice wheels, and read what the monks left. The last sluice drains the arena. After that it is you and him.'),
        G('Go carefully. I will be here when you come back, or I will not, and the fen will be a worse place for it.', [{ startQuest: 'd05' }]),
      ],
    },
    'd05-wait': { lines: [G('The Deeps, the sluices, the arena. I will be here when you come out.')] },
    'after-d05': { lines: [G('The Deeps are quiet now. I can hear my own crow think.')] },
    idle: { lines: [G('The hut, the herbs, the peat. I have enough to do. What do you want?')] },
  },
});
