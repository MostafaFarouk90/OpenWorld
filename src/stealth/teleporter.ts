import type { GameContext } from '../core/Game';
import type { P3 } from './perceptionPort';

/**
 * A capture or load teleport fades and waits for ground. When the waystone path refuses (already travelling), the
 * player is moved directly so a reset never leaves them where they were caught. Resolves true once moved.
 */
export function teleporter(ctx: GameContext): (feet: P3, yaw: number) => Promise<boolean> {
  return async (feet, yaw) => {
    const w = ctx.services.get('waystones');
    if (w) {
      const r = await w.safeTeleport(feet, yaw);
      if (r.ok) return true;
    }
    ctx.player.teleport(feet, yaw);
    return true;
  };
}
