import { buildTree, type Line, type ChoiceSpec } from '../build';
import { all, flagIs, objDone, objOpen, qActive, step, not } from '../cond';

const compromise = flagIs('story.r10.branch', 'compromise');

/** One persuasion round of R10's compromise: the case is made with the evidence read, with standing, or not at all (a hint, then again). */
export function roundChoices(n: 1 | 2 | 3): ChoiceSpec[] {
  const won = [{ setFlag: `story.r10.p.${n}`, value: true }, { event: 'story.r10.persuaded', payload: { n: String(n) } }] as ChoiceSpec['fx'];
  return [
    { id: 'evidence', t: 'Put the ledgers, the injury roll and the orders on the table, and read them aloud.', go: `r10-round-${n}-won`, when: objDone('r10', 'read'), fx: won },
    { id: 'standing', t: 'Remind them whose Writ is in your satchel, and who stands behind it.', go: `r10-round-${n}-won`, when: { favour: 'grisel', atLeast: 10 }, fx: won },
    { id: 'bluff', t: 'Tell them the Council will order it settled, whatever they say.', go: `r10-round-${n}-hint` },
  ];
}

export const roundStart = (n: 1 | 2 | 3) => all(qActive('r10'), compromise, objOpen('r10', 'talks'), not(flagIs(`story.r10.p.${n}`)));

/** The six nodes of a round: the openers, the case (a choice), and the answer (won or a hint). */
export function roundSegments(speaker: string, n: 1 | 2 | 3, openers: string[]): Record<string, { lines: Line[]; then?: string | null }> {
  const S = (t: string): Line => ({ s: speaker, t });
  return {
    [`r10-round-${n}`]: {
      lines: [
        ...openers.map(S),
        S('You have heard both halls. You have read what each has kept. I will not pretend I am easy to move.'),
        { s: speaker, t: 'Say your piece, then. I have heard worse.', choices: roundChoices(n) },
      ],
    },
    [`r10-round-${n}-won`]: { lines: [S('...All right. That is not a case I can answer.'), S('Tell the foreman I will sit, if the others sit.')] },
    [`r10-round-${n}-hint`]: { lines: [S('A bluff is a bluff, whoever is bluffing. Bring me something I can read, or someone I must listen to, and I will listen.')] },
  };
}

const line = (s: string) => (t: string): Line => ({ s, t });

const G = line('steward-gate-1');
const GATE = buildTree({
  id: 'npc-steward-gate-1',
  start: [
    { when: all(qActive('m16'), objDone('m16', 'ambush'), objOpen('m16', 'gate')), seg: 'm16-gate' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'm16-gate': {
      lines: [
        G('Halt there. Name and purpose, and keep your hands where my captain can see them.'),
        G('A Knight of the Order of the Hearth. Lord Aldous said we might expect one. He did not say you would arrive with hound-blood to your knees.'),
        G('Put aside the sword. Not the blade, the intent. We have a strike on and nobody is in a mood to see steel.'),
        G('You are expected at the hall. Straight up the road, past the market, no side turnings. My lord waits in the forecourt, and not patiently.'),
        G('And a word, Knight: do not mention the pass toll to him. He is sensitive on the subject, and I like my position.'),
        G('Go. Lord Grisel is at the forecourt braziers.'),
      ],
    },
    idle: { lines: [G('Keep to the road. We have a strike on, and stewards do not like surprises.')] },
  },
});

const E = line('steward-hall-1');
const HALL = buildTree({
  id: 'npc-steward-hall-1',
  start: [
    { when: step('m21', 'counsel', 'escort'), seg: 'm21-escort' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'm21-escort': {
      lines: [
        E('Lady Wenna said you would come. This way, Knight. Mind the study door; it sticks.'),
        E('Lord Aldous receives at the dais. He is in a mood to talk, which is rarer than you think.'),
        E('The hall is not what it was. Half of the old furniture went to pay the stewards, and the other half went to pay the miners.'),
        E('If you want to know what he is like, ask yourself what a man is like who has not slept since the Ember died.'),
        E('The study is on your left. Lord Aldous keeps his papers there. I did not tell you that.'),
        E('The audience is at the dais. I shall wait by the door.'),
      ],
    },
    idle: { lines: [E('Keep to the carpets. The stones are older than the House, and just as unforgiving.')] },
  },
});

const H = line('steward-market-1');
const HALSE = buildTree({
  id: 'npc-steward-market-1',
  start: [
    { when: step('r10', 'miners', 'stewards'), seg: 'r10-office' },
    { when: roundStart(2), seg: 'r10-round-2' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'r10-office': {
      lines: [
        H('Steward Halse. I keep the rolls, the keys and the peace, in that order, and the peace is the one I am worst at.'),
        H('Foreman Slagg has told you his side. I do not doubt he has told it well. He has a gift for it.'),
        H('The pay is late because the pay is short, and the pay is short because Lord Aldous\'s accounts have a hole in them. I did not dig it.'),
        H('The Writ says we are to hold the line. So I hold the line. If I did not, there would be nothing between this market and a riot.'),
        { s: 'cael', t: 'The miners say they are owed a sixth of every shift.' },
        H('They are. I have the numbers, and they are not in dispute. They are in a drawer.'),
        H('The lord is not a cruel man. He is a frightened one, and frightened men sign things.'),
        { s: 'cael', t: 'And you?' },
        H('I am a clerk with a key ring. I have written a petition. I have not sent it. A clerk who sends petitions is a clerk who finds himself unemployed.'),
        H('If you find something in the stalls, or in the hall, that makes it plain, you will have done what I could not.'),
        H('Read what each side has kept. Then decide. And, Knight: whatever you decide, I will do what is ordered, and be ashamed of it.'),
        H('The market stalls hold copies of everything. Nobody burns paper in Deepgate. It is the one extravagance we cannot afford.'),
      ],
    },
    ...roundSegments('steward-market-1', 2, ['Back again? The foreman has talked to you, and so have I. What more is there to say?', 'Halse the clerk, Halse the key ring. I am the one you must move, they say.']),
    idle: { lines: [H('The keys are on my belt, the peace is on my conscience, and the pay is in a drawer. That is Deepgate, Knight.')] },
  },
});

const K = line('steward-market-2');
const CLERK = buildTree({
  id: 'npc-steward-market-2',
  start: [
    { when: step('r09', 'office', 'clerk'), seg: 'r09-clerk' },
    { when: roundStart(3), seg: 'r10-round-3' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'r09-clerk': {
      lines: [
        K('The paymaster\'s clerk, Knight. I wrote the ledger. I did not write the lines you have read in it.'),
        K('The chests went down the cellar stairs the night of the strike vote. Our orders were to put the coin where "a hungry man cannot find it". I carried one down myself.'),
        K('When the crawlers came up the stairs I locked the door and prayed. I am sorry for what that was worth.'),
        K('If the stewards have the coin back, the pay will be paid, late, and with every line audited. If the miners share it, it is theirs, and there will be no audit at all.'),
        K('Both are honest answers. One of them is lawful.'),
        K('I will say what the House will say: bring the chests to the stewards. I will say what I think: bring them to whoever is hungry.'),
      ],
    },
    ...roundSegments('steward-market-2', 3, ['Foreman Slagg told you to find me. I wrote the ledgers; I can tell you which of them are lies. The answer is: most.', 'Everything in the stewards\' office I copied by hand, twice.']),
    idle: { lines: [K('The paymaster is not in. The paymaster has not been in for some weeks.')] },
  },
});

export const STEWARD_TREES = [GATE, HALL, HALSE, CLERK];
