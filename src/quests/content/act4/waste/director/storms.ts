// The Waste quests' weather (plan 4, coordinator 18:01): forced storms on M42's crossing (gate arch to camp), on M43's Storm
// Walk and at R24's two shelter waits; the clear held while M46's waves run (the road between keeps real weather), on R24's road
// between its two storms, and within 30 m of a hand-in. Every hold is derived from flags and quest state each poll, so a load, a completion or a teardown can never
// strand one; one map, one release each.
import type { Kit, Off } from '../../harrowmark/director/shared';
import '../../../../../weather/types';
import { WASTE_A4_QUEST_DEFS } from '../waste.content';
import { M42_CAMP, M42_GATE } from '../m42.quest';
import { M43_WALKING } from '../m43.quest';
import { R24_ARRIVED, R24_CART_OUT, R24_WAITED } from '../r24.quest';
import { R24_AT_SHELTER } from '../props';
import { LOG } from './generic';

/** Metres from a hand-in talker within which the clear is held (L4's escort rule, the same number). */
export const HAND_IN_CLEAR_M = 30;

export interface StormWants {
  storms: string[];
  clears: string[];
}

/** The forced storms and held clears the quest state asks for now (reasons are stable ids). */
export function wantedWeather(k: Kit, extraClear: () => string[] = () => []): StormWants {
  const storms: string[] = [];
  if (k.active('m42') && k.flag(M42_GATE) && !k.flag(M42_CAMP)) storms.push('quest:m42.crossing');
  if (k.active('m43') && k.flag(M43_WALKING)) storms.push('quest:m43.walk');
  for (const n of [1, 2] as const) if (k.active('r24') && k.flag(R24_AT_SHELTER(n)) && !k.flag(R24_WAITED(n))) storms.push(`quest:r24.shelter.${n}`);
  // R24 has its own two storms: the real weather does not halt the column on the road between them (L13 Phase H L2: the cart
  // ran 27 game minutes with real storms halting it). Released at each shelter wait, so the quest's storm can blow.
  const road = k.active('r24') && k.flag(R24_CART_OUT) && !k.flag(R24_ARRIVED) && !storms.some((x) => x.startsWith('quest:r24.')) ? ['quest:r24.road'] : [];
  return { storms, clears: [...road, ...handInClears(k), ...extraClear()] };
}

/** A talk step is current and Cael stands within 30 m of its talker. */
function handInClears(k: Kit): string[] {
  const npcs = k.ctx.services.get('npcs');
  if (!npcs) return [];
  const feet = k.ctx.player.feet;
  for (const q of WASTE_A4_QUEST_DEFS) {
    if (!k.active(q.id)) continue;
    for (const o of q.objectives) {
      if (o.type !== 'talk' || !k.objCurrent(q.id, o.id) || o.id === 'brief') continue;
      if (typeof o.target !== 'string') continue;
      const at = npcs.position(o.target);
      if (at && Math.hypot(at.x - feet.x, at.z - feet.z) <= HAND_IN_CLEAR_M) return ['quest:waste.hand-in'];
    }
  }
  return [];
}

export function installWeather(k: Kit, extraClear: () => string[]): Off {
  const held = new Map<string, () => void>();
  const sync = (): void => {
    const w = k.ctx.services.get('weather');
    const want = wantedWeather(k, extraClear);
    const keys = new Set([...want.storms.map((s) => `storm|${s}`), ...want.clears.map((c) => `clear|${c}`)]);
    for (const [key, release] of held) if (!keys.has(key)) { release(); held.delete(key); }
    if (!w) return;
    for (const key of keys) {
      if (held.has(key)) continue;
      const [kind, reason] = key.split('|') as ['storm' | 'clear', string];
      try {
        held.set(key, kind === 'storm' ? w.forceStorm(reason) : w.holdClear(reason));
      } catch (err) {
        k.warn(`${LOG} weather ${key}: ${String(err)}`);
      }
    }
  };
  k.every(15, sync);
  k.on('save.loaded', () => k.later(sync));
  return () => { for (const r of held.values()) r(); held.clear(); };
}

