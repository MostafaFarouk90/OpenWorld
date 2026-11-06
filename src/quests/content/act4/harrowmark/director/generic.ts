// The Harrowmark director's quest-independent rules: the anchors the quests add (world, near a runtime anchor, inside the inn),
// the minor cast and the trigger, the arms, `story.<id>.complete`, and the group objectives.
import { heightAt } from '../../../../../terrain/heightfield';
import type { Kit, Off } from './shared';
import { recheck } from './shared';
import { NEAR_ANCHORS, QUEST_WORLD_ANCHORS } from '../anchors';
import { HARROWMARK_A4_QUEST_DEFS, HARROWMARK_A4_QUEST_IDS } from '../harrowmark.content';
import { HARROWMARK_A4_TRIGGERS } from '../triggers';
import { HARROWMARK_A4_Q_NPC_DEFS, HARROWMARK_A4_Q_NPC_STRINGS, HARROWMARK_A4_Q_NPCS } from '../npcs';
import { HARROWMARK_A4_ARMS, HARROWMARK_A4_GROUPS, type Arm, type GroupObjective } from './tables';

const yaw = (heading?: number): number => ((((heading ?? 0) + 180) % 360) * Math.PI) / 180;

/**
 * Defines the world anchors at once (on the terrain) and each near anchor beside its base (retried until the base exists: the
 * waystones and the inn's anchors are placed by other plugins). An interior anchor keeps its base's height.
 */
export function installExtraAnchors(k: Kit): Off[] {
  const { ctx } = k;
  const defined = new Map<string, () => void>();
  for (const a of QUEST_WORLD_ANCHORS) {
    if (ctx.anchors.find(a.id)) continue;
    defined.set(a.id, ctx.anchors.define({ id: a.id, position: { x: a.x, y: heightAt(a.x, a.z) + (a.dy ?? 0), z: a.z }, yaw: yaw(a.heading) }));
  }
  const tryNear = (): void => {
    for (const e of NEAR_ANCHORS) {
      if (defined.has(e.id) || ctx.anchors.find(e.id)) continue;
      const near = ctx.anchors.find(e.near);
      if (!near) continue;
      const x = near.position.x + e.dx;
      const z = near.position.z + e.dz;
      const y = e.interior ? near.position.y : heightAt(x, z) + (near.position.y - heightAt(near.position.x, near.position.z));
      defined.set(e.id, ctx.anchors.define({ id: e.id, position: { x, y, z }, yaw: yaw(e.heading) }));
    }
  };
  tryNear();
  const total = QUEST_WORLD_ANCHORS.length + NEAR_ANCHORS.length;
  const off = k.every(30, () => (defined.size < total ? tryNear() : undefined));
  return [off, () => { for (const d of defined.values()) d(); defined.clear(); }];
}

export function installTriggersAndCast(k: Kit, offs: Off[]): void {
  const { ctx } = k;
  for (const t of HARROWMARK_A4_TRIGGERS) {
    const at = ctx.anchors.find(t.anchorId);
    if (!at) { k.warn(`[harrowmark-a4-quests] trigger ${t.id}: no anchor ${t.anchorId}`); continue; }
    offs.push(ctx.triggers.add({ id: t.id, shape: { type: 'sphere', center: at.position, radius: t.radius } }));
  }
  try {
    const npcs = ctx.services.get('npcs');
    if (!npcs) throw new Error('the npcs service is missing');
    offs.push(ctx.strings.register('en', HARROWMARK_A4_Q_NPC_STRINGS));
    offs.push(npcs.register(HARROWMARK_A4_Q_NPCS, HARROWMARK_A4_Q_NPC_DEFS));
  } catch (err) {
    k.warn(`[harrowmark-a4-quests] could not register the minor cast: ${String(err)}`);
  }
}

/** A pack appears only when its step is current or done (never on accept): the spawner reads the flag. */
export function installArms(k: Kit, arms: readonly Arm[] = HARROWMARK_A4_ARMS): void {
  const arm = (): void => {
    for (const a of arms) {
      if (k.flag(a.flag) || !k.active(a.quest)) continue;
      if (k.objCurrent(a.quest, a.objective) || k.objDone(a.quest, a.objective)) k.set(a.flag);
    }
  };
  k.on('quest.objective', () => k.later(arm));
  k.on('quest.started', () => k.later(arm));
  k.on('save.loaded', () => k.later(arm));
  k.later(arm);
}

/** `story.<id>.complete` on completion and re-derived on a load. */
export function installComplete(k: Kit): void {
  const sync = (): void => {
    for (const id of HARROWMARK_A4_QUEST_IDS) if (k.qstate(id) === 'completed') k.set(`story.${id}.complete`);
  };
  k.on('quest.completed', (e) => {
    if (HARROWMARK_A4_QUEST_IDS.includes(e.questId)) k.set(`story.${e.questId}.complete`);
  });
  k.on('save.loaded', sync);
  sync();
}

/** Every flag some step of the nine quests is `doneWhen` on (a dialogue effect, a prop's used flag, a director write). */
export const DONE_WHEN_FLAGS: ReadonlySet<string> = new Set(HARROWMARK_A4_QUEST_DEFS.flatMap((q) => q.objectives.flatMap((o) => {
  const d = o.doneWhen as { flag?: unknown } | undefined;
  return typeof d?.flag === 'string' ? [d.flag] : [];
})));

/**
 * A `doneWhen` flag is only read by a recheck, so whoever writes one (a sergeant's bribe, the clerk's reading, a prop) the
 * quests are rechecked once it changes. One deferred recheck per tick however many flags change in it.
 */
export function installDoneWhenRecheck(k: Kit): void {
  let queued = false;
  k.on('flag.changed', (e) => {
    if (queued || !DONE_WHEN_FLAGS.has(e.key)) return;
    queued = true;
    k.later(() => { queued = false; recheck(k); });
  });
  k.on('save.loaded', () => { queued = false; });
}

/** Poll periods, after a load, before an empty group counts as cleared (the spawners put the survivors back first). */
export const GROUP_GRACE_POLLS = 8;

/** Group objectives (the Greyfen rule): `seen` also comes from the spawn itself, so a group wiped inside one poll still credits. */
export function installGroupObjectives(k: Kit, rows: readonly GroupObjective[] = HARROWMARK_A4_GROUPS): void {
  let grace = 0;
  k.on('save.loaded', () => { grace = GROUP_GRACE_POLLS; });
  const markSeen = (g: GroupObjective): void => { if (k.active(g.quest) && !k.flag(g.seen)) k.set(g.seen); };
  k.on('actor.spawned', () => k.later(() => {
    const en = k.ctx.services.get('enemies');
    for (const g of rows) if (k.flag(g.armFlag) && g.groups.some((id) => (en?.alive(id) ?? []).length > 0)) markSeen(g);
  }));
  k.on('enemies.groupCleared', (e) => {
    for (const g of rows) if (k.flag(g.armFlag) && g.groups.includes(e.spawnerId)) markSeen(g);
  });
  k.every(30, () => {
    if (grace > 0) { grace--; return; }
    for (const g of rows) {
      if (!k.active(g.quest) || k.flag(g.down) || !k.flag(g.armFlag)) continue;
      const standing = g.groups.reduce((n, id) => n + k.standing(id).length, 0);
      if (standing > 0) { if (!k.flag(g.seen)) k.set(g.seen); continue; }
      if (!k.flag(g.seen)) continue;
      k.set(g.down);
      k.emit(g.down);
      k.later(() => recheck(k));
    }
  });
}
