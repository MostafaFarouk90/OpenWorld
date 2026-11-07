// R26's convoy on L4's escort service (the R24 pattern): the master and the cart walk from the Rimfoot fire to the Rim Camp once
// loaded, by the road chosen at the master's talk. The fast road climbs the rim stairs: two ambushes come up as Cael and the cart
// reach their points, and after each a guard is carried off wounded (he stands at the camp's aid tent). The long road goes by the
// east flank: at each of two halts the director forces a 30 s storm, the master asks for the brake (a prop), and once both the
// brake is set and the wall has passed the column goes on; two crates slide off at the second halt. A running escort is saved by
// L4 and comes back waiting at its last junction; a halt that had passed sends it straight on, one that had not restarts.
import type { Act4EscortDef } from '../../../../../escort/EscortEngine';
import '../../../../../weather/types';
import type { Kit, Off } from '../../../act4/harrowmark/director/shared';
import { distanceTo, recheck, toast } from '../../../act4/harrowmark/director/shared';
import { Q } from '../ids';
import { R26_HALT_NODES, R26_ROUTE_IDS } from '../anchors';
import {
  R26_AMBUSH, R26_AMBUSH_ARM, R26_AMBUSH_DOWN, R26_ARRIVED, R26_AT_HALT, R26_BRAKED, R26_CART_OUT, R26_CHOICE, R26_CRATES_LEFT, R26_ESCORT,
  R26_FAST, R26_GUARD_OUT, R26_HALT_S, R26_IN, R26_LOADED, R26_LONG, R26_MASTER, R26_SCENE, R26_WAITED, R26_WOUNDED,
} from '../r26.quest';
import { LOG, playWhenCurrent } from './generic';

/** The mules' pace with the crates (L4's cart pace). */
export const R26_PACE = 1.5;
/** Metres from an ambush point at which its group comes up. */
export const R26_AMBUSH_M = 50;
/** Crates the long road loses at its second halt (of forty; N4 reads the choice, this is the story's count). */
export const R26_CRATES_LOST = 2;

export const r26Escort = (road: 'fast' | 'long'): Act4EscortDef => ({
  id: R26_ESCORT,
  members: [{ id: R26_MASTER, kind: 'npc' }, { id: 'cart.r26', kind: 'cart' }],
  route: road === R26_FAST ? R26_ROUTE_IDS.fast : R26_ROUTE_IDS.long,
  pace: R26_PACE,
  kneelOnHit: true,
  nameKey: 'escort.a5.r26',
  ...(road === R26_LONG ? { stopAt: R26_HALT_NODES, shelters: R26_HALT_NODES } : { threatGroups: [...R26_AMBUSH] }),
});

/** Which halt (1 or 2) a junction id is, or 0. */
export const haltOf = (junction: string | null): 0 | 1 | 2 => {
  const i = junction ? R26_HALT_NODES.indexOf(junction) : -1;
  return i < 0 ? 0 : ((i + 1) as 1 | 2);
};

export function installR26(k: Kit): Off {
  const svc = () => k.ctx.services.get('escortsAct4');
  const road = (): 'fast' | 'long' | null => {
    const c = k.str(R26_CHOICE);
    return c === R26_FAST || c === R26_LONG ? c : null;
  };
  const out = (): boolean => k.active('r26') && k.flag(R26_LOADED) && !k.flag(R26_IN);
  const wall = new Map<1 | 2, number>();
  const storms = new Map<1 | 2, () => void>();
  let settle = 0;

  const release = (n: 1 | 2): void => { storms.get(n)?.(); storms.delete(n); };
  const go = (): void => { if (svc()?.go(R26_ESCORT)) k.later(() => recheck(k)); };
  const atHalt = (n: 1 | 2): void => {
    if (!k.flag(R26_AT_HALT(n))) { k.set(R26_AT_HALT(n)); toast(k, 'rim.q.r26.storm'); k.later(() => recheck(k)); }
    if (!wall.has(n)) wall.set(n, 0);
    if (!storms.has(n)) {
      try { const w = k.ctx.services.get('weather'); if (w) storms.set(n, w.forceStorm(`quest:r26.halt.${n}`)); } catch (err) { k.warn(`${LOG} R26 storm: ${String(err)}`); }
    }
  };

  k.on('escort.junction', (e) => {
    if (e.escortId !== R26_ESCORT || road() !== R26_LONG) return;
    const n = haltOf(e.junction);
    if (n) atHalt(n);
  });
  k.on('escort.arrived', (e) => {
    if (e.escortId !== R26_ESCORT || k.flag(R26_ARRIVED)) return;
    k.set(R26_ARRIVED);
    k.after(90, () => { if (svc()?.active() === R26_ESCORT) svc()?.stop(R26_ESCORT); });
    k.later(() => recheck(k));
  });
  k.on('save.loaded', () => { wall.clear(); for (const n of [...storms.keys()]) release(n); settle = 3; });
  // after an ambush, a guard is carried off wounded (the fast road's price)
  k.on('flag.changed', (e) => {
    for (const n of [1, 2] as const) {
      if (e.key !== R26_AMBUSH_DOWN(n) || e.value !== true || k.flag(R26_WOUNDED(n))) continue;
      k.set(R26_WOUNDED(n));
      k.clear(R26_GUARD_OUT(n));
      toast(k, 'rim.q.r26.wounded');
    }
  });

  const POLL = 15;
  k.every(POLL, () => {
    // the master and the guards are away from their posts while the cart is out
    if (out() !== k.flag(R26_CART_OUT)) (out() ? k.set(R26_CART_OUT) : k.clear(R26_CART_OUT));
    for (const n of [1, 2] as const) {
      const want = out() && !k.flag(R26_WOUNDED(n));
      if (want !== k.flag(R26_GUARD_OUT(n))) (want ? k.set(R26_GUARD_OUT(n)) : k.clear(R26_GUARD_OUT(n)));
    }
    if (!out() || k.flag(R26_ARRIVED)) { for (const n of [...storms.keys()]) release(n); return; }
    const way = road();
    if (!way) return;
    if (settle > 0) { settle--; return; } // L4 restores a saved column first
    const s = svc();
    if (!s) return;
    const cur = s.active();
    if (!cur) {
      if (!s.start(r26Escort(way))) k.warn(`${LOG} R26: the convoy did not start`);
      else toast(k, way === R26_FAST ? 'rim.q.r26.road.fast' : 'rim.q.r26.road.long');
      return;
    }
    if (cur !== R26_ESCORT) return;
    if (way === R26_LONG) {
      const st = s.state(R26_ESCORT);
      const n = haltOf(st?.junction ?? null);
      if (n && st?.reason === 'junction') {
        if (k.flag(R26_WAITED(n))) go();
        else atHalt(n);
      }
      for (const m of [1, 2] as const) {
        if (!wall.has(m) || k.flag(R26_WAITED(m))) continue;
        const t = wall.get(m)! + POLL / 60;
        wall.set(m, t);
        if (t >= R26_HALT_S && k.flag(R26_BRAKED(m))) {
          k.set(R26_WAITED(m));
          wall.delete(m);
          release(m);
          toast(k, 'rim.q.r26.passed');
          if (m === 2 && !k.flag(R26_CRATES_LEFT)) { k.set(R26_CRATES_LEFT, R26_CRATES_LOST); toast(k, 'rim.q.r26.crates'); }
          go();
        }
      }
      return;
    }
    // the fast road's ambushes come up as Cael and the cart reach their points
    for (const m of [1, 2] as const) {
      if (k.flag(R26_AMBUSH_ARM(m))) continue;
      if (distanceTo(k, `${Q}.r26.ambush${m}.2`) <= R26_AMBUSH_M) { k.set(R26_AMBUSH_ARM(m)); toast(k, 'rim.q.r26.ambush'); }
    }
  });
  playWhenCurrent(k, { quest: 'r26', objective: 'in', scene: R26_SCENE });
  return () => { for (const n of [...storms.keys()]) release(n); };
}
