// Phase D prerequisites for A16's `?act2=` jumps. The table itself is `ACT2_PREREQS` in actJump.ts (one registered table for
// both phases); this is its Phase D slice, kept for the Oldsmoke tests and A4's region flags.
import { ACT2_PREREQS } from '../../../actJump';

/** The Phase D quest ids the jumps take (the ending is `ending`: everything but M22 done). */
export const ACT2D_QUEST_IDS = ['m16', 'm17', 'r08', 'r09', 'r10', 'm18', 'm19', 'm20', 'm21', 'd04', 'm22'] as const;

export const ACT2D_PREREQS: Record<string, readonly string[]> = Object.fromEntries(ACT2D_QUEST_IDS.map((id) => [id, ACT2_PREREQS[id]]));

/**
 * The flags a jump to Phase D relies on so the region opens (A4 reads both). The Oldsmoke pass opens on `story.d03.complete`
 * alone: the Phase C hold (`story.phase.oldsmokeOpen`) is retired, so no jump sets it.
 */
export const ACT2D_JUMP_FLAGS: readonly string[] = ['story.gate.a2', 'story.d03.complete'];
