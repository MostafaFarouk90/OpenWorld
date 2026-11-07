// R24's cart on L4's escort service: Brand and the rain-cart walk from the spring to the camp gate at 1.5 m/s once the casks
// are loaded. The two shelters nearest the spring are junctions: at each the director forces a 40 s storm (storms.ts reads
// `story.r24.atShelter<n>`), Brand asks for the brake (a prop), and once both the brake is set and the 40 s are gone the
// storm is released and the column is sent on. The two attack groups are armed as Cael and the cart come up on their points.
// A running escort is saved by L4 and comes back waiting at its last junction; a shelter whose wall had not passed restarts
// its 40 s, one that had passed sends the column straight on.
import type { Act4EscortDef } from '../../../../../escort/EscortEngine';
import type { Kit } from '../../harrowmark/director/shared';
import { distanceTo, recheck, toast } from '../../harrowmark/director/shared';
import { W } from '../ids';
import { R24_ROUTE_IDS, R24_SHELTER_NODES } from '../anchors';
import {
  R24_ARM, R24_ARRIVED, R24_BRAKED, R24_CART_OUT, R24_ESCORT, R24_GROUPS, R24_LOADED, R24_STORM_S, R24_WAITED,
} from '../r24.quest';
import { R24_AT_SHELTER } from '../props';
import { LOG } from './generic';

/** Brand's pace with the casks (plan 2.7). */
export const R24_PACE = 1.5;
/** Metres from an attack point at which its group comes up. */
export const R24_ATTACK_M = 50;

export const r24Escort = (): Act4EscortDef => ({
  id: R24_ESCORT,
  members: [{ id: 'carter', kind: 'npc' }, { id: 'cart.rain', kind: 'cart' }],
  route: R24_ROUTE_IDS,
  pace: R24_PACE,
  stopAt: R24_SHELTER_NODES,
  shelters: R24_SHELTER_NODES,
  kneelOnHit: true,
  threatGroups: R24_GROUPS,
  nameKey: 'escort.a4.r24',
});

/** Which shelter (1 or 2) a junction id is, or 0. */
export const shelterOf = (junction: string | null): 0 | 1 | 2 => {
  const i = junction ? R24_SHELTER_NODES.indexOf(junction) : -1;
  return i < 0 ? 0 : ((i + 1) as 1 | 2);
};

export function installR24(k: Kit): void {
  const svc = () => k.ctx.services.get('escortsAct4');
  const out = (): boolean => k.active('r24') && k.flag(R24_LOADED) && !k.flag(R24_ARRIVED);
  const wall = new Map<1 | 2, number>(); // seconds the storm has blown at each shelter
  let settle = 0;

  const go = (): void => { if (svc()?.go(R24_ESCORT)) k.later(() => recheck(k)); };
  const atShelter = (n: 1 | 2): void => {
    if (!k.flag(R24_AT_SHELTER(n))) { k.set(R24_AT_SHELTER(n)); toast(k, 'waste.q.r24.storm'); }
    if (!wall.has(n)) wall.set(n, 0);
  };

  k.on('escort.junction', (e) => {
    if (e.escortId !== R24_ESCORT) return;
    const n = shelterOf(e.junction);
    if (n) atShelter(n);
  });
  k.on('escort.arrived', (e) => {
    if (e.escortId !== R24_ESCORT || k.flag(R24_ARRIVED)) return;
    k.set(R24_ARRIVED);
    k.after(90, () => { if (svc()?.active() === R24_ESCORT) svc()?.stop(R24_ESCORT); });
    k.later(() => recheck(k));
  });
  k.on('save.loaded', () => { wall.clear(); settle = 3; });

  const POLL = 15;
  k.every(POLL, () => {
    // Brand is away from his camp post while the cart is out
    if (out() !== k.flag(R24_CART_OUT)) (out() ? k.set(R24_CART_OUT) : k.clear(R24_CART_OUT));
    if (!out()) return;
    if (settle > 0) { settle--; return; } // L4 restores a saved column first
    const s = svc();
    if (!s) return;
    const cur = s.active();
    if (!cur) { if (!s.start(r24Escort())) k.warn(`${LOG} R24: the cart did not start`); return; }
    if (cur !== R24_ESCORT) return;
    // a restored column waits at its last junction: a passed shelter lets it go, an unfinished one restarts its wall
    const st = s.state(R24_ESCORT);
    const n = shelterOf(st?.junction ?? null);
    if (n && st?.reason === 'junction') {
      if (k.flag(R24_WAITED(n))) go();
      else atShelter(n);
    }
    for (const m of [1, 2] as const) {
      if (!wall.has(m) || k.flag(R24_WAITED(m))) continue;
      const t = wall.get(m)! + POLL / 60;
      wall.set(m, t);
      if (t >= R24_STORM_S && k.flag(R24_BRAKED(m))) {
        k.set(R24_WAITED(m));
        wall.delete(m);
        toast(k, 'waste.q.r24.passed');
        go();
      }
    }
    // the attacks come up as Cael and the cart reach their points
    for (const m of [1, 2] as const) {
      if (k.flag(R24_ARM(m))) continue;
      if (distanceTo(k, `${W}.r24.attack${m}.2`) <= R24_ATTACK_M) { k.set(R24_ARM(m)); toast(k, 'waste.q.r24.attack'); }
    }
  });
}
