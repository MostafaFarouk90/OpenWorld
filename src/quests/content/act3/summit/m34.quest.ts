import type { QuestDef } from '../../../types';
import { reads, story } from '../../act2/helpers';
import { WYRMS_HEARTH } from '../../../../shrine/act3/tuning';

export const M34_LIT_FLAG = `shrine.${WYRMS_HEARTH.id}.lit`;
export const M34_CARVINGS = ['note-m34-carving-1', 'note-m34-carving-2', 'note-m34-carving-3', 'note-m34-carving-4'];
export const M34_MARKERS = ['note-m34-marker-1', 'note-m34-marker-2'];
/** Standing at the first glide ledge (the Hearth updraft) credits it. */
export const M34_LEDGE = 'story.m34.ledge';
export const M34_SWEAR_SCENE = 'scene-m34-swear';
export const M34_SWEAR_NPC = 'scene.m34.swear';
export const M34_COMPANIONS_SCENE = 'scene-m34-companions';
export const M34_COMPANIONS_NPC = 'scene.m34.companions';

/**
 * M34 Fire Sworn. Ysmeryth takes the oath at the Hearth and the dragons swear to the Forge's keeper; the companions and Thorgar
 * speak, Cael reads two carvings and the glide markers, rekindles the Hearth (K9's stone), walks to the first glide ledge and
 * reports. Completing it opens the six glide ledges (K7), lights the lodge fire and turns the hunters out (K4), and starts
 * the Quenched aura (K5).
 */
export const m34: QuestDef = {
  id: 'm34',
  titleKey: 'quest.m34.title',
  summaryKey: 'quest.m34.summary',
  sequential: true,
  startWhen: {
    all: ['m23', 'm24', 'm25', 'm26', 'm27', 'd05', 'm28', 'm29', 'm30', 'm31', 'm32', 'm33', 'r12', 'r13', 'r14', 'r15', 'r16', 'r17', 'r18']
      .map((q) => ({ quest: q, state: 'completed' as const })),
  },
  objectives: [
    { id: 'oath', type: 'talk', target: 'ysmeryth', textKey: 'quest.m34.oath' },
    { id: 'swear', type: 'talk', target: M34_SWEAR_NPC, textKey: 'quest.m34.swear' },
    { id: 'companions', type: 'talk', target: M34_COMPANIONS_NPC, textKey: 'quest.m34.companions' },
    { id: 'thorgar', type: 'talk', target: 'thorgar', textKey: 'quest.m34.thorgar' },
    reads('carvings', 'quest.m34.carvings', M34_CARVINGS, { required: 2 }),
    reads('markers', 'quest.m34.markers', M34_MARKERS),
    story('rekindle', 'quest.m34.rekindle', 'shrine.rekindled', { match: { shrineId: WYRMS_HEARTH.id }, doneWhen: { flag: M34_LIT_FLAG, equals: true } }),
    story('ledge', 'quest.m34.ledge', M34_LEDGE, { doneWhen: { flag: M34_LEDGE, equals: true } }),
    { id: 'report', type: 'talk', target: 'ysmeryth', textKey: 'quest.m34.report' },
  ],
  rewards: [{ xp: 750 }, { skillPoints: 2 }],
};
