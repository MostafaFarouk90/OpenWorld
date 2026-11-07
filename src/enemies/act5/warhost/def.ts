import { ENEMY_ATTACKS } from '../../clips';
import type { EnemyDef, MoveDef, WarhostRole } from '../../types';
import { WARHOST, WARHOST_GUARD } from './tuning';

/**
 * The Warhost Soldier (design 10 row 32, plans/act5-N5.md section 2): Vey's soldiers in black and gold on the Knight rig.
 * One def serves the three roles; the spawner's `role` (actor.data.spawn.role) picks the moves and the look through the
 * `warhost` overlay. Shield: chop and a shoving push. Pike: a 0.6 s lower, then a thrust reaching 3.2 m. Torch: a 0.8 s
 * overhead throw of a burning brand. Poise 40; two shield members staggered within a second break the line (lines.ts).
 */
const chop = (damage: number, windup: number, cooldown: number): MoveDef => ({
  id: 'warhost.chop', ...ENEMY_ATTACKS.soldierChop,
  windup, telegraph: 'block', weapon: 'right', damage, poise: 25, range: [0, 1.6], cooldown, recover: 0.7, weight: 3,
});

const push = (damage: number, windup: number): MoveDef => ({
  id: 'warhost.push', ...ENEMY_ATTACKS.soldierBash,
  windup, telegraph: 'block', weapon: 'left', damage, poise: 30, range: [0, 1.2], cooldown: 3, recover: 0.7, weight: 1,
});

const thrust = (damage: number): MoveDef => ({
  id: 'warhost.thrust', ...ENEMY_ATTACKS.soldierChop,
  windup: 0.6, telegraph: 'block', weapon: 'right', damage, poise: 25, range: [1.2, WARHOST.pikeReach], cooldown: 2.2, recover: 0.9, weight: 4,
  area: { radius: WARHOST.pikeAreaRadius, centre: 'front', offset: WARHOST.pikeAreaOffset },
});

const torch = (damage: number): MoveDef => ({
  id: 'warhost.torch', ...ENEMY_ATTACKS.cutpurseSlash,
  windup: 0.8, telegraph: 'dodge', weapon: 'right', damage, poise: 10, range: [4, WARHOST.torchMaxRange], cooldown: 4, recover: 0.9, weight: 4,
  ranged: { shape: 'glob', speed: WARHOST.torchSpeed, maxRange: WARHOST.torchMaxRange, radius: 0.45, originHeight: 1.6, ignite: WARHOST.torchIgniteSeconds },
  element: 'fire',
});

/** The moves each role offers (the overlay's `allowMove`). */
export const WARHOST_ROLE_MOVES: Readonly<Record<WarhostRole, ReadonlySet<string>>> = {
  shield: new Set(['warhost.chop', 'warhost.push']),
  pike: new Set(['warhost.thrust', 'warhost.chop']),
  torch: new Set(['warhost.torch', 'warhost.chop']),
};

export const WARHOST_SOLDIER: EnemyDef = {
  kind: 'warhost-soldier',
  nameKey: 'enemies.name.warhost-soldier',
  model: { prefer: [], tint: 0x2b2622, emissive: 0x3a2a08, weapons: 'sword-shield' },
  maxHealth: WARHOST.maxHealth,
  maxPoise: WARHOST.maxPoise,
  walkSpeed: WARHOST.walkSpeed,
  chaseSpeed: WARHOST.chaseSpeed,
  moves: [chop(20, 0.6, 1.6), push(10, 0.6), thrust(24), torch(14)],
  mercy: { verb: 'spare', tier: 'normal', track: 'halvard', when: 'yielding' },
  material: 'metal',
  rises: false,
  guard: true,
  pairAdvance: true,
  behaviour: 'warhost',
};

/** Vey's household guard: the elite Warhost, 1.1 scale, a black plume, a heavier combo, Halvard +2 on Spare. */
export const WARHOST_GUARD_DEF: EnemyDef = {
  kind: 'warhost-guard',
  nameKey: 'enemies.name.warhost-guard',
  model: { prefer: [], tint: 0x1c1916, emissive: 0x4a3408, weapons: 'sword-shield', scale: WARHOST_GUARD.scale },
  maxHealth: WARHOST_GUARD.maxHealth,
  maxPoise: WARHOST_GUARD.maxPoise,
  walkSpeed: WARHOST.walkSpeed,
  chaseSpeed: WARHOST.chaseSpeed,
  moves: [chop(24, 0.55, 1.4), push(14, 0.55), thrust(30), torch(18)],
  mercy: { verb: 'spare', tier: 'elite', track: 'halvard', when: 'yielding' },
  material: 'metal',
  rises: false,
  guard: true,
  pairAdvance: true,
  behaviour: 'warhost',
};
