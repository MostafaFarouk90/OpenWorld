// Act 2 POI content: Fox-Fire chests, the fox cache, rewards, gold and strings. Positions come from A1's roads and
// pasture constants. Gold is paid from ACT2_POI_GOLD (the Act 1 CHEST_GOLD table stays untouched).
import type { Effect } from '../../quests/types';
import { FELLWALKER_PASTURE } from '../../terrain/shape/cinderRoad';
import { roadPoint, type Act2RoadId } from '../../terrain/shape/roadPoint';
import { ACT2_POI_PLACEMENTS } from './placement.act2';
import { ACT2_POI_GOLD_CAP, setPoiGold } from './loot';

export interface FoxChestSite {
  n: number;
  road: Act2RoadId;
  s: number;
  side: number;
}

/** Six hidden chests in Cinderreach (design 7.9: revealed within 20 m while Fox-Fire is on). */
export const FOXFIRE_CHESTS: readonly FoxChestSite[] = [
  { n: 1, road: 'cinder-road', s: 8800, side: -110 },
  { n: 2, road: 'cinder-road', s: 10600, side: 105 },
  { n: 3, road: 'cinder-road', s: 12300, side: -105 },
  { n: 4, road: 'cinder-road', s: 13000, side: 110 },
  { n: 5, road: 'fellwalker-track', s: 600, side: 70 },
  { n: 6, road: 'stonefold-road', s: 300, side: -75 },
];

export const foxChestId = (n: number): string => `chest:poi-a2-foxfire-${n}`;
export const FOX_CACHE_CHEST_ID = 'chest:poi-a2-fox-cache';
export const FOX_CACHE_ANCHOR = 'poi.a2.fox-cache';
export const FOX_CACHE_FLAG = 'world.poi.foxCache.revealed';
/** The cache sits in Fellwalker Pasture, 120 m east and 90 m south of its centre. */
export const FOX_CACHE_POS = { x: FELLWALKER_PASTURE.centre.x + 120, z: FELLWALKER_PASTURE.centre.z - 90 };

export const foxChestPos = (s: FoxChestSite): { x: number; z: number } => {
  const p = roadPoint(s.road, s.s, s.side);
  return { x: p.x, z: p.z };
};

export const takenFlag = (poiId: string): string => `poi.a2.${poiId}.taken`;
export const discoveredFlag = (poiId: string): string => `place.poi.a2.${poiId}.discovered`;
export const loreCodexId = (poiId: string): string => `lore.poi.${poiId}`;

/** Per-source gold. 21 sources, 590 in all. */
export function buildGold(): Record<string, number> {
  const gold: Record<string, number> = {};
  for (const p of ACT2_POI_PLACEMENTS) {
    const t = p.site.template;
    if (['camp', 'cave', 'ruin', 'wyrm-nest', 'hunter-pen'].includes(t)) gold[`chest:poi-a2-${p.site.id}`] = 20;
    if (p.site.params?.ledge) gold[`use:poi-a2-${p.site.id}-ledge`] = 40;
  }
  for (const f of FOXFIRE_CHESTS) gold[foxChestId(f.n)] = 25;
  gold[FOX_CACHE_CHEST_ID] = 60;
  return gold;
}

export interface Act2PoiReward {
  interactableId: string;
  onceFlag: string;
  effects: Effect[];
  codexId?: string;
}

/** Leap caches and lore stones: a once-flagged xp + gold reward through installPoiRewards. */
export function buildRewards(gold: Record<string, number>): Act2PoiReward[] {
  const out: Act2PoiReward[] = [];
  for (const p of ACT2_POI_PLACEMENTS) {
    if (!p.site.params?.ledge) continue;
    const id = `use:poi-a2-${p.site.id}-ledge`;
    const stone = p.site.template === 'lore-stone';
    out.push({
      interactableId: id,
      onceFlag: takenFlag(p.site.id),
      effects: [{ xp: stone ? 60 : 40 }, ...(gold[id] ? [{ giveGold: gold[id] } as Effect] : [])],
      ...(stone ? { codexId: loreCodexId(p.site.id) } : {}),
    });
  }
  return out;
}

setPoiGold(buildGold());
export { ACT2_POI_GOLD_CAP };

export const POI_NAMES: Record<string, string> = {
  camp: "a roadside camp",
  cave: 'a cave mouth',
  ruin: 'a broken ruin',
  'lore-stone': 'a standing stone',
  'wyrm-nest': 'a wyrm nest',
  'hunter-pen': "a hunters' pen",
  vista: 'a lookout',
};

export const POI_STRINGS_EN: Record<string, string> = {
  'poi.a2.found': 'You found {name}.',
  ...Object.fromEntries(Object.entries(POI_NAMES).map(([k, v]) => [`poi.a2.name.${k}`, v])),
  'poi.a2.foxfire.glimmer': 'A light flickers over a hidden chest.',
  'codex.lore.poi-lore-stone-1.name': 'The Pass Stone',
  'codex.lore.poi-lore-stone-1.body':
    'Cut into the stone, in a hand older than Valdren: "What the mountain burns, the mountain keeps. Bring your own fire, or leave."',
};
