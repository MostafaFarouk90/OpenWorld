import { ENEMY_ATTACKS } from '../../clips';
import type { EnemyDef } from '../../types';

/**
 * Peat Shambler (design 10 row 10, plan 6.1): a bog-mound on the Barbarian rig at 1.8, slow and huge. Smash behind a 1.1 s
 * fists-raised telegraph with peat clods falling (red, a 2.5 m circle in front) and a thrown mud clod (yellow, slows). Poise 150,
 * regenerating in peat; fire takes 50 poise at once. Lay to rest (a free Calm, Codex only): pull it out of the bog, then hold T
 * while it slumps; it sinks back into the peat (the `peat` overlay, fen/shambler/peat.ts).
 */
export const PEAT_SHAMBLER: EnemyDef = {
  kind: 'peat-shambler',
  nameKey: 'enemies.name.peat-shambler',
  model: {
    prefer: ['barbarian'],
    tint: 0x4a3a28,
    emissive: 0x0c1408,
    weapons: 'none',
    hide: ['Barbarian_Round_Shield', '1H_Axe'],
    scale: 1.8,
    props: [{ id: 'proc/peat-mound', bone: 'chest', position: [0, 0.1, 0.22], scale: 1 }],
  },
  maxHealth: 260,
  maxPoise: 150,
  walkSpeed: 0.9,
  chaseSpeed: 1.6,
  // A poise break holds it 3 s, long enough to walk up and Drag it out (the hold is 1 s).
  breakStaggerSeconds: 3,
  moves: [
    {
      id: 'shambler.smash', ...ENEMY_ATTACKS.soldierChop,
      windup: 1.1, telegraph: 'dodge', weapon: 'right', damage: 30, poise: 40,
      range: [0, 2.8], cooldown: 3, recover: 1.3, weight: 3,
      area: { radius: 2.5, centre: 'front', offset: 1.5 },
    },
    {
      id: 'shambler.mud', ...ENEMY_ATTACKS.hunterThrow,
      windup: 0.8, telegraph: 'block', weapon: 'right', damage: 16, poise: 15,
      range: [4, 14], cooldown: 5, recover: 1.1, weight: 2,
      ranged: { shape: 'rock', speed: 13, maxRange: 15, radius: 0.45, originHeight: 2.8 },
    },
  ],
  mercy: { verb: 'calm', tier: 'normal', track: null, when: 'staggered', freeCalm: 'always', calmForm: 'layToRest', precondition: 'pulledOut' },
  material: 'wood',
  rises: false,
  behaviour: 'peat',
  attackersPerTarget: 3,
};
