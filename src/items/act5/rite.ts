// Act 5 N7 (plans/act5-N7.md section 8): Aelfreda's Act 5 Hearth Rite. The shipped service already counts the act from the
// gates, so this only names the flag and the reads N11 PR 2 uses for Q13 (the unused Rite offered before M56).
import type { RiteService } from '../../companions/rite';

export const ACT5_RITE_FLAG = 'aelfreda.rite.a5';

export const act5RiteUnused = (flag: (k: string) => unknown): boolean => !flag(ACT5_RITE_FLAG);
/** True when it is Act 5, the Rite is unspent and she can perform it now (joined, has a Scar). */
export const act5RiteAvailable = (rite: Pick<RiteService, 'act' | 'available'>): boolean => rite.act() === 5 && rite.available();
