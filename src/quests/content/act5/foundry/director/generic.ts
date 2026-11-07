// The Foundry director's quest-independent rules (the shape of L11's generic.ts): the anchors the quests add (world, and near
// an interior anchor that N2's plugin places), the cast and the triggers, `story.<id>.complete`, and the `doneWhen` recheck.
import { heightAt } from '../../../../../terrain/heightfield';
import type { Kit, Off } from '../../../act4/harrowmark/director/shared';
import { recheck } from '../../../act4/harrowmark/director/shared';
import { NEAR_ANCHORS, QUEST_WORLD_ANCHORS } from '../anchors';
import { FOUNDRY_A5_QUEST_DEFS, FOUNDRY_A5_QUEST_IDS } from '../foundry.content';
import { FOUNDRY_A5_TRIGGERS } from '../triggers';
import { FOUNDRY_A5_NPC_DEFS, FOUNDRY_A5_NPC_STRINGS, FOUNDRY_A5_NPCS } from '../npcs';

export const LOG = '[foundry-a5-quests]';
const yaw = (heading?: number): number => ((((heading ?? 0) + 180) % 360) * Math.PI) / 180;

/** World anchors at once (on the terrain); each near anchor beside its base once that exists, keeping an interior's height. */
export function installExtraAnchors(k: Kit): Off[] {
  const { ctx } = k;
  const defined = new Map<string, () => void>();
  for (const a of QUEST_WORLD_ANCHORS) {
    if (ctx.anchors.find(a.id)) continue;
    defined.set(a.id, ctx.anchors.define({ id: a.id, position: { x: a.x, y: heightAt(a.x, a.z), z: a.z }, yaw: yaw(a.heading) }));
  }
  const tryNear = (): void => {
    for (const e of NEAR_ANCHORS) {
      if (defined.has(e.id) || ctx.anchors.find(e.id)) continue;
      const near = ctx.anchors.find(e.near);
      if (!near) continue;
      const x = near.position.x + e.dx;
      const z = near.position.z + e.dz;
      const y = e.interior === false ? heightAt(x, z) : near.position.y;
      defined.set(e.id, ctx.anchors.define({ id: e.id, position: { x, y, z }, yaw: yaw(e.heading) }));
    }
  };
  tryNear();
  const total = QUEST_WORLD_ANCHORS.length + NEAR_ANCHORS.length;
  const off = k.every(30, () => (defined.size < total ? tryNear() : undefined));
  return [off, () => { for (const d of defined.values()) d(); defined.clear(); }];
}

/** The triggers (once their anchors exist) and the cast on the npcs service. */
export function installTriggersAndCast(k: Kit, offs: Off[]): void {
  const { ctx } = k;
  const added = new Set<string>();
  const tryTriggers = (): void => {
    for (const t of FOUNDRY_A5_TRIGGERS) {
      if (added.has(t.id)) continue;
      const at = ctx.anchors.find(t.anchorId);
      if (!at) continue;
      added.add(t.id);
      offs.push(ctx.triggers.add({ id: t.id, shape: { type: 'sphere', center: at.position, radius: t.radius } }));
    }
  };
  tryTriggers();
  k.every(30, () => (added.size < FOUNDRY_A5_TRIGGERS.length ? tryTriggers() : undefined));
  try {
    const npcs = ctx.services.get('npcs');
    if (!npcs) throw new Error('the npcs service is missing');
    offs.push(ctx.strings.register('en', FOUNDRY_A5_NPC_STRINGS));
    offs.push(npcs.register(FOUNDRY_A5_NPCS, FOUNDRY_A5_NPC_DEFS));
  } catch (err) {
    k.warn(`${LOG} could not register the Foundry cast: ${String(err)}`);
  }
}

/** `story.<id>.complete` on completion and re-derived on a load. */
export function installComplete(k: Kit): void {
  const sync = (): void => {
    for (const id of FOUNDRY_A5_QUEST_IDS) if (k.qstate(id) === 'completed') k.set(`story.${id}.complete`);
  };
  k.on('quest.completed', (e) => { if (FOUNDRY_A5_QUEST_IDS.includes(e.questId)) k.set(`story.${e.questId}.complete`); });
  k.on('save.loaded', sync);
  sync();
}

/** Every flag a step is `doneWhen` on (a dialogue effect, a prop's used flag, a director write). */
export const DONE_WHEN_FLAGS: ReadonlySet<string> = new Set(FOUNDRY_A5_QUEST_DEFS.flatMap((q) => q.objectives.flatMap((o) => {
  const d = o.doneWhen as { flag?: unknown; any?: { flag?: unknown }[] } | undefined;
  const flags = [d?.flag, ...(d?.any ?? []).map((c) => c.flag)];
  return flags.filter((f): f is string => typeof f === 'string');
})));

/** One deferred recheck per tick once a `doneWhen` flag changes, whoever wrote it. */
export function installDoneWhenRecheck(k: Kit): void {
  let queued = false;
  k.on('flag.changed', (e) => {
    if (queued || !DONE_WHEN_FLAGS.has(e.key)) return;
    queued = true;
    k.later(() => { queued = false; recheck(k); });
  });
  k.on('save.loaded', () => { queued = false; });
}
