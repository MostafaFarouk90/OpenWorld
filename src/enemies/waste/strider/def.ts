import type { EnemyDef } from '../../types';
import { STRIDER } from '../tuning';
import { STRIDER_ATTACKS } from './clips';

/**
 * Waste Strider (design 10 row 13, plans/act4-L5.md section 2): a tall long-legged ash-eater on procedural legs. It keeps
 * 4 to 9 m from its target and fights from there: `strider.lunge` (a forelimb stab along a 6 m line after a 0.6 s leg
 * draw-back, yellow) and `strider.blast` (the same draw-back with a sand puff, then sand kicked over a patch in front, red,
 * slows). A projectile, a spell or a heavy blow on a shin trips it at once; two light hits on one leg within 4 s also do
 * (the `strider` overlay and the waste plugin's modifier). Calm with a Rain Flask while it is tripped or unaware: it drinks
 * from the poured water and walks off. Ashwalkers +1.
 */
export const WASTE_STRIDER: EnemyDef = {
  kind: 'waste-strider',
  nameKey: 'enemies.name.waste-strider',
  // Procedural body: the recipe's tint is the hull's ash grey.
  model: { prefer: [], tint: 0xa49c90, emissive: 0x120804, weapons: 'none' },
  maxHealth: STRIDER.maxHealth,
  maxPoise: STRIDER.maxPoise,
  walkSpeed: STRIDER.walkSpeed,
  chaseSpeed: STRIDER.chaseSpeed,
  breakStaggerSeconds: STRIDER.tripSeconds,
  moves: [
    {
      id: 'strider.lunge', ...STRIDER_ATTACKS.lunge,
      windup: 0.6, telegraph: 'block', weapon: 'right', damage: 22, poise: 25,
      range: [2, 6], cooldown: 2.4, recover: 0.8, weight: 3,
      area: { radius: 1.3, centre: 'front', offset: 4 },
    },
    {
      id: 'strider.blast', ...STRIDER_ATTACKS.blast,
      windup: 0.6, telegraph: 'dodge', weapon: 'right', damage: 16, poise: 30,
      range: [3, 8], cooldown: 6, recover: 1.0, weight: 2, onHit: 'slow',
      area: { radius: 2.6, centre: 'front', offset: 4.5 },
    },
  ],
  mercy: {
    verb: 'calm',
    tier: 'normal',
    track: 'ashwalkers',
    when: 'calming',
    offerings: [{ itemId: 'rain-flask', count: 1 }],
    warmHand: false,
    precondition: 'grounded',
  },
  material: 'ash',
  rises: false,
  body: 'strider',
  behaviour: 'strider',
  attackersPerTarget: 2,
};
