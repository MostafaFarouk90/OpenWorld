import type { QuestDef } from '../../types';

/**
 * j06 Rook's Board: The Smith's Crate (side job). A notice asks whoever has a free back for Master Smith Dunstan's crate of
 * bar iron, left on a hand-cart by the old smelter yard when the cart's wheel went. Cael hears Dunstan out, finds the crate
 * (a carry pickup), brings it to the forge door and tells him.
 */
export const j06: QuestDef = {
  id: 'j06',
  titleKey: 'quest.j06.title',
  summaryKey: 'quest.j06.summary',
  sequential: true,
  startWhen: { quest: 'm06', state: 'completed' },
  objectives: [
    { id: 'notice', type: 'talk', target: 'note-j06-notice', textKey: 'quest.j06.notice' },
    { id: 'smith', type: 'talk', target: 'dunstan', textKey: 'quest.j06.smith' },
    { id: 'crate', type: 'carry', target: 'j06.forge', textKey: 'quest.j06.crate' },
    { id: 'report', type: 'talk', target: 'dunstan', textKey: 'quest.j06.report' },
  ],
  rewards: [{ xp: 50 }, { giveGold: 12 }],
};
