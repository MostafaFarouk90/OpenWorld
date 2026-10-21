// Phase D prerequisites for A16's `?act2=` jumps: transitive and in play order, in the shape of `ACT2_PREREQS` (which stays
// Phase C only until A16 folds both tables into one). Rows for the quests that wait on the mines (R10, M21, M22 and the
// mines quests themselves) are added with them.
import { ACT2_PREREQS } from '../../../actJump';

/** The Phase C quests a Phase D quest may assume done: those on the way to D03. */
const THROUGH_D03 = [...ACT2_PREREQS.d03, 'd03'] as const;

export const ACT2D_PREREQS: Record<string, readonly string[]> = {
  m16: [...THROUGH_D03],
  r09: [...THROUGH_D03, 'm16'],
};

/** The flags a jump to Phase D sets so the region opens (A4 reads both). */
export const ACT2D_JUMP_FLAGS: readonly string[] = ['story.gate.a2', 'story.d03.complete', 'story.phase.oldsmokeOpen'];
