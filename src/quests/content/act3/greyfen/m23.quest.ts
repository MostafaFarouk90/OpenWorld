import type { QuestDef } from '../../../types';
import { nums, reads } from '../../act2/helpers';
import { bridgeFlag } from '../../../../greyfen/flags';

export const M23_FOLK = nums('reedgate-folk-', 3);
/** The four searches in walking order: the causeway's cart, way-marker and ranger pack, then the song stone on the shore. */
export const M23_CART = 'note-m23-cart';
export const M23_MARKER = 'note-m23-marker';
export const M23_PACK = 'note-m23-pack';
export const M23_STONE = 'note-m23-stone';
export const M23_NOTES = [M23_CART, M23_MARKER, M23_PACK, M23_STONE];
export const M23_KNOT_TAGS = nums('m23.knot.', 3);
/** Written by the director when each knot's objective becomes current (the spawner reads it); never on accept. */
export const M23_KNOT_FLAGS = nums('story.m23.knotOut.', 3);
export const M23_SIGHT_TRIGGER = 'trg.greyfen.mere.first-sight';
export const M23_SIGHT_SCENE = 'scene-m23-sight';
export const M23_SIGHT_NPC = 'scene.m23.sight';
export const M23_BRIDGE_FLAGS = [bridgeFlag(1), bridgeFlag(2)] as const;

const bridge = (n: 1 | 2) => ({
  id: `bridge${n}`, type: 'event' as const, target: 'flag.changed', match: { key: M23_BRIDGE_FLAGS[n - 1], value: true }, textKey: `quest.m23.bridge${n}`,
  doneWhen: { flag: M23_BRIDGE_FLAGS[n - 1], equals: true },
});
const knot = (n: number) => ({ id: `knot${n}`, type: 'kill' as const, target: 'fen-leech', required: 3, spawnTag: M23_KNOT_TAGS[n - 1], textKey: `quest.m23.knot${n}` });

/**
 * M23 Into the Fen. Leofa Hartley sends Cael down the Reedgate causeway: the folk and the causeway ranger first, then the
 * causeway itself (three leech knots, three searches, two plank bridges to lower), the first sight of the Mere (a set piece:
 * the first ripples), the song stone on the shore and Leofa's report at the Mere post. Accepting locks the Greyfen block's
 * level (K9). Plain quest: no choice, no favour.
 */
export const m23: QuestDef = {
  id: 'm23',
  titleKey: 'quest.m23.title',
  summaryKey: 'quest.m23.summary',
  sequential: true,
  startWhen: { flag: 'story.gate.a3', equals: true },
  objectives: [
    { id: 'brief', type: 'talk', target: 'leofa', textKey: 'quest.m23.brief' },
    ...M23_FOLK.map((id, i) => ({ id: `folk${i + 1}`, type: 'talk' as const, target: id, textKey: `quest.m23.folk${i + 1}` })),
    { id: 'ranger', type: 'talk', target: 'causeway-ranger', textKey: 'quest.m23.ranger' },
    reads('cart', 'quest.m23.cart', [M23_CART]),
    knot(1),
    reads('marker', 'quest.m23.marker', [M23_MARKER]),
    bridge(1),
    reads('pack', 'quest.m23.pack', [M23_PACK]),
    knot(2),
    bridge(2),
    knot(3),
    { id: 'sight', type: 'talk', target: M23_SIGHT_NPC, textKey: 'quest.m23.sight' },
    reads('stone', 'quest.m23.stone', [M23_STONE]),
    { id: 'report', type: 'talk', target: 'leofa', textKey: 'quest.m23.report' },
  ],
  rewards: [{ xp: 600 }, { give: [{ itemId: 'gear.fen-boots', count: 1 }] }],
};
