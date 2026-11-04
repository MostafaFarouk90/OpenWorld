import { buildTree } from '../../act2/build';
import { all, qActive } from '../../act2/cond';
import { C, at, offer, voice } from './common';

const A = voice('ansgar');

/**
 * Brother Ansgar, keeper of the Last Anvil: M30 (brief 14, lore 6, the rise 3, the carvings 6, the report 6) and R17 (brief 8,
 * report 6). The rise stands where the plan's updraft shimmer set piece was (K9 does not build it in Act 3; logged as a taste call).
 */
export const ANSGAR = buildTree({
  id: 'npc-ansgar',
  start: [
    { when: at('m30', 'report'), seg: 'm30-report' },
    { when: at('r17', 'report'), seg: 'r17-report' },
    { when: at('m30', 'carvings'), seg: 'm30-carvings' },
    { when: at('m30', 'rise'), seg: 'm30-rise' },
    { when: at('m30', 'lore'), seg: 'm30-lore' },
    { when: offer('m30'), seg: 'm30-brief' },
    { when: offer('r17'), seg: 'r17-brief' },
    { when: qActive('m30'), seg: 'm30-wait' },
    { when: qActive('r17'), seg: 'r17-wait' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'm30-brief': {
      lines: [
        A('Peace on the road, traveller. You are the knight from the lodge. The Burn is on you, but you hold it well.'),
        C('Brother Ansgar? Thorgar says you keep the Last Anvil.'),
        A('Keep is a large word for a man with a broom and a candle. It is a task.'),
        A('This was a smithy once, raised by the first keepers. They forged the weapons that sealed the dragons on this ridge, and then they forged the shrine that remembers it.'),
        C('The Anvil is cold.'),
        A('It has been cold since my predecessor died. I swept around it each morning and never struck it.'),
        A('Around it stand six carved stones, and the carvings are worn nearly smooth. They are a story, and the frost is eating it.'),
        C('You want them copied.'),
        A('Rubbings, with paper and charcoal. Hold it against the stone for a count of three and the carving comes through. I have tried myself. My hands shake.'),
        A('Before that, the Anvil itself. It must be swept, relit and sounded, in that order, or the shrine does not wake.'),
        A('A pack of hawks and an ogre have taken the shoulder below. You will have to clear them before you can work.'),
        C('And what do I get for the rubbings?'),
        A('The rubbings. Nothing less. The old tongue can be read, once someone has the knowledge. I do not know who. Perhaps you will.'),
        {
          s: 'ansgar', t: 'Will you help me?',
          choices: [
            { id: 'accept', t: 'I will take the rubbings.', go: null, fx: [{ startQuest: 'm30' }] },
            { id: 'later', t: 'Not yet.', go: null },
          ],
        },
      ],
    },
    'm30-lore': {
      lines: [
        A('Let me tell you the lore, since you will be working in it.'),
        A('The first keepers were smiths, and they believed a weapon remembers the hand that made it. A shrine to that memory was their craft.'),
        A('So they raised the Last Anvil, the last of seven, and each of the six carvings is a day of the forging.'),
        C('What is the seventh?'),
        A('The seventh is the work itself, and it was never carved. That is the secret. They left it for us to do.'),
        A('Go to the pilgrim on the shoulder when you are ready. She has a story that belongs here.'),
      ],
    },
    'm30-wait': { lines: [A('The pilgrim on the shoulder, the hawks, then the Anvil: sweep, relight, sound. The waystone after. The stones last.')] },
    'm30-rise': {
      lines: [
        A('Do you see it? There, where the mountain meets the cloud. The air is moving.'),
        C('A shimmer, rising off the slope.'),
        A('The updraft. The old keepers said it came when the Anvil woke. It carries a hawk, or a glider, or a soul. I never thought to see it.'),
      ],
    },
    'm30-carvings': {
      lines: [
        A('Now the carvings. Stand by me, and I will read them as the keepers cut them.'),
        A('The first stone: "Iron is patient." The second: "Fire is faithful."'),
        A('The third: "The hammer remembers." The fourth: "The anvil forgives."'),
        A('The fifth, which is hardest: "What is struck in anger rings false for ever."'),
        A('The sixth is a drawing, not a word. A hand opening, with the hammer set down in it.'),
        C('They are about setting a weapon down.'),
      ],
    },
    'm30-report': {
      lines: [
        A('The rubbings are safe, and the Anvil sings. I did not think I would hear it again.'),
        C('What do the rubbings say?'),
        A('I cannot read them. No one can, yet. The old tongue will come to someone. Keep them close.'),
        A('The Anvil asks nothing more of you. But the road below has six wayside shrines that sit dark, and that is another matter.'),
        A('If you have the strength, come back when you are rested.'),
        A('Peace on the road.'),
      ],
    },
    'r17-brief': {
      lines: [
        A('The road below has six wayside shrines, one every two hundred paces. Pilgrims lit them once. Now they are dark.'),
        C('You want them lit.'),
        A('I want them burning, so that the pilgrims who come after you can see the way. Candles from the Anvil\'s own fire, carried by hand.'),
        A('Six are bound in a bundle on the Anvil. Take it. They burn only for the one who carries them.'),
        C('And if I set it down?'),
        A('Then it waits where you set it. Do not stray off the road. The mountain takes what it is given.'),
        A('Begin with the third shrine, the lowest, and work toward the first. Then walk back up past the Anvil to the fourth and onward.'),
        A('You must go on foot. A horse will not carry a flame like that.', [{ startQuest: 'r17' }]),
      ],
    },
    'r17-wait': { lines: [A('The bundle is on the Anvil. Shrines three, two, one, then four, five, six. On foot.')] },
    'r17-report': {
      lines: [
        A('I saw them burn from my cell. Six lights on the road, like a necklace.'),
        C('The pilgrims thanked me.'),
        A('They thanked the candles. You are a candle-bearer, which is more than a knight.'),
        A('Take this. It is not blessed by anyone important, only by me.'),
        A('A blessing is a small thing. It is meant to be.'),
        A('Go with peace.'),
      ],
    },
    idle: {
      lines: [
        {
          s: 'ansgar', t: 'Peace on the road, {name}. The Anvil burns, and so do I. Is there something you need?',
          choices: [
            { id: 'trade', t: 'Do you sell candles?', go: null, fx: [{ event: 'npc.vendor.open', payload: { vendorId: 'ansgar' } }] },
            { id: 'bye', t: 'Only your blessing.', go: null },
          ],
        },
      ],
    },
  },
});
