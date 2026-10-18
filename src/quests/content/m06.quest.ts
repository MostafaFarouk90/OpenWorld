import type { QuestDef } from '../types';

/**
 * M06 Gates of Harrowmark. Rook's first dialogue starts it (sets the choice of route); the gate is passed by stealth
 * (thread 18's `m06.south-gate` section), a bribe or an argument (dialogue nodes complete o2 directly). `story.m06.route`
 * is written by the route nodes, and by onComplete when the player sneaked in.
 */
export const m06: QuestDef = {
  id: 'm06',
  titleKey: 'quest.m06.title',
  summaryKey: 'quest.m06.summary',
  sequential: true,
  onStart: [{ setFlag: 'story.m06.started', value: true }],
  objectives: [
    { id: 'o1', type: 'talk', target: 'rook', textKey: 'quest.m06.o1' },
    {
      id: 'o2', type: 'event', target: 'stealth.section', match: { sectionId: 'm06.south-gate', phase: 'cleared' },
      textKey: 'quest.m06.o2',
    },
    { id: 'o3', type: 'talk', target: 'rook', textKey: 'quest.m06.o3' },
  ],
  onComplete: [
    { if: { flag: 'story.m06.route' }, then: [], else: [{ setFlag: 'story.m06.route', value: 'stealth' }] },
    { if: { flag: 'story.m06.gateOpen' }, then: [], else: [{ setFlag: 'story.m06.gateOpen', value: true }] },
  ],
  rewards: [{ xp: 350 }, { give: [{ itemId: 'watch-pass', count: 1 }] }],
};
