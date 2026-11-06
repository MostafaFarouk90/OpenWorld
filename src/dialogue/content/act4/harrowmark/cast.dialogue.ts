// The new Harrowmark cast's trees (L2's delegates, captains, watchmen and Vey's guards; my sergeants, cellar-keeper, clerk,
// captive smith and R22's locals). Each tree is `npc-<id>`; quest segments first, an idle line last.
import { buildTree, type BuiltTree, type Line } from '../../act2/build';
import type { Effect } from '../../../../quests/types';
import { all, flagIs } from '../../act2/cond';
import { CHECKPOINTS } from '../../../../harrowmark/act4/sites';
import { guardId } from '../../../../harrowmark/act4/act4.layout';
import { M35_GUARD, M35_HOUSES, type M35House } from '../../../../quests/content/act4/harrowmark/m35.quest';
import { M36_DELEGATE } from '../../../../quests/content/act4/harrowmark/m36.quest';
import { R19_CAN, R19_MUSTER, type R19Company } from '../../../../quests/content/act4/harrowmark/r19.quest';
import { R20_BRIBE, R20_BRIBE_BANKED, R20_CHOICE, R20_PASSED, R20_AT } from '../../../../quests/content/act4/harrowmark/r20.quest';
import { R22_SITES } from '../../../../quests/content/act4/harrowmark/r22.quest';
import { R23_CHOICE, R23_CRUCIBLE, R23_EXPOSED } from '../../../../quests/content/act4/harrowmark/r23.quest';
import { C, at, voice } from './common';

/** The event Bran's challenge sends; the director starts the bout on it. */
export const R19_BOUT_EVENT = 'story.r19.boutAsked';

const tree = (id: string, start: { when: Parameters<typeof buildTree>[0]['start'][number]['when']; seg: string }[], segments: Record<string, { lines: Line[]; then?: string | null }>, idle: Line[]): BuiltTree =>
  buildTree({ id: `npc-${id}`, start: [...start, { when: all(), seg: 'idle' }], segments: { ...segments, idle: { lines: idle } } });

// ---- M35 and M36: the delegates --------------------------------------------------------------------------------------------
const AC = voice('aldric-cole');
const WP = voice('wilmot-penn');
const halvardWon: Effect[] = [{ setFlag: M36_DELEGATE('halvard'), value: 'won' }, { favour: 'halvard', delta: 5 }];
const oswinWon: Effect[] = [{ setFlag: M36_DELEGATE('oswin'), value: 'won' }, { favour: 'oswin', delta: 5 }];

export const ALDRIC = tree('aldric-cole', [
  { when: at('m35', 'halvard'), seg: 'm35-halvard' },
  { when: at('m36', 'halvard'), seg: 'm36-halvard' },
], {
  'm35-halvard': {
    lines: [
      AC('The Halvard delegation, such as it is: Lord Halvard\'s brother Ulf, two of his sworn men, and me to see them in.'),
      AC('I do not sit on the Council. I only stand behind those who do.'),
      C('The Keep Road checkpoint first. Then the court.'),
    ],
  },
  'm36-halvard': {
    lines: [
      AC('You have been reading my debts. I can see it on your face.'),
      AC('Forty crowns to a dead sergeant for a horse I lost in a war we won. The Regent\'s broker bought it, and now it is a hundred and twenty.'),
      AC('He says he will forget it, if I forget how to vote.'),
      {
        s: 'aldric-cole', t: 'Well?',
        choices: [
          { id: 'pay', t: 'Then I pay it. Here: a hundred and twenty. You owe the Regent nothing.', when: { gold: { atLeast: 120 } }, go: 'm36-paid', fx: [{ spendGold: { amount: 120, reason: 'persuasion' } }, ...halvardWon] },
          { id: 'ledger', t: 'The debt was to Wulf Garrow, and Garrow is dead. A dead man\'s debt cannot be sold. I have the ledger.', go: 'm36-cleared', fx: halvardWon },
          { id: 'honour', t: 'A knight who sells his vote for a horse has no honour left to lose.', go: 'm36-lost', fx: [{ setFlag: M36_DELEGATE('halvard'), value: 'lost' }, { favour: 'halvard', delta: -2 }] },
        ],
      },
    ],
  },
  'm36-paid': { lines: [AC('You would pay a stranger\'s debt? Then I am not a stranger to you any more. The King has my voice.')] },
  'm36-cleared': { lines: [AC('Garrow was my friend. I forgot the law in my shame.'), AC('Let the broker come to me with a dead man\'s paper. The King has my voice.')] },
  'm36-lost': { lines: [AC('Honour. Easy to say when you have never had to choose between it and your children\'s bread.'), AC('Get out of my sight.')] },
}, [AC('The Bastion still stands. So do I, most days.')]);

export const WILMOT = tree('wilmot-penn', [{ when: at('m36', 'oswin'), seg: 'm36-oswin' }], {
  'm36-oswin': {
    lines: [
      WP('Ah. Merrin sent you. She thinks I am a traitor; I think I am a clerk who can read.'),
      WP('Page nine of the Oswin charter: in a regency, the Oswin seat may not vote. I did not write it. I only found it.'),
      C('You found it on your own copy. The Archive\'s copy is older, and it says "may".'),
      WP('That is not... let me see. That is not possible.'),
      {
        s: 'wilmot-penn', t: 'Who would change one word in a charter?',
        choices: [
          { id: 'page', t: 'Someone who wanted Oswin silent. Compare the hands. Yours is a copy, and a forged one.', go: 'm36-oswin-won', fx: oswinWon },
          { id: 'word', t: 'Perhaps you are right. Keep your page.', go: 'm36-oswin-lost', fx: [{ setFlag: M36_DELEGATE('oswin'), value: 'lost' }, { favour: 'oswin', delta: -2 }] },
        ],
      },
    ],
  },
  'm36-oswin-won': { lines: [WP('Then I have been someone\'s fool. Merrin will enjoy that. The Oswin seat votes, and it votes with the King.')] },
  'm36-oswin-lost': { lines: [WP('I will. The law is the law, even when it is inconvenient. The Oswin seat stays silent.')] },
}, [WP('The Archive never sleeps, and neither, it seems, do I.')]);

// ---- M35: Vey's checkpoint guards -------------------------------------------------------------------------------------------
const PASS: Readonly<Record<M35House, [string, string]>> = {
  oswin: ['A writ under the King\'s own seal. For one elder and two guards.', 'Go on, then. Mind the old man on the steps.'],
  halvard: ['Halvard men at the Keep Road, with a writ. The Regent will hear of this.', 'He will hear the King signed it. Pass.'],
  grisel: ['The Council writ. For the Grisel party. We had no word of any Grisel party.', 'You have it now. Pass, and be quick about the lane.'],
};
const guardTree = (id: string): BuiltTree => {
  const G = voice(id);
  const h = M35_HOUSES.find((x) => M35_GUARD(x) === id);
  const rows = h ? [{ when: at('m35', `${h}Pass`), seg: 'm35-pass' }] : [];
  const segs: Record<string, { lines: Line[] }> = h ? { 'm35-pass': { lines: [G(PASS[h][0]), G(PASS[h][1])] } } : {};
  return tree(id, rows, segs, [G('The Regent keeps this street. Move along.')]);
};
export const VEY_GUARDS: readonly BuiltTree[] = CHECKPOINTS.flatMap((c) => [1, 2].map((k) => guardTree(guardId(c, k))));

// ---- R19: the four captains -------------------------------------------------------------------------------------------------
const muster = (id: R19Company, yes: string, no: string): Line => ({
  s: `captain-${id === 'archers' ? 'hesketh' : id === 'pikes' ? 'morwen' : id === 'horse' ? 'bran' : 'tolly'}`,
  t: 'So: do we march, or do we hold?',
  choices: [
    { id: 'muster', t: yes, when: R19_CAN[id].muster, go: null, fx: [{ setFlag: R19_MUSTER(id), value: true }] },
    { id: 'hold', t: no, when: R19_CAN[id].hold, go: null, fx: [{ setFlag: `story.r19.hold.${id}`, value: true }] },
  ],
});
const HE = voice('captain-hesketh');
const MO = voice('captain-morwen');
const BR = voice('captain-bran');
const TO = voice('captain-tolly');

export const CAPTAINS: readonly BuiltTree[] = [
  tree('captain-hesketh', [{ when: at('r19', 'archers'), seg: 'r19' }], {
    r19: { lines: [
      HE('Sixty bows on this wall, and every one of them could put a shaft through a helm at two hundred paces.'),
      HE('Twenty went over to the Regent. The rest stayed because they are stubborn, not because they are paid.'),
      C('If you march, the wall is bare.'),
      muster('archers', 'March. The Council needs bows behind it.', 'Hold the wall. The city needs you more.'),
    ] },
  }, [HE('The wall walk is mine. Mind the gap by the third tower.')]),
  tree('captain-morwen', [{ when: at('r19', 'pikes'), seg: 'r19' }], {
    r19: { lines: [
      MO('Pikes do not hurry, knight. They stand, and things break on them.'),
      MO('Give me a street and I will close it. Give me a field and I will close that too.'),
      C('Some of your own men are deserting. I saw them by the gate.'),
      muster('pikes', 'March. Close the field for the Council.', 'Hold. Close the streets behind us.'),
    ] },
  }, [MO('Stand straight. The yard is watching.')]),
  tree('captain-bran', [{ when: at('r19', 'bout'), seg: 'r19-bout' }, { when: at('r19', 'horse'), seg: 'r19' }], {
    'r19-bout': { lines: [
      BR('You want my riders. Everyone wants my riders.'),
      BR('I do not talk muster with a man I have not crossed swords with. One bout, in the ring by the stables.'),
      { s: 'captain-bran', t: 'Well?', choices: [
        { id: 'fight', t: 'One bout. Ready when you are.', go: null, fx: [{ event: R19_BOUT_EVENT }] },
        { id: 'later', t: 'Later.', go: null },
      ] },
    ] },
    r19: { lines: [
      BR('Not bad. You keep your guard low, like a farmer, but you do not back up.'),
      BR('Forty horse. Fast enough to be somewhere before Vey knows we left.'),
      C('Or fast enough to be back here when the gates are rushed.'),
      muster('horse', 'Ride with the Council.', 'Hold the stables and the gates.'),
    ] },
  }, [BR('The horses have more sense than the men. They at least know when to run.')]),
  tree('captain-tolly', [{ when: at('r19', 'engineers'), seg: 'r19' }], {
    r19: { lines: [
      TO('Ropes, ladders, rams and fire. Engineers win the sieges nobody remembers.'),
      TO('I wrote to my wife last night. I did not send it. I suppose you read it.'),
      C('I did. You said you would go either way.'),
      muster('engineers', 'Go. Bring the ropes and the ladders.', 'Stay. The city may need its walls mended.'),
    ] },
  }, [TO('If it is broken, I can mend it. If it is standing, I can bring it down.')]),
];

// ---- R20: the post sergeants ------------------------------------------------------------------------------------------------
const SERGEANT_LINES: readonly [string, string, string][] = [
  ['River Gate post. Every cart is searched by order of the Regent.', 'Oswin crates. Heavy, too. You know I am meant to hold these.', 'Then I am meant to be looking at the river for a while.'],
  ['The farm-ring is closed to carts without a Regent\'s pass. Turn round.', 'Silver? Of course it is silver. Everyone\'s got silver going out this week.', 'Go on. I never saw a cart.'],
  ['Last post before the farms. I have got a quota and you are not on it.', 'I could send to the Keep for orders. Or I could get a drink.', 'Mind the ruts past the mill. They will take a wheel off.'],
];
const banked = { favour: 'oswin' as const, band: ['banked', 'stoked', 'hearthbound'] as ('banked' | 'stoked' | 'hearthbound')[] };
const sergeantTree = (n: 1 | 2 | 3): BuiltTree => {
  const id = `r20-sergeant-${n}`;
  const S = voice(id);
  const [hail, bargain, pass] = SERGEANT_LINES[n - 1]!;
  const paid = (amount: number): Effect[] => [{ spendGold: { amount, reason: 'bribe' } }, { setFlag: R20_PASSED(n), value: true }];
  return tree(id, [
    // the bargain is struck with the cart parked short of the post, never before it has come up
    { when: all(at('r20', `cp${n}`), flagIs(R20_CHOICE, 'bribe'), flagIs(R20_AT(n))), seg: 'bribe' },
    { when: at('r20', `cp${n}`), seg: 'post' },
  ], {
    bribe: { lines: [
      S(hail),
      C('An Oswin convoy, sergeant. The House would be grateful for a quick look.'),
      S(bargain),
      { s: id, t: 'How grateful?', choices: [
        { id: 'banked', t: `${R20_BRIBE_BANKED} gold, and the House remembers your name kindly.`, when: all(banked, { gold: { atLeast: R20_BRIBE_BANKED } }), go: 'paid', fx: paid(R20_BRIBE_BANKED) },
        { id: 'pay', t: `${R20_BRIBE} gold for your trouble.`, when: { gold: { atLeast: R20_BRIBE } }, go: 'paid', fx: paid(R20_BRIBE) },
        { id: 'later', t: 'Wait here. I will be back with it.', go: null },
      ] },
    ] },
    paid: { lines: [S(pass)] },
    post: { lines: [S(hail)] },
  }, [S('Move along. Nothing to see but a sergeant on a stool.')]);
};
export const SERGEANTS: readonly BuiltTree[] = [sergeantTree(1), sergeantTree(2), sergeantTree(3)];

// ---- R21: the cellar-keeper ---------------------------------------------------------------------------------------------------
const HE2 = voice('cellar-keeper');
export const CELLAR_KEEPER = tree('cellar-keeper', [{ when: at('r21', 'keeper'), seg: 'r21' }], {
  r21: { lines: [
    HE2('Who sent you? Nobody knocks on this door who has not been sent.'),
    C('Wenna Grisel.'),
    HE2('Then come in, and keep your voice down. There are children asleep behind those barrels.'),
    HE2('The back lanes are watched. Three of them in masks, round and round like a mill-horse. They change at the bell.'),
    HE2('The patrol is worse: Grisel men, and they know every cellar in the quarter. Break them, and the lanes are yours.'),
  ] },
}, [HE2('Shut the door behind you. Draughts and Regents both come in through open doors.')]);

// ---- R23: the five watchmen and the clerk ------------------------------------------------------------------------------------
const WITNESS: readonly { id: string; lines: [string, string, string] }[] = [
  { id: 'witness-barracks', lines: [
    'Cuthred Hale, thirty years on the watch, struck off in one night. I was told to go home. I did not go far.',
    'The order came with the Regent\'s seal, and the Captain read it with his hand shaking. Then he told us where the carts were going: the Crucible, under the old Smelter.',
    'I kept the order. It is in my box by the bunk-house door, if you can stand the smell of my boots.',
  ] },
  { id: 'witness-gatehouse', lines: [
    'Osgood Fenn. I kept the South Gate tally for nineteen years. Then I was told to stop counting the carts with black wax.',
    'Twenty-three in a month, all at night. I counted them anyway, in my head, and wrote them down after.',
    'The order is pinned under my tally. Take both.',
  ] },
  { id: 'witness-stables', lines: [
    'Leofwine. I keep the watch horses, or I did. Now I keep six for the Regent\'s riders, saddled day and night.',
    'Nobody rides them. They are waiting for something. I think they are waiting to carry somebody out of the Keep in a hurry.',
    'The page is folded in the tack room. It has a drawing on the back I did not do.',
  ] },
  { id: 'witness-chapel', lines: [
    'Wulfstan Reed. Almoner\'s clerk. I gave bread to the watch widows, until the order said no.',
    'I gave it anyway. I wrote down every loaf, so when they hang me for it there will be a proper account.',
    'The order is in the alms box. The almoner never opens it.',
  ] },
  { id: 'witness-anvil', lines: [
    'Aldred Tapper. I drink here because they let me. I was the one who nailed that order up in the yard, and the one who took it down.',
    'Nobody had heard the word Crucible before that order. After it, nobody would say it.',
    'It is behind the yard barrel. Wrapped in oilcloth. I am not a fool.',
  ] },
];
export const WITNESSES: readonly BuiltTree[] = WITNESS.map((w, i) => {
  const V = voice(w.id);
  const first: Effect[] = i === 0 ? [{ setFlag: R23_CRUCIBLE, value: true }] : [];
  return tree(w.id, [{ when: at('r23', `w${i + 1}`), seg: 'r23' }], {
    r23: { lines: [V(w.lines[0]), { s: w.id, t: w.lines[1], ...(first.length ? { fx: first } : {}) }, C('I will find it. Thank you.'), V(w.lines[2])] },
  }, [V('The watch remembers, knight. Even when it is told not to.')]);
});

const HQ = voice('hamon-quill');
export const HAMON = tree('hamon-quill', [{ when: all(at('r23', 'expose'), flagIs(R23_CHOICE, 'private')), seg: 'r23' }], {
  r23: { lines: [
    HQ('Rook said you would come. Five orders under the Regent\'s seal, all in one clerk\'s hand. Let me see.'),
    HQ('The hand is Felbrigg\'s. He keeps the Regent\'s letters. I sat beside him for eleven years.'),
    C('Will the Houses read them?'),
    HQ('Under the Council seal, before the vote. Every delegate. That is the law, and I am the law\'s clerk.', [{ setFlag: R23_EXPOSED, value: true }]),
  ] },
}, [HQ('The Council sits when it sits. Until then I keep the ink wet.')]);

// ---- D07: the captive smith ---------------------------------------------------------------------------------------------------
const EA = voice('crucible-captive');
export const CAPTIVE = tree('crucible-captive', [{ when: at('d07', 'captive'), seg: 'd07' }], {
  d07: { lines: [
    EA('You are not one of them. You have a face.'),
    EA('Eadric Smallbone, smith, of the Row. They took me for my hands. I fit the hearts into the cradles.'),
    C('What are the hearts for?'),
    EA('The furnaces, and what is behind the gate at the bottom. They call it the engine. It breathes.'),
    EA('The vats at the end feed it. There are three wheels. Turn them wrong and the vat boils over. I saw it happen.'),
    EA('The order is in the furnace log. Read it before you touch anything. I will find my own way out.'),
  ] },
}, [EA('Go on. I am counting the steps to the stair.')]);

// ---- R22: the three locals --------------------------------------------------------------------------------------------------
const LOCAL: Readonly<Record<string, [string, string, string]>> = {
  'star-iron': [
    'Star-iron? There is a fist of it in the crag, where the old fall came down. My grandfather said it glowed for a year.',
    'Hunters camp by it now. They are not friendly to people who want to dig.',
    'Clear them off and it is yours. I only cut stone.',
  ],
  'bog-oak': [
    'Bog-oak lies in the peat cut past the hut, black and old as the fen. You need an axe and a strong back.',
    'The cut is guarded. Some hunters think they own the fen because they walked across it first.',
    'Take a billet from the deep end. The shallow end is only old oak.',
  ],
  'rime-iron': [
    'Rime-iron is in the cairn up the slope, under the third stone. The old smiths left it there for whoever earned it.',
    'Two hunters sit by the cairn. They say they guard it. They mean they sell it.',
    'The ore bites, so mind your fingers.',
  ],
};
export const LOCALS: readonly BuiltTree[] = R22_SITES.map((s) => {
  const L = voice(s.local);
  const [a, b, c] = LOCAL[s.id]!;
  return tree(s.local, [{ when: at('r22', `${s.id}Talk`), seg: 'r22' }], { r22: { lines: [L(a), L(b), L(c)] } }, [L('Mind how you go. The land here is older than any king.')]);
});

export const CAST_TREES: readonly BuiltTree[] = [ALDRIC, WILMOT, ...VEY_GUARDS, ...CAPTAINS, ...SERGEANTS, CELLAR_KEEPER, ...WITNESSES, HAMON, CAPTIVE, ...LOCALS];
