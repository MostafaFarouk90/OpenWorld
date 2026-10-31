// M33 (K13 PR 2): Skyhold's net. The cut toasts, the witness count (hunters who saw Cael spare one of their own, read by Thorgar's report), the wyrmlings'
// flight set piece, and the aftermath scene. The tracker also counts D06's courtyard (the same flag, K13's one count of spared hunters).
import type { Kit } from './shared';
import { distanceTo, offerScene, recheck, toast } from './shared';
import { D06_GROUP } from '../d06.quest';
import { M33_AFTERMATH_NPC, M33_AFTERMATH_SCENE, M33_ANCHOR_FLAGS, M33_FLIGHT, M33_PACK_GROUPS, M33_WITNESSES } from '../m33.quest';

/** Thorgar names up to this many witnesses; a larger count is written as this. */
export const WITNESS_CAP = 8;
/** Fixed ticks the flight is held for (60 a second). */
export const FLIGHT_TICKS = 600;
export const FLIGHT_FROM = 'dragonspine.skyhold.camp';
export const FLIGHT_TO = 'dragonspine.skyhold.flight.escape';
export const FLIGHT_NEAR = 70;

export function installM33(k: Kit): void {
  const { ctx } = k;

  k.on('flag.changed', (e) => {
    if (e.value === true && (M33_ANCHOR_FLAGS as readonly string[]).includes(e.key) && k.active('m33')) toast(k, 'dragonspine.q.m33.cut');
  });

  // ---- Witnesses: a member of either pack (or the courtyard) in the group when Cael spares one ------------------------------------
  const seen = new Set<string>();
  let base = k.num(M33_WITNESSES);
  k.on('save.loaded', () => { seen.clear(); base = k.num(M33_WITNESSES); });
  k.on('mercy', (e) => {
    if (!e.actorId || seen.has(e.actorId) || !(k.active('m33') || k.active('d06'))) return;
    const enemies = ctx.services.get('enemies');
    const groups = k.active('m33') ? [...M33_PACK_GROUPS] : [D06_GROUP];
    if (!enemies || !groups.some((g) => enemies.alive(g).includes(e.actorId!))) return;
    seen.add(e.actorId);
    const first = k.num(M33_WITNESSES) === 0;
    k.set(M33_WITNESSES, Math.min(WITNESS_CAP, base + seen.size));
    if (first) toast(k, 'dragonspine.q.m33.witness');
  });

  // ---- The flight: camera held on the escape line while the wyrmlings go -------------------------------------------------------------
  let shot: { release(blendOut?: number): void } | null = null;
  let token = 0;
  const release = (): void => { shot?.release(); shot = null; };
  k.on('save.loaded', () => { token++; release(); });
  k.every(30, () => {
    if (!k.active('m33') || !k.objCurrent('m33', 'flight') || k.flag(M33_FLIGHT) || shot) return;
    if (distanceTo(k, FLIGHT_FROM) > FLIGHT_NEAR) return;
    const from = ctx.anchors.find(FLIGHT_FROM);
    const to = ctx.anchors.find(FLIGHT_TO);
    if (!from || !to) return;
    const p = from.position;
    shot = ctx.cameraRig?.override({ position: { x: p.x, y: p.y + 3, z: p.z }, lookAt: to.position, blendIn: 1, blendOut: 1 }) ?? { release: () => {} };
    const mine = ++token;
    k.after(FLIGHT_TICKS, () => {
      if (mine !== token) return;
      release();
      if (!k.active('m33') || k.flag(M33_FLIGHT)) return;
      k.set(M33_FLIGHT);
      k.emit(M33_FLIGHT);
      recheck(k);
    });
  });
  offerScene(k, { quest: 'm33', objective: 'aftermath', scene: M33_AFTERMATH_SCENE, npc: M33_AFTERMATH_NPC });
}
