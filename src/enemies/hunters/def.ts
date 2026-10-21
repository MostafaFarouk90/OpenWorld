import { ENEMY_ATTACKS } from '../clips';
import type { EnemyDef, MoveDef } from '../types';

/**
 * Dragon-Hunter Spearman (design 10 row 30): a hired spear-and-net hunter in a pack of 3 to 4 with one harpooner. Spear thrust
 * (0.5 s drop, yellow), net throw (0.6 s arm swing and a rope hiss, yellow: a blocked net does not root; roots 2 s on a hit).
 * Poise 35. Spare when rooted or staggered under half health (Oswin +1). There is no flee: hunters are paid to stay.
 * The Barbarian body in a red tabard tint, a procedural spear.
 */
export const HUNTER_SPEARMAN: EnemyDef = {
  kind: 'hunter-spearman',
  nameKey: 'enemies.name.hunter-spearman',
  model: {
    prefer: ['rogue'],
    tint: 0xd8806a,
    emissive: 0x2a0a06,
    weapons: 'none',
    props: [{ id: 'proc/hunter-spear', bone: 'handslotr', rotation: [0, 0, 0], scale: 1 }],
  },
  maxHealth: 70,
  maxPoise: 35,
  walkSpeed: 1.5,
  chaseSpeed: 3.0,
  moves: [
    move('hunter.thrust', ENEMY_ATTACKS.hunterThrust, {
      windup: 0.5, telegraph: 'block', weapon: 'right', damage: 16, poise: 18,
      range: [0, 1.9], cooldown: 1.6, recover: 0.8, weight: 3,
    }),
    move('hunter.net', ENEMY_ATTACKS.hunterThrow, {
      windup: 0.6, telegraph: 'block', weapon: 'right', damage: 4, poise: 5,
      range: [5, 14], cooldown: 7, recover: 1.0, weight: 4,
      ranged: { shape: 'net', speed: 16, maxRange: 16, radius: 0.5, originHeight: 1.4, root: 2 },
    }),
  ],
  mercy: { verb: 'spare', tier: 'normal', track: 'oswin', when: 'yielding' },
  yieldWhenRooted: true,
  material: 'metal',
  rises: false,
  attackersPerTarget: 3,
};

/**
 * Dragon-Hunter Harpooner: the pack's one harpooner (its leader slot). The harpoon is a red, dodge-only throw with a 0.9 s
 * laser-glint line on the ground and pulls the player 4 m on a hit (a hit that lands; an i-frame dodge ignores it). Rogue
 * body in the same red tabard. Spare as the Spearman.
 */
export const HUNTER_HARPOONER: EnemyDef = {
  kind: 'hunter-harpooner',
  nameKey: 'enemies.name.hunter-harpooner',
  model: {
    prefer: ['rogueHooded'],
    tint: 0xd8806a,
    emissive: 0x2a0a06,
    weapons: 'none',
    props: [{ id: 'proc/hunter-harpoon', bone: 'handslotr', rotation: [0, 0, 0], scale: 1 }],
  },
  maxHealth: 60,
  maxPoise: 35,
  walkSpeed: 1.5,
  chaseSpeed: 3.2,
  moves: [
    move('harpooner.thrust', ENEMY_ATTACKS.hunterThrust, {
      windup: 0.5, telegraph: 'block', weapon: 'right', damage: 14, poise: 16,
      range: [0, 1.7], cooldown: 1.8, recover: 0.8, weight: 3,
    }),
    move('harpooner.harpoon', ENEMY_ATTACKS.hunterThrow, {
      windup: 0.9, telegraph: 'dodge', weapon: 'right', damage: 10, poise: 10,
      range: [4, 16], cooldown: 8, recover: 1.2, weight: 4,
      ranged: { shape: 'harpoon', speed: 30, maxRange: 18, radius: 0.35, originHeight: 1.4, pull: 4 },
    }),
  ],
  mercy: { verb: 'spare', tier: 'normal', track: 'oswin', when: 'yielding' },
  yieldWhenRooted: true,
  material: 'metal',
  rises: false,
  attackersPerTarget: 3,
};

/** The hunters' spawner level band offset is the region's; the pack: three spearmen and one harpooner (slot 3 leads). */
export const HUNTER_PACK_KINDS = ['hunter-spearman', 'hunter-spearman', 'hunter-spearman', 'hunter-harpooner'] as const;
export const HUNTER_PACK_LEADER_SLOT = 3;

function move(
  id: string,
  clip: { clip: string; activeStart: number; activeEnd: number },
  rest: Omit<MoveDef, 'id' | 'clip' | 'activeStart' | 'activeEnd'>,
): MoveDef {
  return { id, clip: clip.clip, activeStart: clip.activeStart, activeEnd: clip.activeEnd, ...rest };
}
