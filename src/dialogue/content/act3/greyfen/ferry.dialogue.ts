import { buildTree } from '../../act2/build';
import { all, any, flagIs, not, objDone, qActive, qDone } from '../../act2/cond';
import { C, at, offer, voice } from './common';

const D = voice('dudda');
const H = voice('hild');
const W = voice('widow');

const unlocked = not(any(flagIs('story.r12.choice', 'burned'), flagIs('story.r12.choice', 'cut')));

/** Dudda Reedly, the ferryman: M24 (brief 10, hand-in 10) and R12 (brief 8, the torch-or-sickle choice 4, hand-in 8). */
export const DUDDA = buildTree({
  id: 'npc-dudda',
  start: [
    { when: at('m24', 'report'), seg: 'm24-report' },
    { when: at('r12', 'report'), seg: 'r12-report' },
    { when: at('r12', 'choice'), seg: 'r12-choice' },
    { when: offer('r12'), seg: 'r12-brief' },
    { when: offer('m24'), seg: 'm24-brief' },
    { when: all(qActive('r12'), objDone('r12', 'choice'), unlocked), seg: 'r12-wait' },
    { when: qActive('r12'), seg: 'r12-locked' },
    { when: qActive('m24'), seg: 'm24-wait' },
    { when: qDone('r12'), seg: 'after' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'm24-brief': {
      lines: [
        D('Well. There is a face I have not seen at my landing in a month. You are the knight from the Council.'),
        C('Leofa said the ferry is idle.'),
        D('Idle is a soft word. My horn went into the pool in the spring, with a boat on top of it. Without the horn the Mere ferry does not answer, and without the ferry the Mere does not answer us.'),
        D('The horn is how the boat knows it is wanted. Blow it from the landing, and the old boat on the far shore comes about on her own. Do not ask me how. My grandfather did not know.'),
        C('And the pool?'),
        D('Fenced, since the leeches took Jory. It is deep and it is dark. I could not swim it with a stone round my neck, and I would sooner not try.'),
        D('The mud flats round the wreck are not safe either. Take five soundings of the bottom for me, so I know where the planks went. And the leeches round the wreck have grown fat on the wreckage.'),
        C('A sounding, the wreck and the pool. Anything else?'),
        D('Hild will tell you the things I forget. My hands will tell you the rest. Do not trust the widow\'s kindness; she means it, but she will keep you talking.'),
        D('Bring me back the horn, knight. Blow it, and ride her, and come back to my landing with the token. Then we are square.', [{ startQuest: 'm24' }]),
      ],
    },
    'm24-wait': { lines: [D('The horn first, then the blowing, then the ride. Talk to Hild and my hands if you need the way.')] },
    'm24-report': {
      lines: [
        D('She came about on the first blast. I heard her come, like the oldest bell in the world.'),
        C('The ferry ran. I rode her to the Mere and back.'),
        D('So Hild told me. And you came back alive, which Jory did not.'),
        D('Here. The token. A ferry token is a small thing, a plain disc of the fen-brass my grandfather struck. But it opens the boat\'s doors, and without it she will not carry a soul.'),
        C('I keep it on me.'),
        D('Keep it close. The ferry stops at Reedgate, the Mere and Greywatch, and she goes to Mireweather when she is in the mood. Show the token at the landing and the hands will do the rest.'),
        D('You will pay no fare. I know the Council paid in advance, and I will not take their coin twice.'),
        C('It was a fair job, Dudda.'),
        D('It was a better job than I deserved, and I will not forget it. Come back when you want to be useful. The reed-cutters owe me, and I cannot collect.'),
        D('There is the matter of the reed-beds, too. But that is another day.'),
      ],
    },
    'r12-brief': {
      lines: [
        D('Knight. There is a matter of dues, and I am embarrassed by it.'),
        D('The reed-cutters cut for the ferry, and the ferry pays them in coin and carries their reeds free. A good bargain. For ten years, a good bargain.'),
        C('And now?'),
        D('Now the beds are fouled. Leeches in every one of the five, thick as mud. They cannot cut, so they cannot pay, and I cannot carry what is not cut.'),
        D('There are two ways. Burn the beds with a torch, quick and thorough, and the reeds grow back thinner. Or cut them down with a sickle, slow and honest, and the leeches come out one by one.'),
        D('The cutters will tell you what they think. Go and hear them, both of them. They are at their beds, north and south.'),
        D('When you have heard them, tell me which you will do. The torch or the sickle.'),
        D('And read what they have left lying about. A man tells you more with his tally than with his tongue.', [{ startQuest: 'r12' }]),
      ],
    },
    'r12-choice': {
      lines: [
        D('Well? You have heard them, the both of them.'),
        C('I have. The torch is quick. The sickle is kinder to the fen.'),
        {
          s: 'dudda', t: 'It is your knife, or your fire. Which will it be?',
          choices: [
            { id: 'torch', t: 'The torch.', go: 'r12-torch', fx: [{ setFlag: 'story.r12.pick', value: 'burned' }, { event: 'story.r12.picked' }] },
            { id: 'sickle', t: 'The sickle.', go: 'r12-sickle', fx: [{ setFlag: 'story.r12.pick', value: 'cut' }, { event: 'story.r12.picked' }] },
          ],
        },
      ],
    },
    'r12-torch': { lines: [D('The torch it is, then. Quick work, and it will smoke. Burn the five beds, and mind the leeches that crawl out of them. You may change your mind until the first bed is lit.')] },
    'r12-sickle': { lines: [D('The sickle, then. Slow work, and the leeches will come out in dozens. Cut the five beds, two cuts each. You may change your mind until the first bed is cut.')] },
    // before the first bed is treated the plan may still change; after it the choice is fixed
    'r12-wait': {
      lines: [
        {
          s: 'dudda', t: 'Five beds, and every one fouled. Do you want to change the plan?',
          choices: [
            { id: 'torch', t: 'I will take the torch.', go: 'r12-torch', fx: [{ setFlag: 'story.r12.pick', value: 'burned' }, { event: 'story.r12.picked' }] },
            { id: 'sickle', t: 'I will take the sickle.', go: 'r12-sickle', fx: [{ setFlag: 'story.r12.pick', value: 'cut' }, { event: 'story.r12.picked' }] },
            { id: 'stay', t: 'No. I will go on as I said.', go: null },
          ],
        },
      ],
    },
    'r12-locked': { lines: [D('The beds are begun, and what is begun is done. Finish the work and come back to me.')] },
    'r12-report': {
      lines: [
        D('The reeds are clean. The cutters are out with their baskets already; I can hear them from the landing.'),
        C('It is done. Every bed.'),
        D('Then the dues are paid, in a manner of speaking. The reeds will go to the ferry and the ferry will carry them to the market, and Reedgate will eat this winter.'),
        D('The cutters wove a suit of reed armour for whoever cleared their beds, and they have been waiting to give it to someone.'),
        C('I will wear it.'),
        D('See that you do. It turns a leech\'s tooth, and a hunter\'s spear if the weave holds.'),
        D('You have done more for Reedgate than any lord has done in my lifetime. I will not forget it.'),
        C('Keep the ferry running, Dudda. That is thanks enough.'),
      ],
    },
    after: { lines: [D('The ferry runs, the reeds are cut, and the landing is quiet. Come and see me when you want the river.')] },
    idle: { lines: [D('The landing, the boat, the horn. That is my world, knight. What can I do for you?')] },
  },
});

/** Hild Reedly, Dudda's wife (6 nodes in M24). */
export const HILD = buildTree({
  id: 'npc-hild',
  start: [
    { when: at('m24', 'hild'), seg: 'm24-hild' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'm24-hild': {
      lines: [
        H('So you are the one Dudda has been shouting about. Come in out of the wet, {name}.'),
        C('He sent me to you. He said you remember what he forgets.'),
        H('He forgets what he does not want to remember. The horn went into the pool because he threw it, in a temper. I will not say that where he can hear.'),
        H('It lies on the pool floor, by the wreck. There is a pocket of air under the planks where you can breathe. Dive, take it, and come up for air.'),
        C('And the leeches?'),
        H('They breed in the mud round the wreck. Burn them. They hate the smoke.'),
      ],
    },
    idle: { lines: [H('Dudda is at the landing, as always. He will not say it, but he is glad of the help.')] },
  },
});

const HAND1 = buildTree({
  id: 'npc-ferry-hand-1',
  start: [{ when: at('m24', 'hand1'), seg: 'm24-hand' }, { when: all(), seg: 'idle' }],
  segments: {
    'm24-hand': { lines: [voice('ferry-hand-1')('The horn is in the pool, sir. We all saw it go. Nobody wanted to be the one to tell the master he should not have thrown it.'), C('Then I will fetch it myself.')] },
    idle: { lines: [voice('ferry-hand-1')('The boat is quiet, sir. So are we.')] },
  },
});

const HAND2 = buildTree({
  id: 'npc-ferry-hand-2',
  start: [{ when: at('m24', 'hand2'), seg: 'm24-hand' }, { when: all(), seg: 'idle' }],
  segments: {
    'm24-hand': { lines: [voice('ferry-hand-2')('Mind the mud, sir. The flats look firm and are not, and the leeches wait in the soft places. Five soundings will tell you where the hard ground is.'), C('Five soundings. Thank you.')] },
    idle: { lines: [voice('ferry-hand-2')('The landing, the boat, the mud. There is not much else to say.')] },
  },
});

/** The ferryman\'s widow (3 nodes in M24). */
export const WIDOW = buildTree({
  id: 'npc-widow',
  start: [{ when: at('m24', 'widow'), seg: 'm24-widow' }, { when: all(), seg: 'idle' }],
  segments: {
    'm24-widow': {
      lines: [
        W('You are going into the pool. I can see it in the way you stand. My Jory went into it, once, for a bet.'),
        W('The water is not the danger. It is the dark under the planks, and the thing that sings in it. If you hear singing, come up.'),
        C('I will. Thank you.'),
      ],
    },
    idle: { lines: [W('I sit by the landing. It is where Jory left from. It is where he will come back to, if he comes.')] },
  },
});

const cutter = (n: 1 | 2, who: string, lines: [string, string, string, string]) => buildTree({
  id: `npc-reed-cutter-${n}`,
  start: [{ when: at('r12', `cutter${n}`), seg: 'r12-cutter' }, { when: all(), seg: 'idle' }],
  segments: {
    'r12-cutter': {
      lines: [voice(who)(lines[0]), C(lines[1]), voice(who)(lines[2]), voice(who)(lines[3])],
    },
    idle: { lines: [voice(who)('The reeds, the water, the leeches. That is the whole of the trade.')] },
  },
});

export const CUTTER1 = cutter(1, 'reed-cutter-1', [
  'The torch, knight. Burn them out. Fire is quick and the reeds forgive it.',
  'The reeds grow back thinner, Dudda said.',
  'Thinner, but they grow back. A sickle takes weeks, and we have not got weeks. The leeches are in every stalk.',
  'Burn the beds. I will bring the baskets in the spring.',
]);
export const CUTTER2 = cutter(2, 'reed-cutter-2', [
  'The sickle, I say. The torch kills what it touches, and it touches the fish and the frogs and the herons\' nests.',
  'The fire drives the leeches out, though.',
  'And they come out in dozens, with the fen hating you for it. A sickle takes the leeches one bed at a time, and the fen knows who is kind to it.',
  'Cut them. It is slower, but it is the honest way.',
]);

export const HAND_TREES = [HAND1, HAND2];
