// The Waste director's quest-independent rules (the shape of L10's generic.ts): the anchors the quests add (world, and near an
// L1 anchor that a later plugin places), the cast, the triggers and the scenes, `story.<id>.complete`, and the `doneWhen`
// recheck. The arms and the group objectives are L10's installers run on this block's tables.
import { heightAt } from '../../../../../terrain/heightfield';
import type { Condition } from '../../../../types';
import type { Kit, Off } from '../../harrowmark/director/shared';
import { recheck } from '../../harrowmark/director/shared';
import { NEAR_ANCHORS, QUEST_WORLD_ANCHORS } from '../anchors';
import { WASTE_A4_QUEST_DEFS, WASTE_A4_QUEST_IDS } from '../waste.content';
import { WASTE_A4_TRIGGERS } from '../triggers';
import { WASTE_A4_NPC_DEFS, WASTE_A4_NPC_STRINGS, WASTE_A4_NPCS } from '../npcs';
import { WASTE_A4_SCENES } from '../scenes';

export const LOG = '[waste-a4-quests]';
const yaw = (heading?: number): number => ((((heading ?? 0) + 180) % 360) * Math.PI) / 180;

/**
 * Defines the world anchors at once (on the terrain) and each near anchor beside its base, retried until the base exists
 * (L1's sites and interiors are placed by other plugins). An interior anchor keeps its base's height.
 */
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
      const y = e.interior ? near.position.y : heightAt(x, z) + (near.position.y - heightAt(near.position.x, near.position.z));
      defined.set(e.id, ctx.anchors.define({ id: e.id, position: { x, y, z }, yaw: yaw(e.heading) }));
    }
  };
  tryNear();
  const total = QUEST_WORLD_ANCHORS.length + NEAR_ANCHORS.length;
  const off = k.every(30, () => (defined.size < total ? tryNear() : undefined));
  return [off, () => { for (const d of defined.values()) d(); defined.clear(); }];
}

/** The triggers (once their anchors exist), the cast on the npcs service and the scenes on L0's sequencer. */
export function installTriggersCastScenes(k: Kit, offs: Off[]): void {
  const { ctx } = k;
  const added = new Set<string>();
  const tryTriggers = (): void => {
    for (const t of WASTE_A4_TRIGGERS) {
      if (added.has(t.id)) continue;
      const at = ctx.anchors.find(t.anchorId);
      if (!at) continue;
      added.add(t.id);
      offs.push(ctx.triggers.add({ id: t.id, shape: { type: 'sphere', center: at.position, radius: t.radius } }));
    }
  };
  tryTriggers();
  k.every(30, () => (added.size < WASTE_A4_TRIGGERS.length ? tryTriggers() : undefined));
  try {
    const npcs = ctx.services.get('npcs');
    if (!npcs) throw new Error('the npcs service is missing');
    offs.push(ctx.strings.register('en', WASTE_A4_NPC_STRINGS));
    offs.push(npcs.register(WASTE_A4_NPCS, WASTE_A4_NPC_DEFS));
  } catch (err) {
    k.warn(`${LOG} could not register the Waste cast: ${String(err)}`);
  }
  const scenes = ctx.services.get('scenes');
  if (!scenes) k.warn(`${LOG} no scenes service: the dream, the voice and the rim will not play`);
  else for (const d of WASTE_A4_SCENES) offs.push(scenes.register(d));
}

/** `story.<id>.complete` on completion and re-derived on a load. */
export function installComplete(k: Kit): void {
  const sync = (): void => {
    for (const id of WASTE_A4_QUEST_IDS) if (k.qstate(id) === 'completed') k.set(`story.${id}.complete`);
  };
  k.on('quest.completed', (e) => { if (WASTE_A4_QUEST_IDS.includes(e.questId)) k.set(`story.${e.questId}.complete`); });
  k.on('save.loaded', sync);
  sync();
}

const flagsOf = (c: Condition | undefined, out: string[] = []): string[] => {
  if (!c) return out;
  if ('flag' in c) out.push(c.flag);
  else if ('all' in c) c.all.forEach((x) => flagsOf(x, out));
  else if ('any' in c) c.any.forEach((x) => flagsOf(x, out));
  else if ('not' in c) flagsOf(c.not, out);
  return out;
};

/** Every flag some step of the eight quests is `doneWhen` on (nested `any` clauses included). */
export const WASTE_DONE_WHEN_FLAGS: ReadonlySet<string> = new Set(
  WASTE_A4_QUEST_DEFS.flatMap((q) => q.objectives.flatMap((o) => flagsOf(o.doneWhen as Condition | undefined))),
);

/** A `doneWhen` flag is only read by a recheck: one deferred recheck per tick whenever one of them changes. */
export function installDoneWhenRecheck(k: Kit): void {
  let queued = false;
  k.on('flag.changed', (e) => {
    if (queued || !WASTE_DONE_WHEN_FLAGS.has(e.key)) return;
    queued = true;
    k.later(() => { queued = false; recheck(k); });
  });
  k.on('save.loaded', () => { queued = false; });
}
