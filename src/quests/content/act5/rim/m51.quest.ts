import type { QuestDef } from '../../../types';
import { reads, story } from '../../act2/helpers';
import { rewardOf } from './rewards';
import { ALRIC } from './m47.quest';

export const M51_CALL = 'use:m51-call';
export const M51_CALL_NPC = 'scene.m51.call';
export const M51_CALL_DIALOGUE = 'scene-m51-call';
export const TERRACES_WAYSTONE = 'wyrm-terraces';
export const M51_DRAGONS_SCENE = 'scene-m51-dragons';
export const M51_LANDED = 'story.m51.landed';
/** The dragons are talked to by props in front of their perches (they are scene rigs, not NPCs). */
export const M51_DRAGONS = ['ysmeryth', 'orsk', 'hathren'] as const;
export type M51Dragon = (typeof M51_DRAGONS)[number];
export const M51_TALK = (d: M51Dragon): string => `use:m51-talk-${d}`;
/** Ysmeryth's report talk, from the same spot in front of her perch. */
export const M51_REPORT = 'use:m51-report';
export const M51_FIRES_SCENE = 'scene-m51-fires';
/** The warhost's fires are lit on the plain (N1 PR 2's camp set reads it). */
export const M51_FIRES = 'story.m51.fires';
/** Two groups on one shield line (N5's line id is `line ?? tag`): the shields and the pikes. */
export const M51_SCOUTS = ['m51.scouts.shields', 'm51.scouts.pikes'] as const;
export const M51_SCOUTS_LINE = 'm51.scouts';
export const M51_SCOUTS_ARM = 'story.m51.scoutsArmed';
export const M51_SCOUTS_DOWN = 'story.m51.scoutsDown';
export const M51_CAPTAIN = 'm51-scout-captain';
export const M51_NOTES = { orders: 'note-m51-orders', bones: 'note-m51-bones' } as const;
/** R11 spared: the hill wyrm comes with the dragons and later flies at the siege. R16 given: Eadgyth's axe on Ysmeryth's ledge. */
export const R11_CHOICE = 'story.r11.choice';
export const R16_CHOICE = 'story.r16.choice';
export const F2_CHOICE = 'story.m31.choice';

/**
 * M51 Dragons Gather (plan 2.1, 2.7; reads R11, R16, F2). The keeper's call heard at the camp (a horn-stone; Ysmeryth's voice),
 * Alric and Edric; the climb to the Wyrm Terraces and their waystone; the dragons come (scene: Ysmeryth, Orsk, Hathren, the hill
 * wyrm if spared); each dragon's word (Ysmeryth's reads R16's axe, R11 and F2); the warhost's fires on the plain; Vey's four
 * scouts climb the east terraces (a shield line: the first Warhost Soldiers, N5's break-and-spare rule); their wounded captain
 * talks; the scouts' orders and the dragon-bone ledge; Ysmeryth.
 */
export const m51: QuestDef = {
  id: 'm51',
  titleKey: 'quest.m51.title',
  summaryKey: 'quest.m51.summary',
  sequential: true,
  startWhen: { quest: 'm49', state: 'completed' },
  objectives: [
    { id: 'call', type: 'talk', target: M51_CALL_NPC, textKey: 'quest.m51.call' },
    { id: 'alric', type: 'talk', target: ALRIC, textKey: 'quest.m51.alric' },
    { id: 'edric', type: 'talk', target: 'edric', textKey: 'quest.m51.edric' },
    story('stone', 'quest.m51.stone', 'waystone.rekindled', { match: { waystoneId: TERRACES_WAYSTONE }, doneWhen: { flag: `waystone.${TERRACES_WAYSTONE}.lit`, equals: true } }),
    story('landed', 'quest.m51.landed', M51_LANDED, { doneWhen: { flag: M51_LANDED, equals: true } }),
    ...M51_DRAGONS.map((d) => ({ id: d, type: 'talk' as const, target: d, textKey: `quest.m51.${d}` })),
    story('fires', 'quest.m51.fires', M51_FIRES, { doneWhen: { flag: M51_FIRES, equals: true } }),
    story('scouts', 'quest.m51.scouts', M51_SCOUTS_DOWN, { doneWhen: { flag: M51_SCOUTS_DOWN, equals: true } }),
    { id: 'captain', type: 'talk', target: M51_CAPTAIN, textKey: 'quest.m51.captain' },
    reads('orders', 'quest.m51.orders', [M51_NOTES.orders]),
    reads('bones', 'quest.m51.bones', [M51_NOTES.bones]),
    { id: 'report', type: 'talk', target: 'ysmeryth', textKey: 'quest.m51.report' },
  ],
  rewards: rewardOf('m51', 1100),
};
