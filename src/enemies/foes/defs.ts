import type { FoeDef, FoeKind } from './types';

export const ASH_SCARECROW: FoeDef = {
  kind: 'ash-scarecrow',
  nameKey: 'enemies.name.ash-scarecrow',
  maxHealth: 25,
  maxPoise: 0,
  material: 'straw',
  team: 'hostile',
};

export const BLIGHTBLOOM: FoeDef = {
  kind: 'blightbloom',
  nameKey: 'enemies.name.blightbloom',
  maxHealth: 40,
  maxPoise: 0,
  material: 'wood',
  team: 'hostile',
};

/** A ford barrier only a heavy blow breaks. 'neutral': the player can damage it and it never attacks. */
export const TOLL_POST: FoeDef = {
  kind: 'toll-post',
  nameKey: 'enemies.name.toll-post',
  maxHealth: 120,
  maxPoise: 0,
  material: 'wood',
  team: 'neutral',
};

export const FOE_DEFS: Readonly<Record<FoeKind, FoeDef>> = {
  'ash-scarecrow': ASH_SCARECROW,
  blightbloom: BLIGHTBLOOM,
  'toll-post': TOLL_POST,
};

export function isFoeKind(kind: unknown): kind is FoeKind {
  return typeof kind === 'string' && Object.prototype.hasOwnProperty.call(FOE_DEFS, kind);
}

/** The registry of foe definitions, mirroring `ENEMY_DEFS`. */
export const FoeRegistry = {
  get(kind: FoeKind): FoeDef {
    return FOE_DEFS[kind];
  },
  has: isFoeKind,
  kinds(): FoeKind[] {
    return Object.keys(FOE_DEFS) as FoeKind[];
  },
} as const;
