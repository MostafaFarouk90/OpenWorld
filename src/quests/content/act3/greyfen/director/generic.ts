// The Greyfen director's quest-independent rules: the few anchors the quests add to K3's, the "arms" that turn a spawner group on
// when its step is current, `story.<id>.complete`, the triggers and the minor cast.
import { heightAt } from '../../../../../terrain/heightfield';
import type { Kit, Off } from './shared';
import { EXTRA_ANCHORS } from '../extraAnchors';
import { GREYFEN_ARMS } from '../arms';
import { GREYFEN_QUEST_IDS } from '../greyfen.content';
import { GREYFEN_TRIGGERS } from '../triggers';
import { GREYFEN_Q_NPC_DEFS, GREYFEN_Q_NPC_STRINGS, GREYFEN_Q_NPCS } from '../npcs';

/** Defines each extra anchor beside the K3 anchor it is offset from (retried until that anchor exists). Returns when all are defined. */
export function installExtraAnchors(k: Kit): Off[] {
  const { ctx } = k;
  const defined = new Map<string, () => void>();
  const tryDefine = (): void => {
    for (const e of EXTRA_ANCHORS) {
      if (defined.has(e.id) || ctx.anchors.find(e.id)) continue;
      const near = ctx.anchors.find(e.near);
      if (!near) continue;
      const x = near.position.x + e.dx;
      const z = near.position.z + e.dz;
      const lift = near.position.y - heightAt(near.position.x, near.position.z);
      defined.set(e.id, ctx.anchors.define({ id: e.id, position: { x, y: heightAt(x, z) + lift, z }, yaw: ((e.heading ?? 0) + 180) % 360 }));
    }
  };
  tryDefine();
  const off = defined.size < EXTRA_ANCHORS.length ? [k.every(30, () => (defined.size < EXTRA_ANCHORS.length ? tryDefine() : undefined))] : [];
  return [...off, () => { for (const d of defined.values()) d(); defined.clear(); }];
}

/** A pack or prop group appears only when its step is current or done (never on accept): the spawner reads the flag. */
export function installArms(k: Kit): void {
  const arm = (): void => {
    for (const a of GREYFEN_ARMS) {
      if (k.flag(a.flag) || !k.active(a.quest)) continue;
      if (k.objCurrent(a.quest, a.objective) || k.objDone(a.quest, a.objective)) k.set(a.flag);
    }
  };
  k.on('quest.objective', () => k.later(arm));
  k.on('quest.started', () => k.later(arm));
  k.on('save.loaded', () => k.later(arm));
  k.later(arm);
}

/** `story.<id>.complete` on completion and re-derived on a load (K7 reads `story.m24.complete`). */
export function installComplete(k: Kit): void {
  const sync = (): void => {
    for (const id of GREYFEN_QUEST_IDS) if (k.qstate(id) === 'completed') k.set(`story.${id}.complete`);
  };
  k.on('quest.completed', (e) => {
    if (GREYFEN_QUEST_IDS.includes(e.questId)) k.set(`story.${e.questId}.complete`);
  });
  k.on('save.loaded', sync);
  sync();
}

export function installTriggersAndCast(k: Kit, offs: Off[]): void {
  const { ctx } = k;
  for (const t of GREYFEN_TRIGGERS) {
    const at = ctx.anchors.find(t.anchorId);
    if (!at) { k.warn(`[greyfen-quests] trigger ${t.id}: no anchor ${t.anchorId}`); continue; }
    offs.push(ctx.triggers.add({ id: t.id, shape: { type: 'sphere', center: at.position, radius: t.radius } }));
  }
  try {
    const npcs = ctx.services.get('npcs');
    if (!npcs) throw new Error('the npcs service is missing');
    offs.push(ctx.strings.register('en', GREYFEN_Q_NPC_STRINGS));
    offs.push(npcs.register(GREYFEN_Q_NPCS, GREYFEN_Q_NPC_DEFS));
  } catch (err) {
    k.warn(`[greyfen-quests] could not register the minor cast: ${String(err)}`);
  }
}
