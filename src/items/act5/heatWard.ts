// Act 5 N7 (plans/act5-N7.md section 2.3): what the worn trinket does against the Caldera's heat. Pure. N3 (lava ticks,
// haze exposure) and N6 (forge-fire Burn) read the `heatWard` service; no service means 1. N0's lava floor rule still wins.
import { ACT5_TRINKETS } from './catalog';

export interface HeatWard {
  lava: number;
  exposure: number;
  forgeFire: number;
}

export const NO_WARD: HeatWard = { lava: 1, exposure: 1, forgeFire: 1 };

export const HEAT_WARD_TUNING = { mantleLava: 0.7, beadExposure: 0.75, runeForgeFire: 0.75 } as const;

export function heatWard(trinketId: string | null): HeatWard {
  switch (trinketId) {
    case ACT5_TRINKETS.cinderproofMantle:
      return { ...NO_WARD, lava: HEAT_WARD_TUNING.mantleLava };
    case ACT5_TRINKETS.coolingBead:
      return { ...NO_WARD, exposure: HEAT_WARD_TUNING.beadExposure };
    case ACT5_TRINKETS.hammerRune:
      return { ...NO_WARD, forgeFire: HEAT_WARD_TUNING.runeForgeFire };
    default:
      return NO_WARD;
  }
}

export interface HeatWardService {
  heatWard(): HeatWard;
}

declare module '../../core/Services' {
  interface GameServices {
    /** N7: the worn trinket's heat multipliers (soft: absent means 1). */
    heatWard: HeatWardService;
  }
}
