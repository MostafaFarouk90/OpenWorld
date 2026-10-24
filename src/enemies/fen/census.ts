import { ACT3_BLOCKS } from '../level';
import type { SpawnerDef } from '../types';
import { killXp } from '../../progression/tuning';

/** One spawner group's share of a census. */
export interface CensusRow {
  id: string;
  members: number;
  xp: number;
}

export interface CensusOptions {
  /** The level every group is planned at (the block's L), and the player's level the kills are paid against. */
  level: number;
  playerLevel: number;
  /** The kill XP region factor of the census region; 1 when unset (no factor registered). */
  regionFactor?: number;
  /** `parity`: every member at `level`. `rolled`: each member at its roll's expected XP (L to L + span, the group's own `blockSpan`). */
  mode?: 'parity' | 'rolled';
}

/**
 * The static ambient census (plan 7.2, K16 is the authority): the kill XP of every member of `defs` at its planned level,
 * paid through `killXp` with the region factor, summed. A kind with no XP row pays 0; a member's kind is its `memberKinds`
 * entry, else the def's `enemy`.
 */
export function act3AmbientCensus(defs: readonly SpawnerDef[], opts: CensusOptions): { total: number; rows: CensusRow[] } {
  const factor = opts.regionFactor ?? 1;
  const rows: CensusRow[] = [];
  let total = 0;
  for (const d of defs) {
    const span = d.block ? (d.blockSpan ?? ACT3_BLOCKS[d.block]?.span ?? 0) : 0;
    let xp = 0;
    for (let i = 0; i < d.count; i++) {
      const kind = d.memberKinds?.[i] ?? d.enemy;
      if (opts.mode === 'rolled' && span > 0) {
        // L + round(roll x span) with a uniform roll: the two ends weigh half as much as each level between them.
        let sum = 0;
        for (let k = 0; k <= span; k++) sum += killXp(kind, opts.level + k, opts.playerLevel, factor) * (k === 0 || k === span ? 0.5 : 1);
        xp += sum / span;
      } else {
        xp += killXp(kind, opts.level, opts.playerLevel, factor);
      }
    }
    rows.push({ id: d.id, members: d.count, xp: Math.round(xp) });
    total += xp;
  }
  return { total: Math.round(total), rows };
}
