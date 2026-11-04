import { buildTree } from '../../act2/build';
import { M31_GATE_MET } from '../../../../quests/content/act3/summit/m31.quest';
import { C, at, offer, qActive, voice } from './common';

const E = voice('eadgyth');

/**
 * Eadgyth's summit segments, added in front of her lower-slope tree (extendTree; node ids all start `s3`): M31's offer (8) at the shelter, the
 * gate talk (6) and the report (5) at the Hearth, and M32's few words (6). She walks on by post rules.
 */
export const EADGYTH_SUMMIT = buildTree({
  id: 'npc-eadgyth',
  start: [
    { when: at('m31', 'report'), seg: 's31-report' },
    { when: at('m31', 'gatetalk'), seg: 's31-gate' },
    { when: at('m32', 'eadgyth'), seg: 's32-talk' },
    { when: offer('m31'), seg: 's31-offer' },
    { when: qActive('m31'), seg: 's31-wait' },
  ],
  segments: {
    's31-offer': {
      lines: [
        E('You have the look of someone who has come to ask me for something. I am glad. I have been wondering when.'),
        E('The Keeper will not talk to a stranger. She tests every one who climbs to her slope, and she has been doing it for as long as my grandmother\'s grandmother.'),
        C('A test. What kind?'),
        E('A trial, not a fight. Ysmeryth does not kill who comes. She wants to know what is in your hands before she lets you near the stone.'),
        E('We do not fight her, {name}. You will be told this by every old hunter on this mountain. The ones who forgot it did not come back.'),
        E('I will ride with you as far as the gate. I have not been that high in forty winters. I would like to see it before I am too old to look.'),
        E('Break her guard three times, and she will speak. Or yield after two. She prefers it, though she will not say so.'),
        {
          s: 'eadgyth', t: 'Will you go to her?',
          choices: [
            { id: 'accept', t: 'I will go.', go: null, fx: [{ startQuest: 'm31' }] },
            { id: 'later', t: 'Not yet.', go: null },
          ],
        },
      ],
    },
    's31-wait': { lines: [E('The gate, then the climb. Walk it on your own feet. She watches the ridge.')] },
    's31-gate': {
      lines: [
        E('There it is. The gate. I held the wall here in my second year. It was taller then.'),
        C('You are shaking.'),
        E('It is the cold. Do not look at me like that.'),
        E('Go up. The roost is past the ledges. I will go on to the Hearth, and wait there, where the stone is warm. I trust her more than I trust my own legs.'),
        E('If you have to bow to her, bow. Pride is a poor guard against a creature three hundred times your size.'),
        E('Go well, {name}. I will see you at the fire.', [{ setFlag: M31_GATE_MET, value: true }]),
      ],
    },
    's31-report': {
      lines: [
        E('You are alive. I had not decided what I would say if you were not.'),
        C('She let me stand. She told me what the Hearth is.'),
        E('She told me too, once, from a distance, when I was too young to understand. I thought she was cursing.'),
        E('Keep what she gave you. She does not give twice. And forgive an old woman for being afraid of the thing you were not.'),
        E('Go and speak with her. The fire is lit enough for talk.'),
      ],
    },
    's32-talk': {
      lines: [
        E('I stood in the doorway and listened. She spoke to you as one speaks to a friend, and I had not known she could.'),
        C('You heard what she said about the axe?'),
        E('I heard. I will not say what I think. It is yours to settle, and hers.'),
        E('I am too old to learn a new way of seeing dragons. But I would like to see one that does not die for it.'),
        E('Go on. I will stay by the fire. It is the first fire I have sat at in forty winters that does not smell of ash.'),
        E('Mind the companions. They are afraid of her too, and the fear will make them talkative.'),
      ],
    },
  },
});
