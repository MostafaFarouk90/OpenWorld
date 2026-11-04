import { buildTree } from '../../act2/build';
import { all, flagIs, not } from '../../act2/cond';
import { C, voice, witnessesAre } from './common';
import { R16_CHOICE } from '../../../../quests/content/act3/dragonspine/r16.quest';
import { M31_AFTER_SCENE, M31_BEFORE_SCENE, M31_CHOICE, M31_CLIMB_SCENE } from '../../../../quests/content/act3/summit/m31.quest';
import { M32_AXE_FAVOUR, M32_AXE_GIVEN, M32_AXE_SCENE, M32_RUBBING_SCENE, M32_VISION_SCENE } from '../../../../quests/content/act3/summit/m32.quest';
import { M33_AFTERMATH_SCENE, M33_WITNESSES } from '../../../../quests/content/act3/summit/m33.quest';
import { M34_SWEAR_SCENE } from '../../../../quests/content/act3/summit/m34.quest';
import { D06_LINES_SCENE, D06_LIP_SCENE, D06_OUTCOME_SCENE, D06_SKARL_OUTCOME } from '../../../../quests/content/act3/summit/d06.quest';

/** The set pieces as one-way scene trees: the director starts each, the talk objective is credited at its end. */
const scene = (id: string, lines: ReturnType<ReturnType<typeof voice>>[], extra: Record<string, { lines: ReturnType<ReturnType<typeof voice>>[] }> = {}) =>
  buildTree({ id, start: [{ when: all(), seg: 'scene' }], segments: { scene: { lines }, ...extra } });

const Y = voice('ysmeryth');
const H = voice('hathren');
const T = voice('thorgar');
const S = voice('skarl');
const E1 = voice('aerie-escort-1');
const E2 = voice('aerie-escort-2');
const HU = voice('skyhold-rigger');

export const SCENE_M31_CLIMB = scene(M31_CLIMB_SCENE, [
  C('The third ledge is the last. Above it the stone is black and smooth, and the air has the smell of a struck flint.'),
  C('Hawks wheel below me, driven off, and the wind is steady in my ears.'),
  C('The summit shelf lies ahead, a bowl of ash and shed scale. Something has been lying in it, and has only just risen.'),
  C('Eadgyth said we do not fight her. I am not sure I believe the mountain has been told.'),
  C('I will go the rest on foot, slowly. Nobody ever hurried toward a thing like that and arrived well.'),
  C('Whatever she wants, she will say it with her whole body. I had better be ready to listen with mine.'),
]);

export const SCENE_M31_BEFORE = scene(M31_BEFORE_SCENE, [
  Y('Come no nearer, little knight. Let me look at you. It has been a long while since anything climbed my slope for a reason other than my death.'),
  Y('You carry the shard of the Forge in your chest. I felt it from the moment you touched the pass. It sings, and not well.'),
  C('I have not come to hurt you.'),
  Y('No. You have come to be measured. That is not a harm, but it is not a kindness either. Listen, and do not mistake me for a monster or a mother.'),
  Y('I am a keeper. I keep the Hearth, and I keep the Forge\'s word, and I have kept both for longer than your people have had walls.'),
  Y('The shard cannot be given to someone I have not tested. I will not kill you. I will not let you kill me. We will find out what is in your hands.'),
  Y('Three times you must break my guard. If you tire, or if you doubt, you may bow and yield after two. There is no shame in either.'),
  Y('Now. Stand where you are. I am coming down.'),
]);

const AFTER_YIELDED = [
  C('Enough. I yield. You are the better of us at this, and I have no wish to find out how much.'),
  Y('You yield after two. Most who come never learn that the third is not the point.'),
  C('Then what is?'),
  Y('That you were willing to stop. I have fought a hundred hunters who could not.'),
  C('I did not stop out of fear.'),
  Y('No. You stopped out of sense. That is the thing the Forge was meant to forge, and it so rarely comes out right.'),
];
const AFTER_COMMON = [
  Y('I will not pretend it does not hurt. I am old, and you are young, and the shard is not gentle with either of us.'),
  Y('But I know what you are now. Not a hunter and not a king. A knight who carries a thing that was never asked for, and keeps going.'),
  Y('Go down to the Hearth. I will fly there before you. We shall speak where the stone remembers, and the fire has room.'),
  Y('One more thing. There are men on the other spurs who do not share my patience. Do not tell them I was gentle.'),
  C('I will tell them you were terrible.'),
  Y('Good. That is the version that keeps my slope quiet.'),
  Y('Eadgyth will be waiting. She is afraid of me, still. It is the reason I trust her.'),
  Y('Go. The path down is shorter than the path up, and I am not used to being thanked.'),
  C('Thank you.'),
  Y('Enough. Go.'),
];
const AFTER_WON = [
  Y('Three breaks. Well struck. I have not been so reminded of my own hide in a century.'),
  ...AFTER_COMMON.slice(0, 9),
];

export const SCENE_M31_AFTER = buildTree({
  id: M31_AFTER_SCENE,
  start: [{ when: flagIs(M31_CHOICE, 'yielded'), seg: 'yielded' }, { when: all(), seg: 'won' }],
  segments: {
    yielded: { lines: [...AFTER_YIELDED, ...AFTER_COMMON] },
    won: { lines: AFTER_WON },
  },
});

export const SCENE_M32_VISION = scene(M32_VISION_SCENE, [
  Y('Look into the stone, knight. It does not show what is. It shows what was meant.'),
  C('A forge. Gold and fire. A hammer coming down, and each blow throws a spark that does not die.'),
  Y('Each spark is a wyrm. The first smiths struck them to keep the world warm. The Heartshard is the first spark, hardened. It is the Forge\'s duty, in a shape small enough to carry.'),
  C('And you were meant to carry it.'),
]);

export const SCENE_M32_RUBBING = scene(M32_RUBBING_SCENE, [
  Y('The rubbings you took at the Last Anvil are readable now. Hold one to the light. I will say what it says.'),
  Y('"Tend what you did not light. Kneel to nothing but the work. When the fire is low, call the one who carries the shard."'),
  C('It was written for me.'),
]);

const AXE_GIVE = [
  Y('That is the axe. Eadgyth\'s axe, Frostbrow\'s. I know the smell of its steel. I smelled it forty winters ago in a cave on the western spur.'),
  C('Eadgyth said she would not hold it again. I carried it out of the dark.'),
  Y('And you bring it here. You do not keep it, though it would cut dragons deeper than any edge you own.'),
  C('It was not mine to keep. The mountain lost something to it.'),
  Y('Then the mountain will remember. I will lay it on the hoard, where the old weapons rest. The dragons will know who carried it back.'),
  Y('Go carefully, knight. You have given me more than a blade.', [
    { if: not(flagIs(M32_AXE_GIVEN)), then: [{ favour: 'dragons', delta: M32_AXE_FAVOUR }, { setFlag: M32_AXE_GIVEN, value: true }, { take: [{ itemId: 'frostbrows-axe', count: 1 }] }] },
  ]),
];
const AXE_KEEP = [
  Y('I smell the axe on you. Eadgyth\'s axe, the one that killed a mother in front of her clutch.'),
  C('I kept it. It bites dragonkin harder than anything I own.'),
  Y('Yes. That is what it was made for.'),
  Y('I will not tell you what to do with it. But I will tell you what I see. A knight who asked the mountain for peace, and picked up the thing that broke it.'),
  C('I have not forgotten who it was forged against.'),
  Y('Good. Remember it when the shard burns, and the axe is the nearest thing to hand.'),
];

export const SCENE_M32_AXE = buildTree({
  id: M32_AXE_SCENE,
  start: [{ when: flagIs(R16_CHOICE, 'give'), seg: 'give' }, { when: all(), seg: 'keep' }],
  segments: { give: { lines: AXE_GIVE }, keep: { lines: AXE_KEEP } },
});

export const SCENE_M33_AFTERMATH = scene(M33_AFTERMATH_SCENE, [
  C('The net lies across the spur like a dead fisherman\'s catch, and the wyrmlings are specks over the far ridge.'),
  HU('I hung the second span myself. I will not hang a third, whatever Vey pays.'),
  C('Then leave the rope where it is, and go.'),
  { s: 'skyhold-rigger', t: 'One of the lads you spared is at the edge of the camp. He says you let him walk. He wants it known.', when: witnessesAre(M33_WITNESSES, 1, 8) },
  HU('The anchors are cut and the camp is quiet. Whoever comes next will have to start from the beginning.'),
  C('Then they will start. Thorgar will want to hear all of it.'),
]);

export const SCENE_M34_SWEAR = scene(M34_SWEAR_SCENE, [
  H('I am Hathren, and I carry the cold breath of the north. I swear to the Forge, and to the one who bears its shard, that the summit shall not burn for hunters\' gold again.'),
  H('Every wyrm who hears this voice, hear it. We are not lonely and we are not cruel. We are keepers, and we are sworn.'),
  C('A dragon is speaking to me from the sky.'),
  H('A dragon is speaking to the sky through you, little knight. Do not make a face. It is the most polite thing we do.'),
  H('The others will follow. I have sent the word along the ridges. Some will take a season to believe it.'),
  H('Be easy, Coal-Mother\'s knight. The oath is made. Go and see to the fire.'),
]);

export const SCENE_D06_LIP = scene(D06_LIP_SCENE, [
  T('This is the lip. Over it is the chasm, and across it the Aerie. Skarl has kept the road to it closed since before my father was born.'),
  T('The ledge is open to you now. The wind off the Hearth carries a glider across in a minute and a half, if the glider holds the line.'),
  T('Step to the edge and press the glide. If the wind takes you wrong, the mountain will put you back at the lip. It is forgiving, but it is not patient.'),
  T('The Aerie will be watching. Land soft and stay low.'),
]);

export const SCENE_D06_AERIE = scene(D06_LINES_SCENE, [
  C('The courtyard is quiet. Eight hunters and four on the walls are gone, and the gate stands open behind me.'),
  C('The keep has the Marshal\'s orders. The ledger has the buyers\' names. The letter has Vey\'s hand in it.'),
  C('The drake is chained at the post in the middle of the yard, silent as a stone, watching me.'),
  C('If I walk to the centre, the Marshal will come.'),
  C('I do not need his blood. I need him to put the chain down.'),
  C('Let it be so.'),
]);

const OUTCOME_SPARED = [
  S('Put your blade down, knight. Take it from a man who knows when a thing is done. The Aerie is yours.'),
  E1('Marshal Skarl. You are relieved. Wyrmwatch asks you to walk with us.'),
  S('Wyrmwatch. The same lodge that called me a butcher for forty winters. You will have to carry me.'),
  E2('We will walk you. Slowly. The Lord-Regent will want to hear what you know about his ledger.'),
  S('He will want to hear nothing. He will want me quiet. Do not take me south, hunter.'),
  E1('We are taking you down the mountain, and to the Council. None of the Regent\'s men will see you before then.'),
  C('Go carefully. The wyrm is free. Do not look back at it.'),
  S('I will look back at it every day I have left.'),
];
const OUTCOME_DEFEATED = [
  C('The Marshal is down. The horn has stopped.'),
  C('The drake is free of the post. It does not fly. It stands over the fallen man and says nothing.'),
  C('It has served him for two years in chains. It does not know what the quiet means.'),
  C('There is a silence the length of the Aerie, and then the wind takes the banner off its pole.'),
  C('I do not feel lighter. I feel as if a tooth has been pulled, and the gum is still empty.'),
  C('The hunters on the walls are gone. The gate is open. The keep is a house with its owner out.'),
  C('Thorgar will want this told in order, and I will tell it plainly.'),
  C('The Aerie is the dragons\' again, whoever asks.'),
];

export const SCENE_D06_OUTCOME = buildTree({
  id: D06_OUTCOME_SCENE,
  start: [{ when: flagIs(D06_SKARL_OUTCOME, 'spared'), seg: 'spared' }, { when: all(), seg: 'defeated' }],
  segments: { spared: { lines: OUTCOME_SPARED }, defeated: { lines: OUTCOME_DEFEATED } },
});

export const SUMMIT_SCENE_TREES = [
  SCENE_M31_CLIMB, SCENE_M31_BEFORE, SCENE_M31_AFTER, SCENE_M32_VISION, SCENE_M32_RUBBING, SCENE_M32_AXE, SCENE_M33_AFTERMATH, SCENE_M34_SWEAR,
  SCENE_D06_LIP, SCENE_D06_AERIE, SCENE_D06_OUTCOME,
];

/** Names the voices without an NPC def fall back to (the NPC defs' names are the summit's own). */
export const SUMMIT_SPEAKER_NAMES: Record<string, string> = {
  'npc.ysmeryth.name': 'Ysmeryth the Coal-Mother',
  'npc.hathren.name': 'Hathren',
  'npc.skarl.name': 'Corvin Skarl',
};
