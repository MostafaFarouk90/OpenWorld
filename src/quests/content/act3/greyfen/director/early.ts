// M23, M24, R12 and M25 rules (K12): everything the quest definitions and the dialogue cannot say.
import type { Kit } from './shared';
import { offerScene, recheck, toast } from './shared';
import { M23_SIGHT_NPC, M23_SIGHT_SCENE, M23_SIGHT_TRIGGER } from '../m23.quest';
import {
  M24_BLOWN, M24_DIVED, M24_FERRY_OPEN, M24_FERRY_RUN, M24_HORN_FLAG, M24_ROUTE_PREFIX, M24_SURFACED, M24_VOLUME,
} from '../m24.quest';
import {
  R12_ARMOUR_GIVEN, R12_BEDS, R12_BURN_DOWN, R12_BURN_KILLS, R12_BURN_KILL_COUNT, R12_BURN_TAG, R12_CHOICE, R12_CUT_DOWN, R12_CUT_FLAG,
  R12_CUT_KILLS, R12_CUT_KILL_COUNT, R12_CUT_TAG, R12_FAVOURED, R12_TORCH_FLAG,
} from '../r12.quest';
import { GREYFEN_LAYOUT } from '../../../../../greyfen/greyfen.layout';
import { M25_DRUNK, M25_HERBS, M25_POT_FLAGS, M25_BREWED } from '../m25.quest';

/** Seconds between the last pot and the drink, in fixed ticks (60 a second). */
/** The first-sight trigger's centre, from K3's layout (never written down here). */
const SIGHT_CENTRE = (() => {
  const t = GREYFEN_LAYOUT.triggers.find((x) => x.id === M23_SIGHT_TRIGGER) as { x: number; z: number } | undefined;
  return t ?? { x: Infinity, z: Infinity };
})();

export const M25_DRINK_TICKS = 180;
export const M25_BURN_RELIEF = 20;
export const M25_SALVE = 'fen-salve';

export function installM23(k: Kit): void {
  // The first sight of the Mere: a set piece (six lines) once the sight step is current and Cael stands in the trigger, or has
  // walked on past it (a gap in the trigger must not strand the quest: the player is as near the shrine as its centre is).
  const trig = k.ctx.anchors.find('greyfen.mere.shrine');
  const inTrigger = (): boolean => k.ctx.triggers.isInside?.(M23_SIGHT_TRIGGER, 'player') === true;
  const past = (): boolean => {
    if (!trig) return false;
    const centre = SIGHT_CENTRE;
    const f = k.ctx.player.feet;
    return Math.hypot(f.x - trig.position.x, f.z - trig.position.z) <= Math.hypot(centre.x - trig.position.x, centre.z - trig.position.z);
  };
  offerScene(k, { quest: 'm23', objective: 'sight', scene: M23_SIGHT_SCENE, npc: M23_SIGHT_NPC, ready: () => inTrigger() || past() });
}

export function installM24(k: Kit): void {
  k.on('dive.started', (e) => {
    if (e.volumeId === M24_VOLUME && k.active('m24')) { k.set(M24_DIVED); k.later(() => recheck(k)); }
  });
  // surfacing counts once the horn is in hand (the swim down also surfaces, with nothing in hand)
  k.on('dive.surfaced', (e) => {
    if (e.volumeId === M24_VOLUME && k.active('m24') && k.flag(M24_HORN_FLAG)) { k.set(M24_SURFACED); k.later(() => recheck(k)); }
  });
  // the horn blown opens the boat for the first run (K7 reads the flag beside `story.m24.complete`)
  k.on('flag.changed', (e) => {
    if (e.key === M24_BLOWN && e.value === true && k.active('m24')) k.set(M24_FERRY_OPEN);
  });
  k.on('ferry.arrived', (e) => {
    if (e.routeId.startsWith(M24_ROUTE_PREFIX) && k.active('m24') && k.flag(M24_BLOWN)) { k.set(M24_FERRY_RUN); k.later(() => recheck(k)); }
  });
  k.on('save.loaded', () => {
    if (k.flag(M24_BLOWN) && k.active('m24')) k.set(M24_FERRY_OPEN);
  });
}

export function installR12(k: Kit): void {
  const torchKeys = R12_BEDS.map(R12_TORCH_FLAG);
  const cutKeys = R12_BEDS.flatMap((n) => [R12_CUT_FLAG(n, 1), R12_CUT_FLAG(n, 2)]);
  const isTorch = (key: string): boolean => torchKeys.includes(key);
  const isCut = (key: string): boolean => cutKeys.includes(key);

  // The first bed treated fixes the choice (K3's readers mirror `story.r12.choice`); the favour moves once.
  const lock = (): void => {
    if (!k.active('r12') || k.str(R12_CHOICE)) return;
    const burned = torchKeys.some((f) => k.flag(f));
    const cut = cutKeys.some((f) => k.flag(f));
    if (!burned && !cut) return;
    const value = burned ? 'burned' : 'cut';
    k.set(R12_CHOICE, value);
    if (!k.flag(R12_FAVOURED)) {
      k.set(R12_FAVOURED);
      k.favour('dragons', value === 'burned' ? -2 : 3);
    }
  };
  k.on('flag.changed', (e) => {
    if (e.value === true && (isTorch(e.key) || isCut(e.key))) {
      lock();
      armourOnLastTorch();
      if (torchKeys.every((f) => k.flag(f)) || cutKeys.every((f) => k.flag(f))) k.emit('story.r12.bedsDone');
      k.later(() => recheck(k));
    }
  });
  k.on('save.loaded', () => { lock(); });

  // the burn branch is paid at its last bed (the cut branch at hand-in: the quest's reward)
  const armourOnLastTorch = (): void => {
    if (!k.active('r12') || k.flag(R12_ARMOUR_GIVEN) || !torchKeys.every((f) => k.flag(f))) return;
    k.set(R12_ARMOUR_GIVEN);
    k.ctx.events.emit('loot.granted', { sourceId: 'r12:armour', items: [{ itemId: 'reed-armour', count: 1 }] });
  };

  // Leech deaths are counted from the first bed treated, whatever bed they were fought at (they may be fought out of order).
  k.on('actor.died', (e) => {
    // any killer counts (a companion's or the fen's own tick), as long as the leech is a bed's own
    if (!k.active('r12')) return;
    if (e.spawnTag === R12_BURN_TAG) bump(R12_BURN_KILL_COUNT, R12_BURN_KILLS, R12_BURN_DOWN);
    else if (e.spawnTag === R12_CUT_TAG) bump(R12_CUT_KILL_COUNT, R12_CUT_KILLS, R12_CUT_DOWN);
  });
  const bump = (counter: string, need: number, done: string): void => {
    const n = k.num(counter) + 1;
    k.set(counter, n);
    if (n >= need && !k.flag(done)) {
      k.set(done);
      k.emit('story.r12.leechesDown');
      k.later(() => recheck(k));
    }
  };
}

export function installM25(k: Kit): void {
  const inventory = () => k.ctx.services.get('inventory');
  // The third pot brews the first salve (the herbs go in; the recipe is Gytha's reward, so the first one is made here).
  const brew = (): void => {
    if (!k.active('m25') || k.flag(M25_BREWED) || !M25_POT_FLAGS.every((f) => k.flag(f))) return;
    k.set(M25_BREWED);
    const inv = inventory();
    for (const h of M25_HERBS) if (inv?.has(h)) inv.remove(h, 1);
    inv?.add(M25_SALVE, 1);
    toast(k, 'greyfen.q.m25.brewed');
    k.after(M25_DRINK_TICKS, drink);
  };
  // The salve is drunk at the cauldron: the Burn drops 20 on screen.
  const drink = (): void => {
    if (!k.active('m25') || k.flag(M25_DRUNK) || !k.flag(M25_BREWED)) return;
    if (!k.objCurrent('m25', 'drink')) { k.after(60, drink); return; }
    const inv = inventory();
    if (inv?.has(M25_SALVE)) inv.remove(M25_SALVE, 1);
    (k.ctx.services as unknown as { get(n: string): { addBurn?(n: number, s: string): void } | undefined }).get('spells')?.addBurn?.(-M25_BURN_RELIEF, 'item');
    k.set(M25_DRUNK);
    toast(k, 'greyfen.q.m25.drunk');
    k.emit('story.m25.drink');
    k.later(() => recheck(k));
  };
  k.on('flag.changed', (e) => {
    if (M25_POT_FLAGS.includes(e.key) && e.value === true) k.later(brew);
  });
  // a load between the brew and the drink: the drink is re-offered
  k.on('save.loaded', () => {
    if (k.active('m25') && k.flag(M25_BREWED) && !k.flag(M25_DRUNK)) k.after(M25_DRINK_TICKS, drink);
  });
}
