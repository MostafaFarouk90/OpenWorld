import type { WaveSetDef } from '../types';
import { CINDERFORD_RAID } from './cinderford';

/** Every wave set the game ships, by id. */
export const WAVE_SETS: Readonly<Record<string, WaveSetDef>> = { [CINDERFORD_RAID.id]: CINDERFORD_RAID };

export { CINDERFORD_RAID };
