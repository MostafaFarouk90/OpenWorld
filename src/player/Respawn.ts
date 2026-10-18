// Death-to-respawn timing and respawn point resolution. Pure and tick based.
import type { Vec3Like } from './types';
import { RESPAWN } from './tuning';

export type DeathPhase = 'idle' | 'dead' | 'respawn';

/** Counts RESPAWN.delayTicks after a death, then emits 'respawn' exactly once. */
export class DeathTimeline {
  private remaining = -1;

  /** Starts the countdown; ignored while one is already pending. */
  onDied(): void {
    if (this.remaining >= 0) return;
    this.remaining = RESPAWN.delayTicks;
  }

  /** Resumes a countdown after loading a save made while dead. */
  resume(remainingTicks: number): void {
    if (!Number.isFinite(remainingTicks)) return;
    this.remaining = Math.max(0, Math.floor(remainingTicks));
  }

  tick(): DeathPhase {
    if (this.remaining < 0) return 'idle';
    this.remaining -= 1;
    if (this.remaining <= 0) {
      this.remaining = -1;
      return 'respawn';
    }
    return 'dead';
  }

  get pending(): boolean {
    return this.remaining >= 0;
  }

  /** Ticks left before the respawn, or null when idle. */
  get remainingTicks(): number | null {
    return this.remaining >= 0 ? this.remaining : null;
  }

  cancel(): void {
    this.remaining = -1;
  }
}

export interface RespawnArgs {
  lastRestedWaystoneId: string | null;
  findAnchor(name: string): { position: Vec3Like; yaw: number } | undefined;
  worldSpawn: Vec3Like;
}

export interface RespawnPoint {
  position: Vec3Like;
  yaw: number;
  source: 'waystone' | 'player-spawn' | 'world';
}

export const PLAYER_SPAWN_ANCHOR = 'brightwater.player-spawn';

/** Last rested waystone, else the village player spawn, else the world spawn. A throwing lookup counts as missing. */
export function resolveRespawnPoint(args: RespawnArgs): RespawnPoint {
  const lookup = (name: string) => {
    try {
      return args.findAnchor(name);
    } catch {
      return undefined;
    }
  };
  if (args.lastRestedWaystoneId) {
    const a = lookup(`waystone.${args.lastRestedWaystoneId}`);
    if (a) return { position: { ...a.position }, yaw: a.yaw, source: 'waystone' };
  }
  const spawn = lookup(PLAYER_SPAWN_ANCHOR);
  if (spawn) return { position: { ...spawn.position }, yaw: spawn.yaw, source: 'player-spawn' };
  return { position: { ...args.worldSpawn }, yaw: 0, source: 'world' };
}
