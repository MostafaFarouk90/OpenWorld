import type { EffectFactory } from '../effects/index';
import type { Tier3Helpers } from '../effects/tier3';
import { ASHBLADE_T4_EFFECT_IDS, ASHBLADE_T5_EFFECT_IDS, ashbladeT4Effects, ashbladeT5Effects, type AshbladeT4EffectId, type AshbladeT5EffectId } from './ashblade';
import { KNIGHT_T4_EFFECT_IDS, KNIGHT_T5_EFFECT_IDS, knightT4Effects, knightT5Effects, type KnightT4EffectId, type KnightT5EffectId } from './knight';
import { WARDEN_T4_EFFECT_IDS, WARDEN_T5_EFFECT_IDS, wardenT4Effects, wardenT5Effects, type WardenT4EffectId, type WardenT5EffectId } from './warden';
import { EMBERWRIGHT_T4_EFFECT_IDS, EMBERWRIGHT_T5_EFFECT_IDS, emberwrightT4Effects, emberwrightT5Effects, type EmberwrightT4EffectId, type EmberwrightT5EffectId } from './emberwright';
import { PATHFINDER_T4_EFFECT_IDS, PATHFINDER_T5_EFFECT_IDS, pathfinderT4Effects, pathfinderT5Effects, type PathfinderT4EffectId, type PathfinderT5EffectId } from './pathfinder';

/** K11 (Act 3): tier 4 and 5 skill presets (design 11.5), one file per class. Helpers come from effects/index.ts. */
export const ACT3_SKILL_EFFECT_IDS = [...KNIGHT_T4_EFFECT_IDS, ...KNIGHT_T5_EFFECT_IDS, ...WARDEN_T4_EFFECT_IDS, ...WARDEN_T5_EFFECT_IDS, ...ASHBLADE_T4_EFFECT_IDS, ...ASHBLADE_T5_EFFECT_IDS, ...EMBERWRIGHT_T4_EFFECT_IDS, ...EMBERWRIGHT_T5_EFFECT_IDS, ...PATHFINDER_T4_EFFECT_IDS, ...PATHFINDER_T5_EFFECT_IDS] as const;
export type Act3SkillEffectId = KnightT4EffectId | KnightT5EffectId | WardenT4EffectId | WardenT5EffectId | AshbladeT4EffectId | AshbladeT5EffectId | EmberwrightT4EffectId | EmberwrightT5EffectId | PathfinderT4EffectId | PathfinderT5EffectId;

export function act3SkillEffects(h: Tier3Helpers): Record<Act3SkillEffectId, EffectFactory> {
  return { ...knightT4Effects(h), ...knightT5Effects(h), ...wardenT4Effects(h), ...wardenT5Effects(h), ...ashbladeT4Effects(h), ...ashbladeT5Effects(h), ...emberwrightT4Effects(h), ...emberwrightT5Effects(h), ...pathfinderT4Effects(h), ...pathfinderT5Effects(h) };
}
