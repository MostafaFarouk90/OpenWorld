import type { Action } from '../input/actions';
// Spell-framework constants that are not shared with the vfx thread (those live in src/vfx/tuning.ts).

/** Zone and Scar max-health penalties (design 9.7) are live. The constant stays as a seam for tests. */
export const BURN_MAX_HEALTH_PENALTY_ENABLED: boolean = true;

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

/** The Surge Leap (design 9.7 and 11.5): 6 m forward, 8 Burn, 4 s cooldown. `apex` is tuned by the ledge-reach test. */
export const LEAP = { distance: 6, burn: 8, cooldownSeconds: 4, apex: 2.2, fovPunch: 4, fovSeconds: 0.25, pulse: 0.3, pulseSeconds: 0.3 } as const;
/** Ability id of the Leap (granted at M03, not a tree skill). The flag `ability.<id>.learned` is the single source. */
export const LEAP_ABILITY_ID = 'surge-leap';

/** Banner Plant (Knight Standard 2): -10% damage taken by the player and allies within 8 m. Cost and cooldown are on the SkillDef. */
export const BANNER = { skillId: 'knight.bannerPlant', radius: 8, damageScale: 0.9, lifetimeSeconds: 20, placeDistance: 2 } as const;
