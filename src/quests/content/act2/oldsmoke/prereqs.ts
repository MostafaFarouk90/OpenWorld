// Phase D prerequisites for A16's `?act2=` jumps: transitive and in play order, in the shape of `ACT2_PREREQS` (which stays
// Phase C only until A16 folds both tables into one). Every row is the quest's transitive `startWhen` chain, in play order
// (m16, m17, r09, r08, m18, r10, m19, m20, m21, d04, m22); a sibling that the quest does not wait on (R09 for R08, R10 for M18)
// is not listed. M22 waits on every other quest of both phases (plans/act2-A13.md section 6).
import { ACT2_PREREQS } from '../../../actJump';

/** The Phase C quests a Phase D quest may assume done: those on the way to D03. */
const THROUGH_D03 = [...ACT2_PREREQS.d03, 'd03'] as const;

export const ACT2D_PREREQS: Record<string, readonly string[]> = {
  m16: [...THROUGH_D03],
  r09: [...THROUGH_D03, 'm16'],
  m17: [...THROUGH_D03, 'm16'],
  r08: [...THROUGH_D03, 'm16', 'm17'],
  m18: [...THROUGH_D03, 'm16', 'm17'],
  r10: [...THROUGH_D03, 'm16', 'm17'],
  m19: [...THROUGH_D03, 'm16', 'm17', 'm18'],
  m20: [...THROUGH_D03, 'm16', 'm17', 'm18', 'm19'],
  m21: [...THROUGH_D03, 'm16', 'm17', 'm18', 'm19', 'm20'],
  d04: [...THROUGH_D03, 'm16', 'm17', 'm18', 'm19', 'm20'],
  m22: [...THROUGH_D03, 'm16', 'm17', 'r09', 'r08', 'm18', 'r10', 'm19', 'm20', 'm21', 'd04'],
};

/** The flags a jump to Phase D sets so the region opens (A4 reads both). */
export const ACT2D_JUMP_FLAGS: readonly string[] = ['story.gate.a2', 'story.d03.complete', 'story.phase.oldsmokeOpen'];
