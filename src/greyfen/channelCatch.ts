// Murkjaw's arena channel catch (revision 2 item 6): a backup only, run while no water service is present. A player standing
// in a deep channel for 1.5 s is put back on the nearest walkway, so a fall never strands anyone. With K7's service the deep
// volumes push the player back themselves and this does nothing.
import type { CoreContext } from '../region/coreTypes';
import type { InteriorLayout } from '../interiors/layout';
import { ARENA, DEEPS_ID } from './deepsInterior';
import { POOL_DEPTH } from './interiorKit';

export const CATCH_SECONDS = 1.5;
/** Feet this far under the walkway count as in the channel. */
const BELOW = 1;
export const WALKWAY_COUNT = 8;

export function channelCatch(ctx: Pick<CoreContext, 'player' | 'anchors' | 'services' | 'systems'>, deeps: InteriorLayout): () => void {
  const { x: ox, y: oy, z: oz } = deeps.origin;
  let held = 0;
  // Only inside the Deeps, between the channel floor and a metre under the walkway: the ground outside lies under the same
  // x, z far below the floating interior.
  const inChannel = (x: number, y: number, z: number) =>
    ctx.services.get('interiors')?.current === DEEPS_ID &&
    y < oy - BELOW &&
    y > oy - POOL_DEPTH - 0.5 &&
    ARENA.channels.some((r) => x >= ox + r.x0 && x < ox + r.x1 && z >= oz + r.z0 && z < oz + r.z1);
  return ctx.systems.add({
    id: 'greyfen.channel-catch',
    fixedPhase: 'rules',
    order: 0,
    fixedUpdate: (dt: number) => {
      if (ctx.services.get('water')) return void (held = 0);
      const f = ctx.player.feet;
      if (!inChannel(f.x, f.y, f.z)) return void (held = 0);
      held += dt;
      if (held < CATCH_SECONDS) return;
      held = 0;
      let best: { x: number; y: number; z: number } | null = null;
      let bestD = Infinity;
      for (let n = 1; n <= WALKWAY_COUNT; n++) {
        const p = ctx.anchors.find(`greyfen.d05.arena.walkway.${n}`)?.position;
        if (!p) continue;
        const d = Math.hypot(p.x - f.x, p.z - f.z);
        if (d < bestD) (bestD = d), (best = p);
      }
      if (best) ctx.player.teleport({ x: best.x, y: best.y, z: best.z });
    },
  });
}
