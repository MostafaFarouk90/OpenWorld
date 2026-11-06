// M35's three delegations, R20's convoy (one leg a post, so the cart waits at each post until it is passed) and R21's miners,
// on L4's escorts service. A running escort is saved by L4 and comes back at its last junction; everything else here is
// re-derived from quest state on every poll, so a load never strands a leg.
import type { Act4EscortDef } from '../../../../../escort/EscortEngine';
import type { EscortMemberDef } from '../../../../../escort/types';
import type { Kit } from './shared';
import { recheck, toast } from './shared';
import { ROUTES, routeIds, routeSlice } from '../anchors';
import { M35_AMBUSH_FLAG, M35_ESCORT, M35_HOUSES, M35_IN, M35_LANE_TRIGGER, type M35House } from '../m35.quest';
import { R20_AT, R20_ESCORT, R20_PASSED, R20_THROUGH } from '../r20.quest';
import { R21_ESCORT, R21_FIRST_OUT, R21_GROUPS, R21_OUT, type R21Way } from '../r21.quest';

/** Walking pace of every Harrowmark escort (plan 2.7: 2 m/s). */
export const ESCORT_PACE = 2;

const npc = (id: string): EscortMemberDef => ({ id, kind: 'npc' });
const M35_MEMBERS = (h: M35House): EscortMemberDef[] => [npc(`delegate.${h}`), npc(`guard.${h}.1`), npc(`guard.${h}.2`)];

export const m35Escort = (h: M35House): Act4EscortDef => ({
  id: M35_ESCORT(h), members: M35_MEMBERS(h), route: routeIds(`m35.${h}`, ROUTES[`m35.${h}`]!.length), pace: ESCORT_PACE, kneelOnHit: true,
  threatGroups: h === 'grisel' ? ['m35.ambush.1', 'm35.ambush.2'] : [], nameKey: `escort.a4.m35.${h}`,
});

/** R20's legs: route nodes per leg (the cart halts at the end of legs 1 to 3, short of each post). */
export const R20_LEGS: readonly (readonly [number, number])[] = [[1, 5], [5, 8], [8, 10], [10, 12]];
export const r20LegId = (leg: number): string => (leg === R20_LEGS.length ? R20_ESCORT : `${R20_ESCORT}.leg${leg}`);
/** Leg `leg` of the convoy; `parked` brings back a leg that had already arrived (after a load) on its last stretch only. */
export const r20Escort = (leg: number, parked = false): Act4EscortDef => {
  const [from, to] = R20_LEGS[leg - 1]!;
  return {
    id: r20LegId(leg), members: [npc('guard.oswin.1'), { id: 'cart.silver', kind: 'cart' }],
    route: routeSlice('r20.convoy', parked ? to - 1 : from, to), pace: ESCORT_PACE, kneelOnHit: true, nameKey: 'escort.a4.r20',
  };
};

export const r21Escort = (way: R21Way, group: number): Act4EscortDef => ({
  id: R21_ESCORT(group), members: R21_GROUPS[way][group - 1]!.map(npc), route: routeIds('r21.miners', ROUTES['r21.miners']!.length),
  pace: ESCORT_PACE, kneelOnHit: true, threatGroups: ['r21.cellars', 'r21.cellars.all'], nameKey: 'escort.a4.r21',
});

export function installEscorts(k: Kit): void {
  const svc = () => k.ctx.services.get('escortsAct4');
  const running = (): string | null => svc()?.active() ?? null;
  const ensure = (def: Act4EscortDef): void => {
    const s = svc();
    if (!s) return;
    const cur = s.active();
    if (cur === def.id) return;
    if (cur) return; // another escort is out: this one waits for it
    if (!s.start(def)) k.warn(`[harrowmark-a4-quests] escort ${def.id} did not start`);
  };
  const stop = (id: string): void => { if (running() === id) svc()?.stop(id); };

  // ---- which leg should be out now --------------------------------------------------------------------------------
  const wanted = (): Act4EscortDef | null => {
    if (k.active('m35')) {
      for (const h of M35_HOUSES) {
        if (k.flag(M35_IN(h))) continue;
        // the Grisel party walks from the moment the checkpoint is passed (the lane ambush is on its way)
        const from = h === 'grisel' ? ['ambush', 'search', 'griselIn'] : [`${h}In`];
        if (from.some((o) => k.objCurrent('m35', o))) return m35Escort(h);
      }
    }
    if (k.active('r20') && k.flag('story.r20.loaded') && !k.flag(R20_THROUGH)) {
      for (let leg = 1; leg <= R20_LEGS.length; leg++) {
        const last = leg === R20_LEGS.length;
        // a leg is done once it arrived and its post is passed; a post can only be passed once the cart is parked there
        if (!last && k.flag(R20_AT(leg)) && k.flag(R20_PASSED(leg))) continue;
        // parked short of post `leg`: the held leg stays out, or (after a load, which drops arrived escorts) comes back parked
        if (!last && k.flag(R20_AT(leg))) return arrivedHold.has(r20LegId(leg)) ? null : r20Escort(leg, true);
        return r20Escort(leg);
      }
    }
    if (k.active('r21') && k.objCurrent('r21', 'out')) {
      const way = (k.str('story.r21.choice') || 'leaders') as R21Way;
      const group = way === 'all' && k.flag(R21_FIRST_OUT) ? 2 : 1;
      return r21Escort(way, group);
    }
    return null;
  };

  const sync = (): void => {
    const w = wanted();
    const cur = running();
    // an Act 4 Harrowmark leg that is no longer wanted is put away (the next one starts on the following poll)
    if (cur && cur !== w?.id && isMine(cur) && !arrivedHold.has(cur)) stop(cur);
    if (w) ensure(w);
  };
  // a leg that arrived stays standing until its post is passed (R20) or for a moment (the others)
  const arrivedHold = new Set<string>();
  const isMine = (id: string): boolean => id.startsWith('m35.') || id.startsWith('r20.convoy') || id.startsWith('r21.miners');

  k.on('escort.arrived', (e) => {
    const id = e.escortId;
    for (const h of M35_HOUSES) {
      if (id !== M35_ESCORT(h)) continue;
      k.set(M35_IN(h));
      k.after(90, () => stop(id));
      k.later(() => recheck(k));
    }
    for (let leg = 1; leg <= R20_LEGS.length; leg++) {
      if (id !== r20LegId(leg)) continue;
      if (leg === R20_LEGS.length) {
        k.set(R20_THROUGH);
        k.after(120, () => stop(id));
        k.later(() => recheck(k));
      } else {
        k.set(R20_AT(leg));
        arrivedHold.add(id);
        toast(k, 'harrowmark.a4.q.r20.halt');
      }
    }
    for (const g of [1, 2]) {
      if (id !== R21_ESCORT(g)) continue;
      const all = k.str('story.r21.choice') === 'all';
      if (all && g === 1) { k.set(R21_FIRST_OUT); toast(k, 'harrowmark.a4.q.r21.firstOut'); } else k.set(R21_OUT);
      k.after(60, () => stop(id));
      k.later(() => recheck(k));
    }
  });
  // R20: a post passed lets its parked leg go (the next leg starts from the same spot)
  const release = (): void => {
    for (let leg = 1; leg < R20_LEGS.length; leg++) {
      const id = r20LegId(leg);
      if (arrivedHold.has(id) && k.flag(R20_PASSED(leg))) {
        arrivedHold.delete(id);
        stop(id);
        toast(k, 'harrowmark.a4.q.r20.passed');
      }
    }
  };
  k.on('save.loaded', () => arrivedHold.clear());
  k.every(20, () => { release(); sync(); });

  // M35: the lane ambush springs when the Grisel party's walk reaches the lane (Cael walks it with them)
  const spring = (): void => {
    if (!k.active('m35') || k.flag(M35_AMBUSH_FLAG)) return;
    if (k.objCurrent('m35', 'ambush') || k.objDone('m35', 'ambush')) k.set(M35_AMBUSH_FLAG);
  };
  k.on('trigger.enter', (e) => { if (e.triggerId === M35_LANE_TRIGGER && e.actorId === 'player') spring(); });
  k.every(30, () => {
    if (!k.active('m35') || k.flag(M35_AMBUSH_FLAG) || !k.objCurrent('m35', 'ambush')) return;
    const a = k.ctx.anchors.find('harrowmark.a4.q.m35.lane');
    const f = k.ctx.player.feet;
    if (a && Math.hypot(f.x - a.position.x, f.z - a.position.z) <= 14) spring();
  });
}
