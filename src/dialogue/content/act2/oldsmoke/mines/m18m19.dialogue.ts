// Dialogue of M18 Breath for the Bellows and M19 What Grisel Hides (A13): new trees for Pike (he has no tree on this branch; A10's
// shop is a separate interactable) and his apprentice, the scenes (the Bellows breathing, the nursery, the six route barks), and
// an extension of Wenna's tree (A4's `npc-wenna`, built in ../wenna.dialogue.ts). Segment and node ids all start `a2-m18-` or `a2-m19-`.
import { buildTree, type BuiltTree, type Line } from '../../build';
import { all, objDone, objOpen, qActive, qDone, qIdle, step } from '../../cond';

const L = (s: string) => (t: string, fx?: Line['fx']): Line => (fx ? { s, t, fx } : { s, t });
const C = L('cael');

// ---- Pike -------------------------------------------------------------------------------------------------
const P = L('pike');
export const PIKE: BuiltTree = buildTree({
  id: 'npc-pike',
  start: [
    { when: all(qActive('m18'), objDone('m18', 'breathe'), objOpen('m18', 'report')), seg: 'a2-m18-report' },
    { when: step('m18', 'apprentice', 'lore'), seg: 'a2-m18-lore' },
    { when: step('m18', null, 'brief'), seg: 'a2-m18-brief-again' },
    { when: all(qActive('m18'), objOpen('m18', 'apprentice')), seg: 'a2-m18-wait-read' },
    { when: all(qActive('m18'), objDone('m18', 'lore'), objOpen('m18', 'crawlers')), seg: 'a2-m18-wait-crawlers' },
    { when: all(qActive('m18'), objDone('m18', 'crawlers'), objOpen('m18', 'rekindle')), seg: 'a2-m18-wait-valves' },
    { when: qActive('m18'), seg: 'a2-m18-wait-breath' },
    { when: qDone('m18'), seg: 'a2-m18-after' },
    { when: all(qDone('m17'), qIdle('m18')), seg: 'a2-m18-offer' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'a2-m18-offer': {
      lines: [
        P('{name}. They said you had been down the shaft, and that the lift runs again. I have waited a long time to say this to someone who could do something about it.'),
        P('The Weeping Bellows. You will have heard the name in a song, if you have heard it at all. It is the breath of the Deepgate forges: six great leather lungs in a cavern under the shaft, and a founder\'s pipe-run that fed every fire in the north.'),
        C('And they are cold.'),
        P('Cold, and choked, and spoiled. The wheels on the mains have been turned out of true, deliberately, and the plaque that says how they should sit has gone green. Nobody has set them right in a generation. I have tended the fire at the collar for thirty years, and I have never once heard her breathe.'),
        P('There is a shrine in the cavern, a forge-shrine like the one on the Hushed Anvil. Light it, and the Bellows are said to give a blessing to whoever stands before them. I am not a man for blessings. But a lit shrine means a living forge under this town, and a living forge means the miners have something to dig for.'),
        C('What does it take?'),
        P('Six valves, six marks on the plaque, and the breath will not wait. It holds for a count of forty-five once the first wheel moves. Then it dies and the wheels swing home, and you begin again. Nothing is lost by a failure but time.'),
        P('When the breath is true, the braziers need lighting in the plaque\'s order. That is a Surge, I am told, and no kindling of mine will do it. It is why I need you, and not a boy with a flint.'),
        P('A word of warning. Something has been nesting in the cavern: slag crawlers, the same brood that came down on you in the shaft. They will not let a man read the plaque in peace.'),
        P('My apprentice, Hob, is already down there with the lanterns. He knows the pipes better than I do now, and he will tell you what he has seen. Read the plaque, read the pipes, and come back to me when you have a head full of numbers.', [{ startQuest: 'm18' }]),
      ],
    },
    'a2-m18-brief-again': { lines: [P('The cavern, {name}. Read the plaque and the pipe run, and hear what Hob has to say. Then come and tell me what you make of it.')] },
    'a2-m18-wait-read': { lines: [P('The plaque and the pipes first, and Hob after. A man should know what he is turning before he turns it.')] },
    'a2-m18-lore': {
      lines: [
        P('Hob told you what he saw? Good. He is a careful lad. He counts the rivets on everything.'),
        P('Then here is the rest. There are six wheels, and each one feeds one lung. The plaque gives, for each wheel, the lung it must feed. Every wheel starts short of its mark, some by a turn, some by two. You turn each until its mark is right.'),
        C('And the clock?'),
        P('The first wheel you move wakes the breath, and the breath runs out in forty-five seconds. Walk the ring, do not run it. Nine turns in all, if I count the plaque right, and I have counted it more often than I have counted my wages.'),
        P('Once the six are true, the lungs fill, and the braziers are the second half. Six of them, on the rim. The plaque shows the order. A Surge lights the one you stand beside, so stand beside the right one.'),
        P('Light one out of turn and they all gutter, and you begin the braziers again. It is a harsh teacher, this machine. It was built by men who did not forgive.'),
      ],
    },
    'a2-m18-wait-crawlers': { lines: [P('The crawlers first. You cannot count the numbers on the plaque with one on your neck.')] },
    'a2-m18-wait-valves': { lines: [P('Six wheels, forty-five seconds, then the braziers. If it fails, it only resets. Take a breath of your own and try again.')] },
    'a2-m18-wait-breath': { lines: [P('Listen. That is the sound of something old deciding whether to wake.')] },
    'a2-m18-report': {
      lines: [
        P('I heard it from the collar. I was standing at the winch with my back to the shaft and I heard her breathe, {name}. A long one. Like a sleeper turning over.'),
        P('Thirty years I have kept the fire up there for a forge that was dead beneath me, and I never said so to anyone. I told the miners it was tradition.'),
        C('The shrine is lit.'),
        P('So the apprentice tells me. He ran up the stairs with his lantern swinging and his mouth wide open, and for a minute I thought he had seen a ghost. Then I heard it, and I thought: no. He has seen a bellows.'),
        P('There is a way open below the cavern now, a gallery the founders cut to bring the breath down to the lower works. The stewards walled it up when the lower galleries were shut. The Bellows have taken the wall down from the other side.'),
        P('I do not know what is in the lower galleries these days, and I do not much like not knowing. But the breath goes where it is sent, and now it is going somewhere again.'),
        P('Take the blessing while it lasts, and make it count. The fire at the collar will burn a good deal brighter tonight.'),
        P('You have done a thing, {name}. I do not say that to everyone. I have said it to nobody for thirty years.'),
      ],
    },
    'a2-m18-after': { lines: [P('The Bellows breathe, and the collar fire burns bright. I did not think I would live to see both.')] },
    'idle': { lines: [P('The shaft is quiet today. That is as it should be. Quiet is the sound of nothing falling.')] },
  },
});

// ---- Pike's apprentice ----------------------------------------------------------------------------
const H = L('pike-apprentice');
export const PIKE_APPRENTICE: BuiltTree = buildTree({
  id: 'npc-pike-apprentice',
  start: [
    { when: step('m18', 'pipes', 'apprentice'), seg: 'a2-m18-apprentice' },
    { when: qDone('m18'), seg: 'a2-m18-apprentice-after' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'a2-m18-apprentice': {
      lines: [
        H('You are the one Master Pike sent! I am Hob. I have been down here since the lift stopped, and nobody has come, and I have talked to the bellows because there was nobody else.'),
        C('Do they answer?'),
        H('No. But I have learned what they sound like when they are not saying anything, and it is a good deal of noise. Mind your head: the crawlers have been getting bold, and they like the dark behind the pipes.'),
        H('I counted the wheels. Six, and every one turned out of true. Someone did that on purpose, a quarter-turn at a time, over years. A wheel does not drift by itself.'),
        H('The plaque has a mark for each wheel. Look at the numbers, not the words. The words are all about patience, and patience is not what the machine wants. It wants arithmetic.'),
        H('Master Pike says the breath only holds for forty-five heartbeats of the clock. I counted my own heartbeats, once, to be sure. They do not agree with the clock. Do not use your heart.'),
        H('The crawlers nested in the cavern while I slept on the stair. I will light the lanterns, and the lanterns will help, but I am not a fighter. Please. Clear them.'),
        H('When you are ready, tell Master Pike what you make of it. He is a hard man to impress, but he is easier after you have broken something.'),
      ],
    },
    'a2-m18-apprentice-after': { lines: [H('She breathes! I sat on the stair all night and I could hear her. Master Pike pretended not to be listening.')] },
    'idle': { lines: [H('The pipes are older than the shaft, you know. I have started to think they are older than the town.')] },
  },
});

// ---- M18: the Bellows breathe ---------------------------------------------------------------------
export const SCENE_M18_BREATH: BuiltTree = buildTree({
  id: 'scene-m18-breath',
  start: [{ when: all(), seg: 'a2-m18-breath' }],
  segments: {
    'a2-m18-breath': {
      lines: [
        P('Do you hear that? Under the stone. It is not a sound, so much as a pressure in the teeth.'),
        P('Six lungs, all filling together. She is breathing, {name}, and she will not stop now.', [{ setFlag: 'story.m18.set', value: true }]),
      ],
    },
  },
});

// ---- M19: Wenna ---------------------------------------------------------------------------------------
const W = L('wenna');
export const WENNA_M19: BuiltTree = buildTree({
  id: 'npc-wenna',
  start: [
    { when: all(qActive('m19'), objDone('m19', 'nursery'), objOpen('m19', 'report')), seg: 'a2-m19-report' },
    { when: all(qActive('m19'), objDone('m19', 'reveal'), objOpen('m19', 'nursery')), seg: 'a2-m19-nursery' },
    { when: all(qActive('m19'), objDone('m19', 'stealth'), objOpen('m19', 'reveal')), seg: 'a2-m19-wait-reveal' },
    { when: all(qActive('m19'), objDone('m19', 'confession'), objOpen('m19', 'doors')), seg: 'a2-m19-wait-door' },
    { when: all(qActive('m19'), objDone('m19', 'doors'), objOpen('m19', 'stealth')), seg: 'a2-m19-wait-lead' },
    { when: step('m19', null, 'confession'), seg: 'a2-m19-again' },
    { when: all(qDone('m18'), qIdle('m19')), seg: 'a2-m19-offer' },
  ],
  segments: {
    'a2-m19-offer': {
      lines: [
        W('You lit the Bellows. Pike has not stopped talking about it since, and Pike does not talk. It has changed the shaft, Knight. The air moves.'),
        W('It has also done something I did not expect. It has opened the way to the lower galleries from the cavern side. My father walled that gallery up himself, nine years ago. The Bellows took the wall down in a breath.'),
        C('You knew what was behind it.'),
        W('I knew. I told you, in the court, that there was a cellar under this town my father did not mean you to see. I let you think it was a cellar.'),
        W('It is a hatchery, Knight. There are wyrmlings in the lower galleries: forty or so, hatched from clutches the House has been buying from hunters for years. They are chained. They are kept hungry, so they stay small and biddable. And they are sold.'),
        C('To whom?'),
        W('To anyone with a black anvil on their letter and gold in their hand. I have never seen the buyer. I have seen the orders. My father signs every one himself, because he does not trust a clerk with a thing he is ashamed of.'),
        W('I should have told you at the court. I did not, because you were the first person in ten years who might have stopped it, and I was afraid of what stopping it would cost. This House is my father\'s, and it is mine. I am not clean of it.'),
        C('Why tell me now?'),
        W('Because the Bellows were lit, and I cannot unknow what that means. A forge that breathes again will draw the Houses to Deepgate, and sooner or later one of them will open the wall. I would rather it were you than a buyer.'),
        W('The stewards keep a watch on the lower galleries. Four of them, on a loop, and they are paid not to look at anything but the corridor. They will see you if you are careless. They will not see you if you are quiet and patient, and the galleries are old and have a great many dark corners.'),
        W('I will take you down and show you the route. When the watch is near, I will stay low in a hiding place. Two of us moving is twice as loud as one. You go past alone, and I will find you on the other side.'),
        W('Past the watch there is a sealed door. Three locks: an iron lock, a wax seal, and a steward\'s key on its hook. The stewards left all three where they could see them. They did not think anyone would dare.'),
        W('Come. The lift is waiting, and I would rather not lose my nerve in the hall.', [{ startQuest: 'm19' }]),
      ],
    },
    'a2-m19-again': { lines: [W('Come down to the lower galleries with me, Knight. I have told you everything I can say in a hall. The rest must be seen.')] },
    'a2-m19-wait-lead': { lines: [W('Quiet now, and slowly. The watch will not look twice if you do not give it a reason.')] },
    'a2-m19-wait-door': { lines: [W('The door. Three locks. The iron one, the wax one, the key on its hook. Do not hurry them; the stewards will not be back for a while.')] },
    'a2-m19-wait-reveal': { lines: [W('It is open. Go on. I will follow, and I will not look away. I have done enough of that.')] },
    'a2-m19-nursery': {
      lines: [
        W('I have stood in this room once before. It was the day I found the orders, in my father\'s study, and I came down here to see if they were true.'),
        W('They are true. Forty-two, and I counted twice. Some are barely out of the shell. Some have the marks of a chain that is too short.'),
        C('You said you were not clean of this.'),
        W('I have known for nine years. I told myself I would find a way to stop it when the Houses were united and my father had no cause to fear. That day was never going to come. The Houses were never going to unite.'),
        W('Then you walked into the court with a shard in your satchel and a rekindled brazier, and I thought: here is someone who does things instead of explaining why they cannot be done.'),
        C('What do you want me to do?'),
        W('I want them out of the chains, and I want the trade stopped. I will not ask you to do either alone, and I will not ask you tonight. But I want you to look at them first, and remember.'),
        W('There are stewards in the inner gallery. They are my father\'s men, loyal to the House before they are loyal to the truth. They will not be talked round. I think they will have to be beaten.'),
        W('And there is something behind the inner gallery that I have not dared to go near. The orders mention it. They do not name it. The word is "the elder", and my father writes it very small.'),
        W('Look at them once more. Then speak to me when you are ready.'),
      ],
    },
    'a2-m19-report': {
      lines: [
        W('Thank you. I did not think I would be able to bring anyone down here and say it aloud.'),
        W('When you are ready, we break them out. The inner gallery is guarded, and the chains are a steward\'s work: it will take a fight to reach them, and a good deal more to cut them.'),
        C('I will not leave them in the dark.'),
        W('No. I did not think you would. That is why I brought you.'),
        W('Go up and breathe for a moment. The Bellows will still be breathing when you come back. I will wait here, with them.'),
        W('If my father asks, I will tell him you were never here. He will know I am lying. He always does.'),
        W('Whatever comes after, Knight, I am glad it was you who saw this room first.'),
      ],
    },
  },
});

// ---- M19: the nursery reveal and the six route barks ---------------------------------------------
export const SCENE_M19_NURSERY: BuiltTree = buildTree({
  id: 'scene-m19-nursery',
  start: [{ when: all(), seg: 'a2-m19-reveal' }],
  segments: {
    'a2-m19-reveal': {
      lines: [
        W('Here. Do not move too fast. They are not used to light.'),
        C('They are chained to the wall. All of them.'),
        W('Every one. And none of them has ever been outside.', [{ setFlag: 'story.m19.set', value: true }]),
      ],
    },
  },
});

const BARKS: [string, string][] = [
  ['Mind the rails. The stewards stopped oiling the carts the day the strike began.', 'They were never for ore, the carts on this level. Remember that.'],
  ['The galleries go quiet in the middle, and the quiet is the worst of it.', 'It is the sound of a place that is hiding something.'],
  ['My father had these corridors lit with oil. Now he lets the dark do his guarding.', 'It is cheaper, and it never asks for a wage.'],
  ['Do you smell that? Wyrm. Faint, but it never leaves the stone.', 'The first time I came down, I thought it was a smithy. I was a child.'],
  ['Tread softly here. The stewards walk this part with their hands on their hilts.', 'Not because they fear us. Because they fear what is behind them.'],
  ['We are close. I can hear them now, through the rock. Low, like a kettle that never boils.', 'Keep your nerve, Knight. It is only the sound of what my father does.'],
];

export const SCENE_M19_BARKS: BuiltTree[] = BARKS.map(([a, b], i) =>
  buildTree({
    id: `scene-m19-bark-${i + 1}`,
    start: [{ when: all(), seg: `a2-m19-bark-${i + 1}` }],
    segments: { [`a2-m19-bark-${i + 1}`]: { lines: [W(a), W(b)] } },
  }),
);

/** New trees (Pike and his apprentice have no base tree on this branch), to join `NEW_TREES` in the Act 2 dialogue index. */
export const M18M19_TREES: BuiltTree[] = [PIKE, PIKE_APPRENTICE, SCENE_M18_BREATH, SCENE_M19_NURSERY, ...SCENE_M19_BARKS];

/** Extensions of trees that already exist (A4's Wenna), merged with `extendTree`; their start rules come first. */
export const M18M19_EXTENSIONS: Array<{ baseId: string; ext: BuiltTree }> = [{ baseId: 'npc-wenna', ext: WENNA_M19 }];
