// M28, R15, M29, R16 and M30 rules (K13): the climb's flags and the crag view, the sled hauls, the shelter, the cave and the Anvil.
import { heightAt } from '../../../../../terrain/heightfield';
import { buildCarryRoutes } from '../../../../../dragonspine/carryRoutes';
import { dragonspineBuild } from '../../../../../dragonspine/layout';
import type { CarryRoute } from '../../../../../traversal/carry/CarryResets';
import type { Kit, Off } from './shared';
import { distanceTo, offerScene, recheck, toast } from './shared';
import { M28_CLIMB_NPC, M28_CLIMB_SCENE, M28_CRAG_DOWN, M28_LEDGE_FLAGS, M28_TRAILHEAD, M28_VIEW } from '../m28.quest';
import { R15_HAULING, R15_HAUL_ID, R15_SCENE, R15_SCENE_NPC, R15_SLEDS, R15_SLED_EVENT, R15_SLED_FLAGS } from '../r15.quest';
import { M29_CONFESSION_NPC, M29_CONFESSION_SCENE, M29_FIRE } from '../m29.quest';
import { R16_AXE_FLAG, R16_CAVE_NPC, R16_CAVE_SCENE, R16_MOUTH, R16_ROCKFALL } from '../r16.quest';

export const M28_CRAG_GROUP = 'dragonspine.q.m28.crag';
export const R15_STOOP_GROUPS = [1, 2, 3].map((n) => `dragonspine.q.r15.stoop.${n}`);
/** The sled counts as delivered when it is dropped this close (x, z) to its route's last checkpoint. */
export const R15_DELIVER_RADIUS = 8;
/** Fixed ticks the crag view holds (60 a second). */
export const M28_VIEW_TICKS = 360;
export const R15_HAUL_OUT = 'story.r15.haulOut';
/** Metres within which the trailhead, the mouth and a ledge top count. */
export const REACH = { trailhead: 12, mouth: 14, ledge: 3.5 };

let cached: CarryRoute[] | null = null;
/** K4's carry routes (built once, from the shipped height field). */
export function carryRoutes(): CarryRoute[] {
  return (cached ??= buildCarryRoutes(heightAt, dragonspineBuild()));
}
export const routeById = (id: string): CarryRoute | undefined => carryRoutes().find((r) => r.id === id);

export function installM28(k: Kit): void {
  const { ctx } = k;
  // Poll: the trigger volumes are not replayed on a load, and a walk-around that never touches a step must still count.
  k.every(30, () => {
    if (!k.active('m28')) return;
    if (!k.flag(M28_TRAILHEAD) && distanceTo(k, 'dragonspine.m28.trailhead') <= REACH.trailhead) {
      k.set(M28_TRAILHEAD);
      k.emit(M28_TRAILHEAD);
      k.later(() => recheck(k));
    }
    M28_LEDGE_FLAGS.forEach((f, i) => {
      if (k.flag(f)) return;
      const a = ctx.anchors.find(`dragonspine.m28.leap.${i + 1}`);
      if (!a || distanceTo(k, a.id) > REACH.ledge || ctx.player.feet.y < a.position.y - 1.5) return;
      k.set(f);
      k.emit(f);
      toast(k, 'dragonspine.q.m28.ledge');
      k.later(() => recheck(k));
    });
  });
  offerScene(k, { quest: 'm28', objective: 'climb', scene: M28_CLIMB_SCENE, npc: M28_CLIMB_NPC });

  // The view: only when the crag group is down and nothing stands (never mid-fight); the camera holds, then the step is credited.
  let shot: { release(blendOut?: number): void } | null = null;
  const release = (): void => { shot?.release(); shot = null; };
  k.on('save.loaded', release);
  k.every(30, () => {
    if (!k.active('m28') || !k.objCurrent('m28', 'view') || k.flag(M28_VIEW) || shot) return;
    if (!k.flag(M28_CRAG_DOWN) || k.standing(M28_CRAG_GROUP).length > 0) return;
    const view = ctx.anchors.find('dragonspine.m28.crag.view');
    if (!view || distanceTo(k, 'dragonspine.m28.crag') > 45) return;
    const p = view.position;
    const look = { x: p.x - Math.sin(view.yaw) * 120, y: p.y - 6, z: p.z - Math.cos(view.yaw) * 120 };
    shot = ctx.cameraRig?.override({ position: { x: p.x, y: p.y + 2, z: p.z }, lookAt: look, blendIn: 1, blendOut: 1 }) ?? { release: () => {} };
    k.after(M28_VIEW_TICKS, () => {
      release();
      if (!k.active('m28') || k.flag(M28_VIEW)) return;
      k.set(M28_VIEW);
      k.emit(M28_VIEW);
      recheck(k);
    });
  });
}

export function installR15(k: Kit): void {
  const carry = () => k.ctx.services.get('carry');
  const enemies = () => k.ctx.services.get('enemies');
  const sleds = new Map<string, Off>();
  const sync = (): void => {
    const c = carry();
    R15_SLEDS.forEach((id, i) => {
      const want = k.active('r15') && !k.flag(R15_SLED_FLAGS[i]);
      if (want && !sleds.has(id) && c) {
        const route = routeById(id);
        if (route) sleds.set(id, c.addSled({ id, route }));
      } else if (!want && sleds.has(id)) {
        sleds.get(id)!();
        sleds.delete(id);
      }
    });
  };
  const stoopsOff = (): void => {
    for (const g of R15_STOOP_GROUPS) enemies()?.reset(g);
  };
  const out = (): void => void k.set(R15_HAUL_OUT, k.str(R15_HAUL_ID) !== '');

  k.on('quest.started', (e) => { if (e.questId === 'r15') k.later(sync); });
  k.on('quest.completed', (e) => { if (e.questId === 'r15') k.later(sync); });
  k.on('save.loaded', () => {
    // Nothing is held after a load (K7 puts the sleds where they lay): the hawks stand down and the haul id clears.
    k.clear(R15_HAULING);
    k.clear(R15_HAUL_ID);
    out();
    k.later(() => { sync(); stoopsOff(); });
  });
  k.on('sled.taken', (e) => {
    if (!R15_SLEDS.includes(e.id) || !k.active('r15')) return;
    k.set(R15_HAUL_ID, e.id);
    k.set(R15_HAULING);
    out();
  });
  k.on('sled.dropped', (e) => {
    const n = R15_SLEDS.indexOf(e.id);
    if (n < 0 || !k.active('r15')) return;
    k.clear(R15_HAULING);
    const end = routeById(e.id)?.checkpoints.at(-1);
    const f = k.ctx.player.feet;
    if (end && !k.flag(R15_SLED_FLAGS[n]) && Math.hypot(f.x - end.x, f.z - end.z) <= R15_DELIVER_RADIUS) {
      k.set(R15_SLED_FLAGS[n]);
      k.clear(R15_HAUL_ID);
      out();
      toast(k, 'dragonspine.q.r15.delivered');
      k.emit(R15_SLED_EVENT);
      k.later(() => { sync(); recheck(k); });
    }
    k.after(180, () => { if (!k.flag(R15_HAULING)) stoopsOff(); });
  });
  offerScene(k, { quest: 'r15', objective: 'choice', scene: R15_SCENE, npc: R15_SCENE_NPC });
  k.later(sync);
}

export function installM29(k: Kit): void {
  k.on('interact', (e) => { if (e.interactableId === M29_FIRE && k.active('m29')) toast(k, 'dragonspine.q.m29.fire'); });
  offerScene(k, { quest: 'm29', objective: 'confession', scene: M29_CONFESSION_SCENE, npc: M29_CONFESSION_NPC });
}

export function installR16(k: Kit): void {
  k.every(30, () => {
    if (!k.active('r16') || k.flag(R16_MOUTH) || distanceTo(k, 'dragonspine.cave.mouth') > REACH.mouth) return;
    k.set(R16_MOUTH);
    k.emit(R16_MOUTH);
    k.later(() => recheck(k));
  });
  k.on('interact', (e) => { if (e.interactableId === R16_ROCKFALL && k.active('r16')) toast(k, 'dragonspine.q.r16.rockfall'); });
  offerScene(k, { quest: 'r16', objective: 'lines', scene: R16_CAVE_SCENE, npc: R16_CAVE_NPC, ready: () => k.flag(R16_AXE_FLAG) });
}

/** M30: K9's flags and events credit the Anvil's steps and the rubbings; a recheck reads them. */
export function installM30(k: Kit): void {
  const again = (): void => void k.later(() => recheck(k));
  k.on('rubbing.taken', again);
  k.on('shrine.rekindled', again);
  k.on('flag.changed', (e) => { if (e.key.startsWith('shrine.') || e.key.startsWith('world.rubbing.')) again(); });
}
