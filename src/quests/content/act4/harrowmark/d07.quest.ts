import type { QuestDef } from '../../../types';
import { ACT4_REWARDS_IDS } from './rewards';
import { reads, story } from '../../act2/helpers';
import { CRUCIBLE_ID } from '../../../../harrowmark/act4/sites';

const C = 'harrowmark.a4.crucible';
export const D07_CAPTIVE = 'crucible-captive';
/** The heart ledgers (read at M38): this quest owns the flag (coordinator, 2026-11-06). */
export const D07_LEDGERS = 'story.d07.ledgers';
/** The three vat valves turned in the furnace log's order: L6 opens the arena gate on this (`CRUCIBLE_ARENA_GATE_FLAG`). */
export const D07_VALVES = 'story.d07.valves';
export const D07_VALVE = (n: number): string => `use:d07-vatvalve-${n}`;
export const D07_VALVE_ANCHOR = (n: number): string => `${C}.vatvalve.${n}`;
/** The order chalked on the furnace log: middle, north, south (anchors 2, 3, 1). */
export const D07_VALVE_ORDER = [2, 3, 1] as const;
/** Valves turned so far in the right order (0 to 3); a wrong wheel resets it. */
export const D07_VALVE_STEP = 'story.d07.valveStep';
export const D07_ENTERED = 'story.d07.entered';
export const D07_HALLS = ['d07.vat-1', 'd07.cradles'] as const;
export const D07_FORGE = ['d07.vat-2', 'd07.forge'] as const;
export const D07_HALLS_DOWN = 'story.d07.hallsDown';
export const D07_FORGE_DOWN = 'story.d07.forgeDown';
export const D07_NOTES = { stamp: 'note-d07-stamp', tally: 'note-d07-tally', ledgers: 'note-d07-ledgers', log: 'note-d07-log' } as const;
export const D07_NOTE_ANCHORS: Readonly<Record<keyof typeof D07_NOTES, string>> = {
  stamp: `${C}.cradle-stamp`, tally: `${C}.carter-tally`, ledgers: `${C}.ledgers`, log: `${C}.furnace-log`,
};
export const D07_BOSS_FLAG = 'boss.bellows-engine.outcome';

/**
 * D07 The Regent's Crucible (plan 2.7, Q6). Rook has the key to the old Smelter gate (L2's door opens on `story.d07.started`).
 * Inside: a captive smith, two halls of hounds and soot Footmen, the cradle stamp and the carter's tally, the forge room with
 * the heart ledgers and the furnace log, the three vat valves in the log's order (L6's arena gate opens on `story.d07.valves`),
 * then the Bellows-Engine (L6; no mercy). Rook waits at the stair foot inside.
 */
export const d07: QuestDef = {
  id: 'd07',
  titleKey: 'quest.d07.title',
  summaryKey: 'quest.d07.summary',
  sequential: true,
  startWhen: { all: [{ quest: 'm35', state: 'completed' }, { flag: 'story.r23.crucible', equals: true }] },
  objectives: [
    { id: 'brief', type: 'talk', target: 'rook', textKey: 'quest.d07.brief' },
    story('enter', 'quest.d07.enter', 'interior.entered', { match: { interiorId: CRUCIBLE_ID }, doneWhen: { flag: D07_ENTERED, equals: true } }),
    { id: 'captive', type: 'talk', target: D07_CAPTIVE, textKey: 'quest.d07.captive' },
    story('halls', 'quest.d07.halls', D07_HALLS_DOWN, { doneWhen: { flag: D07_HALLS_DOWN, equals: true } }),
    reads('stamp', 'quest.d07.stamp', [D07_NOTES.stamp]),
    reads('tally', 'quest.d07.tally', [D07_NOTES.tally]),
    story('forge', 'quest.d07.forge', D07_FORGE_DOWN, { doneWhen: { flag: D07_FORGE_DOWN, equals: true } }),
    reads('ledgers', 'quest.d07.ledgers', [D07_NOTES.ledgers]),
    reads('log', 'quest.d07.log', [D07_NOTES.log]),
    story('valves', 'quest.d07.valves', D07_VALVES, { doneWhen: { flag: D07_VALVES, equals: true } }),
    story('boss', 'quest.d07.boss', 'boss.defeated', { match: { bossId: 'bellows-engine' }, doneWhen: { flag: D07_BOSS_FLAG, equals: 'defeated' } }),
    { id: 'report', type: 'talk', target: 'rook', textKey: 'quest.d07.report' },
  ],
  rewards: [{ xp: 1100 }, { give: [{ itemId: ACT4_REWARDS_IDS.d07, count: 1 }] }],
};
