import type { QuestDef } from '../../../types';
import { flagsAll, nums, reads, story } from '../../act2/helpers';

export const M33_ANCHOR_FLAGS = nums('story.m33.anchor', 6);
export const M33_ANCHOR_PROPS = nums('use:net-anchor-', 6);
export const M33_ANCHOR_ANCHORS = nums('dragonspine.skyhold.net-anchor.', 6);
/** The spared hunters of either pack, deduped by actor and never going down. Thorgar's hand-in names the count. */
export const M33_WITNESSES = 'story.m33.witnesses';
export const M33_CAMP = ['note-m33-plan', 'note-m33-seal', 'note-m33-map', 'note-m33-rope', 'note-m33-tally'];
export const M33_PACK_A_TAG = 'm33.pack-a';
export const M33_PACK_B_TAG = 'm33.pack-b';
export const M33_PACKS_FLAG = 'story.m33.packsOut';
export const M33_PACKS_DOWN = 'story.m33.packsDown';
export const M33_PACK_GROUPS = ['dragonspine.q.m33.pack-a', 'dragonspine.q.m33.pack-b'] as const;
/** The wyrmlings' flight (the set piece after the sixth cut) is done. */
export const M33_FLIGHT = 'story.m33.flight';
export const M33_AFTERMATH_SCENE = 'scene-m33-aftermath';
export const M33_AFTERMATH_NPC = 'scene.m33.aftermath';

/**
 * M33 The Hunters' Net. Thorgar has the hunters' net across Skyhold's spur in plain view: six rope anchors hold it, two packs guard
 * them, and a wyrmling handler lies under it. Cael hears Thorgar and the rigger, searches the camp, cuts the six anchors in any order,
 * clears the packs (a spared hunter counts as gone and is counted as a witness), frees the handler, sees the wyrmlings fly and reports.
 */
export const m33: QuestDef = {
  id: 'm33',
  titleKey: 'quest.m33.title',
  summaryKey: 'quest.m33.summary',
  sequential: true,
  startWhen: { quest: 'm32', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'thorgar', textKey: 'quest.m33.brief' },
    { id: 'rigger', type: 'talk', target: 'skyhold-rigger', textKey: 'quest.m33.rigger' },
    reads('camp', 'quest.m33.camp', M33_CAMP),
    {
      id: 'anchors', type: 'event', target: 'interact', match: { interactableId: M33_ANCHOR_PROPS }, dedupeBy: 'interactableId', required: 6,
      textKey: 'quest.m33.anchors', doneWhen: flagsAll(M33_ANCHOR_FLAGS),
    },
    story('packs', 'quest.m33.packs', M33_PACKS_DOWN, { doneWhen: { flag: M33_PACKS_DOWN, equals: true } }),
    { id: 'handler', type: 'talk', target: 'skyhold-handler', textKey: 'quest.m33.handler' },
    story('flight', 'quest.m33.flight', M33_FLIGHT, { doneWhen: { flag: M33_FLIGHT, equals: true } }),
    { id: 'aftermath', type: 'talk', target: M33_AFTERMATH_NPC, textKey: 'quest.m33.aftermath' },
    { id: 'report', type: 'talk', target: 'thorgar', textKey: 'quest.m33.report' },
  ],
  rewards: [{ xp: 700 }, { give: [{ itemId: 'cliff-crampons', count: 1 }] }],
};
