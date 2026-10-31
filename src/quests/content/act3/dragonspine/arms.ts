import { M28_CRAG_FLAG, M28_SCOUT_FLAG } from './m28.quest';
import { M29_HAWKS_FLAG } from './m29.quest';
import { R16_PACK_FLAG } from './r16.quest';
import { M30_PACK_FLAG } from './m30.quest';
import { R17_HAWK_FLAGS } from './r17.quest';

/**
 * A pack appears only once its step is current (the Oldsmoke rule): the director sets `flag` when `quest`/`objective` is current
 * or done, never on accept, so an early wander cannot burn a one-shot. The spawners read them. R15's stoops, R17's hawks and
 * R18's parents are armed by the haul, the legs and the egg step instead (installers).
 */
export interface Arm { quest: string; objective: string; flag: string }

export const DRAGONSPINE_ARMS: readonly Arm[] = [
  { quest: 'm28', objective: 'scout', flag: M28_SCOUT_FLAG },
  { quest: 'm28', objective: 'crag', flag: M28_CRAG_FLAG },
  { quest: 'm29', objective: 'hawks', flag: M29_HAWKS_FLAG },
  { quest: 'r16', objective: 'pack', flag: R16_PACK_FLAG },
  { quest: 'm30', objective: 'pack', flag: M30_PACK_FLAG },
  // R17: hawks at the second shrine down the road and the second up it, once those steps are current
  { quest: 'r17', objective: 'shrine2', flag: R17_HAWK_FLAGS[0] },
  { quest: 'r17', objective: 'shrine5', flag: R17_HAWK_FLAGS[1] },
];
