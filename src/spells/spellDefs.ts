import { RALLY, SURGE } from '../vfx/tuning';
import { RALLY_SKILL_ID, TEST_BOLT } from './tuning';
import { SPELLCAST_CLIPS } from './spellClips';

export interface SpellDef {
  id: string;
  clip: string;
  emberCost: number;
  /** Seconds, starts at release. */
  cooldown: number;
  /** Normalised clip time of the release. */
  releaseAt: number;
  lockMove: boolean;
  effect?: string;
  kind: 'area' | 'projectile' | 'self';
  soundCharge?: string;
  soundRelease?: string;
  /** Skill id the abilities service uses to call this spell. */
  skillId?: string;
  /** Projectile spells only. */
  speed?: number;
  lifetime?: number;
  radius?: number;
}

export const SURGE_DEF: SpellDef = {
  id: SURGE.spellId,
  clip: SURGE.clip,
  emberCost: SURGE.emberCost,
  cooldown: SURGE.cooldown,
  releaseAt: SPELLCAST_CLIPS[SURGE.clip].release,
  lockMove: true,
  effect: 'surge',
  kind: 'area',
  soundCharge: 'sfx.surge.charge',
  soundRelease: 'sfx.surge.release',
};

export const RALLY_DEF: SpellDef = {
  id: 'rally-cry',
  clip: RALLY.clip,
  // Thread 5's skill data owns Rally's Ember cost and cooldown (it spends them after the handler returns ok),
  // so a cast through the abilities handler and a direct spells.cast are both free here.
  emberCost: 0,
  cooldown: 0,
  releaseAt: SPELLCAST_CLIPS[RALLY.clip].release,
  lockMove: true,
  effect: 'skill-q',
  kind: 'self',
  soundRelease: 'sfx.rally',
  skillId: RALLY_SKILL_ID,
};

export const SPELL_DEFS: Record<string, SpellDef> = {
  [SURGE_DEF.id]: SURGE_DEF,
  [RALLY_DEF.id]: RALLY_DEF,
};

/** Test-only spells, never registered by the plugin. */
export const TEST_SPELLS: Record<string, SpellDef> = {
  [TEST_BOLT.spellId]: {
    id: TEST_BOLT.spellId,
    clip: 'Spellcast_Long',
    emberCost: TEST_BOLT.emberCost,
    cooldown: TEST_BOLT.cooldown,
    releaseAt: SPELLCAST_CLIPS.Spellcast_Long.release,
    lockMove: true,
    kind: 'projectile',
    speed: TEST_BOLT.speed,
    lifetime: TEST_BOLT.lifetime,
    radius: TEST_BOLT.radius,
  },
};
