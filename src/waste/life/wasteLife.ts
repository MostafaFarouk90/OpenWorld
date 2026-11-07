// The Waste's living state (Act 4 L1 PR 2, plans/act4-L1.md section 16): which places are discovered on which trigger, and
// what the Ashgate refuge and the Walker Camp show for the story flags (R19's pennants, R21's miners, R24's casks and
// cisterns). Pure data and readers; the waste-life plugin draws it and re-derives it on every flag change and load.
import { poiPlaceId, poiTriggerId, WASTE_POIS } from '../wasteSites';

export const discoveredFlag = (placeId: string): string => `place.${placeId}.discovered`;

export interface WastePlace {
  placeId: string;
  triggerId: string;
  /** Text key of the place's name (the "You found ..." toast). */
  nameKey: string;
}

/** The five sites (their discover triggers are PR 1's site volumes, plus the Glasslands') and the eleven POIs. */
export const WASTE_PLACES: readonly WastePlace[] = [
  ...(['walker-camp', 'cinder-chapel', 'glasslands', 'husk-cathedral', 'rimfoot'] as const).map((s) => ({
    placeId: `waste.${s}`,
    triggerId: `trg.waste.${s}`,
    nameKey: `waste.place.${s}`,
  })),
  ...WASTE_POIS.map((p) => ({ placeId: poiPlaceId(p.id), triggerId: poiTriggerId(p.id), nameKey: `waste.poi.${p.template}` })),
];

/** The four R19 companies, their pennant colours, west to east along the refuge's banner row. */
export const R19_COMPANIES = ['archers', 'pikes', 'horse', 'engineers'] as const;
export type R19CompanyId = (typeof R19_COMPANIES)[number];

export interface RefugeDressing {
  /** The refuge stands from M41's end. */
  present: boolean;
  /** The companies whose pennants fly raised (R19's pair). */
  raised: R19CompanyId[];
  /** Miners standing at the fire: 3, or 12 after R21's "all". */
  miners: number;
  /** R24's casks kept for the refugees ("half"). */
  casks: boolean;
}

export interface Flags {
  getBool(key: string): boolean;
  getString(key: string): string;
}

export const REFUGE_PRESENT_FLAG = 'story.m41.complete';
export const R19_CHOICE_FLAG = 'story.r19.choice';
export const R21_CHOICE_FLAG = 'story.r21.choice';
export const R24_CHOICE_FLAG = 'story.r24.choice';
export const REFUGE_MINERS_DEFAULT = 3;
export const REFUGE_MINERS_ALL = 12;

/** `story.r19.choice` is the pair sorted and joined with '-' (L2's r19Pair); anything else raises nothing. */
export function raisedCompanies(choice: string): R19CompanyId[] {
  const parts = choice.split('-');
  if (parts.length !== 2) return [];
  const ids = parts.filter((p): p is R19CompanyId => (R19_COMPANIES as readonly string[]).includes(p));
  return ids.length === 2 && ids[0] !== ids[1] ? ids : [];
}

export function refugeDressing(f: Flags): RefugeDressing {
  const present = f.getBool(REFUGE_PRESENT_FLAG);
  return {
    present,
    raised: present ? raisedCompanies(f.getString(R19_CHOICE_FLAG)) : [],
    miners: !present ? 0 : f.getString(R21_CHOICE_FLAG) === 'all' ? REFUGE_MINERS_ALL : REFUGE_MINERS_DEFAULT,
    casks: present && f.getString(R24_CHOICE_FLAG) === 'half',
  };
}

/** The Walker Camp's cisterns hold water once R24's casks all went to the walkers. */
export const cisternsFull = (f: Flags): boolean => f.getString(R24_CHOICE_FLAG) === 'all';
