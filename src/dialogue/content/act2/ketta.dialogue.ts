import { buildTree, type Line } from './build';
import { all, qActive, qDone, qIdle, step } from './cond';

const K = (t: string, fx?: Line['fx']): Line => (fx ? { s: 'ketta', t, fx } : { s: 'ketta', t });
const C = (t: string): Line => ({ s: 'cael', t });

export const KETTA = buildTree({
  id: 'npc-ketta',
  start: [
    { when: step('r07', 'pups', 'report'), seg: 'r07-report' },
    { when: step('r07', 'mother', 'choice'), seg: 'r07-choice' },
    { when: step('r05', 'herdHome', 'report'), seg: 'r05-report' },
    { when: step('r05', 'hounds', 'choice'), seg: 'r05-choice' },
    { when: all(qDone('m12'), qIdle('r05')), seg: 'r05-brief' },
    { when: all(qDone('m13'), qIdle('r07')), seg: 'r07-brief' },
    { when: qActive('r05'), seg: 'r05-wait' },
    { when: qActive('r07'), seg: 'r07-wait' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'r07-report': {
      lines: [
        K('So it is done.'),
        C('The pups are dealt with. The den is quiet.'),
        K('Quiet. That is a word a shepherd learns to trust and to fear.'),
        K('I have counted my dogs this morning, the ones that are left. They are watching the hill. They do not like it empty, either.'),
        K('Osric will want to hear. I will tell him myself.'),
        K('You did what I could not. I will remember that, {name}, whichever way you did it.'),
      ],
    },
    'r07-choice': {
      lines: [
        K('You have seen the den.'),
        C('The mother is down. The pups are in the back, four of them, blind and hungry.'),
        K('Four. I would have guessed three.'),
        K('A wolf cub I could take to the pot without a thought. These are something else. They grow, and they remember who fed them, and who did not.'),
        {
          s: 'ketta',
          t: 'It is your knife, not mine. What will you do?',
          choices: [
            { id: 'spare', t: 'Spare the pups.', go: 'r07-choice-spared', fx: [{ setFlag: 'story.r07.choice', value: 'spared' }, { favour: 'dragons', delta: 3 }, { event: 'story.r07.branched' }] },
            { id: 'cull', t: 'Cull the den.', go: 'r07-choice-culled', fx: [{ setFlag: 'story.r07.choice', value: 'culled' }, { event: 'story.r07.branched' }] },
          ],
        },
      ],
    },
    'r07-choice-spared': { lines: [K('Then they live, and I will keep my flock behind a wall this winter. Go and tell the den it can stop worrying.')] },
    'r07-choice-culled': { lines: [K('Then you do it yourself, {name}. Put them down quick, and do not look at their faces. I will not ask Osric to do it.')] },
    'r07-wait': { lines: [K('The den is up the gully past Osric\'s fold. Mind the dark and mind the wind.')] },
    'r07-brief': {
      lines: [
        K('You have the look of someone who does hard errands. I have one.'),
        K('Something took my dogs. Four of them, in one night. Then it took three of Osric\'s, and he is not a man who cries easily.'),
        C('A wolf?'),
        K('No wolf I ever heard of leaves a dog\'s collar behind, neatly set on a stone.'),
        K('There is a den up the gully. I have not been near it, and I will not. The tracks are too big and too many.'),
        K('Pups, I think. Something has pups, and a mother who feeds them my dogs.'),
        K('I want the mother seen to, if she can be seen to. And I want to know what is in that den before I send a shepherd past it again.'),
        K('Speak to Osric first. He saw what I did not. Then go up the gully.', [{ startQuest: 'r07' }]),
      ],
    },
    'r05-report': {
      lines: [
        K('Seventy-one. I counted twice.'),
        C('The rest are lost in the fog.'),
        K('Lost is a kinder word than gone. But seventy-one is better than none, and the lambs are among them.'),
        K('My boy is home. He is asleep in the straw with his boots on, and I have not the heart to take them off.'),
        K('I am not a woman who thanks people. I will say it once: thank you.'),
        K('Take what you like from the cart. It is not much, but it is honest wool.'),
      ],
    },
    'r05-choice': {
      lines: [
        K('Pell says an orange thing with a tail led them. A fox.'),
        C('A fox that herds sheep?'),
        K('I have lived beside this ground for forty years and I have never seen a fox do such a thing. I do not like it, and I do not dislike it.'),
        {
          s: 'ketta',
          t: 'You have two ways home with the flock. One is long and safe. The other runs where the fox goes. Choose.',
          choices: [
            { id: 'safe', t: 'The safe road home.', go: 'r05-choice-safe', fx: [{ setFlag: 'story.r05.choice', value: 'safe' }, { event: 'story.r05.branched' }] },
            { id: 'fox', t: 'Follow the fox\'s shortcut.', go: 'r05-choice-fox', fx: [{ setFlag: 'story.r05.choice', value: 'fox' }, { event: 'story.r05.branched' }] },
          ],
        },
      ],
    },
    'r05-choice-safe': { lines: [K('The long road, then. It is slower, but a sheep that walks home is a sheep that eats next spring.')] },
    'r05-choice-fox': { lines: [K('The fox goes where it likes, and the sheep go where the fox goes. Some will be lost on the way. Be sure that is a price you will pay.')] },
    'r05-wait': { lines: [K('The hollows are east of the ridge. Find the tracks, find the boy, find the flock.')] },
    'r05-brief': {
      lines: [
        K('You came at a good time, or a bad one. I cannot decide.'),
        K('The ash-fog rolled down the valley three days ago. I have never seen it so thick. I sent the flock to the high pasture before it came and it came faster than I thought.'),
        C('The flock is lost?'),
        K('Scattered. Somewhere in the fog hollows, if the ground has not swallowed them.'),
        K('There are three hollows between here and the ridge, deep dips where the fog sits. A sheep that wanders into one will stand there until she dies.'),
        K('There are tracks. Hooves, and something else, lighter. I could not read them well in the fog.'),
        C('You said you had a boy.'),
        K('Pell. Eleven years old. He went after them and did not come back. I have not slept.'),
        K('Find the tracks. Find the boy. Bring back what sheep you can, and I will count the rest later.'),
        K('I will mind the dogs. They are good, but they are not fools: they will not go into the fog.', [{ startQuest: 'r05' }]),
      ],
    },
    idle: {
      lines: [
        K('The flock is quiet. That is as much as a shepherd asks of a day.'),
        K('If you pass the high pasture, leave the gate as you found it.'),
      ],
    },
  },
});
