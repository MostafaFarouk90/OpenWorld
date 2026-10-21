import type { EnemyDef, MoveDef } from '../types';
import { WYRM_ATTACKS } from './WyrmBody';

/**
 * The Ember Wyrm, design section 10 row 6 (plans/act2-A6a.md 1.3): flies, circles, strafes and dives; a wing hit in
 * the air brings it down, and on the ground it bites, whips its tail and spits a 7 m flame jet. Calm with Ember Coal
 * or the Warm Hand, only while it lies stunned on the ground (elite, dragons' trust +2). XP rows are in
 * progression/tuning.ts (180).
 */
export const EMBER_WYRM_DEF: EnemyDef = {
  kind: 'ember-wyrm',
  nameKey: 'enemies.name.ember-wyrm',
  // Procedural body: the recipe is only read by humanoid bodies.
  model: { prefer: [], tint: 0xffffff, weapons: 'none' },
  maxHealth: 220,
  maxPoise: 60,
  walkSpeed: 2.5,
  chaseSpeed: 4.5,
  moves: [
    move('wyrm.spit', WYRM_ATTACKS.spit, {
      windup: 0.7, telegraph: 'dodge', weapon: 'right', damage: 22, poise: 25,
      range: [3, 7], cooldown: 4, recover: 1.0, weight: 2, onHit: 'ignite', flight: 'ground',
    }),
    move('wyrm.bite', WYRM_ATTACKS.bite, {
      windup: 0.4, telegraph: 'block', weapon: 'right', damage: 18, poise: 20,
      range: [0, 2.2], cooldown: 1.5, recover: 0.7, weight: 3, flight: 'ground',
    }),
    move('wyrm.tailWhip', WYRM_ATTACKS.tailWhip, {
      windup: 0.5, telegraph: 'block', weapon: 'left', damage: 16, poise: 30,
      range: [0, 3.5], cooldown: 3, recover: 0.8, weight: 2, flight: 'ground',
    }),
    move('wyrm.dive', WYRM_ATTACKS.dive, {
      windup: 0.9, telegraph: 'dodge', weapon: 'right', damage: 28, poise: 40,
      range: [5, 14], cooldown: 6, recover: 1.2, weight: 1, leap: { maxMetres: 14 }, flight: 'air',
    }),
  ],
  mercy: {
    verb: 'calm',
    tier: 'elite',
    track: 'dragons',
    when: 'calming',
    offerings: [{ itemId: 'ember-coal', count: 1 }],
    warmHand: true,
  },
  material: 'ash',
  rises: false,
  body: 'wyrm',
  behaviour: 'wyrm-flight',
  breakStaggerSeconds: 3,
  poiseBreakBones: ['wingL', 'wingR'],
};

/**
 * The Wyrmling, design section 10 row 7 (plans/act2-A6a.md 1.4): skittish, keeps its distance, bites or puffs only
 * when cornered or struck. Calm with any bread or the Warm Hand (dragons' trust +1). XP 15.
 */
export const WYRMLING_DEF: EnemyDef = {
  kind: 'wyrmling',
  nameKey: 'enemies.name.wyrmling',
  model: { prefer: [], tint: 0xffffff, weapons: 'none' },
  maxHealth: 30,
  maxPoise: 10,
  walkSpeed: 2,
  chaseSpeed: 6,
  moves: [
    move('wyrmling.bite', WYRM_ATTACKS.bite, {
      windup: 0.3, telegraph: 'block', weapon: 'right', damage: 6, poise: 5,
      range: [0, 1.2], cooldown: 1.5, recover: 0.6, weight: 2,
    }),
    move('wyrmling.puff', WYRM_ATTACKS.puff, {
      windup: 0.3, telegraph: 'block', weapon: 'right', damage: 5, poise: 5,
      range: [0, 2], cooldown: 3, recover: 0.6, weight: 1, onHit: 'ignite',
    }),
  ],
  mercy: {
    verb: 'calm',
    tier: 'normal',
    track: 'dragons',
    when: 'calming',
    offerings: [
      { itemId: 'hearth-bread', count: 1 },
      { itemId: 'barley-cake', count: 1 },
    ],
    warmHand: true,
  },
  material: 'ash',
  rises: false,
  body: 'wyrm',
  behaviour: 'skittish',
};

function move(
  id: string,
  clip: { clip: string; activeStart: number; activeEnd: number },
  rest: Omit<MoveDef, 'id' | 'clip' | 'activeStart' | 'activeEnd'>,
): MoveDef {
  return { id, clip: clip.clip, activeStart: clip.activeStart, activeEnd: clip.activeEnd, ...rest };
}
