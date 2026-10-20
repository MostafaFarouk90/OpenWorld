import type { Condition, QuestDef } from '../types';

const REQUIRED = ['m01', 'm02', 'm03', 'm04', 'm05', 'm06', 'm07', 'm08', 'm09', 'm10', 'r01', 'r02', 'r03', 'r04'];

/** D02 opens only when every M quest and R quest of Act 1 is done (D01 is optional). */
export const D02_PREREQUISITES: string[] = REQUIRED;
export const d02StartWhen: Condition = { all: REQUIRED.map((q) => ({ quest: q, state: 'completed' as const })) };

export const D02_VALVES = ['use:d02-valve-1', 'use:d02-valve-2'];

/**
 * D02 Hounds of the Underways. Rook's offer node starts it, hands over Hearth Bread, teaches Calm and opens the
 * Underways door (`story.d02.underwaysOpen`, thread 3a). Favour comes from thread 1's boss ledger, not from here. The
 * density pass: Rook's lesson on two real strays in the barracks yard first (Calm, or a kill, counts) and his word on
 * how it went; past the kennels the last tunnel is flooded: a smelter hand's tally on the wall, two sluice valves drain
 * it, three hounds come through, and the arena gate opens once they are dealt with (`story.d02.sluiceClear`); after the
 * Gaffer, the crates in his den.
 */
export const d02: QuestDef = {
  id: 'd02',
  titleKey: 'quest.d02.title',
  summaryKey: 'quest.d02.summary',
  sequential: true,
  startWhen: d02StartWhen,
  objectives: [
    { id: 'o1', type: 'talk', target: 'rook', textKey: 'quest.d02.o1' },
    { id: 'stray', type: 'kill', target: 'ember-hound', required: 2, spawnTag: 'd02.stray', textKey: 'quest.d02.stray' },
    { id: 'lesson', type: 'talk', target: 'rook', textKey: 'quest.d02.lesson' },
    { id: 'o2', type: 'event', target: 'interior.entered', match: { interiorId: 'underways' }, textKey: 'quest.d02.o2' },
    { id: 'o3', type: 'kill', target: 'ember-hound', required: 4, spawnTag: 'd02.kennels', textKey: 'quest.d02.o3' },
    { id: 'tally', type: 'talk', target: 'note-d02-tally', textKey: 'quest.d02.tally' },
    {
      id: 'valves', type: 'event', target: 'interact', match: { interactableId: D02_VALVES }, dedupeBy: 'interactableId',
      required: 2, textKey: 'quest.d02.valves',
    },
    { id: 'sluice', type: 'kill', target: 'ember-hound', required: 3, spawnTag: 'd02.sluice', textKey: 'quest.d02.sluice' },
    {
      id: 'o4', type: 'event', target: ['boss.defeated', 'boss.released'], match: { bossId: 'gaffer-grimtooth' },
      doneWhen: { flag: 'boss.gaffer-grimtooth.outcome' }, textKey: 'quest.d02.o4',
    },
    { id: 'crates', type: 'talk', target: 'note-d02-crates', textKey: 'quest.d02.crates' },
    { id: 'o5', type: 'talk', target: 'rook', textKey: 'quest.d02.o5' },
  ],
  rewards: [{ xp: 700 }, { give: [{ itemId: 'sewer-master-key', count: 1 }] }],
};
