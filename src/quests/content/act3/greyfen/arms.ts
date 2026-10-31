import { M23_KNOT_FLAGS } from './m23.quest';
import { M24_WRECK_FLAG } from './m24.quest';
import { M25_BEDS_FLAG } from './m25.quest';
import { R14_LEECH_FLAG, R14_PACK_FLAG } from './r14.quest';
import { R13_NAVE_FLAG } from './r13.quest';
import { M26_NETGUARD_FLAG } from './m26.quest';
import { M27_PACK1_FLAG, M27_PACK2_FLAG } from './m27.quest';
import { D05_ROOM_FLAG } from './d05.quest';

/**
 * A pack or prop group appears only once its step is current (the Oldsmoke rule): the director sets `flag` when
 * `quest`/`objective` is current or done, never on accept, so an early wander cannot burn a one-shot. The spawners read them.
 */
export interface Arm { quest: string; objective: string; flag: string }

export const GREYFEN_ARMS: readonly Arm[] = [
  ...[1, 2, 3].map((n): Arm => ({ quest: 'm23', objective: `knot${n}`, flag: M23_KNOT_FLAGS[n - 1] })),
  { quest: 'm24', objective: 'leeches', flag: M24_WRECK_FLAG },
  { quest: 'm25', objective: 'beds', flag: M25_BEDS_FLAG },
  { quest: 'r14', objective: 'leeches', flag: R14_LEECH_FLAG },
  { quest: 'r14', objective: 'pack', flag: R14_PACK_FLAG },
  { quest: 'r13', objective: 'leeches', flag: R13_NAVE_FLAG },
  { quest: 'm26', objective: 'guards', flag: M26_NETGUARD_FLAG },
  { quest: 'm27', objective: 'blinds', flag: M27_PACK1_FLAG },
  { quest: 'm27', objective: 'pack2', flag: M27_PACK2_FLAG },
  { quest: 'd05', objective: 'cell1', flag: D05_ROOM_FLAG('cell-1') },
  { quest: 'd05', objective: 'room1', flag: D05_ROOM_FLAG('sluice-1') },
  { quest: 'd05', objective: 'cell3', flag: D05_ROOM_FLAG('cell-3') },
  { quest: 'd05', objective: 'room2', flag: D05_ROOM_FLAG('sluice-2') },
];
