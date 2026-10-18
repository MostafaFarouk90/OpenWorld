import { ENEMY_ATTACKS, ENEMY_CLIPS } from '../clips';
import type { EnemyDef, MoveDef } from '../types';

function move(
  id: string,
  clip: { clip: string; activeStart: number; activeEnd: number },
  rest: Omit<MoveDef, 'id' | 'clip' | 'activeStart' | 'activeEnd'>,
): MoveDef {
  return { id, clip: clip.clip, activeStart: clip.activeStart, activeEnd: clip.activeEnd, ...rest };
}

/** Ids other code (the Cutpurse controller, tests) refers to. */
export const CUTPURSE_MOVES = { slash: 'cutpurse.slash', grab: 'cutpurse.grab', smoke: 'cutpurse.smoke' } as const;

/**
 * Alley Cutpurse (design 10 row 31): Rogue model (the Knight rig stands in until it loads) with a brown cloak,
 * health 25, poise 10, flinches on any hit, runs at 4.2 m/s and flees below half health. It goes for the coin
 * grab first (1.2 m lunge), then flees with the gold; staggered or cornered while fleeing it yields, and Spare
 * gives the pouch back (no favour track: the codex only).
 */
export const ALLEY_CUTPURSE: EnemyDef = {
  kind: 'alley-cutpurse',
  nameKey: 'enemies.name.alley-cutpurse',
  model: { prefer: ['rogue'], tint: 0x6b4a2c, weapons: 'none' },
  maxHealth: 25,
  maxPoise: 10,
  walkSpeed: 1.8,
  chaseSpeed: 4.2,
  fleeAtHealth: 0.5,
  moves: [
    move(CUTPURSE_MOVES.slash, ENEMY_ATTACKS.cutpurseSlash, {
      windup: 0.3, telegraph: 'block', weapon: 'right', damage: 6, poise: 5,
      range: [0, 1.4], cooldown: 1.4, recover: 0.6, weight: 1,
    }),
    // The coin grab: a lunge; the theft itself happens on the hit (EnemyManager, onHit 'steal').
    move(CUTPURSE_MOVES.grab, ENEMY_ATTACKS.cutpurseGrab, {
      windup: 0.4, telegraph: 'block', weapon: 'right', damage: 2, poise: 0,
      range: [0, 1.2], cooldown: 2, recover: 0.7, weight: 4, onHit: 'steal',
    }),
    // Not an attack: the smoke bomb is driven by the Cutpurse controller (weight 0: the brain never picks it).
    move(CUTPURSE_MOVES.smoke, { clip: ENEMY_CLIPS.useItem, activeStart: 0.5, activeEnd: 0.5 }, {
      windup: 0.4, telegraph: 'block', weapon: 'right', damage: 0, poise: 0,
      range: [0, 1.2], cooldown: 0, recover: 0, weight: 0,
    }),
  ],
  mercy: { verb: 'spare', tier: 'normal', track: null, when: 'yielding' },
  material: 'wood',
  rises: false,
  thief: true,
};
