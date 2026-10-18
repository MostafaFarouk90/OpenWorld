import type { Action } from '../input/actions';
// Spell-framework constants that are not shared with the vfx thread (those live in src/vfx/tuning.ts).

/**
 * Warm-zone max-health loss and Scars are DEFERRED until the designs thread confirms the numbers (design 9.7).
 * While false, Burn.healthMultiplier() returns 1 and the multiplier registered with progression is a no-op.
 */
export const BURN_MAX_HEALTH_PENALTY_ENABLED: boolean = false;

/** Each Scar permanently lowers max health by 2%, capped at 30% (15 Scars). */
export const SCAR = { healthPerScar: 0.02, maxPenalty: 0.3 } as const;

/** Zone penalties (fraction of max health lost) from design 9.7. */
export const BURN_ZONE_PENALTY = {
  warmMax: 0.15, // scaled by burn / 39
  blaze: { from: 0.16, to: 0.3 },
  cinder: { from: 0.31, to: 0.4 },
} as const;

export const SPELL_MOVE_SOURCE = 'spell';
/** Action ids (contracts/input-and-hud.md section 1) the spell locks while casting. lockOn and sprint stay free. */
export const SPELL_LOCK_ACTIONS: readonly Action[] = [
  'attack1', 'attack2', 'attack3', 'attack4', 'block', 'dodge', 'jump', 'surge', 'surgeLeap', 'interact', 'mercy', 'mount',
  'ability1', 'ability2', 'ability3', 'ability4', 'ability5', 'ability6',
];

/** Thread 5's skill id for Rally Cry (plans/hud-inventory-skills.md, v2 changes). Shadows src/vfx/tuning.ts RALLY.skillId. */
export const RALLY_SKILL_ID = 'knight.rallyCry';

/** Surge feedback strengths per Burn zone. */
export const SURGE_FX = {
  pulse: { warm: 0.4, blaze: 0.6, cinder: 0.85 },
  pulseSeconds: 0.5,
  pulseColor: { warm: 0xffb040, blaze: 0xff8030, cinder: 0xffffff },
  shake: { warm: 0.08, blaze: 0.12, cinder: 0.2 },
  shakeSeconds: { warm: 0.2, blaze: 0.25, cinder: 0.3 },
} as const;

export const RALLY_FX = { color: 0xffd070 } as const;

/** Test-only projectile spell. */
export const TEST_BOLT = { spellId: 'test-bolt', emberCost: 10, cooldown: 1, speed: 18, lifetime: 2, radius: 0.3, damage: 10, poise: 10 } as const;

/** Actor hit volume used by projectiles and areas (an upright cylinder from the feet). */
export const ACTOR_HIT = { radius: 0.5, height: 1.8 } as const;

export const PROJECTILE = { defaultCapacity: 16, minSubStep: 0.1 } as const;

/** The player's stagger has no end event; the plugin treats the player as staggered this long. */
export const PLAYER_STAGGER_LOCK_SECONDS = 0.8;

/** How often the plugin retries binding progression / abilities when they are not provided yet. */
export const LATE_BIND_RETRY_SECONDS = 1;
