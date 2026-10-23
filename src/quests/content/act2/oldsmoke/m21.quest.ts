import type { Condition, QuestDef } from '../../../types';
import { interacts, story } from '../helpers';

export const M21_EVIDENCE = ['use:m21-evidence-1', 'use:m21-evidence-2', 'use:m21-evidence-3'];
export const M21_LETTERS = ['use:m21-letter-1', 'use:m21-letter-2', 'use:m21-letter-3'];
export const M21_SECTION = 'm21.grisel-hall';
/** The service passage off the foyer, round the section's start checkpoint: the spy withdraws here before the watch goes live. */
export const M21_WITHDRAW_TRIGGER = 'trg.q13.m21.withdraw';
const confront: Condition = { flag: 'story.m21.branch', equals: 'confront' };
const spy: Condition = { flag: 'story.m21.branch', equals: 'spy' };
/** The loyalists fight only follows a failed case: a spy never meets them and a persuaded Aldous yields the hall. */
const noFight: Condition = { any: [spy, { flag: 'story.m21.persuaded', equals: true }] };

/**
 * M21 Parley at Deepgate. Wenna counsels, a steward escorts Cael to Grisel Hall, and the proof of the sale is gathered in
 * the study. At the audience Cael confronts Aldous (a persuasion case; a failed one ends in the loyalists' fight) or
 * spies (withdraws to the service passage, then a stealth section past the hall's watch for three letters in the study). `story.m21.persuaded` is written before
 * `story.m21.choice`, so A4's peaceful-steward swap reads the right state.
 */
export const m21: QuestDef = {
  id: 'm21',
  titleKey: 'quest.m21.title',
  summaryKey: 'quest.m21.summary',
  sequential: true,
  startWhen: { quest: 'm20', state: 'completed' },
  objectives: [
    { id: 'counsel', type: 'talk', target: 'wenna', textKey: 'quest.m21.counsel' },
    { id: 'escort', type: 'talk', target: 'steward-hall-1', textKey: 'quest.m21.escort' },
    interacts('evidence', 'quest.m21.evidence', M21_EVIDENCE),
    { id: 'audience', type: 'talk', target: 'aldous', textKey: 'quest.m21.audience' },
    { id: 'loyalists', type: 'event', target: 'actor.died', match: { kind: 'steward-guard', spawnTag: 'm21.loyalists' }, dedupeBy: 'actorId', required: 4, textKey: 'quest.m21.loyalists', doneWhen: noFight },
    // The spy leaves the dais for the service passage first: the section goes live with `letters` and its bounds are the whole
    // hall, so going live at the dais (or in the open foyer) put the player in the loop's sight and caught them at once.
    story('withdraw', 'quest.m21.withdraw', 'trigger.enter', { match: { triggerId: M21_WITHDRAW_TRIGGER, actorId: 'player' }, doneWhen: confront }),
    interacts('letters', 'quest.m21.letters', M21_LETTERS, { doneWhen: confront }),
    story('stealth', 'quest.m21.stealth', 'stealth.section', { match: { sectionId: M21_SECTION, phase: 'cleared' }, doneWhen: confront }),
    { id: 'aftermath', type: 'talk', target: 'aldous', textKey: 'quest.m21.aftermath' },
    { id: 'report', type: 'talk', target: 'wenna', textKey: 'quest.m21.report' },
  ],
  rewards: [{ xp: 500 }, { give: [{ itemId: 'favour-mark', count: 1 }] }],
};
