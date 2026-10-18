import type { RespawnPoint, TravelResult, Vec3 } from './types';
import type { TeleportOutcome } from './SafeTeleport';

/** The `waystones` service (contracts/game-events-and-flags.md section 6, provided by thread 6). */
export interface WaystoneService {
  respawnPoint(): RespawnPoint;
  /** Safe teleport to the respawn point; resolves when the player may move again. */
  respawnPlayer(): Promise<void>;
  /** Fast travel to a lit waystone (id without the `waystone.` prefix). */
  travel(toId: string): Promise<TravelResult>;
  /** Lights a stone (default cause 'script': no Burn is added by the spells service). */
  rekindle(id: string, cause?: 'player' | 'script'): { ok: boolean; reason?: string };
  isLit(id: string): boolean;
  litIds(): string[];
  ids(): string[];
  position(id: string): Vec3 | undefined;
  /** Why travel is impossible right now, or null. */
  travelBlockedReason(): string | null;
  /** True from a travel's start until the player is released, so saves can skip it. */
  readonly travelling: boolean;
  /** Any hostile has noticed the player and not calmed or died. */
  readonly hostileAggro: boolean;
  /** Teleport that waits for the ground (also used by Continue). */
  safeTeleport(feet: Vec3, yaw: number): Promise<TeleportOutcome>;
}

declare module '../core/Services' {
  interface GameServices {
    waystones: WaystoneService;
  }
}
