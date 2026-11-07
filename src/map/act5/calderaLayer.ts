// Act 5 N9 (plans/act5-N9.md section 3): the Caldera's place names on the full map. Pure, like L9's wasteLayer: the plugin passes
// the fog test and a flag reader; nothing is cached, so a load or a newly revealed cell shows on the next draw.
import { CALDERA_CENTRE } from '../../region/act5Regions';
import type { MapLabel } from '../viewTypes';

export interface CalderaPlace {
  id: string;
  x: number;
  z: number;
  /** Flag that shows the place once set (besides the fog grid). */
  discoverFlag?: string;
}

/**
 * The Caldera's named places. **Placeholder positions** copied from N1's plan (plans/act5-N1.md section 1); N1's `CALDERA_PLACES` export replaces
 * this table once its branch is merged (the common rule: import, never hard-code).
 */
export const CALDERA_PLACES: readonly CalderaPlace[] = [
  { id: 'rim-gate', x: 11000, z: 6470 }, // N1 plan: CALDERA_PLACES.rimGate (src/caldera/calderaSites.ts); import once merged
  { id: 'rim-camp', x: 11000, z: 6760 }, // rimCamp
  { id: 'lava-stair', x: 11000, z: 6880 }, // lavaStairHead
  { id: 'cooling-hall', x: 11150, z: 7420 }, // coolingHall
  { id: 'wyrm-terraces', x: 11950, z: 7650 }, // wyrmTerraces
  { id: 'foundry', x: 11000, z: 7500 }, // foundry
  { id: 'hammer-hall', x: 11000, z: 7700 }, // hammerHall (label only, it is an interior)
  { id: 'anvil-of-ages', x: CALDERA_CENTRE.x, z: CALDERA_CENTRE.z },
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
