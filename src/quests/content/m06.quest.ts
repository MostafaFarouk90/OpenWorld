import type { QuestDef } from '../types';

/** The two gate refugees whose stories show why Rook needs proof (density pass). */
export const M06_REFUGEES = ['refugee-1', 'refugee-2'];

/**
 * M06 Gates of Harrowmark. Rook's first dialogue starts it and sends Cael to the queue: two refugees turned away as
 * ash-touched (the density pass). Then the choice of route: the gate is passed by stealth (thread 18's
 * `m06.south-gate` section, live only while o2 is current), a bribe or an argument (dialogue nodes complete o2
 * directly). On every route Rook meets Cael at the gate brazier inside: the shard is held to it, Rook names the
 * districts, and Cael tells the queue the brazier will judge them too before walking to the Tilted Anvil's sign.
 * `story.m06.route` is written by the route nodes, or here when o2 is done by the stealth section; it opens the gate.
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
      id: 'queue', type: 'event', target: 'dialogue.ended', match: { npcId: M06_REFUGEES, reason: 'completed' },
      dedupeBy: 'npcId', required: 2, textKey: 'quest.m06.queue',
    },
    {
      id: 'o2', type: 'event', target: 'stealth.section', match: { sectionId: 'm06.south-gate', phase: 'cleared' },
      textKey: 'quest.m06.o2',
    },
    { id: 'brazier', type: 'interact', target: 'use:m06-gate-brazier', textKey: 'quest.m06.brazier' },
    { id: 'proof', type: 'talk', target: 'rook', textKey: 'quest.m06.proof' },
    { id: 'word', type: 'talk', target: 'refugee-1', textKey: 'quest.m06.word' },
    { id: 'anvil', type: 'goTo', target: 'trg.harrowmark.anvil-sign', textKey: 'quest.m06.anvil' },
  ],
  onComplete: [
    { if: { flag: 'story.m06.route' }, then: [], else: [{ setFlag: 'story.m06.route', value: 'stealth' }] },
    { if: { flag: 'story.m06.gateOpen' }, then: [], else: [{ setFlag: 'story.m06.gateOpen', value: true }] },
  ],
  rewards: [{ xp: 350 }, { give: [{ itemId: 'watch-pass', count: 1 }] }],
};
