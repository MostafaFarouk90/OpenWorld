import { HOUND as HOUND_PARAMS } from '../quadruped/params';
import { QUADRUPED_ATTACKS } from '../quadruped/QuadrupedBody';
import type { EnemyDef, MoveDef } from '../types';
import { HOUND } from './tuning';

/**
 * The Ember Hound, design section 10 row 3: a pack hunter that circles, then rushes in threes. Poise 15, flees at
 * 15% health, a 0.4 s crouch before a red (dodge-only) pounce that leaps up to 3.5 m, and a burning bite that
 * ignites. Calm mercy for the dragons' trust: data rows only, the Calm type and state are thread 1's.
 * XP rows belong to the progression thread (25 for `ember-hound`).
 */
export const EMBER_HOUND: EnemyDef = {
  kind: 'ember-hound',
  nameKey: 'enemies.name.ember-hound',
  // The hound has no Knight model; the recipe is only read by humanoid bodies.
  model: { prefer: [], tint: HOUND_PARAMS.tint, emissive: HOUND_PARAMS.emissive, weapons: 'none' },
  maxHealth: 40,
  maxPoise: 15,
  walkSpeed: 2.0,
  chaseSpeed: 5.5,
  fleeAtHealth: 0.15,
  moves: [
    move('hound.pounce', QUADRUPED_ATTACKS.pounce, {
      windup: 0.4, telegraph: 'dodge', weapon: 'right', damage: 14, poise: 15,
      range: [2.0, 3.5], cooldown: 3, recover: 1.0, weight: 3, leap: { maxMetres: 3.5 },
    }),
    move('hound.bite', QUADRUPED_ATTACKS.bite, {
      windup: 0.3, telegraph: 'block', weapon: 'right', damage: 8, poise: 5,
      range: [0, 1.5], cooldown: 1.2, recover: 0.6, weight: 2, onHit: 'ignite',
    }),
  ],
  mercy: {
    verb: 'calm',
    tier: 'normal',
    track: 'dragons',
    when: 'calming',
    offerings: ['hearth-bread', 'ember-coal'],
    packLeader: true,
  },
  material: 'ash',
  rises: false,
  body: 'quadruped',
  behaviour: 'circle-rush',
  attackersPerTarget: HOUND.attackersPerTarget,
  attackStagger: HOUND.attackStaggerSeconds,
  dodgeCounterKnockdown: true,
};

function move(
  id: string,
  clip: { clip: string; activeStart: number; activeEnd: number },
  rest: Omit<MoveDef, 'id' | 'clip' | 'activeStart' | 'activeEnd'>,
): MoveDef {
  return { id, clip: clip.clip, activeStart: clip.activeStart, activeEnd: clip.activeEnd, ...rest };
}
