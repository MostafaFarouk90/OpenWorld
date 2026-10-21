import type { EnemyDef } from '../types';

/**
 * Kindling Fox (design 10 row 4): a harmless guide. It has no moves and no mercy row, takes no part in combat (neutral,
 * `hittable: false`: lock-on, bolts and swings pass through it) and never aggros. Fed a Barley Cake it leads the player to a
 * cache (fox/feed.ts); it also leads R05's fox path through `foxes.guide` (fox/service.ts).
 */
export const KINDLING_FOX: EnemyDef = {
  kind: 'kindling-fox',
  nameKey: 'enemies.name.kindling-fox',
  model: { prefer: [], tint: 0xe8863a, emissive: 0x5a2000, weapons: 'none' },
  maxHealth: 20,
  maxPoise: 0,
  walkSpeed: 2.0,
  chaseSpeed: 4.2,
  moves: [],
  material: 'ash',
  rises: false,
  body: 'quadruped',
  behaviour: 'guide',
};
