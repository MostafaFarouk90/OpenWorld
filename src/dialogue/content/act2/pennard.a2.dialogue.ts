import { buildTree, type Line } from './build';
import { all, flagIs, not, objDone, objOpen, qActive } from './cond';

const P = (t: string, fx?: Line['fx']): Line => (fx ? { s: 'pennard', t, fx } : { s: 'pennard', t });

export const PENNARD_A2 = buildTree({
  id: 'npc-pennard',
  start: [
    { when: all(qActive('r06'), flagIs('story.r06.riteStarted')), seg: 'a2-rite-wait' },
    {
      when: all(qActive('r06'), flagIs('story.r06.branch', 'cleanse'), objDone('r06', 'fire'), objOpen('r06', 'rite'), not(flagIs('story.r06.emberwright'))),
      seg: 'a2-rite-start',
    },
    { when: qActive('r06'), seg: 'a2-wait' },
  ],
  segments: {
    'a2-rite-wait': { lines: [P('The rite is under way. Guard me, {name}, and do not speak to me until the last word.')] },
    'a2-rite-start': {
      lines: [
        P('The well-fire is lit, so the groundwork is done. What remains is the rite, and it takes an hour of unbroken attention.'),
        P('The water holds the dead of the blight. When I begin to draw them out, they will rise as wraiths, in waves. Do not let one touch me.'),
        P('Stand here, by the stone. When I speak the first line, there is no stopping. Ready?', [{ setFlag: 'story.r06.riteStarted', value: true }, { event: 'story.r06.riteStart' }]),
      ],
    },
    'a2-wait': { lines: [P('Mother Maud sent word. I shall ride out once the choice is made. Until then I am reading everything I own about wells.')] },
  },
});
