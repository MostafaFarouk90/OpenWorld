// The Rim Camp's talkers in the Foundry quests (N11): Wenna (R27's brief and report), Wulfhild (R28's brief and farewell),
// Tobb (R30's brief and verse), the ten allies' lines for Tobb's song, Edric and Rook (M53). Every tree here extends a shipped
// (or Rim) tree in front; node ids start `a5f-`. Prose is invented (Q6). The player is addressed as "knight" or {name}.
import { buildTree, type BuiltTree, type Line } from '../../act2/build';
import type { Condition, Effect } from '../../../../quests/types';
import { R27_CHOICE, R30_LINE, R30_VERSE, R30_VERSES, type R30Verse } from '../../../../quests/content/act5/foundry/flags';
import { R30_ALLIES, R30_CHOSEN_EVENT, R30_LINE_EVENT, type R30Ally } from '../../../../quests/content/act5/foundry/r30.quest';
import { C, all, any, at, flagIs, not, offer, open, qActive, voice } from './common';
import { WENNA_D09_RULE, WENNA_D09_SEGMENT } from './foundry.dialogue';

const WE = voice('wenna');
const WU = voice('wulfhild');
const TO = voice('tobb');
const ED = voice('edric');
const RO = voice('rook');

// ---- the ten allies' lines --------------------------------------------------------------------------------------------------
const LINES: Record<R30Ally, readonly [string, string]> = {
  wystan: ['A line for Tobb\'s song? Tell him the gate was held by men who wanted very badly to be somewhere else, and stayed.', 'Tell him not to make it rhyme. Nothing about that night rhymed.'],
  merrin: ['My line? "Bread came up the rim stairs." Write that. Every siege song forgets who fed the singers.', 'And he may say the Oswin blue looked very fine in the firelight. Because it did.'],
  wenna: ['Mine is simple. "The Grisels came to dig, not to sell." He will understand.', 'If he puts my father in it, I will break his lute.'],
  wulfhild: ['The walkers do not sing for the living. But tell your bard this: "The ash remembers every foot that stood on it."', 'He may have that one. It is old. It can stand being sung badly.'],
  rook: ['A line? "The watch held the left lane." That is the whole report.', 'Fine. "The watch held the left lane, and nobody ran." Happy?'],
  edric: ['I have thought about this. "A king is just the one who stands where everyone can see him."', 'Do not tell him I thought about it. Tell him I said it at once, very wisely.'],
  hrolf: ['Hrolf gives you a line? Hrolf gives you this: "The hammer swings, the wall stands."', 'Tobb will want more words. Hrolf does not have more words. Hrolf has a hammer.'],
  aelfreda: ['Tell him: "The hearth was carried up the mountain, and it did not go out."', 'And tell him to sing it slowly. People need time to cry, and they will pretend it is the smoke.'],
  ansgar: ['The gong\'s line, of course. "Three strokes for the dead, one for the living, and silence for the rest."', 'The silence is the important part. Bards always forget the silence.'],
  ysmeryth: ['A song. Small one, your bard. The keepers sang before your kind had mouths. Give him this: "The fire was ours to keep, and we kept it."', 'He will make it shorter. They always do. Let him.'],
};
const lineFx = (a: R30Ally): Effect[] => [{ setFlag: R30_LINE(a), value: true }, { event: R30_LINE_EVENT, payload: { npc: a } }];
const askLine = (a: R30Ally): Condition => all(open('r30', 'lines'), not(flagIs(R30_LINE(a))));

/** The tree each ally speaks from (Aelfreda as a companion has her own tree; the rest are their npc trees). */
export const R30_TREE_OF: Record<R30Ally, string> = {
  wystan: 'npc-wystan', merrin: 'npc-merrin', wenna: 'npc-wenna', wulfhild: 'npc-wulfhild', rook: 'npc-rook', edric: 'npc-edric',
  hrolf: 'npc-hrolf', aelfreda: 'npc-aelfreda-companion', ansgar: 'npc-ansgar', ysmeryth: 'npc-ysmeryth',
};
const lineSegment = (a: R30Ally): Record<string, { lines: Line[] }> => ({
  [`a5f-r30-line-${a}`]: { lines: [C('Tobb is writing a song of the Rim. He wants a line from you.'), { s: a, t: LINES[a][0] }, { s: a, t: LINES[a][1], fx: lineFx(a) }] },
});

// ---- Wenna: R27 -------------------------------------------------------------------------------------------------------------
export const WENNA_A5F: BuiltTree = buildTree({
  id: 'npc-wenna',
  start: [
    { when: offer('r27'), seg: 'a5f-r27-brief' },
    { when: at('r27', 'report'), seg: 'a5f-r27-report' },
    WENNA_D09_RULE,
    { when: askLine('wenna'), seg: 'a5f-r30-line-wenna' },
    { when: qActive('r27'), seg: 'a5f-r27-wait' },
  ],
  segments: {
    ...lineSegment('wenna'),
    ...WENNA_D09_SEGMENT,
    'a5f-r27-brief': {
      lines: [
        WE('Knight. A word, away from the fire. My diggers heard picks last night, under the camp. Not ours.'),
        C('Under the camp? The rim is solid rock.'),
        WE('Most of it. There is an old stokers\' tunnel through the west shoulder, from the Waste side to a door beside the camp. Sealed, they told me. Sealed doors do not echo.'),
        WE('Vey lost the gate. He will not lose the night. He means to come up behind us, through that tunnel, while we are still burying the dead.'),
        WE('My people are already there. We have props, lamps and powder. We need a fighter at the line, and someone to say when to bring the roof down.'),
        C('And if we bring it down, the tunnel is gone for good.'),
        WE('Or we keep it, and it is ours: a sally port under Vey\'s nose. I do not know which is right. My father would have known. He would have been wrong.'),
        {
          s: 'wenna', t: 'Will you stand at the line with us?',
          choices: [
            { id: 'accept', t: 'Show me the tunnel.', go: null, fx: [{ startQuest: 'r27' }] },
            { id: 'later', t: 'Soon. There is something I have to finish first.', go: null },
          ],
        },
      ],
    },
    'a5f-r27-wait': { lines: [WE('The tunnel door is past the last tent, west side. My captain is inside. Do not keep her waiting; she hates it.')] },
    'a5f-r27-report': {
      lines: [
        WE('It is quiet down there now. I keep listening for picks and hearing my own heart.'),
        { s: 'wenna', t: 'The shoring came down like a mountain sitting. Nothing will dig through that in our lifetimes.', when: flagIs(R27_CHOICE, 'collapse') },
        { s: 'wenna', t: 'My miners have the door. If Vey comes again, he comes into our lamps, and we go out behind him.', when: flagIs(R27_CHOICE, 'keep') },
        C('Your people held. That was not my doing.'),
        WE('It was not mine either. A year ago my house sold miners by the cartload. Tonight they chose to stand in a hole in the dark for strangers.'),
        WE('Take this. My grandmother\'s pick, the last one in the family that was ever used for honest work. It should go to someone who digs people out.'),
        WE('Go on. The Foundry is waiting, and so is everyone else.'),
      ],
    },
  },
});

// ---- Wulfhild: R28 ----------------------------------------------------------------------------------------------------------
const F8_ALL = flagIs('story.r24.choice', 'all');
export const WULFHILD_A5F: BuiltTree = buildTree({
  id: 'npc-wulfhild',
  start: [
    { when: offer('r28'), seg: 'a5f-r28-brief' },
    { when: open('r28', 'farewell'), seg: 'a5f-r28-farewell' },
    { when: askLine('wulfhild'), seg: 'a5f-r30-line-wulfhild' },
    { when: qActive('r28'), seg: 'a5f-r28-wait' },
  ],
  segments: {
    ...lineSegment('wulfhild'),
    'a5f-r28-brief': {
      lines: [
        WU('Knight. The dead are lying in the court with their faces to the sky. That is no way to leave anyone on the rim.'),
        C('The engineers are digging graves on the camp side.'),
        WU('Graves are for lowland earth. This is the Forge\'s own rock: put a body in it and the heat keeps it walking. You saw what the stokers became.'),
        WU('Four pyres, then. One for each House that bled for the gate, and one for my walkers. Every one of the dead needs a name said over them and something of theirs on the wood.'),
        { s: 'wulfhild', t: 'My people will light theirs beside you. We owe the dead that, and we owe you the water.', when: F8_ALL },
        { s: 'wulfhild', t: 'My people are few here. You gave half our water to the lowlands; I do not blame you, but I cannot ask them to stand at a lowland pyre.', when: not(F8_ALL) },
        WU('Lighting them is the Heartshard\'s work, if you choose. It is a hot fire. It will cost you. Nobody will think less of a cold pyre.'),
        {
          s: 'wulfhild', t: 'Will you see them off?',
          choices: [
            { id: 'accept', t: 'I will. Show me where they lie.', go: null, fx: [{ startQuest: 'r28' }] },
            { id: 'later', t: 'Not yet.', go: null },
          ],
        },
      ],
    },
    'a5f-r28-wait': { lines: [WU('Hear each mourner. Find each name. Carry what they left to the wood. The dead are patient; the rock is not.')] },
    'a5f-r28-farewell': {
      lines: [
        WU('There. Now they can go up the right way, with the ash, instead of down into the stone.'),
        C('Some of them did not want to go.'),
        WU('Nobody does, at first. The stokers waited three hundred years for somebody to say their names. These waited one night. That is a mercy, knight, even if it does not feel like one.'),
        { s: 'wulfhild', t: 'You lit them with your own fire. My people saw. They will tell it on the long walks.', when: { flag: 'story.r28.lit1', equals: true } },
        WU('Wear this when you go down. A pyre-mask: it keeps the smoke out of your eyes, and the dead out of your dreams. Mostly.'),
        WU('Go. Whatever is under the Foundry, walk into it the way they walked into the gate.'),
        WU('Not looking back.'),
        WU('Ash to ash, Cinder to sky. That is all of the rite there is.'),
      ],
    },
  },
});

// ---- Tobb: R30 --------------------------------------------------------------------------------------------------------------
const VERSE_LINE: Record<R30Verse, string> = {
  gaut: 'The knight who held the stairs. Gaut never sang, but he would have liked a song where somebody stays.',
  keepers: 'The dragons. Three keepers over the gate and the sky on fire. Nobody in Kettlewick will believe it, which is the point.',
  houses: 'The banners at the gate. Grey, blue, green and one that was only a bedsheet. Everybody who came.',
  walkers: 'The dead laid to rest. A quiet verse. The kind you sing at the end when nobody wants to go home.',
};
const VERSE_CHOICE: Record<R30Verse, string> = {
  gaut: 'The knight who held the stairs.', keepers: 'The dragons over the gate.', houses: 'The banners that came.', walkers: 'The dead laid to rest.',
};
const verseFx = (v: R30Verse): Effect[] => [{ setFlag: R30_VERSE, value: v }, { event: R30_CHOSEN_EVENT }];

export const TOBB_A5F: BuiltTree = buildTree({
  id: 'npc-tobb',
  start: [
    { when: offer('r30'), seg: 'a5f-r30-brief' },
    { when: open('r30', 'verse'), seg: 'a5f-r30-verse' },
    { when: open('r30', 'tune'), seg: 'a5f-r30-tune' },
    { when: qActive('r30'), seg: 'a5f-r30-wait' },
  ],
  segments: {
    'a5f-r30-brief': {
      lines: [
        TO('{name}! Sit. No, do not sit, you will only get up again. Listen instead.'),
        TO('Every great siege gets a song. The Siege of the Rim does not have one yet, which means I get to write it, which means I get to be remembered.'),
        C('You were there. Write what you saw.'),
        TO('I saw mostly the inside of a supply tent and the back of Hrolf\'s head. No. A song of the Rim needs everyone\'s Rim. One line from each of them.'),
        TO('Wystan, Merrin, Wenna, Wulfhild, Rook, the boy king, Hrolf, Sister Aelfreda, Brother Ansgar. And the Coal-Mother, if you can get her to say anything that is not a riddle.'),
        TO('The siege also stole my songbook. Three pages are blowing about the camp somewhere. One of them has the only rhyme for "ember" I have ever liked.'),
        TO('Then we put it to a beat. The camp\'s old anvil has a fine ring to it, if you hit it like you mean it.'),
        {
          s: 'tobb', t: 'Will you help a humble bard become immortal?',
          choices: [
            { id: 'accept', t: 'One line from everyone. I will ask.', go: null, fx: [{ startQuest: 'r30' }] },
            { id: 'later', t: 'Later, Tobb.', go: null },
          ],
        },
      ],
    },
    'a5f-r30-wait': { lines: [TO('A line from everyone, three pages of mine, and then the anvil. Do not tell me how many you still need; I can count. Badly, but I can.')] },
    'a5f-r30-tune': { lines: [TO('Lines and pages, all of them! The anvil, then. You keep the beat; I keep everything else.')] },
    'a5f-r30-verse': {
      lines: [
        TO('That is the tune. I can feel it in my teeth. Now the hard part: how does it end?'),
        TO('A song of the Rim can only end one way. Everything before it is the road; the last verse is where you stop and look back.'),
        TO('I have four. I like them all. You choose. You were in front.'),
        {
          s: 'tobb', t: 'Which verse do we end on?',
          choices: R30_VERSES.map((v) => ({ id: v, t: VERSE_CHOICE[v], go: `a5f-r30-chosen-${v}`, fx: verseFx(v) })),
        },
      ],
    },
    ...Object.fromEntries(R30_VERSES.map((v) => [`a5f-r30-chosen-${v}`, { lines: [TO(VERSE_LINE[v]), TO('Right. Gather round, everyone, before I lose my nerve.')] }])),
  },
});

// ---- Edric and Rook: M53 ----------------------------------------------------------------------------------------------------
const edricSegments = {
  'a5f-m53-brief': {
    lines: [
      ED('{name}. Before you go down to the Inner Gate, I have a thing to ask, and you will not like it.'),
      ED('Vey has sent a herald under a white cloth. He asks to speak before we fight. Not to me. To you.'),
      C('He wants time. Every hour we talk, his forge runs.'),
      ED('Perhaps. Or perhaps he believes what he is doing. I was raised in his house. He taught me my letters. I would like to know which.'),
      ED('My mother would have refused. My mother is dead, and he is the reason. So I am asking you to hear him out, for me.'),
      ED('If he means treachery, we will see it. If he means what he says, then someone should listen to the last thing he says before it ends.'),
      ED('Rook will want a word first. Rook always wants a word first.'),
      {
        s: 'edric', t: 'Will you hear him?',
        choices: [
          { id: 'accept', t: 'I will hear him. Then I will stop him.', go: null, fx: [{ startQuest: 'm53' }] },
          { id: 'later', t: 'Not yet, Edric.', go: null },
        ],
      },
    ],
  },
  'a5f-m53-wait': { lines: [ED('The truce banner is at the Inner Gate. I will be there before you. Rook will scold us both on the way.')] },
  'a5f-m53-decide': {
    lines: [
      ED('He is gone into the Foundry. The gate is open behind him. He left it open on purpose, I think.'),
      C('He wants it ended where he chooses.'),
      ED('Then he will have it. I have decided, {name}. If you can spare him, spare him. A king who starts by killing his regent is only a new regent.'),
      ED('But if he will not yield, do not let my wish cost you your life. I could not carry that one.'),
      { s: 'edric', t: 'Aldous\'s seal on the truce cord. His people meant it as a promise: to me, not to Vey. Remember that, when you tell Wenna.', when: flagIs('story.m21.choice', 'confront') },
      ED('Take this. My seal, the real one. Show it to any of his household who still have sense, and they may lower their swords.'),
      ED('Alric is waiting at the Foundry door. Go with him.'),
      ED('And come back up, please. I have run out of people who teach me things.'),
      ED('That is an order, by the way. My first.'),
      ED('Go.'),
    ],
  },
};
export const EDRIC_A5F: BuiltTree = buildTree({
  id: 'npc-edric',
  start: [
    { when: offer('m53'), seg: 'a5f-m53-brief' },
    { when: at('m53', 'decide'), seg: 'a5f-m53-decide' },
    { when: all(qActive('m53'), any(at('m53', 'rook'), at('m53', 'truce'), at('m53', 'broken'), at('m53', 'gate'))), seg: 'a5f-m53-wait' },
    { when: askLine('edric'), seg: 'a5f-r30-line-edric' },
  ],
  segments: { ...edricSegments, ...lineSegment('edric') },
});

export const ROOK_A5F: BuiltTree = buildTree({
  id: 'npc-rook',
  start: [
    { when: at('m53', 'rook'), seg: 'a5f-m53-rook' },
    { when: askLine('rook'), seg: 'a5f-r30-line-rook' },
  ],
  segments: {
    'a5f-m53-rook': {
      lines: [
        RO('So you are going to a truce with the man who hanged the old watch-captain from his own gate. Of course you are.'),
        RO('Listen. Under a white cloth, Vey will keep his word. His household might not. Watch their hands, not his face.'),
        C('And Edric?'),
        RO('Edric will be fine. I will be right behind him, being rude. Go on.'),
      ],
    },
    ...lineSegment('rook'),
  },
});

/** The line-only extensions (Wystan, Merrin, Hrolf, Aelfreda, Ansgar, Ysmeryth). Wenna's and Wulfhild's sit in their trees. */
const lineOnly = (a: R30Ally): BuiltTree => buildTree({
  id: R30_TREE_OF[a],
  start: [{ when: askLine(a), seg: `a5f-r30-line-${a}` }],
  segments: lineSegment(a),
});
export const R30_LINE_TREES: readonly BuiltTree[] = (['wystan', 'merrin', 'hrolf', 'aelfreda', 'ansgar', 'ysmeryth'] as const).map(lineOnly);

export { R30_ALLIES };
