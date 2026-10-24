import type { EffectFactory } from '../effects/index';
import type { Tier3Helpers } from '../effects/tier3';
import { ASHBLADE_T4_EFFECT_IDS, ashbladeT4Effects, type AshbladeT4EffectId } from './ashblade';
import { KNIGHT_T4_EFFECT_IDS, knightT4Effects, type KnightT4EffectId } from './knight';
import { WARDEN_T4_EFFECT_IDS, wardenT4Effects, type WardenT4EffectId } from './warden';

/** K11 (Act 3): tier 4 and 5 skill presets (design 11.5), one file per class. Helpers come from effects/index.ts. */
export const ACT3_SKILL_EFFECT_IDS = [...KNIGHT_T4_EFFECT_IDS, ...WARDEN_T4_EFFECT_IDS, ...ASHBLADE_T4_EFFECT_IDS] as const;
export type Act3SkillEffectId = KnightT4EffectId | WardenT4EffectId | AshbladeT4EffectId;

export function act3SkillEffects(h: Tier3Helpers): Record<Act3SkillEffectId, EffectFactory> {
  return { ...knightT4Effects(h), ...wardenT4Effects(h), ...ashbladeT4Effects(h) };
}
