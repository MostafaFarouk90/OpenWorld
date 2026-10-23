import type { EnemyDef, MoveDef } from '../types';

/** Clip windows of the crawler's moves (normalised; the body's scripts open them at these times). */
const ATTACKS = {
  bite: { clip: 'Bite', activeStart: 0.35, activeEnd: 0.6 },
  spit: { clip: 'Spit', activeStart: 0.4, activeEnd: 0.55 },
  drop: { clip: 'Land', activeStart: 0, activeEnd: 0.4 },
} as const;

/**
 * Slag Crawler (design 10 row 8): a six-legged slag beast that waits on a ceiling anchor and drops on the player (approved
 * invention: no wall-walking), then fights on the floor with a slag spit and a bite behind a 0.5 s rear-up and drip. Poise 25.
 * A cooling hit staggers it whatever its poise. Calm: a thrown Cooling Draught (its own throw prompt, ground/throw.ts), or a
 * cooling hit then hold T (free); Grisel +1. A calmed crawler curls up where it is and the miners move it (a curled form).
 */
export const SLAG_CRAWLER: EnemyDef = {
  kind: 'slag-crawler',
  nameKey: 'enemies.name.slag-crawler',
  model: { prefer: [], tint: 0x3a2a22, emissive: 0xff5a1f, weapons: 'none' },
  maxHealth: 55,
  maxPoise: 25,
  walkSpeed: 1.6,
  chaseSpeed: 4.2,
  moves: [
    {
      id: 'crawler.bite', ...ATTACKS.bite,
      windup: 0.5, telegraph: 'block', weapon: 'right', damage: 10, poise: 8,
      range: [0, 1.5], cooldown: 1.4, recover: 0.7, weight: 3,
    },
    {
      id: 'crawler.spit', ...ATTACKS.spit,
      windup: 0.5, telegraph: 'block', weapon: 'right', damage: 8, poise: 5,
      range: [3, 11], cooldown: 4, recover: 0.9, weight: 2, element: 'fire',
      ranged: { shape: 'glob', speed: 14, maxRange: 12, radius: 0.3, originHeight: 0.6, ignite: 3 },
    },
  ],
  mercy: {
    verb: 'calm',
    tier: 'normal',
    track: 'grisel',
    when: 'calming',
    offerings: [{ itemId: 'cooling-draught', count: 1 }],
    delivery: 'thrown',
    freeCalm: 'cooled',
  },
  settles: 'curled',
  material: 'metal',
  rises: false,
  body: 'crawler',
  behaviour: 'ceiling',
};

/** The landing of a ceiling drop: a 3 m circle around the crawler, red (dodge only by leaving the circle). */
export const CRAWLER_DROP: MoveDef = {
  id: 'crawler.drop', ...ATTACKS.drop,
  windup: 0.8, telegraph: 'dodge', weapon: 'right', damage: 14, poise: 15,
  range: [0, 0], cooldown: 0, recover: 0, weight: 0,
  area: { radius: 3, centre: 'self' },
};
