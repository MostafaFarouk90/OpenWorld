import { ENEMY_ATTACKS } from './clips';
import { ALLEY_CUTPURSE } from './cutpurse/def';
import type { EnemyDef, EnemyKind, MoveDef } from './types';

/**
 * Ash Wraith, design section 10 row 1: shambles, groups of 3 to 5, claw swipe and ash-grab, a 0.5 s
 * arm-raise telegraph, poise 20, Release mercy for the Ashwalkers. The wide red sweep is the T10
 * dodge drill (weight 0: chosen only through a spawn's move filter).
 */
export const ASH_WRAITH: EnemyDef = {
  kind: 'ash-wraith',
  nameKey: 'enemies.name.ash-wraith',
  model: { prefer: [], tint: 0x8d978a, emissive: 0x0b100a, weapons: 'none' },
  maxHealth: 30,
  maxPoise: 20,
  walkSpeed: 1.0,
  chaseSpeed: 1.6,
  moves: [
    move('wraith.claw', ENEMY_ATTACKS.wraithClaw, {
      windup: 0.5, telegraph: 'block', weapon: 'right', damage: 12, poise: 10,
      range: [0, 1.0], cooldown: 1.2, recover: 0.9, weight: 3,
    }),
    move('wraith.grab', ENEMY_ATTACKS.wraithGrab, {
      windup: 0.5, telegraph: 'block', weapon: 'right', damage: 8, poise: 5,
      range: [0, 0.9], cooldown: 4, recover: 0.9, weight: 1, onHit: 'slow',
    }),
    move('wraith.sweep', ENEMY_ATTACKS.wraithSweep, {
      windup: 0.7, telegraph: 'dodge', weapon: 'right', damage: 18, poise: 20,
      range: [0, 1.1], cooldown: 2, recover: 1.0, weight: 0,
    }),
  ],
  mercy: { verb: 'release', tier: 'normal', track: 'ashwalkers', when: 'staggered' },
  material: 'ash',
  rises: true,
};

/**
 * The Charred Footman (design 10 row 2), kept under the slice 1 kind id `blighted-soldier` so saves, XP and
 * quest filters keep working. Overhead chop with a 0.6 s raise, a short shield bash, poise 40, Spare mercy
 * for Halvard; since slice 2 it also raises its shield about half the time (a heavy chop breaks the guard,
 * back attacks ignore it) and advances beside its partner.
 */
export const BLIGHTED_SOLDIER: EnemyDef = {
  kind: 'blighted-soldier',
  nameKey: 'enemies.name.charred-footman',
  model: { prefer: [], tint: 0x6a625a, weapons: 'sword-shield' },
  maxHealth: 60,
  maxPoise: 40,
  walkSpeed: 1.4,
  chaseSpeed: 2.6,
  moves: [
    move('soldier.chop', ENEMY_ATTACKS.soldierChop, {
      windup: 0.6, telegraph: 'block', weapon: 'right', damage: 20, poise: 25,
      range: [0, 1.6], cooldown: 1.6, recover: 0.7, weight: 3,
    }),
    move('soldier.bash', ENEMY_ATTACKS.soldierBash, {
      windup: 0.6, telegraph: 'block', weapon: 'left', damage: 10, poise: 25,
      range: [0, 1.0], cooldown: 3, recover: 0.7, weight: 1,
    }),
  ],
  mercy: { verb: 'spare', tier: 'normal', track: 'halvard', when: 'yielding' },
  material: 'metal',
  rises: false,
  guard: true,
  pairAdvance: true,
};

export const ENEMY_DEFS: Readonly<Record<EnemyKind, EnemyDef>> = {
  'ash-wraith': ASH_WRAITH,
  'blighted-soldier': BLIGHTED_SOLDIER,
  'alley-cutpurse': ALLEY_CUTPURSE,
};

/**
 * Telegraph look per kind, for thread 7 (design 11.6): which part flashes and in what colour.
 * The `telegraph` event names only the actor; thread 7 maps `actor.kind` through this table.
 */
export const TELEGRAPH_STYLE: Readonly<Record<EnemyKind, { part: 'hand' | 'weapon'; color: number }>> = {
  'ash-wraith': { part: 'hand', color: 0x9fbf8f },
  'blighted-soldier': { part: 'weapon', color: 0xd04030 },
  'alley-cutpurse': { part: 'hand', color: 0xc8b070 },
};

function move(
  id: string,
  clip: { clip: string; activeStart: number; activeEnd: number },
  rest: Omit<MoveDef, 'id' | 'clip' | 'activeStart' | 'activeEnd'>,
): MoveDef {
  return { id, clip: clip.clip, activeStart: clip.activeStart, activeEnd: clip.activeEnd, ...rest };
}
