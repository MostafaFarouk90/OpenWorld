// Act 5 N9 (plans/act5-N9.md section 3): the Caldera's place names on the full map. Pure, like L9's wasteLayer: the plugin passes
// the fog test and a flag reader; nothing is cached, so a load or a newly revealed cell shows on the next draw.
import { CALDERA_PLACES as SITES } from '../../caldera/calderaSites';
import type { MapLabel } from '../viewTypes';

export interface CalderaPlace {
  id: string;
  x: number;
  z: number;
  /** Flag that shows the place once set (besides the fog grid). */
  discoverFlag?: string;
}

/**
 * The Caldera's named places, positions imported from N1's master table (`CALDERA_PLACES`, src/caldera/calderaSites.ts).
 */
export const CALDERA_PLACES: readonly CalderaPlace[] = [
  { id: 'rim-gate', x: SITES.rimGate[0], z: SITES.rimGate[1] },
  { id: 'rim-camp', x: SITES.rimCamp[0], z: SITES.rimCamp[1] },
  { id: 'lava-stair', x: SITES.lavaStairHead[0], z: SITES.lavaStairHead[1] },
  { id: 'cooling-hall', x: SITES.coolingHall[0], z: SITES.coolingHall[1] },
  { id: 'wyrm-terraces', x: SITES.wyrmTerraces[0], z: SITES.wyrmTerraces[1] },
  { id: 'foundry', x: SITES.foundry[0], z: SITES.foundry[1] },
  { id: 'hammer-hall', x: SITES.hammerHall[0], z: SITES.hammerHall[1] },
  { id: 'anvil-of-ages', x: SITES.anvil[0], z: SITES.anvil[1] },
];

export interface CalderaPorts {
  /** Open region ids (containment's open set). */
  open: readonly string[];
  isRevealed(x: number, z: number): boolean;
  flag(key: string): boolean;
  t(key: string): string;
}

export const CALDERA_REGION = 'caldera';
const safe = (f: () => boolean): boolean => {
  try {
    return f() === true;
  } catch {
    return false;
  }
};

/** The siege is running: M52 started and not complete. */
export const siegeLive = (flag: (k: string) => boolean): boolean => safe(() => flag('story.m52.started')) && !safe(() => flag('story.m52.complete'));

export function calderaLabels(p: CalderaPorts, places: readonly CalderaPlace[] = CALDERA_PLACES): MapLabel[] {
  if (!p.open.includes(CALDERA_REGION)) return [];
  const out: MapLabel[] = [];
  for (const pl of places) {
    if (!Number.isFinite(pl.x) || !Number.isFinite(pl.z)) continue;
    const seen = safe(() => p.isRevealed(pl.x, pl.z)) || (pl.discoverFlag !== undefined && safe(() => p.flag(pl.discoverFlag as string)));
    if (!seen) continue;
    const key = pl.id === 'rim-gate' && siegeLive(p.flag) ? 'map.place.rim-gate.siege' : `map.place.${pl.id}`;
    out.push({ id: `place.${pl.id}`, x: pl.x, z: pl.z, text: p.t(key) });
  }
  return out;
}

export const MAP_ACT5_STRINGS_EN: Record<string, string> = {
  'map.place.rim-gate': 'Rim Gate',
  'map.place.rim-gate.siege': 'Rim Gate (under siege)',
  'map.place.rim-camp': 'Rim Camp',
  'map.place.lava-stair': 'Lava Stair',
  'map.place.cooling-hall': 'Cooling Hall',
  'map.place.wyrm-terraces': 'Wyrm Terraces',
  'map.place.foundry': 'The Foundry',
  'map.place.hammer-hall': 'Hammer Hall',
  'map.place.anvil-of-ages': 'Anvil of Ages',
};
