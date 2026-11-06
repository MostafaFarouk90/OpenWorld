import type { WaveSetDef } from '../types';
import { CINDERFORD_RAID } from './cinderford';
import { ACT4_M39_WAVES } from '../../harrowmark/act4/spawners';

/** Every wave set the game ships, by id. */
export const WAVE_SETS: Readonly<Record<string, WaveSetDef>> = { [CINDERFORD_RAID.id]: CINDERFORD_RAID, [ACT4_M39_WAVES.id]: ACT4_M39_WAVES };

export { CINDERFORD_RAID };
