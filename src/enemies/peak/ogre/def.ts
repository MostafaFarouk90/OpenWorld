import { ENEMY_ATTACKS } from '../../clips';
import { HELD_PROP_ROTATION } from '../../envProp';
import type { EnemyDef } from '../../types';
import { OGRE_CLUB_ID } from './club';

/**
 * Crag Ogre (design 10 row 12, plans/act3-K6b-pr2.md section 3): a slow brute on the Barbarian rig at 1.7, grey, with a club.
 * `ogre.slam` behind a 1.0 s overhead with a red eye flash and a roar (red, a 2.5 m circle in front); `ogre.throw` hurls a rock
 * at range (yellow). Poise 100; heavy chops deal double poise (peak.plugin.ts). Calm before it swings with two Barley Cakes or
 * one Hearth Bread (either one): it sits and lets the party pass (the `ogre` overlay). Codex only.
 */
export const CRAG_OGRE: EnemyDef = {
  kind: 'crag-ogre',
  nameKey: 'enemies.name.crag-ogre',
  model: {
    prefer: ['barbarian'],
    tint: 0x8a8f96,
    emissive: 0x0a0a0c,
    weapons: 'none',
    hide: ['Barbarian_Round_Shield', '1H_Axe'],
    scale: 1.7,
    props: [{ id: OGRE_CLUB_ID, bone: 'handslotr', position: [0, 0, 0], rotation: HELD_PROP_ROTATION, scale: 1 }],
  },
  maxHealth: 420,
  maxPoise: 100,
  walkSpeed: 1.2,
  chaseSpeed: 2.6,
  breakStaggerSeconds: 2.5,
  moves: [
    {
      id: 'ogre.slam', ...ENEMY_ATTACKS.soldierChop,
      windup: 1.0, telegraph: 'dodge', weapon: 'right', damage: 34, poise: 70,
      range: [0, 2.8], cooldown: 3, recover: 1.2, weight: 3,
      area: { radius: 2.5, centre: 'front', offset: 1.5 },
    },
    {
      id: 'ogre.throw', ...ENEMY_ATTACKS.hunterThrow,
      windup: 0.9, telegraph: 'block', weapon: 'right', damage: 20, poise: 25,
      range: [8, 20], cooldown: 6, recover: 1.1, weight: 2,
      ranged: { shape: 'rock', speed: 15, maxRange: 22, radius: 0.4, originHeight: 2.6 },
    },
  ],
  mercy: {
    verb: 'calm',
    tier: 'normal',
    track: null,
    when: 'calming',
    offerings: [
      { itemId: 'barley-cake', count: 2 },
      { itemId: 'hearth-bread', count: 1 },
    ],
    warmHand: false,
  },
  material: 'wood',
  rises: false,
  behaviour: 'ogre',
  attackersPerTarget: 2,
};
