import { buildTree, type Line } from '../build';
import { all, flagIs, objDone, objOpen, qActive, qDone, qIdle } from '../cond';

const W = (t: string, fx?: Line['fx'], when?: Line['when']): Line => ({ s: 'wenna', t, ...(fx ? { fx } : {}), ...(when ? { when } : {}) });
const C = (t: string): Line => ({ s: 'cael', t });

/**
 * Wenna's M21 counsel. The offer speaks it (its end credits the quest's `counsel` talk), and `m21-counsel` plays the same lines
 * only when that credit is missing: a talk aborted by death or a load after the quest started earns no credit (objectives.ts),
 * so the objective is still open the next time Wenna is spoken to. One list keeps the two from drifting.
 */
const M21_COUNSEL: Line[] = [
  W('You have been below. You have seen the nursery, and Orsk. You have seen what the cages are for.'),
  C('I have seen what my father\'s House has been selling.'),
  W('Our House. Do not spare me the word; I would not spare you. It is my name, too.'),
  W('He will receive you in the hall. He will be charming, because he is always charming, and he will tell you it was necessity. He believes it. That is the worst of it.'),
  W('You may confront him before the court, or you may let him think you are persuaded and read what he keeps. I will not tell you which is wiser. I do not know.'),
  C('What do you want?'),
  W('I want the wyrmlings out of the cages and my father out of the trade. I want it done without Deepgate burning. I want a great many things that do not fit in one hall.'),
  W('Go with the steward. Gather what proof you can; Aldous trusts documents more than faces. And, Knight: whatever you choose, I will be at your side after.'),
];

/** Lady Wenna Grisel: her aside after the brazier (M16), her counsel and her word after the parley (M21). More trees join with the mines. */
export const WENNA = buildTree({
  id: 'npc-wenna',
  start: [
    { when: all(qDone('m20'), qIdle('m21')), seg: 'm21-offer' },
    { when: all(qActive('m21'), objDone('m21', 'aftermath'), objOpen('m21', 'report')), seg: 'm21-report' },
    { when: all(qActive('m21'), objOpen('m21', 'counsel')), seg: 'm21-counsel' },
    { when: qActive('m21'), seg: 'm21-wait' },
    { when: all(qActive('m16'), objDone('m16', 'silence'), objOpen('m16', 'wenna')), seg: 'm16-aside' },
    { when: qActive('m16'), seg: 'm16-wait' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'm21-offer': {
      lines: [
        W('The galleries are behind us, and my father knows what you found. He will not run from it. He will make an argument of it.'),
        W('Come to the hall. Let the steward bring you in, let my father speak, and then decide how you answer him.', [{ startQuest: 'm21' }]),
        // the offer's end is what counts as hearing her counsel (the quest is already open when the talk ends), so the counsel is spoken here
        ...M21_COUNSEL,
      ],
      // The offer runs on into the counsel: its end is a completed talk with Wenna, which credits M21's `counsel` objective,
      // so a separate counsel talk would never open. A talk aborted before the end leaves `counsel` open for 'm21-counsel'.
      then: 'm21-counsel',
    },
    'm16-aside': {
      lines: [
        W('You lit it. I did not think you would. I did not think anyone could.'),
        C('Your father made it a test.'),
        W('My father makes everything a test. He has not forgiven the world for not passing.'),
        W('Hear me, Knight. He means to ally with Halvard, and he means it, today. But there is a cellar under this town that he does not mean you to see, and I do not mean you to leave without seeing.'),
        W('Take his Writ. Take the foreman\'s work. Look at what Deepgate pays for its wages. Then come back and tell me whether you still think my father is a man to ally with.'),
        C('And if I do not?'),
        W('Then at least you will have looked. That is more than the Houses have managed in ten years.'),
      ],
    },
    'm16-wait': { lines: [W('Speak to my father. He is waiting, and he hates to wait. It makes him honest.')] },
    'm21-counsel': {
      lines: [
        ...M21_COUNSEL,
      ],
    },
    'm21-wait': { lines: [W('The hall, Knight. My father is waiting, and he will not wait forever.')] },
    'm21-report': {
      lines: [
        W('It is done, then. I could hear the doors from the stair.'),
        W('The letter you took names a harbour on the Saltmarch coast. A ship leaves Saltmere at midnight, in a month, perhaps. I will remember that.', undefined, flagIs('story.m21.branch', 'spy')),
        W('My father has told me what he said to you. He tells me everything, in the end; it is how I know how little he understands.'),
        W('Come to the capital. There will be a Council, and I mean to stand where my father will not. Whatever he calls it.'),
      ],
    },
    idle: { lines: [W('Deepgate was my home before it was my burden. Do not let it be yours.')] },
  },
});
