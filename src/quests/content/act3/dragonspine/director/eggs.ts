// R18 (K13): three eggs from the thief's camp back up the cliff to the nest, one at a time, past the parents. The pick-up and
// nest props are the quest's (props.ts); this holds the rest: the carry reset (an egg that goes back returns to the camp), the
// parents (spawned, despawned and reset here), the failure (a parent dies: the parents take every egg back to the camp, the
// step restarts from there), the count by toast and the load.
import type { Kit, Off } from './shared';
import { recheck, toast } from './shared';
import { routeById } from './climb';
import {
  R18_EGGS_SET, R18_EGG_EVENT, R18_EGG_ITEM, R18_EGG_TAKEN, R18_FAILED_EVENT, R18_FAIL_TOAST, R18_HOLDING, R18_NESTED, R18_NEST_FLAGS,
  R18_NEST_PROPS, R18_PARENTS_TAG,
} from '../r18.quest';

export const R18_PARENTS_GROUP = 'dragonspine.q.r18.parents';

export function installR18(k: Kit): Off {
  const { ctx } = k;
  const inv = () => ctx.services.get('inventory');
  const carry = () => ctx.services.get('carry');
  const enemies = () => ctx.services.get('enemies');
  const live = (): boolean => k.active('r18') && k.objCurrent('r18', 'nested') && !k.flag(R18_NESTED);
  const placed = (): number => R18_NEST_FLAGS.filter((f) => k.flag(f)).length;
  const taken = (): number => R18_EGG_TAKEN.filter((f) => k.flag(f)).length;

  let tracked: Off | null = null;
  let spawned = false;
  const untrack = (): void => { tracked?.(); tracked = null; };
  const dropItems = (): void => {
    const i = inv();
    if (!i) return;
    const n = i.count?.(R18_EGG_ITEM) ?? (i.has(R18_EGG_ITEM) ? 1 : 0);
    if (n > 0) i.remove(R18_EGG_ITEM, n);
  };
  /** The egg in hand goes back to the camp (a carry reset or a load): one pick-up flag clears, the nest keeps its eggs. */
  const returnHeld = (): void => {
    untrack();
    dropItems();
    k.clear(R18_HOLDING);
    const extra = taken() - placed();
    let left = extra;
    for (const f of [...R18_EGG_TAKEN].reverse()) {
      if (left <= 0) break;
      if (k.flag(f)) { k.clear(f); left--; }
    }
  };
  const trackEgg = (n: number): void => {
    untrack();
    const route = routeById(`egg.r18.${n}`);
    const c = carry();
    if (!route || !c) return;
    tracked = c.track({
      route,
      position: () => (k.flag(R18_HOLDING) ? { ...ctx.player.feet } : null),
      held: () => k.flag(R18_HOLDING),
      place: () => { returnHeld(); toast(k, 'dragonspine.q.r18.back'); },
    });
  };

  // An egg lifted from the camp
  k.on('flag.changed', (e) => {
    const i = R18_EGG_TAKEN.indexOf(e.key);
    if (i >= 0 && e.value === true && k.active('r18')) { k.set(R18_HOLDING); trackEgg(i + 1); }
  });
  // An egg set in the nest (any of the three places, in any order)
  k.on('interact', (e) => {
    const i = R18_NEST_PROPS.indexOf(e.interactableId);
    if (i < 0 || !live() || !k.flag(R18_HOLDING) || k.flag(R18_NEST_FLAGS[i])) return;
    untrack();
    dropItems();
    k.clear(R18_HOLDING);
    k.set(R18_NEST_FLAGS[i]);
    const n = placed();
    k.set(R18_EGGS_SET, n);
    k.emit(R18_EGG_EVENT);
    toast(k, `dragonspine.q.r18.set${n}`);
    if (n >= R18_NEST_FLAGS.length) {
      k.set(R18_NESTED);
      k.emit(R18_NESTED);
      k.later(() => recheck(k));
    }
  });

  // A parent dies: the parents take every egg back to the camp and the step is retried from there.
  const fail = (): void => {
    untrack();
    dropItems();
    for (const f of [...R18_EGG_TAKEN, ...R18_NEST_FLAGS]) k.clear(f);
    k.clear(R18_HOLDING);
    k.set(R18_EGGS_SET, 0);
    toast(k, R18_FAIL_TOAST);
    k.emit(R18_FAILED_EVENT);
    spawned = false;
    enemies()?.reset(R18_PARENTS_GROUP);
  };
  k.on('actor.died', (e) => {
    if (e.spawnTag === R18_PARENTS_TAG && live()) k.later(fail);
  });

  // The parents stand on the cliff only while the step is current.
  k.every(30, () => {
    const want = live();
    if (want && !spawned) { spawned = true; enemies()?.spawnGroup(R18_PARENTS_GROUP); }
    else if (!want && spawned) { spawned = false; enemies()?.despawnGroup(R18_PARENTS_GROUP); }
  });

  // A load: the egg in hand goes back to the camp (the carry is not saved), the parents are the spawner's.
  k.on('save.loaded', () => {
    spawned = false;
    untrack();
    k.later(() => { if (k.flag(R18_HOLDING) || taken() > placed()) returnHeld(); });
  });
  return untrack;
}
