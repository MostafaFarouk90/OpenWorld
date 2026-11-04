import { M31_HAWKS_FLAG } from './m31.quest';
import { M33_PACKS_FLAG } from './m33.quest';
import { D06_ARM_FLAG } from './d06.quest';

/** As the lower block's arms (dragonspine/arms.ts): the flag is set when `quest`/`objective` is current or done, never on accept. */
export interface Arm { quest: string; objective: string; flag: string }

export const SUMMIT_ARMS: readonly Arm[] = [
  // the roost hawks wait for the first ledge so they stand along the climb, not at the foot
  { quest: 'm31', objective: 'ledge1', flag: M31_HAWKS_FLAG },
  { quest: 'm33', objective: 'anchors', flag: M33_PACKS_FLAG },
  // the winch brings the courtyard's hunters out
  { quest: 'd06', objective: 'courtyard', flag: D06_ARM_FLAG },
];
