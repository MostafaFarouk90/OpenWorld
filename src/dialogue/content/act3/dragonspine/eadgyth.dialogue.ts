import { buildTree } from '../../act2/build';
import { all, flagIs, not, qActive } from '../../act2/cond';
import { R16_CHOICE, R16_FAVOURED, R16_KEEP_FAVOUR } from '../../../../quests/content/act3/dragonspine/r16.quest';
import { C, at, offer, voice } from './common';

const E = voice('eadgyth');

/**
 * Eadgyth Frostbrow, the hermit of Rime Pass: M29 (greeting 4 and the fire talk 20, the report 6; the confession is a scene),
 * R16 (brief 8, the choice 8, the report 6). The keep branch costs the dragons favour once (guarded by `story.r16.favoured`).
 */
export const EADGYTH = buildTree({
  id: 'npc-eadgyth',
  start: [
    { when: at('m29', 'report'), seg: 'm29-report' },
    { when: at('r16', 'report'), seg: 'r16-report' },
    { when: at('r16', 'choice'), seg: 'r16-choice' },
    { when: at('m29', 'firetalk'), seg: 'm29-firetalk' },
    { when: offer('m29'), seg: 'm29-greet' },
    { when: offer('r16'), seg: 'r16-brief' },
    { when: qActive('m29'), seg: 'm29-wait' },
    { when: qActive('r16'), seg: 'r16-wait' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'm29-greet': {
      lines: [
        E('You are the knight everyone talks about down the pass. I heard you were coming. I did not hear you were so tall.'),
        C('Thorgar sent me. He said you might talk to me.'),
        E('He said that, did he. I have not said a full sentence to the lodge in six winters.'),
        E('Look at the wall first. Then bring me wood. Then, if I am warm, I will think about it.', [{ startQuest: 'm29' }]),
      ],
    },
    'm29-wait': { lines: [E('The wall, the woodpile, the fire. In that order. I am an old woman and I like a plan.')] },
    'm29-firetalk': {
      lines: [
        E('Sit. Not so close. The pass wind turns and takes the smoke into your eyes.'),
        C('Thank you for the fire.'),
        E('Thank the woodpile. The hawks had nested in it, did you notice? I never had the heart to clear them.'),
        C('You are a hunter. You keep hawks.'),
        E('I was a hunter. The wall says so. Do not read the wall as boasting. It is a ledger.'),
        C('Of what?'),
        E('Of what I owe. Every trophy there is a debt I took on and did not pay.'),
        E('The tooth is from the winter I learned dragons bleed. The harpoon belonged to my father, and to six hunters before him.'),
        C('And the drawing?'),
        E('That is my daughter\'s. She drew me with the axe. She drew the dragon smiling, because nobody had told her yet that they kill.'),
        C('Where is she?'),
        E('Down the mountain, married to a cooper, with children of her own who do not know my name. That is as it should be.'),
        E('I did not stop hunting because I grew old. I stopped because of one dragon, one night and one decision.'),
        C('What did you decide?'),
        E('I will tell you, but not yet. Warm your hands. The telling goes better with something to hold.'),
        C('I have a question first. Why does the lodge still follow you?'),
        E('Follow me? They fear me, which is not the same. A hunter who has done what I did is a warning, not an example.'),
        E('You wear a dragon\'s heat under that armour. I can feel it from here. The Burn is on you, and you are polite about it. That is rare.'),
        C('I am trying not to be what it wants.'),
        E('Then you are further along than I was. Listen, then. I will tell it plainly.'),
      ],
    },
    'm29-report': {
      lines: [
        E('Well. You listened, and you did not flinch. That is rare.'),
        C('I will not pretend to forgive it.'),
        E('I did not ask. I asked to be heard.'),
        E('Take this knife. It is the one I carried when I was first sworn to the lodge. A plain thing, and keen.'),
        E('There is more to the story. The axe I spoke of is still in the cave. When you are ready, ask me.'),
        E('Go and rest. You are welcome at my fire.'),
      ],
    },
    'r16-brief': {
      lines: [
        E('I have been thinking since you left. About the axe.'),
        C('The one in the cave.'),
        E('It is called Frostbrow\'s, because it was mine. It has not been touched in forty winters, and I would like it buried properly or put to a better use than mine.'),
        E('The cave is on the western spur, past the Leap. One of the lodge hunters keeps the mouth.'),
        E('There is a pack at the mouth now: an ogre and hawks. Hawks follow the dead. They never stopped.'),
        C('And inside?'),
        E('The roof came down when she died. I did not see how far. You will need to clear it, and be careful what you disturb.'),
        E('Bring it to me and I will tell you what to do with it. The door will open for you.', [{ startQuest: 'r16' }]),
      ],
    },
    'r16-wait': { lines: [E('The mouth, the passage, the rockfall, the chamber. The axe is at the far end, under the dig.')] },
    'r16-choice': {
      lines: [
        E('You have it. I can feel it from here.'),
        C('Frostbrow\'s axe. A black ash haft and a silver edge.'),
        E('It is smaller than I remember. Everything is.'),
        E('There are two honest things to do with it. Give it back to the dragons, to the mountain that lost what I took. Or keep it and use it as it was made to be used.'),
        C('What would you do?'),
        E('I would not hold it. That is why I left it in the dark. It is not mine to say.'),
        E('But it was forged for dragons, {name}. In your hands it bites dragonkin harder than any edge in the lodge. That is the truth of it, and it is a temptation.'),
        {
          s: 'eadgyth', t: 'Well. Which will it be?',
          choices: [
            { id: 'give', t: 'I will give it back to the dragons.', go: null, when: not(flagIs(R16_CHOICE, 'keep')), fx: [{ setFlag: R16_CHOICE, value: 'give' }] },
            {
              id: 'keep', t: 'I will keep it.', go: null, when: not(flagIs(R16_CHOICE, 'give')),
              fx: [
                { setFlag: R16_CHOICE, value: 'keep' },
                { if: not(flagIs(R16_FAVOURED)), then: [{ favour: 'dragons', delta: R16_KEEP_FAVOUR }, { setFlag: R16_FAVOURED, value: true }] },
              ],
            },
          ],
        },
      ],
    },
    'r16-report': {
      lines: [
        E('It is decided, then. The mountain will remember which way you chose.'),
        C('Will you forgive me either way?'),
        E('Forgiveness is not mine to hand out. I will say this much: I am glad the axe is out of the dark.'),
        E('Take this haft. Rimewood, split from the oldest tree on the pass. It was cut to fit an axe like that one. It will do as well on whatever you carry.'),
        C('Thank you.'),
        E('Go carefully. The summit is not as quiet as the pass.'),
      ],
    },
    idle: {
      lines: [
        {
          s: 'eadgyth', t: 'You are welcome at my fire, {name}. Is there something you need?',
          choices: [
            { id: 'trade', t: 'Show me your knives.', go: null, fx: [{ event: 'npc.vendor.open', payload: { vendorId: 'eadgyth' } }] },
            { id: 'bye', t: 'Only the warmth.', go: null },
          ],
        },
      ],
    },
  },
});
