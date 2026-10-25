import type { EnemyDef } from '../../types';

/** Clip windows of the leech's moves (normalised; LeechBody's scripts open them at these times). */
const ATTACKS = {
  lunge: { clip: 'Lunge', activeStart: 0.35, activeEnd: 0.6 },
  bite: { clip: 'Bite', activeStart: 0.35, activeEnd: 0.6 },
} as const;

/**
 * Fen Leech (design 10 row 9, plan 6.1): lurks under wading water at its anchor and comes up when the player steps within
 * 5 m, opening with a lunge behind a 0.5 s coil and wet hiss (red); a drain bite takes stamina (yellow). Poise 20; fire or a
 * heavy chop breaks it at once (its weakness), and it dives to recover (the `lurk` overlay, fen/leech/lurk.ts). Vermin: no mercy.
 */
export const FEN_LEECH: EnemyDef = {
  kind: 'fen-leech',
  nameKey: 'enemies.name.fen-leech',
  model: { prefer: [], tint: 0x3b4a2a, weapons: 'none' },
  maxHealth: 45,
  maxPoise: 20,
  walkSpeed: 1.2,
  chaseSpeed: 4,
  moves: [
    {
      id: 'leech.lunge', ...ATTACKS.lunge,
      windup: 0.5, telegraph: 'dodge', weapon: 'right', damage: 14, poise: 10,
      range: [1.5, 4.5], cooldown: 3.5, recover: 0.9, weight: 2,
      leap: { maxMetres: 4 },
    },
    {
      id: 'leech.bite', ...ATTACKS.bite,
      windup: 0.45, telegraph: 'block', weapon: 'right', damage: 9, poise: 6,
      range: [0, 1.4], cooldown: 1.6, recover: 0.7, weight: 3, onHit: 'drain',
    },
  ],
  material: 'ash',
  rises: false,
  body: 'leech',
  behaviour: 'lurk',
};
