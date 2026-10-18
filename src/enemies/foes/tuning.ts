import { SURGE } from '../../vfx/tuning';

/** Ash-possessed scarecrow (design 10 / plan 2.3). */
export const SCARECROW = {
  /** Dormant until the player is this close. */
  wakeRange: 14,
  speed: 1.2,
  turnRate: 5,
  /** Starts a claw swing inside this distance (feet to feet). */
  swingRange: 1.5,
  /** Stops walking inside this distance. */
  stopRange: 1.15,
  clawDamage: 10,
  clawPoise: 10,
  windupSeconds: 0.7,
  swingSeconds: 0.2,
  recoverSeconds: 0.9,
  clawId: 'scarecrow.claw',
  /** A sword hit knocks it down this long, then it rises again. */
  knockdownSeconds: 2.5,
  /** Torch contact: burns this long, then it is cleared with method 'torch'. */
  burnSeconds: 4,
  /** Dissolve / fade on clearing. */
  clearFadeSeconds: 1,
  /** Horizontal reach added to the torch's own radius for contact. */
  contactRadius: 0.7,
  contactHeight: 2.5,
  surgeId: SURGE.spellId,
} as const;

/** Blightbloom (plan 2.4). */
export const BLOOM = {
  castInterval: 8,
  playerRange: 25,
  pileRange: 10,
  maxWraiths: 3,
  openSeconds: 1,
  petals: 12,
  puffSeconds: 0.8,
  /** Regular hits needed. */
  hitsToKill: 2,
  contactRadius: 0.9,
  contactHeight: 2.5,
  fadeSeconds: 0.8,
} as const;

/** Toll post (M04 ford barrier). */
export const TOLL = {
  fadeSeconds: 1,
} as const;

/** Attack ids that count as fire for the bloom: Ember Bolt and torch/fire effects, and the Surge. */
export const FIRE_ATTACK_IDS: ReadonlySet<string> = new Set(['ember-bolt', 'test-bolt', 'fire', 'torch', 'burn', SURGE.spellId]);

export function isFireAttack(attackId: string | undefined): boolean {
  return attackId !== undefined && FIRE_ATTACK_IDS.has(attackId);
}

export const FOE_FADE_GRACE_SECONDS = 0.5;
