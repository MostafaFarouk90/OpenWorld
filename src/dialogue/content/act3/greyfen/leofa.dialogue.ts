import { buildTree } from '../../act2/build';
import { all, flagIs, not, qActive, qDone } from '../../act2/cond';
import { C, at, offer, voice } from './common';

const L = voice('leofa');

/**
 * Leofa Hartley, ranger captain: M23 (Reedgate, then the Mere post), R14 (Greywatch), the shore talk of M26 and M27 at the Mere.
 * She gives the Pathfinder master book in the M23 brief to whoever has not got it (K10's idempotent effect; the node is skipped
 * once the flag is set). Segment sizes are the plan's node counts: M23 12 + 4, R14 8 + 4, M26 4, M27 8 + 7 (the buyer's seal).
 */
export const LEOFA = buildTree({
  id: 'npc-leofa',
  start: [
    { when: at('m23', 'report'), seg: 'm23-report' },
    { when: at('m26', 'shore'), seg: 'm26-shore' },
    { when: at('m27', 'report'), seg: 'm27-report' },
    { when: at('r14', 'report'), seg: 'r14-report' },
    { when: offer('m27'), seg: 'm27-brief' },
    { when: offer('r14'), seg: 'r14-brief' },
    { when: offer('m23'), seg: 'm23-brief' },
    { when: qActive('m27'), seg: 'm27-wait' },
    { when: qActive('r14'), seg: 'r14-wait' },
    { when: qActive('m23'), seg: 'm23-wait' },
    { when: qActive('m26'), seg: 'm26-wait' },
    { when: qDone('m27'), seg: 'after-m27' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'm23-brief': {
      lines: [
        L('{name}. The Council wrote ahead of you. They said you would come to the Greyfen, and they did not say why they sent you, which is how I know it is bad.'),
        C('I was told the fen is where the dragons went to ground.'),
        L('The fen is where everything goes to ground. Leeches the length of your arm, reeds that close behind you, and water that keeps its own counsel. I have lost eleven rangers to it in a year, and I have not lost one to a blade.'),
        L('There is a causeway from here to the Mere, a day\'s ride if the planks hold. The planks do not always hold. There are two bridges that sit up on their chains until somebody lowers them.'),
        C('Somebody being me.'),
        L('Somebody being whoever is fool enough. The levers are at the near ends. Wind them down and cross, and wind them up again if you are being followed.'),
        L('Past the bridges is the Mere itself, and in the Mere is something old. The reed-folk will not say its name. They sing to it, instead, and they have stopped singing.'),
        L('Talk to the folk at the gate before you go. Three of them, they know the fen\'s moods better than my maps do. And find my ranger on the causeway; he has the way-markers.'),
        C('And leeches?'),
        L('Three knots of them along the causeway. Burn them out. Fire is the one thing a leech respects.'),
        L('One more thing, and I mean it kindly. The fen sets its teeth when you go in. The beasts in there are not the beasts of the road; they were born harder. Look at the chip on your map before you step off the planks, and go back if it is red.'),
        L('Ride to the Mere. I will be waiting at the post by the shore. Mind the water.', [{ startQuest: 'm23' }]),
        // a Pathfinder's master book, once, whoever asks (skipped when it is already given)
        { s: 'leofa', t: 'And take this before you go. A ranger\'s master book, the high forms of the bow that nobody teaches in a yard. It was meant for my best scout. She will not be needing it.', fx: [{ grantMasterBook: 'pathfinder' }], when: not(flagIs('trainer.pathfinder.masterBook')) },
      ],
    },
    'm23-wait': { lines: [L('The causeway, the two bridges, then the Mere. Burn the leech knots as you go. I will be at the post by the shore.')] },
    'm23-report': {
      lines: [
        L('You came through. I watched the last bridge go down; I wondered whether I would see it go up again.'),
        C('The Mere is wrong, Leofa. The water was still, and then it was not.'),
        L('That is the first thing everyone says. The second is that they heard singing.'),
        L('Rest, and then we speak of the ferry. Dudda is losing his trade, and the fen is losing its keeper. Those two are the same story.'),
      ],
    },
    'm26-shore': {
      lines: [
        L('She woke. I felt it in my teeth, {name}. Whatever lives under the Mere has opened its eyes.'),
        C('Gytha says the hunters netted her in her sleep.'),
        L('Gytha is right. The nets are weighted with lead and strung with iron; they are meant to drag a dragon to the shallows and hold her there. Spearmen on the shore, a harpooner behind them.'),
        L('Clear the hunters, then cut the nets. I will hold the post. I cannot cut a net and keep the leeches off Gytha both.'),
      ],
    },
    'm26-wait': { lines: [L('The hunters first, the nets after. I am holding the post.')] },
    'r14-brief': {
      lines: [
        L('I sent a patrol along the four posts a month ago. Three rangers and a deserter-in-waiting. Four posts, one night each. None of them has come back.'),
        C('You sent me after them.'),
        L('I sent myself after them, twice. The fen turned me round both times. I do not say that lightly.'),
        L('Each post has a sign on it, two a post. The patrol left them, the way we do: a notch, a knot, a tally. They say more than the men did, and less than I want.'),
        L('Find the rangers if they are alive. Find Wybert Fenn if he is not. He is a deserter, or he is dead, and either way he is the one who knows why they stopped.'),
        C('And the hunters?'),
        L('Not mine. The buyers\' men, in the reeds. They have a camp at the last post. I would be glad of every one of them put in the water.'),
        L('Greywatch to post one, post two, post three, post four. Take your time and read the signs. I will be here.', [{ startQuest: 'r14' }]),
      ],
    },
    'r14-wait': { lines: [L('Post one to post four. Read the signs, find the men. I am here.')] },
    'r14-report': {
      lines: [
        L('You have been a long time on the road.'),
        C('The patrol is accounted for. Wybert is dealt with.'),
        L('Then it is done. I cannot give you thanks the way a lord does, {name}. I can give you the post, and a bow I have not the heart to keep.'),
        L('Take it. Halvard would want it used.'),
      ],
    },
    'm27-brief': {
      lines: [
        L('The hunters are back, {name}. Not the small camp at post four; the big one. They have taken the wyrmling brood from the reeds, cages and all.'),
        C('The buyers.'),
        L('The buyers. The same black anvil on every crate. I want it stopped, and I want it stopped quietly enough that the buyers do not know how.'),
        L('There are reed blinds east of the Mere, thick as a wall. A pack of hunters guards them. If you creep, they will not see you. If they see you, you will fight them in the open.'),
        L('Two packs, each with a harpooner: one waits under the blinds, one guards the cages beyond. Break the cages, free the young, and let them go home.'),
        L('A man keeps the brood. Ask him what he knows; I could not stomach the conversation.'),
        L('Read what you find. The nets, the seal, the map. Every scrap says who pays, and I want the name.'),
        L('Be careful. These are not the hunters of the road. They have nothing to lose.', [{ startQuest: 'm27' }]),
      ],
    },
    'm27-wait': { lines: [L('Creep if you can, fight if you must. The brood is beyond the blinds.')] },
    'm27-report': {
      lines: [
        L('I watched the young go. Thirty of them, a stream of green and gold along the reeds.'),
        C('They were afraid. I think it will pass.'),
        L('It will. They are wyrmlings; they forget the first week of cages by the third.'),
        L('The seal worries me, {name}. A black anvil, and under it a number: forty crates a season. Forty. Somebody has been paying for dragons by the crate.'),
        C('Whoever it is has a fort and a Council letter behind them.'),
        L('Then they have more to lose than we have. Good. A man who has something to lose can be made to talk.'),
        L('Go and rest. Deeper in the fen, the Mirewater Deeps wait for you. Gytha will tell you what is in them.'),
      ],
    },
    'after-m27': { lines: [L('Gytha waits at the Deeps door. I will hold the post.')] },
    idle: { lines: [L('The fen keeps its own counsel, {name}. I keep the posts. Come back when you need me.')] },
  },
});
