import type { EnemyDef, MoveDef } from '../types';

/** Clip windows of the golem's moves (normalised; the body's scripts open them at these times). */
const ATTACKS = {
  stomp: { clip: 'Stomp', activeStart: 0.45, activeEnd: 0.65 },
  slam: { clip: 'Slam', activeStart: 0.5, activeEnd: 0.7 },
  rockThrow: { clip: 'Throw', activeStart: 0.45, activeEnd: 0.6 },
} as const;

/**
 * Cinder Golem (design 10 row 5): instanced rock and wall pieces with an emissive crack shader. Stomp, slam and a rock
 * throw behind a 1.0 s core-glow telegraph. Poise 120, but it staggers only when its **back core** is hit (an instant
 * break, a 2.5 s exposed window): front hits do health damage only (ground/golemRules.ts). **Still**: hold T on the
 * exposed core and it settles into a cairn (a free Calm, codex only, no favour).
 */
export const CINDER_GOLEM: EnemyDef = {
  kind: 'cinder-golem',
  nameKey: 'enemies.name.cinder-golem',
  model: { prefer: [], tint: 0x5a4a42, emissive: 0xff5a1f, weapons: 'none' },
  maxHealth: 420,
  maxPoise: 120,
  walkSpeed: 1.2,
  chaseSpeed: 2.3,
  breakStaggerSeconds: 2.5,
  moves: [
    {
      id: 'golem.stomp', ...ATTACKS.stomp,
      windup: 1.0, telegraph: 'dodge', weapon: 'right', damage: 28, poise: 40,
      range: [0, 3.5], cooldown: 3, recover: 1.4, weight: 3,
      area: { radius: 4, centre: 'self' },
    },
    {
      id: 'golem.slam', ...ATTACKS.slam,
      windup: 1.0, telegraph: 'dodge', weapon: 'left', damage: 38, poise: 50,
      range: [0, 5.5], cooldown: 4, recover: 1.6, weight: 2,
      area: { radius: 3, centre: 'front', offset: 2.5 },
    },
    {
      id: 'golem.rock', ...ATTACKS.rockThrow,
      windup: 1.0, telegraph: 'dodge', weapon: 'right', damage: 22, poise: 25,
      range: [8, 22], cooldown: 6, recover: 1.2, weight: 3,
      ranged: { shape: 'rock', speed: 15, maxRange: 24, radius: 0.6, originHeight: 2.6 },
    },
  ],
  mercy: { verb: 'calm', tier: 'elite', track: null, when: 'exposed', freeCalm: 'always' },
  settles: 'cairn',
  material: 'metal',
  rises: false,
  body: 'golem',
  behaviour: 'back-core',
};

export const GOLEM_MOVES: readonly MoveDef[] = CINDER_GOLEM.moves;
