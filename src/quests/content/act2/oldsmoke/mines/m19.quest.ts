import type { QuestDef } from '../../../../types';
import { interacts, nums, story } from '../../helpers';

export const M19_SECTION = 'm19.lower-galleries';
export const M19_DOORS = nums('use:m19-door-', 3);
/** The lead ends where the stealth section begins (A4's `oldsmoke.stealth.m19.start`). */
export const M19_ROUTE_TRIGGER = 'trg.q13.m19.route.1';
export const M19_NURSERY_TRIGGER = 'trg.q13.m19.nursery';
export const M19_SCENE = 'scene-m19-nursery';
/** Written by the sealed-door objective; the blocker `oldsmoke.lower.sealed.door` opens on it. */
export const M19_DOOR_OPEN_FLAG = 'story.m19.doorOpen';

/**
 * M19 What Grisel Hides. Wenna confesses what lies below Deepgate and leads Cael into the Lower Galleries (the guide is in
 * the director). Cael breaks the three locks of the sealed door (in the north corridor, on the way in), passes the stewards' watch alone while she waits in a hide spot, and the nursery is revealed: wyrmlings in chains. Wenna's own words are the last two talks. Stealth is a section
 * (`m19.lower-galleries`, live from the stealth objective until it is done); the reveal is a short scene, credited by its
 * end like M22's council. The confession is also the offer: Wenna starts the quest on its last line and that talk's end
 * credits the first objective.
 */
export const m19: QuestDef = {
  id: 'm19',
  titleKey: 'quest.m19.title',
  summaryKey: 'quest.m19.summary',
  sequential: true,
  startWhen: { quest: 'm18', state: 'completed' },
  objectives: [
    { id: 'confession', type: 'talk', target: 'wenna', textKey: 'quest.m19.confession' },
    // The sealed door stands in the north corridor, on the only way to the stealth start, so its locks come first.
    interacts('doors', 'quest.m19.doors', M19_DOORS),
    { id: 'route', type: 'goTo', target: M19_ROUTE_TRIGGER, textKey: 'quest.m19.route' },
    story('stealth', 'quest.m19.stealth', 'stealth.section', { match: { sectionId: M19_SECTION, phase: 'cleared' } }),
    story('reveal', 'quest.m19.reveal', 'dialogue.ended', { match: { dialogueId: M19_SCENE, reason: 'completed' } }),
    { id: 'nursery', type: 'talk', target: 'wenna', textKey: 'quest.m19.nursery' },
    { id: 'report', type: 'talk', target: 'wenna', textKey: 'quest.m19.report' },
  ],
  rewards: [{ xp: 550 }],
};
