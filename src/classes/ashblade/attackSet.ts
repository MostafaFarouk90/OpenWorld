import type { AttackClipDef } from '../../characters/knightClips';
import type { AttackSet } from '../../player/attackSets';

/**
 * The Ashblade's four attacks (keys 1 to 4) from the Rogue glb's clips. Player melee poise equals the hit damage on
 * main, so there is no poise column here; the crossed chop is the heavy (attack 3, `heavyIndex` 2, costs stamina) and is
 * registered with `heavyBlow` so it breaks guards like the Knight's chop.
 *
 * Active windows are normalised clip times. `measureAshbladeWindows.measure.test.ts` (skipped by default) prints the
 * blade-tip speed windows of the Rogue glb; the values below were set from its output. The dual slice swings twice
 * (strokes at 0.45-0.54 and 0.60-0.70), so its window spans both; the chop's second stroke (0.64-0.70) is left out.
 */
export const ASHBLADE_ATTACKS: readonly AttackClipDef[] = [
  { clip: 'Dualwield_Melee_Attack_Slice', activeStart: 0.43, activeEnd: 0.71 },
  { clip: '1H_Melee_Attack_Slice_Diagonal', activeStart: 0.34, activeEnd: 0.44 },
  { clip: 'Dualwield_Melee_Attack_Chop', activeStart: 0.32, activeEnd: 0.46 },
  { clip: 'Dualwield_Melee_Attack_Stab', activeStart: 0.19, activeEnd: 0.28 },
];

export const ASHBLADE_ATTACK_SET: AttackSet = { attacks: ASHBLADE_ATTACKS, heavyIndex: 2 };

/** The heavy clip, for `registerHeavyClip` (thread 13's additive export of heavyBlow.ts). */
export const ASHBLADE_HEAVY_CLIP = ASHBLADE_ATTACKS[2].clip;
