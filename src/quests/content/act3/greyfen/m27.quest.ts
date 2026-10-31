import type { Condition, QuestDef } from '../../../types';
import { nums, reads, story } from '../../act2/helpers';

export const M27_ALLY_ANCHORS = ['greyfen.m27.ally.1', 'greyfen.m27.ally.2'] as const;
export const M27_SEARCHES = ['note-m27-nets', 'note-m27-seal', 'note-m27-map', 'note-m27-tally'];
export const M27_FREE = nums('use:m27-free-', 3);
export const M27_FREE_FLAGS = nums('story.m27.freed.', 3);
export const M27_PACK1_TAG = 'm27.pack1';
export const M27_PACK2_TAG = 'm27.pack2';
export const M27_PACK1_FLAG = 'story.m27.pack1Out';
export const M27_PACK2_FLAG = 'story.m27.pack2Out';
export const M27_PACK1_DOWN = 'story.m27.pack1Down';
export const M27_PACK2_DOWN = 'story.m27.pack2Down';
/** The blinds are credited when the player creeps through unseen, or once pack 1 (which saw them) is cleared. */
export const M27_BLINDS = 'story.m27.blinds';
export const M27_SEEN = 'story.m27.seen';
export const M27_WITNESSES = 'story.m27.witnesses';
export const M27_BLINDS_START = 'trg.greyfen.m27.blinds';
export const M27_BLINDS_END = 'trg.greyfen.m27.blinds.end';
export const M27_ALLY_SCENE = 'scene-m27-deserter';
/** The ally scene when the deserter was returned to Greywatch (or Wybert is not there): Leofa alone (six lines). */
export const M27_ALONE_SCENE = 'scene-m27-leofa';
export const M27_AFTER_NPC = 'scene.m27.aftermath';
export const M27_AFTER_SCENE = 'scene-m27-aftermath';
export const M27_BROOD_BACK = 'story.m27.broodBack';
export const M27_KEEPER = 'brood-keeper';
const released: Condition = { flag: 'story.r14.choice', equals: 'released' };

/**
 * M27 Hunters in the Reeds. Leofa Hartley at the Mere has found the buyers' hunters netting wyrmling broods in the reeds.
 * Her plan is heard (with the deserter at Cael's side when R14 let him go, else Leofa alone), the brood keeper is questioned,
 * and the reed blinds are crept through: unseen, pack 1 stays unaware and the step credits; seen, pack 1 fights (a spared or
 * calmed hunter counts as gone). Pack 2 at the cages always fights. Four things are searched, three wyrmlings freed, the brood
 * returns (a set piece), and the aftermath is heard. Spared hunters count into `story.m27.witnesses`.
 */
export const m27: QuestDef = {
  id: 'm27',
  titleKey: 'quest.m27.title',
  summaryKey: 'quest.m27.summary',
  sequential: true,
  startWhen: { all: [{ quest: 'm26', state: 'completed' }, { quest: 'r14', state: 'completed' }] },
  objectives: [
    { id: 'brief', type: 'talk', target: 'leofa', textKey: 'quest.m27.brief' },
    { id: 'ally', type: 'talk', target: 'scene.m27.ally', textKey: 'quest.m27.ally' },
    { id: 'keeper', type: 'talk', target: M27_KEEPER, textKey: 'quest.m27.keeper' },
    reads('nets', 'quest.m27.nets', [M27_SEARCHES[0]]),
    story('blinds', 'quest.m27.blinds', 'story.m27.blinds', { doneWhen: { flag: M27_BLINDS, equals: true } }),
    reads('seal', 'quest.m27.seal', [M27_SEARCHES[1]]),
    reads('map', 'quest.m27.map', [M27_SEARCHES[2]]),
    story('pack2', 'quest.m27.pack2', 'story.m27.pack2Down', { doneWhen: { flag: M27_PACK2_DOWN, equals: true } }),
    reads('tally', 'quest.m27.tally', [M27_SEARCHES[3]]),
    { id: 'free', type: 'event', target: 'interact', match: { interactableId: M27_FREE }, dedupeBy: 'interactableId', required: 3, textKey: 'quest.m27.free' },
    story('brood', 'quest.m27.brood', 'story.m27.set', { doneWhen: { flag: M27_BROOD_BACK, equals: true } }),
    { id: 'aftermath', type: 'talk', target: M27_AFTER_NPC, textKey: 'quest.m27.aftermath' },
    { id: 'report', type: 'talk', target: 'leofa', textKey: 'quest.m27.report' },
  ],
  rewards: [{ xp: 600 }, { give: [{ itemId: 'marsh-bow-bolts', count: 20 }] }],
};

export const M27_RELEASED = released;
