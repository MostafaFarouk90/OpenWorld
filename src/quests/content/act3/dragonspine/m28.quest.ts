import type { QuestDef } from '../../../types';
import { flagsAll, reads, story } from '../../act2/helpers';

/** Phase E holds the Dragonspine with this flag (src/quests/act3Jump.ts `DRAGONSPINE_OPEN_FLAG`, pinned by a test; not imported: that file pulls in the quest registry). */
export const M28_OPEN_FLAG = 'story.phase.dragonspineOpen';
/** The four hunters in talk order, all on foot outside the hall: lodge-hunter-3 stands at the tower foot (K4 667a1bb); lodge-hunter-5 is inside Wyrmwatch Hall, so it is not one. */
export const M28_HUNTER_POSTS = [1, 2, 3, 4] as const;
export const M28_HUNTERS = M28_HUNTER_POSTS.map((n) => `lodge-hunter-${n}`);
export const M28_TRAILHEAD = 'story.m28.trailhead';
/** The hunter scout on the lower trail (the shipped spearman) and the crag group (six rime hawks and an ogre, one group). */
export const M28_SCOUT_TAG = 'm28.scout';
export const M28_SCOUT_FLAG = 'story.m28.scoutOut';
/** Written by the director's group row once the scout's group is gone, whoever put him down (a companion's kill counts). */
export const M28_SCOUT_DOWN = 'story.m28.scoutDown';
export const M28_CRAG_TAG = 'm28.crag';
export const M28_CRAG_FLAG = 'story.m28.cragOut';
export const M28_CRAG_DOWN = 'story.m28.cragDown';
/** The four cairn searches in walking order. */
export const M28_CLIMBER = 'note-m28-climber';
export const M28_ROPE = 'note-m28-rope';
export const M28_PACK = 'note-m28-pack';
export const M28_MARKER = 'note-m28-marker';
export const M28_CAIRNS = [M28_CLIMBER, M28_ROPE, M28_PACK, M28_MARKER];
/** Standing on a Leap ledge top credits it, so a walk-around still counts. */
export const M28_LEDGE_FLAGS = ['story.m28.ledge1', 'story.m28.ledge2'] as const;
export const M28_CLIMB_SCENE = 'scene-m28-climb';
export const M28_CLIMB_NPC = 'scene.m28.climb';
export const M28_VIEW = 'story.m28.view';
/** Cael's three lines at the crag's view, played over the camera hold (a one-way scene; its nodes are the view's talk). */
export const M28_VIEW_SCENE = 'scene-m28-view';
export const M28_VIEW_NPC = 'scene.m28.view';

/**
 * M28 Climb to Wyrmwatch. Thorgar sends Cael up the lodge's trail to the Hawk Crag: the lodge hunters first (the block's warning
 * comes before Accept), the trailhead, the hunter scout (a group objective: cleared by anyone), four cairn searches, the two Leap ledges, the climb lines, the crag
 * (six hawks and an ogre, one group) and the view. Accepting locks the lower Dragonspine's level (K9). No choice, no favour.
 */
export const m28: QuestDef = {
  id: 'm28',
  titleKey: 'quest.m28.title',
  summaryKey: 'quest.m28.summary',
  sequential: true,
  startWhen: { all: [{ flag: 'story.gate.a3', equals: true }, { flag: M28_OPEN_FLAG, equals: true }] },
  objectives: [
    { id: 'brief', type: 'talk', target: 'thorgar', textKey: 'quest.m28.brief' },
    ...M28_HUNTERS.map((id, i) => ({ id: `hunter${i + 1}`, type: 'talk' as const, target: id, textKey: `quest.m28.hunter${i + 1}` })),
    story('trailhead', 'quest.m28.trailhead', M28_TRAILHEAD, { doneWhen: { flag: M28_TRAILHEAD, equals: true } }),
    story('scout', 'quest.m28.scout', M28_SCOUT_DOWN, { doneWhen: { flag: M28_SCOUT_DOWN, equals: true } }),
    reads('cairns', 'quest.m28.cairns', M28_CAIRNS),
    story('ledge1', 'quest.m28.ledge1', M28_LEDGE_FLAGS[0], { doneWhen: { flag: M28_LEDGE_FLAGS[0], equals: true } }),
    story('ledge2', 'quest.m28.ledge2', M28_LEDGE_FLAGS[1], { doneWhen: { flag: M28_LEDGE_FLAGS[1], equals: true } }),
    { id: 'climb', type: 'talk', target: M28_CLIMB_NPC, textKey: 'quest.m28.climb' },
    story('crag', 'quest.m28.crag', M28_CRAG_DOWN, { doneWhen: { flag: M28_CRAG_DOWN, equals: true } }),
    story('view', 'quest.m28.view', M28_VIEW, { doneWhen: { flag: M28_VIEW, equals: true } }),
    { id: 'report', type: 'talk', target: 'thorgar', textKey: 'quest.m28.report' },
  ],
  rewards: [{ xp: 650 }, { give: [{ itemId: 'rime-cloak', count: 1 }] }],
};

export const M28_LEDGES_DONE = flagsAll([...M28_LEDGE_FLAGS]);
