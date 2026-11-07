// The Walker Camp's cast (L11): Hild Ropewright (M42's clip), the three trial-masters of M43 (Osgar, Mother Aelfgifu, Hrodna),
// two walkers about the camp and Brand the carter (R24). Each tree is `npc-<id>`; quest segments first, an idle line last.
import { buildTree, type BuiltTree, type Line } from '../../act2/build';
import { any, flagIs, not, qActive } from '../../act2/cond';
import { HILD } from '../../../../quests/content/act4/waste/m42.quest';
import { M43_DANCE_ASKED, M43_DONE, M43_MASTER } from '../../../../quests/content/act4/waste/m43.quest';
import { R24_CARTER } from '../../../../quests/content/act4/waste/r24.quest';
import { C, all, at, objDone, open43, voice } from './common';

type Rule = Parameters<typeof buildTree>[0]['start'][number];
const tree = (id: string, start: Rule[], segments: Record<string, { lines: Line[]; then?: string | null }>, idle: Line[]): BuiltTree =>
  buildTree({ id: `npc-${id}`, start: [...start, { when: all(), seg: 'idle' }], segments: { ...segments, idle: { lines: idle } } });

// ---- Hild Ropewright ------------------------------------------------------------------------------------------------------
const HI = voice(HILD);
export const HILD_TREE = tree(HILD, [{ when: at('m42', 'clip'), seg: 'm42-clip' }], {
  'm42-clip': {
    lines: [
      HI('Arms up. The harness goes round the chest, not the waist; the waist is where the wind takes you in half.'),
      HI('This is the clip. It runs along the rope. It does not come off the rope. If you take it off the rope, you are dead and I have lost a clip.'),
      C('What if the rope breaks?'),
      HI('Then you sit down where you are and wait for me. I have been mending that rope since I was nine. It has broken twice.'),
      HI('Count the posts. At every fourth there is a shelter. When the wall comes, the shelter, the flap, and you count to twenty.'),
      HI('There. You are on. Go through the arch and do not look back at the gate. It does not help.'),
    ],
  },
}, [HI('Rope does not care who you are. That is the best thing about it.')]);

// ---- the trial-masters ----------------------------------------------------------------------------------------------------
const OS = voice(M43_MASTER.walk);
export const OSGAR = tree(M43_MASTER.walk, [
  { when: at('m42', 'unclip'), seg: 'm42-unclip' },
  { when: open43('walkTalk'), seg: 'm43-walk' },
  { when: open43('walk'), seg: 'm43-walk-again' },
], {
  'm42-unclip': {
    lines: [
      OS('Stand still. You are still on the rope, and in the camp that makes you a dog on a lead.'),
      OS('Hild\'s clip. She tightens the gate too far; it bites. There. You are off.'),
      C('Four walls. I counted every one.'),
      OS('Everyone counts the walls the first time. The second time you count the posts. The tenth time you count nothing and sleep in the shelter.'),
      OS('Wulfhild is at the long fire. Go and tell her you are not dead; she will pretend it surprises her.'),
    ],
  },
  'm43-walk': {
    lines: [
      OS('So. You are the knight who came down the crossing rope. That rope has a knot every ten paces; a child could follow it.'),
      OS('My rope has five knots in four hundred paces, and the storm is called down on it. You will not see your hand.'),
      OS('Twice the rope passes a lee cairn. When the wall comes, sit in the lee and count it out. Then on.'),
      OS('At the end there is a post. Put your hand on it and tell me how many knots you passed. Not more. Not fewer.'),
      C('And if I let go?'),
      OS('Then the wind turns you round and you walk back to the last knot you held, and you start from there. Everyone does it once.'),
      OS('Step onto the start stone when you are ready. The storm will know.'),
    ],
  },
  'm43-walk-again': { lines: [OS('The start stone is there by the post. Step on it and the walk begins. Count with your hand, not your eyes.')] },
}, [OS('Five knots. Always five. The day there are six, run.')]);

const AE = voice(M43_MASTER.pyres);
export const AELFGIFU = tree(M43_MASTER.pyres, [
  { when: open43('pyresTalk'), seg: 'm43-pyres' },
  { when: open43('pyres'), seg: 'm43-pyres-again' },
], {
  'm43-pyres': {
    lines: [
      AE('Three pyres. Three of our dead who did not stay dead. They walk round the fire every night, and every night we lay them down again.'),
      AE('Kill one and it gets up. The fire has it, not you. You must let it go, by your own will, close to its pyre.'),
      C('Release them.'),
      AE('That is your word for it. Ours is simpler. Or, if you cannot, take a torch from the camp fire and burn the Blightblooms they grow from.'),
      AE('Three laid down, any way you choose. The fire does not mind which. I do, a little.'),
    ],
  },
  'm43-pyres-again': { lines: [AE('Close to the pyre, child. A dead walker forgets the way home if you let him go in the sand.')] },
}, [AE('Every walker burns in the end. The trick is to choose the fire.')]);

const HR = voice(M43_MASTER.dance);
const ASK = { event: M43_DANCE_ASKED } as const;
export const HRODNA = tree(M43_MASTER.dance, [
  { when: open43('danceTalk'), seg: 'm43-dance' },
  { when: all(qActive('m43'), objDone('m43', 'danceTalk'), not(flagIs(M43_DONE.dance))), seg: 'm43-dance-again' },
], {
  'm43-dance': {
    lines: [
      HR('Wulfhild says you are to dance with me. She says it like a joke. It is not.'),
      HR('Spears down, blades sheathed. We fight in the ring until one of us is out of it, or down. Three passes.'),
      C('And if I lose?'),
      HR('Then you get up and we dance again. A walker who loses once has learned something. A walker who never loses has not been paying attention.'),
      {
        s: M43_MASTER.dance, t: 'Into the ring?',
        choices: [
          { id: 'now', t: 'Now.', go: null, fx: [ASK] },
          { id: 'later', t: 'When I am ready.', go: null },
        ],
      },
    ],
  },
  'm43-dance-again': {
    lines: [
      {
        s: M43_MASTER.dance, t: 'Back for more? The ring is swept.',
        choices: [
          { id: 'now', t: 'Again.', go: null, fx: [ASK] },
          { id: 'later', t: 'Not yet.', go: null },
        ],
      },
    ],
  },
}, [HR('You still favour the left foot. Fix it before I tell Wulfhild.')]);

// ---- two walkers ----------------------------------------------------------------------------------------------------------
const TO = voice('walker-3');
export const TOLA = tree('walker-3', [], {}, [
  TO('The lowlander knight. My mother says your kind drank the rivers dry. I said, all of them? She said, all of them.'),
]);
const CE = voice('walker-4');
export const CEOLRIC = tree('walker-4', [], {}, [
  CE('If you hear singing on the dunes, it is the glass, not a woman. My cousin learned that the hard way.'),
]);

// ---- Brand the carter -----------------------------------------------------------------------------------------------------
const BR = voice(R24_CARTER);
export const BRAND = tree(R24_CARTER, [
  { when: at('r24', 'carter'), seg: 'r24-carter' },
  { when: any(at('r24', 'spring'), at('r24', 'load')), seg: 'r24-spring' },
], {
  'r24-carter': {
    lines: [
      BR('There you are. I was beginning to think Wulfhild had sent me a ghost. The casks are full; the ox is not happy.'),
      BR('We go slow. One and a half paces a breath, or the casks split. You walk ahead and keep things off us.'),
      BR('When a storm comes, we wait it out in a shelter with the brake on. If the brake is off, the cart rolls, and then we are looking for it in the dark.'),
      C('Then I set the brake.'),
      BR('You set the brake. Read the count on the spring post first; it tells the camp how much we took. Then load up.'),
    ],
  },
  'r24-spring': { lines: [BR('Count on the post, casks on the cart. Then we walk.')] },
}, [BR('Water is heavy, knight. Heavier than gold, and worth more out here.')]);

export const CAMP_TREES: readonly BuiltTree[] = [HILD_TREE, OSGAR, AELFGIFU, HRODNA, TOLA, CEOLRIC, BRAND];
