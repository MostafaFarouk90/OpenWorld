import type { ActorInit, Team } from './Actor';

/** `attacker` may damage `target` (contracts/actors-and-damage.md section 3). */
export function canDamage(attacker: Team, target: Team): boolean {
  if (attacker === target) return false;
  switch (attacker) {
    case 'player':
    case 'ally':
      return target === 'hostile' || target === 'neutral';
    case 'hostile':
      return target === 'player' || target === 'ally' || target === 'neutral';
    default:
      return false;
  }
}

/** Placeholders for threads 1 and 5 to tune. */
export const PLAYER_STATS = {
  maxHealth: 100,
  maxStamina: 100,
  maxPoise: 40,
  level: 1,
} as const;

export const PLAYER_ID = 'player';

export function playerInit(): ActorInit {
  return { id: PLAYER_ID, kind: 'knight', team: 'player', ...PLAYER_STATS };
}

export const DUMMY_INIT: Omit<ActorInit, 'owner' | 'root'> = {
  kind: 'dummy',
  team: 'neutral',
  immortal: true,
  maxHealth: 100,
};
