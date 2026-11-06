// Wulfhild of the Ashwalkers (L11): M42's brief and report, M43's trials and welcome, the camp's three errands (R24, D08 and
// M45, offered from one list so declining one never hides the others), R24's choice and the reports. Prose is invented (Q6).
import { buildTree, type Line } from '../../act2/build';
import { any, flagIs, not, qDone } from '../../act2/cond';
import type { Condition } from '../../../../quests/types';
import { R24_CHOICE, R24_CHOSEN_EVENT } from '../../../../quests/content/act4/waste/r24.quest';
import { D08_BOSS_FLAG } from '../../../../quests/content/act4/waste/d08.quest';
import { M45_MET } from '../../../../quests/content/act4/waste/m45.quest';
import { C, all, at, objDone, offer, open43, qActive, voice } from './common';

const WU = voice('wulfhild');
const when = (l: Line, c: Condition): Line => ({ ...l, when: c });

/** M43's welcome: every trial and the lore done. */
const WELCOME = open43('welcome');

export const WULFHILD = buildTree({
  id: 'npc-wulfhild',
  start: [
    { when: at('m42', 'report'), seg: 'm42-report' },
    { when: offer('m42'), seg: 'm42-brief' },
    { when: qActive('m42'), seg: 'm42-wait' },
    { when: offer('m43'), seg: 'm43-brief' },
    { when: WELCOME, seg: 'm43-welcome' },
    { when: qActive('m43'), seg: 'm43-wait' },
    { when: at('r24', 'choose'), seg: 'r24-choose' },
    { when: at('m45', 'report'), seg: 'm45-report' },
    { when: at('d08', 'report'), seg: 'd08-report' },
    { when: any(offer('r24'), offer('d08'), offer('m45')), seg: 'jobs' },
    { when: all(qActive('m45'), not(flagIs(M45_MET))), seg: 'm45-wait' },
    { when: any(qActive('r24'), qActive('d08'), qActive('m45')), seg: 'errands-wait' },
    { when: qDone('m46'), seg: 'rimfoot' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    // ---- M42 ---------------------------------------------------------------------------------------------------------------
    'm42-brief': {
      lines: [
        WU('So the Queen\'s knight comes to the edge of the world at last. I am Wulfhild. My people walk the Waste; nobody else does, and lives.'),
        C('Edric sent us. Harrowmark has fallen to the Regent, and the Ember-King\'s fire is under your sand.'),
        WU('Under our sand, under our feet, in our lungs. We know where the fire is, knight. We have been breathing it for three hundred years.'),
        WU('Our camp lies past the dunes. There is one way there that a lowlander can walk: the rope, post to post, shelter to shelter.'),
        WU('A storm is building over the gate now. It will not wait for you to be ready. Nothing out there waits.'),
        WU('When the wall comes, get into a shelter, pull the flap and count. When it passes, walk. Never let go of the rope.'),
        {
          s: 'wulfhild', t: 'Hild will clip you on. Will you walk it?',
          choices: [
            { id: 'accept', t: 'Show me the rope.', go: null, fx: [{ startQuest: 'm42' }] },
            { id: 'later', t: 'Not yet. I need to see to my people first.', go: null },
          ],
        },
      ],
    },
    'm42-wait': { lines: [WU('The rope does not move, knight. Follow it to the camp. I will be there before you.')] },
    'm42-report': {
      lines: [
        WU('You came down the last post on your own feet. Half the lowlanders who try it come down on ours.'),
        C('The striders were waiting at the second post. And something wearing a man\'s shape at the third.'),
        WU('Husks. The fire takes what dies out there and keeps it walking. We burn ours. You will learn why.'),
        WU('Here. A walker\'s mask, gauze and charcoal. It will not keep the storm out of you, but it will keep it out of your eyes.'),
        C('Thank you.'),
        WU('Do not thank me yet. The camp has not decided what you are. Sleep, and in the morning they will tell you how they mean to find out.'),
      ],
    },

    // ---- M43 ---------------------------------------------------------------------------------------------------------------
    'm43-brief': {
      lines: [
        WU('The camp has decided. They will not follow a knight because a queen says so, nor because I do.'),
        WU('There are three trials. Every walker passes them before the tribe gives them a name.'),
        WU('Osgar keeps the Storm Walk: the knotted rope through a storm, and you count the knots by touch. Lose count and you are lost.'),
        WU('Mother Aelfgifu keeps the Pyre Rite. The dead that walk must be laid down, by the fire or by your hand.'),
        WU('And Hrodna will dance the spear with you. She has never lost. Do not take it badly.'),
        C('In what order?'),
        {
          s: 'wulfhild', t: 'Any order you like. They are all waiting. Well?',
          choices: [
            { id: 'accept', t: 'Then I will start with whoever is nearest.', go: null, fx: [{ startQuest: 'm43' }] },
            { id: 'later', t: 'Give me a little while.', go: null },
          ],
        },
      ],
    },
    'm43-wait': {
      lines: [
        when(WU('Osgar is at the rope-post by the north gate. He has been rubbing his hands since dawn.'), all(qActive('m43'), { not: objDone('m43', 'walk') })),
        when(WU('Aelfgifu keeps the pyres on the east side. Bring her the rest of the dead, one way or the other.'), all(qActive('m43'), { not: objDone('m43', 'pyres') })),
        when(WU('Hrodna is at the ring. She is pretending not to wait for you.'), all(qActive('m43'), { not: objDone('m43', 'dance') })),
        when(WU('Read the count-stones by the fire, and look at Hrodna\'s spear-rack. A walker knows who walked before.'), all(qActive('m43'), { not: objDone('m43', 'lore') })),
        WU('Come back when the camp has nothing left to test.'),
      ],
    },
    'm43-welcome': {
      lines: [
        WU('The rope, the pyres and the spear. Osgar says you counted like a walker born. Aelfgifu says nothing, which is high praise.'),
        WU('And Hrodna has a bruise she will not show me. I have not seen that in eleven years.'),
        C('She let me win the last pass.'),
        WU('Hrodna has never let anyone win anything. Hold out your arm.'),
        WU('The walker\'s mark. Charcoal and ash, pricked in by the fire. Wherever you walk on the Waste now, you walk as one of us.'),
        C('What does it mean?'),
        WU('That if you fall out there, someone will come back for you. That is all it has ever meant.'),
      ],
    },

    // ---- the camp's errands ------------------------------------------------------------------------------------------------
    jobs: {
      lines: [
        WU('You are one of us now, so you can be useful. There is always more to do than walkers to do it.'),
        {
          s: 'wulfhild', t: 'What will you take?',
          choices: [
            { id: 'r24', t: 'The water. Tell me about the cisterns.', go: 'r24-brief', when: offer('r24') },
            { id: 'd08', t: 'The cathedral. Who went in?', go: 'd08-brief', when: offer('d08') },
            { id: 'm45', t: 'Ebba\'s tune. You said you heard it somewhere.', go: 'm45-brief', when: offer('m45') },
            { id: 'later', t: 'Nothing yet.', go: null },
          ],
        },
      ],
    },
    'r24-brief': {
      lines: [
        WU('The cisterns are dry. The last storm cracked the cover-stones and the rain went into the sand.'),
        WU('There is a spring in the Glasslands. Brand has a cart of casks waiting there, and no one to guard it home across the dunes.'),
        WU('Striders smell water. So do husks, though what they want with it I cannot tell you.'),
        C('And Harrowmark\'s people at the gate? They are drinking ash.'),
        WU('I know. When you are back at the gate with the cart, you can tell me where the water goes. I will not pretend it is an easy question.'),
        {
          s: 'wulfhild', t: 'Will you go?',
          choices: [
            { id: 'accept', t: 'I will bring the cart home.', go: null, fx: [{ startQuest: 'r24' }] },
            { id: 'later', t: 'Later.', go: null },
          ],
        },
      ],
    },
    'd08-brief': {
      lines: [
        WU('The Cathedral of Husks. The Old Kingdom\'s last church, half under the dunes. We do not go in.'),
        WU('Leofric went in. He wanted to ring the gong and lay the old archbishop down. That was four days ago.'),
        WU('Something in there was a man once, a holy one. Now it wears his crown and keeps the dead standing round it.'),
        C('Then I will find Leofric, and whatever keeps the dead standing.'),
        {
          s: 'wulfhild', t: 'Go carefully. Some things are better laid down than broken. You will know which when you see it.',
          choices: [
            { id: 'accept', t: 'I will go.', go: null, fx: [{ startQuest: 'd08' }] },
            { id: 'later', t: 'Not yet.', go: null },
          ],
        },
      ],
    },
    'm45-brief': {
      lines: [
        WU('Ebba\'s tune. I heard it in the Glasslands, the day the wind was right. The glass pillars there ring when the wind passes.'),
        WU('There is a shrine at their heart and a strike stone. The old walkers knew how to play it. We have forgotten.'),
        WU('Something guards it. Gnats, and a slag-thing that walks. Clear them, read what the old ones left, and see if the glass will sing for you.'),
        {
          s: 'wulfhild', t: 'I will meet you there.',
          choices: [
            { id: 'accept', t: 'Then let us see if it remembers.', go: null, fx: [{ startQuest: 'm45' }] },
            { id: 'later', t: 'Another time.', go: null },
          ],
        },
      ],
    },
    'm45-wait': { lines: [WU('The Glasslands are south and east of the camp. Follow the ringing. I will be at the shrine.')] },
    'errands-wait': {
      lines: [
        when(WU('Brand is at the spring with the casks. Do not keep him there through a storm.'), qActive('r24')),
        when(WU('The cathedral is west, past the burned village. Leofric will be near the door, if he is anywhere.'), qActive('d08')),
        WU('Go on. The camp will still be here.'),
      ],
    },

    // ---- R24's choice ------------------------------------------------------------------------------------------------------
    'r24-choose': {
      lines: [
        WU('The cart is home, and every cask whole. Brand says you stood in the wind like a post.'),
        WU('Now. Thirty casks. The camp\'s cisterns take thirty. The refugees at the gate have nothing at all.'),
        C('Your people carried that water across the Waste for three hundred years. Theirs walked here last week.'),
        {
          s: 'wulfhild', t: 'Where does it go?',
          choices: [
            {
              id: 'all', t: 'All of it to the camp. It is your spring and your road.', go: 'r24-all',
              fx: [{ setFlag: R24_CHOICE, value: 'all' }, { favour: 'ashwalkers', delta: 10 }, { event: R24_CHOSEN_EVENT }],
            },
            {
              id: 'half', t: 'Half to the gate. Harrowmark\'s children are dying of thirst.', go: 'r24-half',
              fx: [{ setFlag: R24_CHOICE, value: 'half' }, { favour: 'ashwalkers', delta: -4 }, { favour: 'halvard', delta: 3 }, { event: R24_CHOSEN_EVENT }],
            },
          ],
        },
      ],
    },
    'r24-all': { lines: [WU('Then the cisterns fill tonight, and the camp will drink to you. Unload them at the gate; Brand will show you.')] },
    'r24-half': {
      lines: [
        WU('Some of my people will not forgive that. I am not sure I do.'),
        WU('But I have seen those children. Unload half here and the rest at the refuge. Brand will take it on.'),
      ],
    },

    // ---- reports -----------------------------------------------------------------------------------------------------------
    'm45-report': {
      lines: [
        WU('You heard it too. Do not pretend you did not; your face is white under the ash.'),
        C('It called itself a king. It said I carry a piece of its heart.'),
        WU('The walkers have a rule about voices in the glass. We do not answer them. My grandmother said it was the old king, still holding up the fire.'),
        WU('Take this. The Chime Key. The old walkers made it so the glass would know them. It knows you now.'),
        WU('Whatever is under the Waste, it has started to listen. We should hurry.'),
      ],
    },
    'd08-report': {
      lines: [
        WU('You came out. That is more than Leofric did.'),
        when(WU('Eormen is ash. And the crown? Show me.'), flagIs(D08_BOSS_FLAG, 'defeated')),
        when(C('A shard of it, from the niche in the crypt. The rest is in the walls.'), flagIs(D08_BOSS_FLAG, 'defeated')),
        when(WU('Keep it. Something that old does not want to be in a walker\'s hands.'), flagIs(D08_BOSS_FLAG, 'defeated')),
        when(WU('You let him rest? Then he has gone where Leofric wanted to send him. The gong will be quiet tonight.'), flagIs(D08_BOSS_FLAG, 'released')),
        when(C('His crown stays in the crypt. It belongs to him.'), flagIs(D08_BOSS_FLAG, 'released')),
        WU('Either way the cathedral is empty, and the road to the rim is one step shorter.'),
      ],
    },

    rimfoot: { lines: [WU('The rim is above us, and the fire beneath it. Sit, knight. Tomorrow is soon enough.')] },
    idle: { lines: [WU('Mind the rope, knight. It minds you.')] },
  },
});

