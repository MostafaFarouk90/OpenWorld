import { ENEMY_ATTACKS } from '../clips';
import type { EnemyDef, MoveDef } from '../types';

function move(
  id: string,
  clip: { clip: string; activeStart: number; activeEnd: number },
  rest: Omit<MoveDef, 'id' | 'clip' | 'activeStart' | 'activeEnd'>,
): MoveDef {
  return { id, clip: clip.clip, activeStart: clip.activeStart, activeEnd: clip.activeEnd, ...rest };
}

/** The stable spawn tag of R03's thugs: thread 19's thug purses key on it, so it must not change. */
export const GUILDHALL_THUG_TAG = 'r03.guildhall';

/** Ids other code (tests, tuning) refers to. */
export const THUG_MOVES = { club: 'thug.club', shove: 'thug.shove' } as const;

/**
 * Guildhall Thug (R03, slice 2 plan phase B item 2): a humanoid brawler on the Knight rig, a Charred Footman
 * without the armour. Health 45, poise 25, no shield and no partner advance. A club chop (the Footman's
 * overhead clip and window) and a shove (the unarmed punch clip: short, low damage, heavy on poise). Spare
 * mercy with no favour track (the codex only); the thug yields when beaten, like the Footman.
 */
export const GUILDHALL_THUG: EnemyDef = {
  kind: 'guildhall-thug',
  nameKey: 'enemies.name.guildhall-thug',
  model: { prefer: ['barbarian'], tint: 0xa08060, weapons: 'none', show: ['1H_Axe'] },
  maxHealth: 45,
  maxPoise: 25,
  walkSpeed: 1.4,
  chaseSpeed: 2.8,
  moves: [
    move(THUG_MOVES.club, ENEMY_ATTACKS.soldierChop, {
      windup: 0.55, telegraph: 'block', weapon: 'right', damage: 16, poise: 20,
      range: [0, 1.5], cooldown: 1.5, recover: 0.7, weight: 3,
    }),
    move(THUG_MOVES.shove, ENEMY_ATTACKS.wraithGrab, {
      windup: 0.5, telegraph: 'block', weapon: 'right', damage: 6, poise: 25,
      range: [0, 1.0], cooldown: 3, recover: 0.8, weight: 1,
    }),
  ],
  mercy: { verb: 'spare', tier: 'normal', track: null, when: 'yielding' },
  material: 'wood',
  rises: false,
};
