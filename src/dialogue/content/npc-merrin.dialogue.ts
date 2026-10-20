import type { Condition, DialogueDef } from '../../quests/types';

const P = 'dialogue.npc-merrin.';
const done = (q: string, o: string): Condition => ({ objective: [q, o], done: true });
const notDone = (q: string, o: string): Condition => ({ objective: [q, o], done: false });
const m09Active: Condition = { quest: 'm09', state: 'active' };

export const npcMerrin: DialogueDef = {
  id: 'npc-merrin',
  start: [
    // M08 (density pass): waiting her turn in the Keep hall
    { when: { all: [{ quest: 'm08', state: 'active' }, notDone('m08', 'o3')] }, node: 'm08-wait' },
    // M09 Oswin's Ledger
    { when: { all: [{ quest: 'm08', state: 'completed' }, { quest: 'm09', state: 'inactive' }] }, node: 'm09-offer' },
    { when: { all: [m09Active, done('m09', 'return')] }, node: 'm09-report' },
    { when: { all: [m09Active, done('m09', 'o4')] }, node: 'm09-remind-return' },
    { when: { all: [m09Active, done('m09', 'o3')] }, node: 'm09-remind-exit' },
    { when: { all: [m09Active, done('m09', 'o2')] }, node: 'm09-remind-invoices' },
    { when: { all: [m09Active, done('m09', 'key')] }, node: 'm09-remind-enter' },
    { when: { all: [m09Active, done('m09', 'o1')] }, node: 'm09-remind-key' },
    // dialogue aborted before the accept choice finished: replay the brief
    { when: { all: [m09Active, notDone('m09', 'o1')] }, node: 'm09-brief' },

    { when: { quest: 'm09', state: 'completed' }, node: 'idle-after' },
    { when: { favour: 'halvard', band: 'cold' }, node: 'idle-cold' },
    { when: { all: [] }, node: 'idle' },
  ],
  nodes: [
    { id: 'm08-wait', speaker: 'merrin', textKey: P + 'm08-wait', next: 'm08-wait-2' },
    { id: 'm08-wait-2', speaker: 'merrin', textKey: P + 'm08-wait-2', next: 'm08-wait-3' },
    { id: 'm08-wait-3', speaker: 'cael', textKey: P + 'm08-wait-3', next: 'm08-wait-4' },
    { id: 'm08-wait-4', speaker: 'merrin', textKey: P + 'm08-wait-4', next: null },
    { id: 'm09-offer', speaker: 'merrin', textKey: P + 'm09-offer', next: 'm09-offer-2' },
    {
      id: 'm09-offer-2', speaker: 'merrin', textKey: P + 'm09-offer-2',
      choices: [
        {
          id: 'accept', textKey: P + 'm09-offer-2.accept',
          effects: [
            { startQuest: 'm09' },
            { completeObjective: ['m09', 'o1'] },
          ],
          next: 'm09-brief-key',
        },
        { id: 'later', textKey: P + 'm09-offer-2.later', next: null },
      ],
    },
    // density pass: the side-door key is on her clerk, drinking it away at the Tilted Anvil (src/dialogue/content/npc-court.dialogue.ts)
    { id: 'm09-brief-key', speaker: 'merrin', textKey: P + 'm09-brief-key', next: 'm09-brief-key-2' },
    { id: 'm09-brief-key-2', speaker: 'cael', textKey: P + 'm09-brief-key-2', next: 'm09-brief-key-3' },
    { id: 'm09-brief-key-3', speaker: 'merrin', textKey: P + 'm09-brief-key-3', next: 'm09-brief' },
    { id: 'm09-brief', speaker: 'merrin', textKey: P + 'm09-brief', next: null },
    { id: 'm09-remind-key', speaker: 'merrin', textKey: P + 'm09-remind-key', next: null },
    { id: 'm09-remind-enter', speaker: 'merrin', textKey: P + 'm09-remind-enter', next: null },
    { id: 'm09-remind-invoices', speaker: 'merrin', textKey: P + 'm09-remind-invoices', next: null },
    { id: 'm09-remind-exit', speaker: 'merrin', textKey: P + 'm09-remind-exit', next: null },
    { id: 'm09-remind-return', speaker: 'merrin', textKey: P + 'm09-remind-return', next: null },
    { id: 'm09-report', speaker: 'merrin', textKey: P + 'm09-report', next: 'm09-report-2' },
    { id: 'm09-report-2', speaker: 'merrin', textKey: P + 'm09-report-2', next: 'm09-order' },
    // density pass: the strongbox's order, read together
    { id: 'm09-order', speaker: 'merrin', textKey: P + 'm09-order', next: 'm09-order-2' },
    { id: 'm09-order-2', speaker: 'cael', textKey: P + 'm09-order-2', next: 'm09-order-3' },
    { id: 'm09-order-3', speaker: 'merrin', textKey: P + 'm09-order-3', next: 'm09-order-4' },
    { id: 'm09-order-4', speaker: 'merrin', textKey: P + 'm09-order-4', next: null },

    { id: 'idle-after', speaker: 'merrin', textKey: P + 'idle-after', next: null },
    { id: 'idle-cold', speaker: 'merrin', textKey: P + 'idle-cold', next: null },
    { id: 'idle', speaker: 'merrin', textKey: P + 'idle', next: null },
  ],
};
