// Wenna (R21, and her word for Orrin in M36), Orrin the Grisel steward (M35 and M36), Tobb (M37's offer) and Gaut (M37's quiet
// word on the inn stair). Each extends a shipped tree; the extension's rules go first, so they only speak while Act 4 is live.
import { buildTree } from '../../act2/build';
import { all, flagIs, not, objDone, qActive } from '../../act2/cond';
import { M36_DELEGATE, M36_SPY, M36_WENNA_WORD } from '../../../../quests/content/act4/harrowmark/m36.quest';
import { R21_ALL_FLAG, R21_CHOICE } from '../../../../quests/content/act4/harrowmark/r21.quest';
import { C, at, offer, voice, when } from './common';

const WE = voice('wenna');
const O = voice('grisel-steward');
const T = voice('tobb');
const G = voice('gaut');

const ORRIN = M36_DELEGATE('grisel');

export const WENNA_A4 = buildTree({
  id: 'npc-wenna',
  start: [
    { when: at('r21', 'report'), seg: 'a4-r21-report' },
    { when: all(qActive('m36'), not(objDone('m36', 'grisel')), not(flagIs(M36_WENNA_WORD))), seg: 'a4-m36-word' },
    { when: offer('r21'), seg: 'a4-r21-brief' },
    { when: qActive('r21'), seg: 'a4-r21-wait' },
  ],
  segments: {
    'a4-m36-word': {
      lines: [
        WE('You are going to Orrin. I can see it on you. He is frightened, not bought: my father holds his sister\'s house over his head.'),
        WE('Tell him I said this. If the Council stands, I will stand between his sister and my father myself. He has known me since I was six. He will believe it.'),
        { s: 'cael', t: 'I will tell him.', fx: [{ setFlag: M36_WENNA_WORD, value: true }] },
      ],
    },
    'a4-r21-brief': {
      lines: [
        WE('The miners who chose me over my father are hiding in the Guild Quarter cellars. Forty of them, with their families.'),
        WE('My father\'s men are hunting them for the Regent, cellar by cellar. They are Grisel men. They drank with my miners a year ago.'),
        C('Where do they go?'),
        WE('Out. There is a sewer grate at the river wall that the old smugglers used. Past the back lanes, past a patrol, under the wall.'),
        WE('Old Hebba keeps the cellar door. She will let you in if you say my name. Scout the lanes first: if they see you, they will move the patrol.'),
        WE('I have to choose who goes first, and I cannot. The leaders, three of them, will be quick and quiet. All of them, and we need two trips and a lot of luck.'),
        {
          s: 'wenna', t: 'Which would you do?',
          choices: [
            { id: 'leaders', t: 'The leaders first. Quick and quiet; the rest follow when they can.', go: 'a4-r21-leaders', fx: [{ startQuest: 'r21' }, { setFlag: R21_CHOICE, value: 'leaders' }, { favour: 'grisel', delta: 2 }] },
            { id: 'all', t: 'All of them. Nobody stays behind for your father.', go: 'a4-r21-all', fx: [{ startQuest: 'r21' }, { setFlag: R21_CHOICE, value: 'all' }, { setFlag: R21_ALL_FLAG, value: true }, { favour: 'grisel', delta: 6 }] },
            { id: 'later', t: 'Let me think.', go: null },
          ],
        },
      ],
    },
    'a4-r21-leaders': { lines: [WE('The leaders, then. They will send for the others when they are safe. I hope they are safe.')] },
    'a4-r21-all': { lines: [WE('All of them. Two trips, then, and the patrol doubled once they know. Thank you. I could not have said it myself.')] },
    'a4-r21-wait': { lines: [WE('Hebba at the cellar door, the back lanes, the patrol, then the grate. Walk them slowly; there are children.')] },
    'a4-r21-report': {
      lines: [
        WE('They are out. Hebba sent a boy to tell me. Under the wall and down the river, and not one of them lost.'),
        when(WE('Three of them, and the rest still waiting. They will go when the leaders send word. I will pray the word comes.'), flagIs(R21_CHOICE, 'leaders')),
        when(WE('All of them. Every miner who chose me, and their children. My father will hear of it before supper, and I do not care.'), flagIs(R21_CHOICE, 'all')),
        C('Your father\'s men were in the lanes. They knew where to look.'),
        WE('They did. They used to drink with them. That is the worst of it, {name}: not that he is cruel, but that he makes everyone around him cruel too.'),
        WE('My signet. The miners will know it anywhere. If you ever need a Grisel door opened, show it.'),
      ],
    },
  },
});

export const ORRIN_A4 = buildTree({
  id: 'npc-grisel-steward',
  start: [
    { when: at('m35', 'grisel'), seg: 'a4-m35-grisel' },
    { when: at('m36', 'grisel'), seg: 'a4-m36-grisel' },
  ],
  segments: {
    'a4-m35-grisel': {
      lines: [
        O('You are the King\'s knight. Good. I did not think anyone would come for us.'),
        O('The gate guard has kept the chain down since dawn. He says it is broken. It is not broken; I watched him lower it.'),
        C('Then I will raise it, and he can read the Council writ while I do.'),
        O('Lord Aldous is not with us. He sends me, and two guards, and his apologies. He has a cold, he says.'),
      ],
    },
    'a4-m36-grisel': {
      lines: [
        O('I know why you are here. Everyone in this city knows why everyone else is anywhere.'),
        O('I cannot vote with the King. I would like to, but I cannot.'),
        C('Because Aldous holds your sister\'s house over your head. I read your letter-case.'),
        O('Then you know. One word from him and she is on the road with nothing. She is sixty-one.'),
        {
          s: 'grisel-steward', t: 'So what would you have me do, knight?',
          choices: [
            { id: 'letters', t: 'I have Aldous\'s own letters to the Regent. If the Council stands, he falls with what he wrote.', when: flagIs(M36_SPY.flag, M36_SPY.equals), go: 'a4-m36-won', fx: [{ setFlag: ORRIN, value: 'won' }, { favour: 'grisel', delta: 5 }] },
            { id: 'wenna', t: 'Wenna says she will stand between your sister and her father herself.', when: flagIs(M36_WENNA_WORD), go: 'a4-m36-won', fx: [{ setFlag: ORRIN, value: 'won' }, { favour: 'grisel', delta: 5 }] },
            { id: 'threaten', t: 'Vote with the King, or I tell the Council who you are afraid of.', go: 'a4-m36-lost', fx: [{ setFlag: ORRIN, value: 'lost' }, { favour: 'grisel', delta: -2 }] },
          ],
        },
      ],
    },
    'a4-m36-won': { lines: [O('Then I can breathe. Tell the King he has my voice. Tell Lady Wenna I will hold her to it.'), O('Go, before someone sees me smiling.')] },
    'a4-m36-lost': { lines: [O('You would do that. I believe you would.'), O('Then I will vote as I must, and you will have frightened an old man for nothing. Go.')] },
  },
});

export const TOBB_A4 = buildTree({
  id: 'npc-tobb',
  start: [
    { when: offer('m37'), seg: 'a4-m37-brief' },
    { when: qActive('m37'), seg: 'a4-m37-wait' },
  ],
  segments: {
    'a4-m37-brief': {
      lines: [
        T('Right. That\'s every job in the city done, and the Council sits in the morning. You know what that means.'),
        C('It means we should sleep.'),
        T('It means we should eat. I\'ve had the Anvil\'s cook on it since noon. Pie, ale, the good bread, and a ham I am not telling you how I got.'),
        T('Hrolf\'s coming, and the Sister. Gaut said he might. He won\'t sit, but he\'ll stand by the back stair and pretend he isn\'t listening.'),
        T('One thing, and then I\'ll stop being serious. Tomorrow the Council sits, and whatever happens in that hall, the city might not be ours by dark.'),
        T('Anything you still mean to do in Harrowmark, do it tonight. After the vote, there may be no going back through those gates.'),
        {
          s: 'tobb', t: 'So. Supper?',
          choices: [
            { id: 'accept', t: 'Supper. Lead on.', go: null, fx: [{ startQuest: 'm37' }] },
            { id: 'later', t: 'Not yet. There is something I have to finish.', go: null },
          ],
        },
      ],
    },
    'a4-m37-wait': { lines: [T('The table\'s set and the ale\'s pulled. Sit, eat, talk to us. The Council can wait till morning.')] },
  },
});

export const GAUT_A4 = buildTree({
  id: 'npc-gaut',
  start: [{ when: at('m37', 'gaut'), seg: 'a4-m37-gaut' }],
  segments: {
    'a4-m37-gaut': {
      lines: [
        G('Sit with me a moment. Not at the table. Here, where it is quiet.'),
        G('I knighted you in a field with frost on it, and I thought I was giving a farm boy a name to grow into.'),
        C('You were.'),
        G('I was wrong. You have grown past it. Tomorrow you stand at the King\'s shoulder in a hall full of men who want him dead.'),
        G('I will not be in the hall. My knees will not climb those stairs fast enough if it goes wrong, and you will need to be fast.'),
        G('So I will say it now, while I can. Whatever comes, I am proud of you. That is all. Go back to your supper.'),
        C('Thank you, Gaut.'),
      ],
    },
  },
});
