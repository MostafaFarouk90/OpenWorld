// The Caldera's static ambient census (Act 5 N5, plans/act5-N5.md section 7; N12's census stays the authority).
import { act5Level } from '../level';
import type { LevelBand, SpawnerDef } from '../types';
import { killXp } from '../../progression/tuning';
import { CALDERA_KILL_XP_FACTOR } from '../../region/act5Regions';
import { AREA_BANDS, isAreaId } from '../../region/areas';
import { REGION_INFO } from '../../region/regions';

export interface CalderaCensusRow {
  id: string;
  members: number;
  xp: number;
}

export interface CalderaCensusOptions {
  playerLevel: number;
  /** Default `CALDERA_KILL_XP_FACTOR`. */
  regionFactor?: number;
}

function bandOf(d: SpawnerDef): LevelBand {
  return isAreaId(d.area) ? AREA_BANDS[d.area].band : REGION_INFO.caldera.levelBand;
}

/**
 * Every member of `defs` killed once at `playerLevel`: the expected kill XP over its band roll after the Act 5 cap (P + 3,
 * first arrivals P + 2), times the Caldera factor. A kind with no XP row pays 0.
 */
export function calderaAmbientCensus(defs: readonly SpawnerDef[], opts: CalderaCensusOptions): { total: number; rows: CalderaCensusRow[] } {
  const factor = opts.regionFactor ?? CALDERA_KILL_XP_FACTOR;
  const rows: CalderaCensusRow[] = [];
  let total = 0;
  for (const d of defs) {
    const band = bandOf(d);
    const span = band.max - band.min;
    let xp = 0;
    for (let i = 0; i < d.count; i++) {
      const kind = d.memberKinds?.[i] ?? d.enemy;
      if (span <= 0) {
        xp += killXp(kind, act5Level(band, 0, opts.playerLevel, d.firstArrival === true), opts.playerLevel, factor);
        continue;
      }
      let sum = 0;
      for (let k = 0; k <= span; k++) {
        sum += killXp(kind, act5Level(band, k / span, opts.playerLevel, d.firstArrival === true), opts.playerLevel, factor) * (k === 0 || k === span ? 0.5 : 1);
      }
      xp += sum / span;
    }
    rows.push({ id: d.id, members: d.count, xp: Math.round(xp) });
    total += xp;
  }
  return { total: Math.round(total), rows };
}
