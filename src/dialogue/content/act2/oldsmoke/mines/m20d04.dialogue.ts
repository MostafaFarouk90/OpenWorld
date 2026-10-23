// M20 Chain and Ember and D04 The Deepdelve Descent: the two new minor NPCs (steward-captain, wyrmling-keeper) and the
// extensions to Wenna's and Slagg's trees. Every segment id starts `a2-m20-` or `a2-d04-`, so a node never clashes with
// the base trees (`extendTree` checks) or with another quest's extension. Node counts on the shortest path: M20 32 (Wenna
// 8, captain 8, keeper 6, aftermath 10 with the four top-up nodes), D04 20 (Slagg 8, then 12 with the three top-ups).
import { buildTree, type BuiltTree, type Line } from '../../build';
import { all, objDone, objOpen, qActive, qDone, qIdle, step } from '../../cond';

const line = (s: string) => (t: string, fx?: Line['fx']): Line => (fx ? { s, t, fx } : { s, t });
const C = line('cael');
const W = line('wenna');
const CAP = line('steward-captain');
const K = line('wyrmling-keeper');
const S = line('slagg');

// ---- M20 -----------------------------------------------------------------------------------------------------------

const CAPTAIN = buildTree({
  id: 'npc-steward-captain',
  start: [
    { when: step('m20', 'stewards', 'captain'), seg: 'a2-m20-captain' },
    { when: qActive('m20'), seg: 'a2-m20-captain-wait' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'a2-m20-captain': {
      lines: [
        CAP('Enough. Enough! Stand down, all of you. There is no one left to stand.'),
        C('Your stewards chose the blade. I only answered it.'),
        CAP('They chose what I told them to choose. Hobb Varley, steward-captain of the Lower Galleries, eleven years in this gallery and a day longer than I wanted.'),
        CAP('You will want to know what you have walked into. Wyrmlings, five of them, chained to the wall by order of Lord Aldous, to be sold by the winter road. I counted them in, I counted them out.'),
        C('And the one in the roof?'),
        CAP('Orsk. The old one. I was told to keep him fed on ash and never to look him in the eye. I looked once. It is why I drink.'),
        CAP('The chains are iron, the posts are set in the rock, and I have the only keys. They are the wrong keys. I have always known. The chains were never meant to open.'),
        CAP('Break them if you will. I will not stop you, and I will not help you, and when the roof sings I intend to be as far from this gallery as my legs will carry me.'),
      ],
    },
    'a2-m20-captain-wait': { lines: [CAP('The chains are on the posts, not the wall. Break them where they are bolted. And keep away from the roof when the last one goes.')] },
    'idle': { lines: [CAP('Lower Galleries, and no one in them who ought to be. I am only passing through.')] },
  },
});

const KEEPER = buildTree({
  id: 'npc-wyrmling-keeper',
  start: [
    { when: step('m20', 'search', 'keeper'), seg: 'a2-m20-keeper' },
    { when: qActive('m20'), seg: 'a2-m20-keeper-wait' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'a2-m20-keeper': {
      lines: [
        K('You have read the board and the ledger. Then you know what I was paid for. Tamsin Roke, wyrmling-keeper, and I fed them ash for two winters.'),
        C('Why did you stay?'),
        K('Because someone had to hold the bucket. Because they bite less when the same hand feeds them. Because I told myself it was kinder than a stranger.'),
        K('The chains are not what keeps them in. The chains are what keeps them small. Take the last one off and listen to the roof. You will understand.'),
        C('And when the wyrmlings are free?'),
        K('They go up. They always go up. They will not harm you. They do not know yet that they could.'),
      ],
    },
    'a2-m20-keeper-wait': { lines: [K('Gently with the posts. They have not been touched without a leash in two winters. They will not know what to do.')] },
    'idle': { lines: [K('Quiet, now. It is only the shaft settling.')] },
  },
});

/** Wenna: the offer after M19 (the brief), the wait, and the aftermath once Orsk is gone. */
const WENNA_EXT = buildTree({
  id: 'npc-wenna',
  start: [
    { when: all(qActive('m20'), objDone('m20', 'gone'), objOpen('m20', 'aftermath')), seg: 'a2-m20-aftermath' },
    { when: qActive('m20'), seg: 'a2-m20-wait' },
    { when: all(qDone('m19'), qIdle('m20')), seg: 'a2-m20-offer' },
  ],
  segments: {
    'a2-m20-offer': {
      lines: [
        W('The nursery was only the front of it. What my father sells comes out of a gallery below this one, and I have never had the key.'),
        C('You know where it is.'),
        W('I know how to reach it. I never went in. A Grisel does not need to go into a room to be answerable for what is kept there.'),
        W('Eight stewards hold it. Not my father\'s best, but loyal enough to be dangerous, and they have been told that anyone who comes down is a thief. Do not expect them to talk.'),
        C('And then?'),
        W('Chains. Five of them, bolted to posts along the far wall, and a wyrmling on each. They are children, Knight. Young as the cubs your hounds would have had.'),
        W('There is something beyond them that the stewards will not name. It is old, it is chained, and it has been awake a long time.'),
        W('Then go down. I will wait at the lift, and I will not pretend that I am not afraid for you.', [{ startQuest: 'm20' }]),
      ],
    },
    'a2-m20-wait': { lines: [W('The stewards first, then the chains. Go gently with the young ones. They have never been touched by a hand that was not holding a whip.')] },
    'a2-m20-aftermath': {
      lines: [
        W('I heard it from the lift. The whole shaft rang like a bell.'),
        C('Orsk went up through the roof. I have never seen anything so large move so quietly.'),
        W('Quiet is the wrong word. He has been waiting a hundred winters to be loud.'),
        W('The wyrmlings?'),
        C('Free. They went up after him.'),
        W('Then my father has lost his stock and his guardian in one morning, and he does not yet know it.'),
        W('I should feel something besides relief. I keep waiting for it.'),
        C('You went in with me.'),
        W('I stood at the lift. That is not going in. Next time I will not stand at the lift.'),
        W('The Deepdelve is next. Slagg has been talking about it for a month, and I have stopped letting myself hope he is exaggerating. Go and see him.'),
      ],
    },
  },
});

// ---- D04 -----------------------------------------------------------------------------------------------------------

/** Slagg: the offer after M20 (the brief), the waits that follow the descent, and the outcome and hand-in. */
const SLAGG_EXT = buildTree({
  id: 'npc-slagg',
  start: [
    { when: all(qActive('d04'), objDone('d04', 'slagmaw'), objOpen('d04', 'report')), seg: 'a2-d04-report' },
    { when: all(qActive('d04'), objDone('d04', 'pool2'), objOpen('d04', 'slagmaw')), seg: 'a2-d04-wait-arena' },
    { when: all(qActive('d04'), objDone('d04', 'survey')), seg: 'a2-d04-wait-pools' },
    { when: qActive('d04'), seg: 'a2-d04-wait' },
    { when: all(qDone('m20'), qIdle('d04')), seg: 'a2-d04-offer' },
  ],
  segments: {
    'a2-d04-offer': {
      lines: [
        S('{name}. Sit, if the Deepdelve has left you anything to sit on. It is the third level of the pit and it has run hot ever since the lift stopped.'),
        C('What is down there?'),
        S('Everything a shaft could be, and worse. Slag that was cold in my father\'s day is cherry-red now. The crawlers have bred through the old workings like rats. And there is a thing at the bottom that does not like to be looked at.'),
        S('The Slagmaw. I have not seen it. I have heard it, from the second stage, and it is a sound that turns your stomach into a cold cup.'),
        C('You want me to kill it.'),
        S('I want the Deepdelve open. If the Slagmaw is in the way, then yes. But there are two coolant pools between the lift and the bottom, and until they are cooled the arena is not a fight, it is a kiln.'),
        S('Each pool has a ring of valves and a pressure that rises the moment you touch the first. Set them to the marks on the wall and the vents open. Take too long and the valves spring back. It will not hurt you; it is only slow.'),
        S('Go down by the lift in two stages, clear what you find at the second, and read the survey marks on your way. Come back and tell me it is done.', [{ startQuest: 'd04' }]),
      ],
    },
    'a2-d04-wait': { lines: [S('Two stages down, the crawlers and the golem, the marks, the pools. Take it in that order. The pit is patient; it does not need to be rushed.')] },
    'a2-d04-wait-pools': { lines: [S('The marks are on the wall of each valve room, scorched but readable. Set the valves to them before the pressure peaks. It is slower than it sounds and faster than it feels.')] },
    'a2-d04-wait-arena': { lines: [S('Both pools are quiet. The arena door is past the second valve room. Go carefully; the floor is the Slagmaw\'s and it knows every plate.')] },
    'a2-d04-report': {
      lines: [
        S('I felt it through the soles of my boots. The whole Deepdelve shook and then it stopped, and I have never heard a quieter place.'),
        C('It is done. The Slagmaw will not rise again.'),
        S('Then the pit is mine to open. I will tell the crews tonight. They will not believe me until they see a lamp lit in the third level.'),
        S('I will tell you what I did not tell the others. When the lift stopped, I knew what I was sending men down to. I sent them anyway. Three did not come up.'),
        C('You could not have known.'),
        S('I could have asked. I did not want the answer. I have been a foreman twenty years and I have not once wanted the answer.'),
        S('The core it left is yours. It is no ornament. Put it in a forge and the forge will outlive the forger.'),
        S('A hundred years of heat in a lump of black glass. I would not sell it for any price I could name.'),
        S('The pit is open, the miners are working, and Deepgate has a deeper floor than it did. That is no small thing for one week.'),
        S('Whatever Aldous Grisel meant to do with the Deepdelve, he has lost it. I want you to know that.'),
        S('Go on. The capital will want its Knight back, and Lady Wenna has been writing letters about you that I would not like to read aloud.'),
        S('Come and see me when you are next in Deepgate. There will be a lamp.'),
      ],
    },
  },
});

/** New trees for the minor NPCs; the coordinator adds them to the Act 2 dialogue defs and `extendTree`s the extensions. */
export const M20D04_TREES: BuiltTree[] = [CAPTAIN, KEEPER];

export const M20D04_EXTENSIONS: Array<{ baseId: string; ext: BuiltTree }> = [
  { baseId: 'npc-wenna', ext: WENNA_EXT },
  { baseId: 'npc-slagg', ext: SLAGG_EXT },
];
