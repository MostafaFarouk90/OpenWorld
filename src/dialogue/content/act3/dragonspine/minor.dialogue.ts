import { buildTree, type BuiltTree } from '../../act2/build';
import { all } from '../../act2/cond';
import { M28_HUNTER_POSTS } from '../../../../quests/content/act3/dragonspine/m28.quest';
import { C, at, voice } from './common';

// The lodge hunters (M28, two lines each), the sled-hands (R15, three each), the cave hunter (R16, four), the egg thief (R18, 8 + 3)
// and the three pilgrims (M30 and R17, four each). Segment sizes are the plan's node counts.

const tree = (npc: string, rules: Array<[ReturnType<typeof at>, string]>, segments: Parameters<typeof buildTree>[0]['segments']): BuiltTree =>
  buildTree({ id: `npc-${npc}`, start: [...rules.map(([when, seg]) => ({ when, seg })), { when: all(), seg: 'idle' }], segments });

const hunter = (n: number, lines: [string, string], idle: string): BuiltTree => {
  const H = voice(`lodge-hunter-${n}`);
  const slot = M28_HUNTER_POSTS.indexOf(n as never) + 1; // 0 when this hunter has no M28 line
  return tree(`lodge-hunter-${n}`, slot ? [[at('m28', `hunter${slot}`), 'm28-talk']] : [], {
    ...(slot ? { 'm28-talk': { lines: [H(lines[0]), H(lines[1])] } } : {}),
    idle: { lines: [H(idle)] },
  });
};

export const LODGE_HUNTERS: BuiltTree[] = [
  hunter(1, ['North gate, then the trail. Follow the cairns and you will not fall off anything.', 'Anything much, I should say. The two ledges are a jump. The Surge carries you over, or you walk the long way round.'], 'Watch the cairns. They are the only friends the trail has.'),
  hunter(2, ['Hawks work in pairs. One draws the eye and one comes in from behind. Watch the second.', 'Dodge as they land, not as they stoop. They cannot turn in the last ten paces.'], 'A hawk\'s eye never closes. You only think it does.'),
  hunter(3, ['', ''], 'I keep my spear dry. The rest of me I give up on.'),
  hunter(4, ['The crag is where the old roosts were. An ogre sleeps in the lee of it, big as a barn.', 'It does not wake for walkers. It wakes for fighting, and the hawks wake it.'], 'The ogre is the lodge\'s oldest quarrel.'),
  hunter(5, ['The scout, Aldwin\'s boy, went up three days ago to look at the crag. His horn blew once and then not again.', 'If he still stands, he has gone strange. The cold does that. Do not trust the face.'], 'The gate is mine. No one passes who should not.'),
  hunter(6, ['', ''], 'We take the winter in turns. I have the early watch.'),
];

const SH1 = voice('sled-hand-1');
const SH2 = voice('sled-hand-2');
export const SLED_HANDS: BuiltTree[] = [
  tree('sled-hand-1', [[at('r15', 'hand1'), 'r15-talk']], {
    'r15-talk': { lines: [
      SH1('Three sleds, and I loaded them myself. Oil, rope, salt, bread, in that order.'),
      C('How heavy are they?'),
      SH1('Heavy enough that you will think of nothing else for eight hundred paces. Good.'),
    ] },
    idle: { lines: [SH1('The sleds are my life. Mind the traces.')] },
  }),
  tree('sled-hand-2', [[at('r15', 'hand2'), 'r15-talk']], {
    'r15-talk': { lines: [
      SH2('Pull by the traces, not the load. The load shifts.'),
      C('And if I lose one?'),
      SH2('Then Thorgar sends it back to the last bend. He does it with a word. Ask him to reset your haul.'),
    ] },
    idle: { lines: [SH2('The cache is up the north road. You cannot miss it.')] },
  }),
];

const CH = voice('lodge-hunter-cave');
export const CAVE_HUNTER: BuiltTree = tree('lodge-hunter-cave', [[at('r16', 'hunter'), 'r16-talk']], {
  'r16-talk': { lines: [
    CH('Eadgyth\'s axe, is it? I have kept the mouth for her six winters and not once gone in.'),
    CH('The roof talks. The hawks nest on the ledge and will not come near the dark.'),
    CH('Clear the pack and the way opens. The Leap is quicker, and it is a jump.'),
    CH('Mind the passage. If it falls, it falls on you.'),
  ] },
  idle: { lines: [CH('The cave keeps its own counsel. I keep the mouth.')] },
});

const EG = voice('egg-thief');
export const EGG_THIEF: BuiltTree = tree('egg-thief', [[at('r18', 'thief'), 'r18-thief'], [at('r18', 'excuse'), 'r18-excuse']], {
  'r18-thief': { lines: [
    EG('You wear the lodge\'s colours. Thorgar sent you, I suppose, about the eggs.'),
    C('He did. I would rather hear it from you.'),
    EG('There is nothing to hear. I took what the cliff gave me.'),
    EG('Four eggs, from the low nest. One cracked in my pack. Three are warm and well.'),
    C('The parents have stooped at the road ever since.'),
    EG('They would have stooped at me anyway. I do not like what I have done, but I do not like what the Council\'s men did to the rest of the nest either.'),
    C('The Council\'s men?'),
    EG('Three winters back. They burned the high roosts. I took what I could save.'),
  ] },
  'r18-excuse': { lines: [
    EG('So that is my excuse, and it is a poor one. I meant to hatch them myself and let them go.'),
    C('Thorgar wants them returned.'),
    EG('Then take them from my straw. The camp is open. Mind the parents. They do not forgive twice.'),
  ] },
  idle: { lines: [EG('The camp is yours. I have nothing left to hide.')] },
});

const pilgrim = (n: number, talk: { quest: string; obj: string; lines: [string, string, string, string] } | null, idle: string): BuiltTree => {
  const P = voice(`pilgrim-${n}`);
  return tree(`pilgrim-${n}`, talk ? [[at(talk.quest, talk.obj), 'talk']] : [], {
    ...(talk ? { talk: { lines: [P(talk.lines[0]), C(talk.lines[1]), P(talk.lines[2]), P(talk.lines[3])] } } : {}),
    idle: { lines: [P(idle)] },
  });
};

export const PILGRIMS: BuiltTree[] = [
  pilgrim(1, { quest: 'r17', obj: 'pilgrim1', lines: [
    'The third shrine and the second burn again. I have walked this road six years and never seen it so.',
    'There is another below.',
    'The first is the lowest, and it was my mother\'s. Light it and I will say her name aloud.',
    'Go on. I will keep the road.',
  ] }, 'Peace on the road.'),
  pilgrim(2, { quest: 'r17', obj: 'pilgrim2', lines: [
    'The high shrines. Four and five burn, I see.',
    'Six is the last.',
    'Six was the pilgrim\'s rest. You will understand when you reach it.',
    'The hawks nest above it. Mind your candles.',
  ] }, 'The road is steeper than I remembered.'),
  pilgrim(3, { quest: 'm30', obj: 'pilgrim', lines: [
    'I walked here from the Council\'s lands to see the Anvil lit before I die.',
    'It is not lit yet.',
    'Then I will wait. Waiting is what pilgrims are for.',
    'Mind the hawks on the shoulder. They took my staff.',
  ] }, 'The Anvil burns, and I am content.'),
];

export const MINOR_TREES: BuiltTree[] = [...LODGE_HUNTERS, ...SLED_HANDS, CAVE_HUNTER, EGG_THIEF, ...PILGRIMS];
