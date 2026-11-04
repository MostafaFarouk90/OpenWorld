// R17 (K13): the forge-candle bundle. The player carries it down the road past shrines 3, 2, 1 and back up past the Anvil to 4, 5, 6;
// K9's wayside shrines light only for whoever holds it (the light gate), K7 tracks it for the carry reset (a bundle that goes back
// lies at the last shrine passed, to be picked up again), and the road's two legs are two K4 routes.
import type { Vec3Like } from '../../../../../core/events';
import type { Kit, Off } from './shared';
import { recheck, toast } from './shared';
import { routeById } from './climb';
import {
  R17_BUNDLE_ITEM, R17_BUNDLE_LYING, R17_DOWN, R17_HELD, R17_TAKEN, R17_UP, r17LitFlag,
} from '../r17.quest';

export const R17_ORDER: readonly number[] = [...R17_DOWN, ...R17_UP];
export const R17_LEG_ROUTES = { down: 'candle.r17.down', up: 'candle.r17.up' } as const;

/** The shrine the bundle must light next (the first unlit in road order), or null when all six burn. */
export function nextShrine(lit: (n: number) => boolean): number | null {
  return R17_ORDER.find((n) => !lit(n)) ?? null;
}

export function installR17(k: Kit): Off {
  const { ctx } = k;
  const inv = () => ctx.services.get('inventory');
  const carry = () => ctx.services.get('carry');
  const lit = (n: number): boolean => k.flag(r17LitFlag(n));
  const leg = (): 'down' | 'up' => (lit(1) ? 'up' : 'down');
  const live = (): boolean => k.active('r17') && k.flag(R17_TAKEN) && nextShrine(lit) !== null;

  let lying: Vec3Like | null = null;
  let tracked: { leg: 'down' | 'up'; off: Off } | null = null;
  const held = (): boolean => k.flag(R17_HELD);

  const untrack = (): void => { tracked?.off(); tracked = null; };
  const track = (): void => {
    const want = leg();
    if (!live() || tracked?.leg === want) return;
    untrack();
    const route = routeById(R17_LEG_ROUTES[want]);
    const c = carry();
    if (!route || !c) return;
    const off = c.track({
      route,
      position: () => (held() ? { ...ctx.player.feet } : lying),
      held,
      place: (p) => {
        // A reset (off the road, too low, deep water, a travel, "asked"): the bundle waits at the last shrine passed.
        inv()?.remove(R17_BUNDLE_ITEM, 1);
        k.clear(R17_HELD);
        lying = { x: p.x, y: p.y, z: p.z };
        toast(k, 'dragonspine.q.r17.lost');
      },
    });
    tracked = { leg: want, off };
  };
  const pick = (): void => {
    if (!live() || held()) return;
    inv()?.add(R17_BUNDLE_ITEM, 1);
    k.set(R17_HELD);
    lying = null;
    track();
  };

  // The first pick-up is the quest prop's (it gives the item and sets the flag).
  k.on('flag.changed', (e) => {
    if (e.key === R17_TAKEN && e.value === true && k.active('r17')) { k.set(R17_HELD); lying = null; track(); }
    // Shrine 1 burning ends the down leg; the up leg starts there and a toast says so.
    if (e.key === r17LitFlag(1) && e.value === true && k.active('r17')) { toast(k, 'dragonspine.q.r17.switch'); k.later(track); }
  });
  k.on('wayside.lit', () => k.later(() => { track(); recheck(k); }));
  k.on('quest.completed', (e) => {
    if (e.questId !== 'r17') return;
    untrack();
    k.clear(R17_HELD);
    inv()?.remove(R17_BUNDLE_ITEM, 1);
  });
  // A load: the lying bundle's place is not saved, so the player holds it again (the quest never waits on a lost bundle).
  k.on('save.loaded', () => {
    untrack();
    lying = null;
    k.later(() => {
      if (!live()) { k.clear(R17_HELD); return; }
      if (!inv()?.has(R17_BUNDLE_ITEM)) inv()?.add(R17_BUNDLE_ITEM, 1);
      k.set(R17_HELD);
      track();
    });
  });

  // The wayside light gate: only the holder, and only the next shrine on the road.
  const offs: Off[] = [() => untrack()];
  const wayside = ctx.services.get('waysideShrines');
  if (wayside) offs.push(wayside.setLightGate((index) => held() && nextShrine(lit) === index));

  // A reset bundle lies at the shrine; this interactable picks it up again.
  const interaction = (ctx as { interaction?: { register(i: unknown): Off } }).interaction;
  if (interaction) {
    offs.push(interaction.register({
      id: R17_BUNDLE_LYING, kind: 'use', name: 'r17-bundle-lying', radius: 2.5, promptKey: 'quest.prompt.bundleLying',
      position: (out: Vec3Like) => { if (lying) { out.x = lying.x; out.y = lying.y; out.z = lying.z; } return out; },
      enabled: () => lying !== null && !held() && live(),
      onInteract: pick,
    }));
  }
  if (k.active('r17') && k.flag(R17_TAKEN)) k.later(track);
  return () => { for (const o of offs.splice(0)) o(); };
}
