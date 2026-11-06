import type { EnemyDef } from '../../types';
import { GNATS } from '../tuning';
import { GNAT_ATTACKS } from './clips';

/**
 * Cinder Gnat swarm (design 10 row 15, plans/act4-L5.md section 4): a cloud of burning gnats that swarms the player. Its
 * one move `gnats.sting` contracts the cloud for 0.8 s (it shrinks, brightens, the buzz rises; red), then washes over a
 * 2 m circle and sets the target burning. No poise (it never staggers), no mercy. Any area effect or any fire disperses it
 * at once (the waste plugin's modifier); single-target blows also hurt it, about four sword hits.
 */
export const CINDER_GNAT_SWARM: EnemyDef = {
  kind: 'cinder-gnat-swarm',
  nameKey: 'enemies.name.cinder-gnat-swarm',
  // Procedural Points: the tint is the ember colour of the cloud.
  model: { prefer: [], tint: 0xff7a2a, weapons: 'none' },
  maxHealth: GNATS.maxHealth,
  maxPoise: 0,
  walkSpeed: GNATS.walkSpeed,
  chaseSpeed: GNATS.chaseSpeed,
  moves: [
    {
      id: 'gnats.sting', ...GNAT_ATTACKS.sting,
      windup: 0.8, telegraph: 'dodge', weapon: 'right', damage: 4, poise: 0,
      range: [0, 2], cooldown: 2.5, recover: 0.6, weight: 1, onHit: 'ignite', element: 'fire',
      area: { radius: 2, centre: 'self' },
    },
  ],
  material: 'ash',
  rises: false,
  body: 'swarm',
  behaviour: 'gnats',
  attackersPerTarget: 3,
};
