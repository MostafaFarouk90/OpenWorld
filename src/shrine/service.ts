import type { WarmthBlocksService } from './warmthService';

/**
 * The `warmth` service (contracts/game-events-and-flags.md section 6) and the shrine's own surface. v0.7: the Act 3
 * block methods (`WarmthBlocksService`) are optional until K9 PR 1 provides them.
 */
export interface WarmthService extends Partial<WarmthBlocksService> {
  /** W, 0..8, derived from the eight `shrine.<id>.lit` flags. */
  tier(): number;
}

export interface ShrineService {
  /** Seconds of Cooled left (0 when off); the HUD reads `buff.applied` and `buff.removed` instead. */
  cooledSeconds(): number;
  /** The next wardstone to strike (1..5), or null when the road is closed to wraiths. */
  nextWardstone(): number | null;
}

declare module '../core/Services' {
  interface GameServices {
    warmth: WarmthService;
    shrine: ShrineService;
  }
}
