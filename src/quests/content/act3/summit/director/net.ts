// M33 (K13 PR 2): Skyhold's net. The cut toasts, the witness count (hunters of either pack who saw Cael spare one of their own, read by Thorgar's report;
// the plan defines it for M33 only, so D06's courtyard mercies are not counted), the wyrmlings' flight set piece (three wyrmlings on a FlightPath, with
// K13's particle flock as the fallback, flock.ts), and the aftermath scene.
import type { Kit, Off } from './shared';
import { distanceTo, offerScene, recheck, toast } from './shared';
import { startFlock, type Flock } from './flock';
import { M33_AFTERMATH_NPC, M33_AFTERMATH_SCENE, M33_ANCHOR_FLAGS, M33_FLIGHT, M33_PACK_GROUPS, M33_WITNESSES } from '../m33.quest';

/** Thorgar names up to this many witnesses; a larger count is written as this. */
export const WITNESS_CAP = 8;
/** Fixed ticks the flight is held for (60 a second). */
export const FLIGHT_TICKS = 600;
export const FLIGHT_FROM = 'dragonspine.skyhold.camp';
export const FLIGHT_TO = 'dragonspine.skyhold.flight.escape';
/** The handler lies about 100 m from the camp, so the flight starts as the talk with him ends. */
export const FLIGHT_NEAR = 110;

export function installM33(k: Kit): Off {
  const { ctx } = k;

  k.on('flag.changed', (e) => {
    if (e.value === true && (M33_ANCHOR_FLAGS as readonly string[]).includes(e.key) && k.active('m33')) toast(k, 'dragonspine.q.m33.cut');
  });

  // ---- Witnesses: a member of either pack in the group when Cael spares one ------------------------------------
  const seen = new Set<string>();
  let base = k.num(M33_WITNESSES);
  k.on('save.loaded', () => { seen.clear(); base = k.num(M33_WITNESSES); });
  k.on('mercy', (e) => {
    if (!e.actorId || seen.has(e.actorId) || !k.active('m33')) return;
    const enemies = ctx.services.get('enemies');
    if (!enemies || !M33_PACK_GROUPS.some((g) => enemies.alive(g).includes(e.actorId!))) return;
    seen.add(e.actorId);
    const first = k.num(M33_WITNESSES) === 0;
    k.set(M33_WITNESSES, Math.min(WITNESS_CAP, base + seen.size));
    if (first) toast(k, 'dragonspine.q.m33.witness');
  });

  // ---- The flight: camera held on the escape line while the three wyrmlings fly the net's line to the escape anchor and are removed -------------------------------------------------------------
  let shot: { release(blendOut?: number): void } | null = null;
  let token = 0;
  let flock: Flock | null = null;
  const release = (): void => { shot?.release(); shot = null; };
  const endFlock = (): void => { flock?.dispose(); flock = null; };
  k.on('save.loaded', () => { token++; release(); endFlock(); });
  k.every(30, () => {
    if (!k.active('m33') || !k.objCurrent('m33', 'flight') || k.flag(M33_FLIGHT) || shot) return;
    if (distanceTo(k, FLIGHT_FROM) > FLIGHT_NEAR) return;
    const from = ctx.anchors.find(FLIGHT_FROM);
    const to = ctx.anchors.find(FLIGHT_TO);
    if (!from || !to) return;
    const p = from.position;
    shot = ctx.cameraRig?.override({ position: { x: p.x, y: p.y + 3, z: p.z }, lookAt: to.position, blendIn: 1, blendOut: 1 }) ?? { release: () => {} };
    const mine = ++token;
    const lift = (q: { x: number; y: number; z: number }, dy: number) => ({ x: q.x, y: q.y + dy, z: q.z });
    flock = startFlock(ctx.scene, lift(p, 1), to.position, (m) => k.warn(m));
    const fly = k.every(1, () => {
      if (mine !== token || !flock) { fly(); return; }
      try { flock.step(1 / 60); } catch (err) {
        k.warn(`summit: the flight failed (${String(err)})`);
        endFlock();
        flock = startFlock(ctx.scene, lift(p, 1), to.position, (m) => k.warn(m), true);
      }
      if (flock?.done) { endFlock(); fly(); }
    });
    k.after(FLIGHT_TICKS, () => {
      fly();
      if (mine === token) endFlock();
      if (mine !== token) return;
      release();
      if (!k.active('m33') || k.flag(M33_FLIGHT)) return;
      k.set(M33_FLIGHT);
      k.emit(M33_FLIGHT);
      recheck(k);
    });
  });
  offerScene(k, { quest: 'm33', objective: 'aftermath', scene: M33_AFTERMATH_SCENE, npc: M33_AFTERMATH_NPC });
  return endFlock;
}
