// What the Greyfen installers share (K12): scene offering, the toast, the player's distance to an anchor.
import type { Kit } from '../../../act2/director/kit';

export type { Kit, Off } from '../../../act2/director/kit';

/** Polls every half second; starts `scene` (a one-way dialogue) with `npc` once its objective is current and nothing else holds the floor. A closed scene is offered again after ten seconds. */
export function offerScene(k: Kit, o: { quest: string; objective: string; scene: string | (() => string); npc: string; ready?: () => boolean; before?: () => void }): void {
  let cool = 0;
  k.every(30, () => {
    if (cool > 0) { cool--; return; }
    if (!k.active(o.quest) || !k.objCurrent(o.quest, o.objective)) return;
    const d = k.ctx.services.get('dialogue');
    if (!d || d.active) return;
    if (o.ready && !o.ready()) return;
    o.before?.();
    if (d.start(typeof o.scene === 'function' ? o.scene() : o.scene, o.npc)) cool = 20;
  });
}

export const toast = (k: Kit, textKey: string): void => void k.ctx.events.emit('hud.toast', { textKey });

/** Metres from the player's feet to an anchor (Infinity when it is not defined). */
export function distanceTo(k: Kit, anchorId: string): number {
  const a = k.ctx.anchors.find(anchorId);
  if (!a) return Infinity;
  const f = k.ctx.player.feet;
  return Math.hypot(f.x - a.position.x, f.z - a.position.z);
}

/** Recheck the quests now (a `doneWhen` flag is only read by a recheck). */
export const recheck = (k: Kit): void => void k.ctx.services.get('quests')?.recheck?.();
