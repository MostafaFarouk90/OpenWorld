import type { QuestDef } from '../../../types';
import { flagsAll, nums, story } from '../../act2/helpers';

export const R15_HANDS = nums('sled-hand-', 2);
/** K7's sled ids are K4's carry route ids. */
export const R15_SLEDS = nums('sled.r15.', 3);
export const R15_SLED_FLAGS = nums('story.r15.sled.', 3);
export const R15_SLED_EVENT = 'story.r15.sledDelivered';
/** The sled the player has out and has not delivered (a route id), for "reset haul"; empty when none. */
export const R15_HAUL_ID = 'story.r15.haulId';
/** True while a sled is held: the hawks stoop only then. */
export const R15_HAULING = 'story.r15.hauling';
/** One flag per stoop group: only the group of the current haul is armed (two hawks per haul, six over the three). */
export const R15_STOOP_FLAGS = nums('story.r15.stoop.', 3);
export const R15_STOOP_TAG = 'r15.stoop';
export const R15_UNLOAD = 'use:r15-unload';
export const R15_UNLOADED = 'story.r15.unloaded';
export const R15_CHOICE = 'story.r15.choice';
export const R15_SCENE = 'scene-r15-cache';
export const R15_SCENE_NPC = 'scene.r15.cache';

/**
 * R15 Skyhold Supplies. Three sled hauls from the lodge's shed to the hawk-line cache (K7's sled and carry reset, K4's routes),
 * the hawks stooping on whoever hauls; then the surplus is unloaded and the sled-hands ask where it goes: the lodge (Thorgar's
 * cold gear 15% cheaper) or Eadgyth's hut (the knife upgrade). Locks once. No favour.
 */
export const r15: QuestDef = {
  id: 'r15',
  titleKey: 'quest.r15.title',
  summaryKey: 'quest.r15.summary',
  sequential: true,
  startWhen: { quest: 'm28', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'thorgar', textKey: 'quest.r15.brief' },
    ...R15_HANDS.map((id, i) => ({ id: `hand${i + 1}`, type: 'talk' as const, target: id, textKey: `quest.r15.hand${i + 1}` })),
    story('hauls', 'quest.r15.hauls', R15_SLED_EVENT, { required: 3, doneWhen: flagsAll(R15_SLED_FLAGS) }),
    { id: 'unload', type: 'event', target: 'interact', match: { interactableId: R15_UNLOAD }, textKey: 'quest.r15.unload', doneWhen: { flag: R15_UNLOADED, equals: true } },
    { id: 'choice', type: 'talk', target: R15_SCENE_NPC, textKey: 'quest.r15.choice' },
    { id: 'report', type: 'talk', target: 'thorgar', textKey: 'quest.r15.report' },
  ],
  rewards: [{ xp: 450 }, { give: [{ itemId: 'ashmare-saddlebags', count: 1 }] }],
};
