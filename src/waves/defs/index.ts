import type { WaveSetDef } from '../types';
import { CINDERFORD_RAID } from './cinderford';
import { ACT4_M39_WAVES } from '../../harrowmark/act4/spawners';
import { M46_WAVE_SETS } from '../../quests/content/act4/waste/waves';

/** Every wave set the game ships, by id. */
export const WAVE_SETS: Readonly<Record<string, WaveSetDef>> = {
  [CINDERFORD_RAID.id]: CINDERFORD_RAID,
  [ACT4_M39_WAVES.id]: ACT4_M39_WAVES,
  // Act 4 L11: M46's three cairn holds
  ...Object.fromEntries(M46_WAVE_SETS.map((s) => [s.id, s])),
};

export { CINDERFORD_RAID };
