import type { EnemyDef } from '../../types';
import { HAWK } from '../tuning';
import { HAWK_ATTACKS } from './HawkBody';

/**
 * Rime Hawk (design 10 row 11, plans/act3-K6b-pr2.md section 2), the first flying enemy: soars out of reach and stoops on
 * its target after a 0.8 s hover with a white wing flash and a shriek (red: dodge); after a dive that missed it may rake with
 * its wings (yellow). Poise 30. A projectile in the hover or the dive, or a poise break in the air, knocks it to the ground
 * for 4 s: then (or perched on its nest, unstruck) Calm with Hawk Jerky, dragons' trust +1. No Spare. The `hawk` overlay.
 */
export const RIME_HAWK: EnemyDef = {
  kind: 'rime-hawk',
  nameKey: 'enemies.name.rime-hawk',
  // Procedural body: the recipe's tint is the plumage.
  model: { prefer: [], tint: 0xd8dde3, weapons: 'none' },
  maxHealth: 60,
  maxPoise: 30,
  walkSpeed: 3,
  chaseSpeed: 6,
  breakStaggerSeconds: HAWK.groundedSeconds,
  moves: [
    {
      id: 'hawk.stoop', ...HAWK_ATTACKS.stoop,
      windup: 0.8, telegraph: 'dodge', weapon: 'right', damage: 22, poise: 30,
      range: [4, 16], cooldown: 4, recover: 0.2, weight: 3, leap: { maxMetres: 18 }, flight: 'air',
    },
    {
      id: 'hawk.rake', ...HAWK_ATTACKS.rake,
      windup: 0.5, telegraph: 'block', weapon: 'right', damage: 10, poise: 40,
      range: [0, 3], cooldown: 3, recover: 0.4, weight: 2,
    },
  ],
  mercy: {
    verb: 'calm',
    tier: 'normal',
    track: 'dragons',
    when: 'calming',
    offerings: [{ itemId: 'hawk-jerky', count: 1 }],
    warmHand: false,
    precondition: 'grounded',
  },
  material: 'ash',
  rises: false,
  body: 'bird',
  behaviour: 'hawk',
};
