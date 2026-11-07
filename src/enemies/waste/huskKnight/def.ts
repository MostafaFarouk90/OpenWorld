import { ENEMY_ATTACKS } from '../../clips';
import type { EnemyDef } from '../../types';
import { HUSK_KNIGHT } from '../tuning';

/** The hurtbox whose hit breaks the Husk Knight's poise while its ember is exposed (the Knight rig's chest capsule). */
export const HUSK_EMBER_HURTBOX = 'torso';

/**
 * Husk Knight (design 10 row 14, plans/act4-L5.md section 3): an armoured undead on the Knight rig at 1.1 in ash, with a
 * two-handed sword (look) and the round shield (the rush). `huskknight.raise` lifts the greatsword for 0.7 s with an amber
 * chest pulse and a gong tone (yellow), and `huskknight.sweep` may follow it as the combo's second blow; `huskknight.rush`
 * raises the shield for 0.7 s with the chest glowing, then charges 5 m (red). Poise 90; a hit on the chest while the ember
 * is exposed breaks it at once (the `husk-knight` overlay and the waste plugin's modifier). Release on the break (10 Burn,
 * Ashwalkers +2, elite). Killed unreleased, it rises once at half health; the second death is final.
 */
export const HUSK_KNIGHT_DEF: EnemyDef = {
  kind: 'husk-knight',
  nameKey: 'enemies.name.husk-knight',
  // Bone-white ash with dark ember seams; the helmet stays on. The 2H sword is swapped in by the overlay (look only: the
  // tracers stay on the embedded sword and shield, so the hits land as a Footman's do).
  model: { prefer: [], tint: 0x8f8a84, emissive: 0x3a3029, weapons: 'sword-shield', scale: HUSK_KNIGHT.scale, hide: ['Knight_Helmet'] },
  maxHealth: HUSK_KNIGHT.maxHealth,
  maxPoise: HUSK_KNIGHT.maxPoise,
  walkSpeed: HUSK_KNIGHT.walkSpeed,
  chaseSpeed: HUSK_KNIGHT.chaseSpeed,
  breakStaggerSeconds: HUSK_KNIGHT.breakStaggerSeconds,
  moves: [
    {
      id: 'huskknight.raise', ...ENEMY_ATTACKS.soldierChop,
      windup: 0.7, telegraph: 'block', weapon: 'right', damage: 26, poise: 30,
      range: [0, 2.2], cooldown: 2.2, recover: 0.25, weight: 3,
    },
    {
      id: 'huskknight.sweep', ...ENEMY_ATTACKS.cutpurseSlash,
      windup: 0.25, telegraph: 'block', weapon: 'right', damage: 20, poise: 30,
      range: [0, 2.4], cooldown: 2.2, recover: 0.9, weight: 4,
    },
    {
      id: 'huskknight.rush', ...ENEMY_ATTACKS.soldierBash,
      windup: 0.7, telegraph: 'dodge', weapon: 'left', damage: 24, poise: 45,
      range: [3, 7], cooldown: 7, recover: 1.0, weight: 2, leap: { maxMetres: 5 },
    },
  ],
  mercy: { verb: 'release', tier: 'elite', track: 'ashwalkers', when: 'staggered' },
  material: 'metal',
  rises: false,
  guard: false,
  behaviour: 'husk-knight',
};
