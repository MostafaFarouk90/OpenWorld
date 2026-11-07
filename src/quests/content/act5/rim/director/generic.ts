// The Rim director's quest-independent rules (the shape of L11's generic.ts): the anchors the quests add (world, and inside N2's
// Cooling Hall once the interior is placed), the cast, the triggers, the scenes and their named tests, `story.<id>.complete`, the
// `doneWhen` recheck, and the scene helper every quest module uses.
import { heightAt } from '../../../../../terrain/heightfield';
import type { Condition } from '../../../../types';
import type { Kit, Off } from '../../../act4/harrowmark/director/shared';
import { recheck } from '../../../act4/harrowmark/director/shared';
import { NEAR_ANCHORS, QUEST_WORLD_ANCHORS } from '../anchors';
import { RIM_A5_QUEST_DEFS, RIM_A5_QUEST_IDS } from '../rim.content';
import { RIM_A5_TRIGGERS } from '../triggers';
import { RIM_A5_NPC_DEFS, RIM_A5_NPC_STRINGS, RIM_A5_NPCS } from '../npcs';
import { RIM_A5_SCENES, TEST_DELEGATE, TEST_M52_ASHWALKERS, TEST_M52_DRAGONS, TEST_R11_SPARED, TEST_R26_FAST } from '../scenes';
import { siegeRoster } from '../../../../../siege/roster';
import { DELEGATE_FLAG, M49_HOUSES } from '../m49.quest';
import { R26_CHOICE, R26_FAST } from '../r26.quest';
import { R11_CHOICE } from '../m51.quest';

export const LOG = '[rim-a5-quests]';
const yaw = (heading?: number): number => ((((heading ?? 0) + 180) % 360) * Math.PI) / 180;

/** World anchors at once (on the terrain); the interior ones beside N2's anchors, retried until the Hall is placed. */
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

/** The triggers (once their anchors exist), the cast on the npcs service, the scenes and the scenes' named tests. */
export function installTriggersCastScenes(k: Kit, offs: Off[]): void {
  const { ctx } = k;
  const added = new Set<string>();
  const tryTriggers = (): void => {
    for (const t of RIM_A5_TRIGGERS) {
      if (added.has(t.id)) continue;
      const at = ctx.anchors.find(t.anchorId);
      if (!at) continue;
      added.add(t.id);
      offs.push(ctx.triggers.add({ id: t.id, shape: { type: 'sphere', center: at.position, radius: t.radius } }));
    }
  };
  tryTriggers();
  k.every(30, () => (added.size < RIM_A5_TRIGGERS.length ? tryTriggers() : undefined));
  try {
    const npcs = ctx.services.get('npcs');
    if (!npcs) throw new Error('the npcs service is missing');
    offs.push(ctx.strings.register('en', RIM_A5_NPC_STRINGS));
    offs.push(npcs.register(RIM_A5_NPCS, RIM_A5_NPC_DEFS));
  } catch (err) {
    k.warn(`${LOG} could not register the Rim cast: ${String(err)}`);
  }
  const scenes = ctx.services.get('scenes');
  if (!scenes) { k.warn(`${LOG} no scenes service: the Rim's set pieces will not play`); return; }
  for (const d of RIM_A5_SCENES) offs.push(scenes.register(d));
  // the delegate and choice flags hold strings, which a FlagCondition cannot compare
  for (const h of M49_HOUSES) offs.push(scenes.registerTest(TEST_DELEGATE(h), () => k.str(DELEGATE_FLAG(h)) === 'won'));
  offs.push(scenes.registerTest(TEST_R11_SPARED, () => k.str(R11_CHOICE) === 'spared'));
  offs.push(scenes.registerTest(TEST_R26_FAST, () => k.str(R26_CHOICE) === R26_FAST));
  // M52's holds scene reads N4's roster on the snapshot, so its lines match who stood
  offs.push(scenes.registerTest(TEST_M52_DRAGONS, () => siegeRoster(k.ctx.state, 'm52').dragons.length > 0));
  offs.push(scenes.registerTest(TEST_M52_ASHWALKERS, () => siegeRoster(k.ctx.state, 'm52').squads.some((s) => s.look === 'ashwalker')));
}

/** `story.<id>.complete` on completion and re-derived on a load. */
export function installComplete(k: Kit): void {
  const ids: readonly string[] = RIM_A5_QUEST_IDS;
  const sync = (): void => {
    for (const id of ids) if (k.qstate(id) === 'completed') k.set(`story.${id}.complete`);
  };
  k.on('quest.completed', (e) => { if (ids.includes(e.questId)) k.set(`story.${e.questId}.complete`); });
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

/** Every flag some step of the seven quests is `doneWhen` on, or gated `when` on (a recheck reopens a gated step). */
export const RIM_DONE_WHEN_FLAGS: ReadonlySet<string> = new Set(
  RIM_A5_QUEST_DEFS.flatMap((q) => q.objectives.flatMap((o) => [...flagsOf(o.doneWhen as Condition | undefined), ...flagsOf(o.when as Condition | undefined)])),
);

/** A `doneWhen` flag is only read by a recheck: one deferred recheck per tick whenever one of them changes. */
export function installDoneWhenRecheck(k: Kit): void {
  let queued = false;
  k.on('flag.changed', (e) => {
    if (queued || !RIM_DONE_WHEN_FLAGS.has(e.key)) return;
    queued = true;
    k.later(() => { queued = false; recheck(k); });
  });
  k.on('save.loaded', () => { queued = false; });
}

/**
 * Plays `scene` once its step is current and the floor is free (no scene, no dialogue), polled every half second; `ready` adds a
 * condition (Cael near a spot). A scene writes its own flag at its end, so a step it closes never stalls on a skip.
 */
export function playWhenCurrent(k: Kit, o: { quest: string; objective: string; scene: string; ready?: () => boolean }): void {
  let playing = false;
  k.on('save.loaded', () => { playing = false; });
  k.every(30, () => {
    if (playing || !k.active(o.quest) || !k.objCurrent(o.quest, o.objective)) return;
    const scenes = k.ctx.services.get('scenes');
    if (!scenes || scenes.active || k.ctx.services.get('dialogue')?.active) return;
    if (o.ready && !o.ready()) return;
    playing = true;
    void scenes.play(o.scene).finally(() => { playing = false; k.later(() => recheck(k)); });
  });
}

/** The player's actor (the shipped test: the rig's `player` or the live actor's id). */
export const isPlayer = (k: Kit, id: string): boolean => id === 'player' || id === k.ctx.player.actor?.id;
