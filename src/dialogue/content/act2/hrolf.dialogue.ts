import { buildTree } from './build';
import { all, flagIs, qActive, qDone, qIdle, step } from './cond';

const H = (t: string, fx?: import('../../../quests/types').Effect[]) => ({ s: 'hrolf', t, ...(fx ? { fx } : {}) });
const C = (t: string) => ({ s: 'cael', t });

/** Hrolf Ironbrow, warden of Stonefold. The same tree serves him as a companion, so no segment depends on where he stands. */
export const HROLF = buildTree({
  id: 'npc-hrolf',
  start: [
    { when: step('m13', 'duel', 'oath'), seg: 'm13-oath' },
    { when: step('m13', 'hall', 'duel'), seg: 'm13-duel' },
    { when: step('m13', 'logs', 'banter'), seg: 'm13-banter' },
    { when: qActive('m13'), seg: 'm13-wait' },
    { when: all(qDone('m12'), qIdle('m13')), seg: 'm13-brief' },
    { when: step('r11', 'axe', 'report'), seg: 'r11-report' },
    { when: qActive('r11'), seg: 'r11-wait' },
    { when: all(qDone('m13'), qIdle('r11')), seg: 'r11-brief' },
    { when: all(qActive('r07'), flagIs('story.r07.denWoke'), { objective: ['r07', 'choice'], done: false }), seg: 'r07-aside' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'm13-brief': {
      lines: [
        H('Stonefold keeps one gate and one rule. Nobody passes it carrying a grudge, and nobody stays in it carrying nothing.'),
        C('I carry a message from Harrowmark, and not much else.'),
        H('Then you are light enough to climb. I am Hrolf Ironbrow, warden of this gate. The hold has had worse visitors, and worse manners.'),
        C('The Council says Stonefold has no warden worth the name. I came to see for myself.'),
        H('The Council says many things from a long way off. Here, a warden is a man who swore an oath on the anvil to hold the pass while there is breath in him.'),
        H('The oath is older than the Council. It is older than the stone I am standing on, if the old smiths are to be believed, and I do not argue with the old smiths.'),
        C('Then you will hear what I came to ask?'),
        H('I will hear it from a man I trust to carry my end of a log. I do not follow strangers, {name}. I have buried enough men who did.'),
        H('So we do what Stonefold has always done. Three trials of strength, carrying, pushing and heaving, and then a fight in the ring. Strength is a plain language, and it is hard to lie in it.'),
        C('And if I fail one?'),
        H('Then you go home with all your bones, which is more than most get who ask me for things.'),
        H('Speak with my cousin Ealdred in the brothers\' hall first. He will tell you what the trial means. Then come and find me at the logs.', [{ startQuest: 'm13' }]),
      ],
    },
    'm13-wait': { lines: [H('Strength first, talk after. The trials will not carry themselves, though I have tried bribing the logs.')] },
    'm13-banter': {
      lines: [
        H('You carried all three. I counted. I also counted the two you dropped and the one you swore at.'),
        C('The third one was heavier than the other two.'),
        H('The third one is always heavier. A warden carries before he fights, and pushes before he carries, and learns which is which by the ache.'),
        C('You are enjoying this.'),
        H('A little. It is rare that anyone from the valley lasts past the first log.'),
        H('Come. The boulder next.'),
      ],
    },
    'm13-duel': {
      lines: [
        H('The trials are done, and you are still standing. That is more than I promised you.'),
        H('The ring is swept and the lamps are lit. You fight me, and no one else, and we stop when one of us yields or the hall gets bored.'),
        H('Do not hold back out of respect. I would take it as an insult, and I bruise slowly.', [{ event: 'story.m13.duelStart' }]),
      ],
    },
    'm13-oath': {
      lines: [
        H('Hold. That was a fair fall, and a fairer rising. I yield, {name}.'),
        C('You let me win the last exchange.'),
        H('I let nobody win anything. I wanted to see what you did when you were tired. You kept your feet under you and your temper in your belt. It is enough.'),
        H('Hear the oath, then. A warden stands in the gate so that others may walk behind him unafraid. He does not leave the gate while a hand is raised against it, and he does not raise his own hand against one who has asked for shelter.'),
        H('My brother Hjalti kept this oath. He kept it into the hills above the pasture, after something that took our herds. He did not come back, and I did not leave the gate to look for him.'),
        C('That is a hard thing to have kept.'),
        H('It is the only thing I have kept that he would have approved of. I would break it for you, if you asked, and I think that is the whole of what I am trying to say.'),
        H('I ask one thing of you in return. When the road leads you near that den, you tell me before you go in. I will not be left at the gate a second time.'),
        C('You have my word, Hrolf. When the road bends that way, you will be the first to know.'),
        H('Then I will walk beside you, as a warden walks beside a friend. The gate will hold without me. It held before I was born.'),
        H('Let it be said and written: Hrolf Ironbrow stands with {name}, under the old oath.'),
        H('Now, you are thin. I packed salted mutton for the road. It is not a gift. It is an investment in your continued usefulness.', [
          { setFlag: 'story.m13.hrolfJoined', value: true },
          { event: 'story.companion.rank', payload: { companionId: 'hrolf', rank: 1 } },
          { setFlag: 'story.m13.complete', value: true },
        ]),
      ],
    },
    'r11-brief': {
      lines: [
        H('You asked about my brother, once. Sit, if the bench will bear you, and I will tell it once.'),
        H('Hjalti was the elder by four winters and the better warden. He could talk a goat off a ledge. I could only carry it down.'),
        C('You do not have to tell me this.'),
        H('I do. It is part of the oath, in a way. A warden says plainly what the gate has cost him.'),
        H('Two springs ago a wyrm took up a den above the high pasture, in a cleft the shepherds call the Shelf. It burned the herds, and then it burned the hut, and then it kept to its den.'),
        H('Hjalti went up with his axe, the one our father forged. He told me to hold the gate. I held it.'),
        C('And the axe?'),
        H('Still up there, so Wynne tells me, and she would know. She waits in the camp below the den. I could not look at her face and tell her I had not gone after him.'),
        C('Then we go together, and you do not hold the gate this time.'),
        H('Yes. We go up, you and I, past the hounds that guard the ledges, and see what keeps the den now. I want the axe. I want to know what became of him.'),
        H('Speak to Wynne first. She has earned that courtesy and I have not.'),
        H('Then we climb. Bring your flasks. I will bring food, in case the wyrm is open to negotiation.', [{ startQuest: 'r11' }]),
      ],
    },
    'r11-wait': { lines: [H('The den is above the pasture, and Wynne waits below it. Go to her first, then we climb. I will have bread ready, just in case.')] },
    'r11-report': {
      lines: [
        H('The axe is back in my hands. It is lighter than I remembered, and I do not believe it is the axe that has changed.'),
        C('It is yours by right, Hrolf. Your brother carried it home in the end.'),
        H('He carried it as far as the den. We carried it the rest of the way, and that will have to do.'),
        { s: 'hrolf', t: 'The wyrm is dead, and I will not pretend I am sorry. It took my brother, and your blade paid the debt. Wynne may sleep a little easier.', when: flagIs('story.r11.choice', 'slain') },
        { s: 'hrolf', t: 'The wyrm sleeps on, and I am told I should be angry. I find I am not. It was hungry, and so was I, once. The axe will keep.', when: flagIs('story.r11.choice', 'spared') },
        H('You stood at my side on a ledge where I would not have stood for a king. I will remember that when the Council asks what Stonefold thinks of the valley.'),
      ],
    },
    'r07-aside': {
      lines: [
        H('You are going to the den of the pups. I can see it in how you hold the blade, {name}.'),
        H('I am a warden. I have put down a mad hound and a lame ox, and I will tell you plainly that it is never easier. It is only quicker.'),
        H('But a pup has done nothing yet. If you cull them, do it because the flock is in danger and not because the road is short.'),
        H('Whatever you choose, I stand with you. I would simply like you to choose with your eyes open.'),
      ],
    },
    idle: {
      lines: [
        H('Fair day for it. Whatever "it" is. I have a heel of bread here, if you know anything with teeth that wants befriending.'),
        H('I once calmed a hound with a smoked ham. The ham did not survive the negotiation, but the hound and I understand each other now.'),
      ],
    },
  },
});
