// The descent and the Anvil (N11 PR 2, plans/act5-N11.md section 5): Alric's last chance on the rim and his warnings below
// (M54), Ulthred's voice through the walls and his parley in the Hammer Hall (M55), Alric's D10 word, and the Anvil of Ages:
// Alric's disclosure, Ysmeryth with Ulthred's last, the company, the choice with its confirm, and the aftermath (M56).
// Prose is invented (Q6). Choices pick words, never outcomes (Q5), except M56's, which is the ending.
import { buildTree, type BuiltTree, type Line, type Segment, type StartRule } from '../../act2/build';
import type { Condition, Effect } from '../../../../quests/types';
import { ACT5_RITE_FLAG } from '../../../../items/act5/rite';
import { r29 } from '../../../../quests/content/act5/rim/r29.quest';
import {
  M54_VOICE_SEEN, M55_PARLEY_SEEN, M56_AFTER_SEEN, M56_CAEL_LIVES_FLAG, M56_CHOICE_FLAG, M56_COMPANY_SEEN, M56_CONFIRM_EVENT, M56_SCAR_BAND, M56_TOLD,
  M56_YSMERYTH_SEEN, R30_VERSE, R30_VERSES, VEY_OUTCOME, type R30Verse,
} from '../../../../quests/content/act5/foundry/flags';
import { R30_CHOSEN_EVENT } from '../../../../quests/content/act5/foundry/r30.quest';
import { M54_VOICE } from '../../../../quests/content/act5/foundry/m54.quest';
import { M55_ULTHRED } from '../../../../quests/content/act5/foundry/m55.quest';
import { M56_COMPANY_NPC, M56_COMPANY_TREE } from '../../../../quests/content/act5/foundry/director/descent';
import { C, all, any, at, flagIs, not, objDone, offer, qActive, qDone, voice } from './common';

const AL = voice('alric');
const UL = voice(M55_ULTHRED);
const YS = voice('ysmeryth');
const TO = voice('tobb');
const HR = voice('hrolf');
const AE = voice('aelfreda');
const ED = voice('edric');
const when = (l: Line, c: Condition): Line => ({ ...l, when: c });
const qIdle = (q: string): Condition => ({ quest: q, state: 'inactive' });

// ---- the last chance on the rim (plan 2.3): every rim quest that is offered or under way is named ------------------------
const rimOpen = {
  r28: any(offer('r28'), qActive('r28')),
  r29: any(all(r29.startWhen!, qIdle('r29')), qActive('r29')),
  r30: any(offer('r30'), qActive('r30')),
};
const anyRimOpen = any(rimOpen.r28, rimOpen.r29, rimOpen.r30);
const riteUnused = not(flagIs(ACT5_RITE_FLAG, true));
/** R30's run is done but no verse is chosen yet: Tobb asks for it before the descent (coordinator exception). */
const verseOwed = all(qActive('r30'), objDone('r30', 'tune'), not(any(...R30_VERSES.map((v) => flagIs(R30_VERSE, v)))));
const VERSE_T: Record<R30Verse, string> = {
  gaut: 'The knight who held the stairs.', keepers: 'The dragons over the gate.', houses: 'The banners that came.', walkers: 'The dead laid to rest.',
};
const verseFx = (v: R30Verse): Effect[] => [{ setFlag: R30_VERSE, value: v }, { event: R30_CHOSEN_EVENT }];

export const ALRIC_DESCENT_RULES: StartRule[] = [
  { when: offer('m54'), seg: 'a5f-m54-offer' },
  { when: all(qActive('m54'), at('m54', 'descend')), seg: 'a5f-m54-below' },
  { when: at('m54', 'warnings'), seg: 'a5f-m54-warnings' },
  { when: qActive('m54'), seg: 'a5f-m54-hold' },
  { when: at('m55', 'alric'), seg: 'a5f-m55-alric' },
  { when: qActive('m55'), seg: 'a5f-m55-wait' },
  { when: offer('d10'), seg: 'a5f-d10-brief' },
  { when: at('d10', 'end'), seg: 'a5f-d10-end' },
  { when: qActive('d10'), seg: 'a5f-d10-wait' },
  // a talk cut short (a death mid-line) replays from its step: the telling, the choice, the aftermath by the branch written
  { when: any(offer('m56'), at('m56', 'told')), seg: 'a5f-m56-told' },
  { when: at('m56', 'choice'), seg: 'a5f-m56-choice' },
  { when: all(at('m56', 'after'), flagIs(M56_CHOICE_FLAG, 'rekindle')), seg: 'a5f-m56-after-rekindle' },
  { when: all(at('m56', 'after'), flagIs(M56_CHOICE_FLAG, 'let-it-die')), seg: 'a5f-m56-after-let-it-die' },
  { when: qActive('m56'), seg: 'a5f-m56-wait' },
  { when: qDone('m56'), seg: 'a5f-m56-done' },
];

const goDown: Line = {
  s: 'alric', t: 'Say the word and we go down. Not before.',
  choices: [
    { id: 'go', t: 'We go down.', go: null, fx: [{ startQuest: 'm54' }] },
    { id: 'later', t: 'Not yet.', go: null },
  ],
};

export const ALRIC_DESCENT_SEGMENTS: Record<string, Segment> = {
  // M54's offer at the Rim Camp: the last chance on the rim, Tobb's verse if he is owed one, the Rite if unused
  'a5f-m54-offer': {
    lines: [
      AL('Vey is done. The Foundry is ours, and the stair below it goes on down. Further than I have ever been.'),
      AL('Something is awake down there. The stokers used to say the walls hummed at night. They were right.'),
      when(AL('Before we go: once we are under the Foundry, we are not coming back up for a long while. Whatever you left on the rim stays left.'), anyRimOpen),
      when(AL('Wulfhild still has the dead on their pyres in the court. If you mean to stand with her, do it now.'), rimOpen.r28),
      when(AL('Ansgar\'s gong is still in pieces at the stokers\' stair. Somebody ought to hang it.'), rimOpen.r29),
      when(AL('And the bard has not finished his song.'), rimOpen.r30),
      when(AL('Your Sister has a rite she has not spent. She can lift one Scar. I would let her, before the Anvil counts them.'), riteUnused),
      // one choice node at the end (a conditional node with choices would leave the one after it unreachable): while Tobb is
      // owed his verse, he asks it before Cael can go down
      {
        ...goDown,
        choices: [
          { id: 'verse', t: 'Tobb looks like he will burst. What is it, Tobb?', go: 'a5f-m54-verse', when: verseOwed },
          ...goDown.choices!.map((c) => (c.id === 'go' ? { ...c, when: not(verseOwed) } : c)),
        ],
      },
    ],
  },
  'a5f-m54-verse': {
    lines: [{
      s: 'tobb', t: 'Wait! The tune is done, the anvil rang, and I still do not know how it ends. Which verse? Quick, before he drags you under the mountain.',
      choices: R30_VERSES.map((v) => ({ id: v, t: VERSE_T[v], go: 'a5f-m54-offer-go', fx: verseFx(v) })),
    }],
  },
  'a5f-m54-offer-go': { lines: [TO('That one. Good. I will have it ready when you come back up.'), goDown] },
  'a5f-m54-below': { lines: [AL('Through the Foundry and down past Vey\'s floor. The Hammer Hall is under it. I will meet you there.')] },
  // M54's last warnings in the approach (8), then the companions (6)
  'a5f-m54-warnings': {
    lines: [
      AL('You heard him. You saw the walls. Now you know what the Anvil is.'),
      C('A king who chained the keepers to a fire and called it warmth.'),
      AL('And who was sorry, at the end, and could not undo it. That is the worst kind of king. The sorry kind.'),
      AL('He will talk to you. He is patient. He has had a thousand years to practise being patient.'),
      AL('Listen to him, if you like. But do not let him put his hand on the shard. Whatever he says.'),
      C('What happens if he does?'),
      AL('Then there is a new Ash King, and he has your face.'),
      AL('The hall door is open now. I will be behind you. Not in front. I am too old to be in front.'),
      TO('I have written "the hall door is open now" on my arm. In case it rhymes with something later.'),
      HR('There is no rhyme for "door" that Hrolf has not heard in a tavern. Walk, bard.'),
      AE('If he speaks gently to you, knight, remember that gentle is not the same as kind.'),
      HR('And if he swings at you, duck. That one Hrolf can teach in a word.'),
      TO('Duck. Kind. Door. I can work with that.'),
      AE('Go on. We are with you as far as the light goes.'),
    ],
  },
  'a5f-m54-hold': { lines: [AL('Not yet. Look around you first. The walls are trying to tell us something.')] },
  // M55's after-trial (4), then the companions (6)
  'a5f-m55-alric': {
    lines: [
      AL('You are still standing. I did not think he would let anyone stand.'),
      AL('He was testing your arm. He liked it. That is not good news.'),
      C('He wants out. I believe him.'),
      AL('So do I. That is what frightens me. Wanting out is how this started.'),
      HR('Three rounds with a hammer that size, and the knight is not even bleeding. Hrolf is jealous.'),
      AE('He held back. I saw it. He wanted you whole.'),
      TO('Whole for what, though? That is the line I cannot find.'),
      AE('For whatever comes next. We will know soon enough.'),
      HR('Soon enough is Hrolf\'s favourite time.'),
      TO('That is a terrible last line. I am keeping it.'),
    ],
  },
  'a5f-m55-wait': { lines: [AL('He is waiting for you in the hall. He has waited a long time; do not make it longer.')] },
  // D10's word
  'a5f-d10-brief': {
    lines: [
      AL('This is it, then. Past that door the hall ends and the Anvil begins.'),
      AL('His things will be awake in the approach first: thralls, and fire with a mind of its own. Break them before you go in.'),
      AL('When he comes for you he will come in pieces. The hall first. Then, if the floor goes, the Anvil itself.'),
      when(AL('He will wear Vey\'s armour when he is hurt. Vey is in it. I am sorry.'), flagIs(VEY_OUTCOME, 'defeated')),
      when(AL('He will wear Vey\'s armour when he is hurt. It will be empty. The Regent is in chains on the rim, alive, because of you.'), not(flagIs(VEY_OUTCOME, 'defeated'))),
      AL('And when he is near the end, the fire will remember everyone who stood with you. Let it. It is the only help I can promise.'),
      C('Will you be there?'),
      AL('As near as I can stand. Which is not very near. I am a stoker, not a knight.'),
      TO('I have a verse half written for this door. It is mostly about being frightened. Very honest verse.'),
      HR('Hrolf will go first through the door, then. Somebody should frighten the door.'),
      AE('No. The knight goes first. It is the knight he wants. We follow.'),
      HR('Then Hrolf will follow very closely.'),
      TO('And I will follow Hrolf. Nobody follows me. That is the bard\'s privilege.'),
      AE('Light keep you, knight.'),
      {
        s: 'alric', t: 'The last blow must be the Heartshard. Nothing else will reach him. Are you ready?',
        choices: [
          { id: 'go', t: 'Open the door.', go: null, fx: [{ startQuest: 'd10' }] },
          { id: 'later', t: 'Give me a moment.', go: null },
        ],
      },
    ],
  },
  'a5f-d10-wait': { lines: [AL('Break his things first. Then him. The Heartshard at the end. I will be here.')] },
  'a5f-d10-end': {
    lines: [
      AL('Knight! Knight, here. You came down with the floor; I came down the long way, by the causeway.'),
      AL('Is he gone?'),
      C('He is ash. The crown is all that is left of him.'),
      AL('Then put it on, or put it in your pack. It is yours, either way. Nobody else should touch it.'),
      AL('Look at the Anvil. Still warm. Still waiting. He is gone and it is still waiting.'),
      AL('Catch your breath. Then we talk about what comes next. There is no hurry now. There is all the time in the world, for once.'),
    ],
  },
  // M56: the disclosure (Alric says plainly what Rekindle costs with Cael's Scars)
  'a5f-m56-told': {
    lines: [
      { s: 'alric', t: 'It is over. He is ash. And the Anvil is still warm, and you are still holding the shard.', fx: [{ startQuest: 'm56' }] },
      AL('There are two ways to end this, and I will not pretend there is a third.'),
      C('Tell me both. All of it. Nobody told him.'),
      AL('No. Nobody told him. So I will tell you, slowly, and you will let me finish.'),
      AL('The shard in your hand is the last of what he took from the keepers. It is not a weapon any more. It is a choice.'),
      C('Go on.'),
      AL('Whatever you do with it, the land changes. Not a little. All of it, from here to the sea.'),
      AL('Rekindle: you pour the Heartshard into the Anvil. The forge wakes, the land warms, the blight burns out. The way it was meant to be.'),
      AL('Let it die: you keep the shard and walk away, and the Anvil goes cold for good. The keepers wake, all of them, and warm the land themselves, the slow way.'),
      when(AL('With the Scars you carry, Rekindle will not take you with it. It will hurt. You will live.'), flagIs(M56_SCAR_BAND, 'light')),
      when(AL('I will say it plainly, because nobody said it to Ulthred: with that many Scars, the fire will take you with it. Rekindle, and you do not walk off this island.'), not(flagIs(M56_SCAR_BAND, 'light'))),
      when(AL('Your Sister\'s rite is still unspent. She is at the camp. One Scar, lifted: if you are close to the line, it may be the difference.'), riteUnused),
      { s: 'alric', t: 'Talk to them first. Ysmeryth is at the edge. Your people are by the causeway. Then come back to me.', fx: [{ setFlag: M56_TOLD, value: true }] },
    ],
  },
  'a5f-m56-wait': { lines: [AL('Talk to them first. Ysmeryth, and your people. I will not be going anywhere.')] },
  // M56: the choice (2 lines, the choice; each choice has a confirm step)
  'a5f-m56-choice': {
    lines: [
      AL('Well, knight. The Anvil is listening.'),
      AL('They are all up on the rim, waiting to see which way the light goes.'),
      C('Whatever I choose, they will live with it longer than I will.'),
      {
        s: 'alric', t: 'What will it be?',
        choices: [
          { id: 'rekindle', t: 'Rekindle the Anvil.', go: 'a5f-m56-confirm-rekindle' },
          { id: 'let-it-die', t: 'Let it die.', go: 'a5f-m56-confirm-let-it-die' },
          { id: 'later', t: 'Not yet.', go: null },
        ],
      },
    ],
  },
  'a5f-m56-confirm-rekindle': {
    lines: [
      when(AL('The shard into the fire. You will live through it. Are you certain?'), flagIs(M56_SCAR_BAND, 'light')),
      when(AL('The shard into the fire, and you with it. Are you certain?'), not(flagIs(M56_SCAR_BAND, 'light'))),
      {
        s: 'alric', t: 'Once it is poured, it is poured.',
        choices: [
          { id: 'confirm', t: 'I am certain. Rekindle it.', go: 'a5f-m56-after-rekindle', fx: [{ event: M56_CONFIRM_EVENT, payload: { choice: 'rekindle' } }] },
          { id: 'back', t: 'Wait. Let me think again.', go: 'a5f-m56-choice' },
        ],
      },
    ],
  },
  'a5f-m56-confirm-let-it-die': {
    lines: [
      AL('No forge, then. The keepers wake, the land warms slowly, and nobody ever sits on that anvil again. Are you certain?'),
      {
        s: 'alric', t: 'Once it goes cold, it stays cold.',
        choices: [
          { id: 'confirm', t: 'I am certain. Let it die.', go: 'a5f-m56-after-let-it-die', fx: [{ event: M56_CONFIRM_EVENT, payload: { choice: 'let-it-die' } }] },
          { id: 'back', t: 'Wait. Let me think again.', go: 'a5f-m56-choice' },
        ],
      },
    ],
  },
  // the aftermath (12 each), before the ending director takes over
  'a5f-m56-after-rekindle': {
    lines: [
      C('I take the shard in both hands. It is warm, the way a hand is warm.'),
      C('I set it in the crack in the Anvil\'s face, and push.'),
      AL('There. Do you feel it? Under your feet. The whole mountain is breathing in.'),
      C('Light runs down the crack like water finding a channel. The Anvil rings, once, so low I feel it in my teeth.'),
      AL('A thousand years cold, and it remembers how to sing.'),
      when(C('It hurts. It hurts like a burn and a fever at once. Then it stops, and I am still here.'), flagIs(M56_CAEL_LIVES_FLAG, true)),
      when(AL('You are still here. Look at your hands. Still yours.'), flagIs(M56_CAEL_LIVES_FLAG, true)),
      when(C('It does not stop. The light goes up my arms, and it is not cruel. It is only very bright.'), flagIs(M56_CAEL_LIVES_FLAG, false)),
      when(AL('I am here, knight. I am not leaving. Let it go now. Let it go.'), flagIs(M56_CAEL_LIVES_FLAG, false)),
      AL('Up on the rim they will see it. Every hearth from here to Harrowmark will catch at once.'),
      C('The keepers on the terraces lift their heads. They do not roar. They are listening, too.'),
      AL('The blight cannot stand heat like this. It will burn out of the ground by spring.'),
      C('And the keepers?'),
      AL('They will sleep easy. The chains are gone; the fire keeps itself now. Nobody needs their hearts.'),
      when(AL('Go up, knight. They will want to see you. Tell them the forge is lit.'), flagIs(M56_CAEL_LIVES_FLAG, true)),
      when(AL('I will tell them. I will tell them who lit it.'), flagIs(M56_CAEL_LIVES_FLAG, false)),
      { s: 'alric', t: 'The Anvil of Ages is burning again.', fx: [{ setFlag: M56_AFTER_SEEN, value: true }] },
    ],
  },
  'a5f-m56-after-let-it-die': {
    lines: [
      C('I close my hand around the shard and step back from the Anvil.'),
      AL('Then that is that.'),
      C('The glow in the crack goes from orange to red to the grey of old coals. It takes a long time. Nobody speaks.'),
      AL('A thousand years it burned. I thought I would feel worse.'),
      C('Up on the terraces, something answers. Then something else. Then all of them.'),
      AL('The keepers. Every one of them, awake at once. Listen to that.'),
      C('Wyrm-breath lights the rim in blue and orange, the slow, careful fire they keep in their chests.'),
      when(AL('They are strong. They will warm the land for a long time before they tire.'), flagIs(M56_SCAR_BAND, 'light')),
      when(AL('The shard\'s Scars are on you, and on them too. They will tire sooner than I would like. But they will try.'), not(flagIs(M56_SCAR_BAND, 'light'))),
      AL('No more Ash Kings. No more hearts in jars. Nobody sits on that anvil ever again.'),
      C('Ash comes down like snow, very soft, and settles on the Anvil\'s face.'),
      AL('It will be a long dawn. But it is a dawn.'),
      AL('Come on, knight. They will want to see you up on the rim.'),
      { s: 'alric', t: 'The Anvil of Ages is cold.', fx: [{ setFlag: M56_AFTER_SEEN, value: true }] },
    ],
  },
  'a5f-m56-done': { lines: [AL('It is done. Whatever it is now, it is done.')] },
};

// ---- Ulthred's voice through the walls (M54, 12 nodes): Ebba's music-box hum, then words --------------------------------
export const ULTHRED_VOICE_TREE: BuiltTree = buildTree({
  id: `npc-${M54_VOICE}`,
  start: [{ when: all(), seg: 'idle' }],
  segments: {
    idle: {
      lines: [
        C('A hum in the stone. I know it. It is the tune from Ebba\'s music box, the one she wound for me in Kettlewick.'),
        UL('Do you know it? Somebody always knows it. I made it for my daughter, before the fire.'),
        C('Who are you?'),
        UL('A smith. The first one. They called me a king, after. Kings are only smiths who stopped working.'),
        UL('You have come a long way down for a man who is only a voice in the walls.'),
        UL('I felt you on the stair. I felt the shard. It sings when it is near the Anvil, did you know? It wants to come home.'),
        C('It is not yours.'),
        UL('No. It was never mine. That is the whole of my story, in four words.'),
        UL('Look at the walls as you come. My stonecutters painted it all, once. Then they tried to paint over the worst of it.'),
        UL('I am in the hall. I will not hurt you. Not yet. I have been alone a very long time, and I would like to talk.'),
        C('And after you have talked?'),
        { s: M55_ULTHRED, t: 'After, we will see what your arm is worth. Come down, bearer.', fx: [{ setFlag: M54_VOICE_SEEN, value: true }] },
      ],
    },
  },
});

// ---- Ulthred in the Hammer Hall (M55): the parley (24 nodes with Cael's answer, 4) ----------------------------------------
export const ULTHRED_SPIRIT_TREE: BuiltTree = buildTree({
  id: `npc-${M55_ULTHRED}`,
  start: [
    { when: any(offer('m55'), at('m55', 'parley')), seg: 'parley' },
    { when: at('m55', 'trial'), seg: 'trial' },
    { when: at('m55', 'verdict'), seg: 'verdict' },
    { when: qActive('m55'), seg: 'after' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    parley: {
      lines: [
        { s: M55_ULTHRED, t: 'There you are. Sit, if you like. The floor is warm. Everything down here is warm.', fx: [{ startQuest: 'm55' }] },
        UL('I am Ulthred. I made the Anvil, and the hammer, and the chains. I made the song your little friend in Kettlewick winds up in a box.'),
        C('You chained the keepers.'),
        UL('I did. The land was cold, and the keepers were warm, and I was clever. That is how most terrible things begin: somebody cold and clever.'),
        UL('I told myself it was a loan. A little of their fire, for a little while, until the land could keep itself.'),
        UL('A little while became a thousand years. The land never learned to keep itself. Why would it, with a forge doing the work?'),
        C('Why tell me this?'),
        UL('Because you are carrying the last piece of what I took, and you have a choice I never had. I would like you to make it knowing.'),
        UL('And because I am tired, bearer. You have no idea how tired.'),
        {
          s: M55_ULTHRED, t: 'So. Tell me, before we go further. What do you want, at the end of all this?',
          choices: [
            { id: 'warm', t: 'A warm land. People not dying of the cold.', go: 'parley-answer' },
            { id: 'free', t: 'The keepers free. Whatever it costs.', go: 'parley-answer' },
            { id: 'home', t: 'To go home. That is all.', go: 'parley-answer' },
            { id: 'stop', t: 'To stop you. Nothing more.', go: 'parley-answer' },
          ],
        },
      ],
    },
    'parley-answer': {
      lines: [
        UL('A good answer. Every answer is good, down here. It is what you do with it that is not.'),
        UL('I will tell you a true thing now, and you will not like it.'),
        UL('I want out. I want out of this anvil so badly that I will wear whoever carries a shard. I cannot help it. It is what the chains made me.'),
        C('So you mean to take me.'),
        UL('I mean to try. I will be sorry while I do it. I am always sorry.'),
        UL('You could leave now. Go back up, keep the shard, never come down here again. I would not blame you.'),
        C('And the Anvil?'),
        UL('Will go on burning, a little less each year, until somebody braver or more foolish than you comes down to finish it.'),
        UL('But you will not leave. I can see it on you. You are the staying kind.'),
        UL('So let me see your arm, first. Not to fight. Not yet. A trial: three rounds of my hammer, and you stand up after each.'),
        UL('It cannot kill you. I will not let it. I only want to know what I am going to be wearing.'),
        UL('There is a stone by your feet. Put your hand on it when you are ready.'),
        { s: M55_ULTHRED, t: 'Take your time. I have plenty.', fx: [{ setFlag: M55_PARLEY_SEEN, value: true }] },
      ],
    },
    trial: { lines: [UL('The stone, bearer. Your hand on it, and we begin. Three rounds; stand up after each.')] },
    verdict: {
      lines: [
        UL('Three rounds, and you stood up after every one. Do you know how long it has been since anyone stood up?'),
        UL('You have a good arm. A stubborn back. And you are kind, which is the most dangerous thing a bearer can be.'),
        C('Dangerous to whom?'),
        UL('To me, bearer. Go to your stoker now. When you come back, I will not be able to hold myself still.'),
      ],
    },
    after: { lines: [UL('Good arm. Strong. Stubborn. Go and talk to the old stoker; he is frightened for you, and he is right.')] },
    idle: { lines: [UL('Not yet, bearer. Soon.')] },
  },
});

// ---- M56 on the Anvil: Ysmeryth at the edge (6) and Ulthred's last (6), on Ysmeryth's tree --------------------------------
export const YSMERYTH_M56_RULES: StartRule[] = [{ when: at('m56', 'ysmeryth'), seg: 'a5f-m56-ysmeryth' }];
export const YSMERYTH_M56_SEGMENTS: Record<string, Segment> = {
  'a5f-m56-ysmeryth': {
    lines: [
      YS('Little bearer. You smell of him. Of ash and old iron.'),
      YS('I was chained to that anvil before your grandmother\'s grandmother was born. I remember the cold before it. I remember the warmth after.'),
      C('What do you want me to do?'),
      YS('Want? Keepers do not want. We keep. Whatever you choose, we will keep it.'),
      YS('If the forge burns, we will sleep easy and dream of the sky. If it dies, we will wake and fly and warm the land with our own breath. Both are a kind of keeping.'),
      YS('Listen. The ash is speaking. He is not quite gone.'),
      UL('Bearer. I am only embers now. A little warmth in the crack. I will not last the hour.'),
      UL('I was only the first. There were others: my apprentices, each bound to a lesser anvil, far from here. They will feel this, whatever you do.'),
      UL('If you light it, they will beg for rest. If you let it die, they will wake angry. Be kind to them, if you meet them. They were only children when I chained them.'),
      C('Why tell me now?'),
      UL('Because nobody told me. That is the last of my sorry.'),
      { s: M55_ULTHRED, t: 'Choose well, bearer. Then let me go out.', fx: [{ setFlag: M56_YSMERYTH_SEEN, value: true }] },
    ],
  },
};

// ---- M56: the company by the causeway (Tobb, Hrolf, Aelfreda 4 each, Edric 4) ---------------------------------------------
export const M56_COMPANY_TREE_DEF: BuiltTree = buildTree({
  id: M56_COMPANY_TREE,
  start: [{ when: all(), seg: 'idle' }],
  segments: {
    idle: {
      lines: [
        TO('I came down to see the end. That is what bards are for. Somebody has to be there to see it.'),
        TO('Whatever you pick, I will make it sound braver than it felt. That is also what bards are for.'),
        TO('I have the last verse ready. Two last verses, in fact. I wrote both, in case.'),
        C('Which one is better?'),
        C('And if it goes badly?'),
        TO('Then I will make it sound braver still. Go on. We are all here.'),
        HR('Hrolf has stood beside you since the bridge in Cinderreach. Hrolf will stand beside you now.'),
        HR('Hrolf does not understand forges. Hrolf understands that you are tired, and that you are going to do the hard thing anyway.'),
        HR('Whatever happens, there will be a cup on Hrolf\'s table with your name on it.'),
        HR('Do not make Hrolf drink it alone.'),
        AE('I have prayed over a great many fires, knight. None like this one.'),
        when(AE('My rite is still unspent. If you want it, come back to the camp with me before you choose. One Scar, lifted.'), riteUnused),
        AE('Whatever you choose, it will be a good choice, because you chose it with your eyes open.'),
        AE('That is more than he ever did.'),
        ED('Knight. I came down because a king should see what his kingdom costs.'),
        ED('My father would have told you what to do. I will not. It is not mine to choose.'),
        ED('But I will remember it, whatever it is. Harrowmark will remember it.'),
        { s: 'edric', t: 'Go on. We will be here when it is done.', fx: [{ setFlag: M56_COMPANY_SEEN, value: true }] },
      ],
    },
  },
});
export { M56_COMPANY_NPC };
