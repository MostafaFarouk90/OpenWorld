// The Waste's static ambient census (Act 4 L5, plan section 9; L13 reads it for the Phase H pacing and the factor check).
import { act4Level } from '../level';
import type { LevelBand, SpawnerDef } from '../types';
import { killXp } from '../../progression/tuning';
import { REGION_INFO } from '../../region/regions';
import { WASTE_KILL_XP_FACTOR } from './tuning';

export interface WasteCensusRow {
  id: string;
  members: number;
  xp: number;
}

export interface WasteCensusOptions {
  /** The player's level the members are capped against and paid at. */
  playerLevel: number;
  /** Default `WASTE_KILL_XP_FACTOR`. */
  regionFactor?: number;
  /** Default the Waste's band (31 to 35). */
  band?: LevelBand;
}

/**
 * Every member of `defs` killed once at `playerLevel`: each member's expected kill XP over its band roll (uniform, so the
 * band's two ends weigh half as much as each level between, as `act4Level` rounds), after the Act 4 cap (P + 3, first
 * arrivals P + 2), times the region factor. A kind with no XP row pays 0.
 */
export function wasteAmbientCensus(defs: readonly SpawnerDef[], opts: WasteCensusOptions): { total: number; rows: WasteCensusRow[] } {
  const factor = opts.regionFactor ?? WASTE_KILL_XP_FACTOR;
  const band = opts.band ?? REGION_INFO['ashen-waste'].levelBand;
  const span = band.max - band.min;
  const rows: WasteCensusRow[] = [];
  let total = 0;
  for (const d of defs) {
    let xp = 0;
    for (let i = 0; i < d.count; i++) {
      const kind = d.memberKinds?.[i] ?? d.enemy;
      if (span <= 0) {
        xp += killXp(kind, act4Level(band, 0, opts.playerLevel, d.firstArrival === true), opts.playerLevel, factor);
        continue;
      }
      let sum = 0;
      for (let k = 0; k <= span; k++) {
        const level = act4Level(band, k / span, opts.playerLevel, d.firstArrival === true);
        sum += killXp(kind, level, opts.playerLevel, factor) * (k === 0 || k === span ? 0.5 : 1);
      }
      xp += sum / span;
    }
    rows.push({ id: d.id, members: d.count, xp: Math.round(xp) });
    total += xp;
  }
  return { total: Math.round(total), rows };
}
