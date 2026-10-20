import type { QuestDef } from '../types';

export const M09_INVOICES = ['use:m09-invoice-1', 'use:m09-invoice-2', 'use:m09-invoice-3'];
/** Vey's strongbox in the office (density pass): the fourth document of o3, opened with the clerk's key. */
export const M09_STRONGBOX = 'use:m09-strongbox';
export const M09_CLERK_KEY = 'use:m09-clerk-key';

/**
 * M09 Oswin's Ledger. The density pass puts the side-door key on Merrin's clerk, Simeon Penhallow, drinking on the
 * Tilted Anvil's bench: bought with a drink (10 gold), asked for in Merrin's name (Oswin Banked or better), or lifted
 * from his satchel once he has talked himself to sleep (free). The key opens the door (`story.m09.houseOpen`, by the
 * objective-flag bridge). Inside, the Regent's day-book says where the invoices are filed; the three invoices and Vey's
 * strongbox are one objective in any order; thread 18's `m09.counting-house` section reports the clean exit (armed once
 * o3 is done); the key goes back to Simeon; Merrin reads the strongbox's order.
 */
export const m09: QuestDef = {
  id: 'm09',
  titleKey: 'quest.m09.title',
  summaryKey: 'quest.m09.summary',
  sequential: true,
  onStart: [{ setFlag: 'story.m09.started', value: true }],
  objectives: [
    { id: 'o1', type: 'talk', target: 'merrin', textKey: 'quest.m09.o1' },
    // the clerk's dialogue completes it for the drink or Merrin's name; the satchel prop for the quiet way
    { id: 'key', type: 'interact', target: M09_CLERK_KEY, textKey: 'quest.m09.key' },
    { id: 'o2', type: 'event', target: 'interior.entered', match: { interiorId: 'counting-house' }, textKey: 'quest.m09.o2' },
    // the Regent's day-book on the clerks' counter says where the invoices are filed (density pass)
    { id: 'daybook', type: 'talk', target: 'note-m09-daybook', textKey: 'quest.m09.daybook' },
    {
      id: 'o3', type: 'event', target: 'interact', match: { interactableId: [...M09_INVOICES, M09_STRONGBOX] }, dedupeBy: 'interactableId',
      required: 4, textKey: 'quest.m09.o3',
    },
    {
      id: 'o4', type: 'event', target: 'stealth.section', match: { sectionId: 'm09.counting-house', phase: 'cleared' },
      textKey: 'quest.m09.o4',
    },
    // the key goes back to Simeon (or back into his satchel while he sleeps) before Merrin reads the copies
    { id: 'return', type: 'talk', target: 'clerk', textKey: 'quest.m09.return' },
    { id: 'o5', type: 'talk', target: 'merrin', textKey: 'quest.m09.o5' },
  ],
  rewards: [{ xp: 450 }, { give: [{ itemId: 'oswin-lockpicks', count: 5 }] }],
};
