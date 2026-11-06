import type { QuestDef } from '../../../types';
import { ACT4_REWARDS_IDS } from './rewards';
import { reads, story } from '../../act2/helpers';
import { ACT4_SPAWN_FLAGS } from '../../../../harrowmark/act4/spawners';

export const M36_HOUSES = ['halvard', 'oswin', 'grisel'] as const;
export type M36House = (typeof M36_HOUSES)[number];
/** F3: `won` (+5 to that House) or `lost` (-2). */
export const M36_DELEGATE = (h: M36House): string => `story.m36.delegate.${h}`;
export const M36_DELEGATE_NPC: Readonly<Record<M36House, string>> = { halvard: 'aldric-cole', oswin: 'wilmot-penn', grisel: 'grisel-steward' };
/** Wenna's word for Orrin (a talk with her while M36 runs; plan review note 5). */
export const M36_WENNA_WORD = 'story.m36.wennaWord';
/** M21's spy branch: Cael holds Aldous's letters (F1). */
export const M36_SPY = { flag: 'story.m21.branch', equals: 'spy' } as const;
export const M36_SECTION = 'm36.rooftops';
export const M36_ROOFTOPS_FLAG = ACT4_SPAWN_FLAGS.m36Rooftops;
export const M36_DAGGERMAN_FLAG = ACT4_SPAWN_FLAGS.m36Daggerman;
export const M36_DAGGERMAN_GROUPS = ['m36.daggerman'] as const;
export const M36_DAGGERMAN_DOWN = 'story.m36.daggermanDown';
/** The daggerman's words before the fight (a one-way scene on the drop). */
export const M36_DAGGER_NPC = 'scene.m36.daggerman';
export const M36_DAGGER_SCENE = 'scene-m36-daggerman';
export const M36_NOTE_LEDGER = 'note-m36-ledger';
export const M36_NOTE_PAGE = 'note-m36-page';
export const M36_NOTE_DROP = 'note-m36-drop';
export const M36_NOTE_LETTERS = 'note-m36-letters';
export const M36_CHALK = 'use:m36-chalk';
export const M36_CHALK_FLAG = 'story.m36.chalked';

/**
 * M36 Votes and Daggers (plan 2.7, Q6). Merrin names the three undecided delegates. Each errand is won on its good path and lost
 * on the hard line (F3). Between the second and third, the rooftops of the Rooftop Ward (the shipped stealth system; a capture
 * sends Cael back to the roof's start) end at the drop, where the daggerman and his three wait. Then Orrin, then the vote chalked.
 */
export const m36: QuestDef = {
  id: 'm36',
  titleKey: 'quest.m36.title',
  summaryKey: 'quest.m36.summary',
  sequential: true,
  startWhen: { quest: 'm35', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'merrin', textKey: 'quest.m36.brief' },
    reads('ledger', 'quest.m36.ledger', [M36_NOTE_LEDGER]),
    { id: 'halvard', type: 'talk', target: M36_DELEGATE_NPC.halvard, textKey: 'quest.m36.halvard' },
    reads('page', 'quest.m36.page', [M36_NOTE_PAGE]),
    { id: 'oswin', type: 'talk', target: M36_DELEGATE_NPC.oswin, textKey: 'quest.m36.oswin' },
    story('rooftops', 'quest.m36.rooftops', 'stealth.section', { match: { sectionId: M36_SECTION, phase: 'cleared' }, doneWhen: { flag: 'story.m36.roofsCrossed', equals: true } }),
    { id: 'dagger', type: 'talk', target: M36_DAGGER_NPC, textKey: 'quest.m36.dagger' },
    story('daggerman', 'quest.m36.daggerman', M36_DAGGERMAN_DOWN, { doneWhen: { flag: M36_DAGGERMAN_DOWN, equals: true } }),
    reads('drop', 'quest.m36.drop', [M36_NOTE_DROP]),
    reads('letters', 'quest.m36.letters', [M36_NOTE_LETTERS]),
    { id: 'grisel', type: 'talk', target: M36_DELEGATE_NPC.grisel, textKey: 'quest.m36.grisel' },
    { id: 'chalk', type: 'interact', target: M36_CHALK, textKey: 'quest.m36.chalk' },
    { id: 'report', type: 'talk', target: 'merrin', textKey: 'quest.m36.report' },
  ],
  rewards: [{ xp: 800 }, { give: [{ itemId: ACT4_REWARDS_IDS.m36, count: 1 }] }],
};
