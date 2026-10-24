import type { QuestDef } from '../../../../types';
import { interacts, nums, reads, story } from '../../helpers';

export const M17_PARTS = nums('use:m17-part-', 3);
export const M17_VENTS = nums('use:m17-vent-', 4);
export const M17_WINCH = 'use:m17-winch';
export const M17_NOTES = ['note-m17-board', 'note-m17-tally'];
export const M17_MINERS = ['miner-hale', 'miner-brig'];
/** The lift's bottom landing (A4's `oldsmoke.shaft.floor`), where the ride down is counted and the trapped miners are set down. */
export const M17_FLOOR_TRIGGER = 'trg.q13.m17.floor';
export const M17_LIFT_TRIGGER = 'trg.q13.m17.lift';
export const M17_HEAD_TRIGGER = 'trg.q13.m17.head';
/** Written by the winch objective (A4's PR 2 lift reads it); the first cleared vent wakes the ceiling swarm. */
export const LIFT_RESTORED_FLAG = 'world.oldsmoke.lift.restored';
export const M17_SWARM_FLAG = 'story.m17.vent1';

/**
 * M17 Down the Oldsmoke Shaft. The lift has hung dead since the strike. Slagg and the winch-wright send Cael to find three
 * winch parts and restore the winch (which writes `world.oldsmoke.lift.restored`), ride down, clear four choked vents (the
 * first one wakes a swarm of crawlers in the roof), carry two trapped miners to the lift, ride up and report. The first
 * vent is its own objective so the swarm (sequential objectives credit only the current one) is counted from its start.
 */
export const m17: QuestDef = {
  id: 'm17',
  titleKey: 'quest.m17.title',
  summaryKey: 'quest.m17.summary',
  sequential: true,
  startWhen: { quest: 'm16', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'slagg', textKey: 'quest.m17.brief' },
    { id: 'wright', type: 'talk', target: 'winch-wright', textKey: 'quest.m17.wright' },
    interacts('parts', 'quest.m17.parts', M17_PARTS),
    reads('search', 'quest.m17.search', M17_NOTES),
    story('winch', 'quest.m17.winch', 'interact', { match: { interactableId: M17_WINCH } }),
    { id: 'ride', type: 'goTo', target: M17_FLOOR_TRIGGER, textKey: 'quest.m17.ride' },
    story('vent1', 'quest.m17.vent1', 'interact', { match: { interactableId: M17_VENTS[0] } }),
    { id: 'swarm', type: 'kill', target: 'slag-crawler', required: 12, spawnTag: 'm17.drop', textKey: 'quest.m17.swarm' },
    interacts('vents', 'quest.m17.vents', M17_VENTS.slice(1)),
    story('miners', 'quest.m17.miners', 'carry.delivered', { required: 2, match: { destinationId: M17_LIFT_TRIGGER }, dedupeBy: 'carryId' }),
    { id: 'up', type: 'goTo', target: M17_HEAD_TRIGGER, textKey: 'quest.m17.up' },
    reads('thanks', 'quest.m17.thanks', M17_MINERS),
    { id: 'report', type: 'talk', target: 'slagg', textKey: 'quest.m17.report' },
  ],
  rewards: [{ xp: 500 }, { give: [{ itemId: 'miners-helm', count: 1 }] }],
};
