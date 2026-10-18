/**
 * Enemy clips from the shared KayKit rig (Knight.glb) and their active windows, normalised 0..1.
 * Windows are measured from the weapon or claw tip speed by `measureEnemyClips.measure.test.ts`
 * (run with MEASURE_ENEMY_CLIPS=1), as knightClips.ts was for the player.
 */
export const ENEMY_CLIPS = {
  idle: 'Idle',
  walk: 'Walking_B',
  run: 'Running_A',
  rise: 'Lie_StandUp',
  flinch: 'Hit_A',
  stagger: 'Hit_B',
  death: 'Death_A',
  kneel: 'Sit_Floor_Down',
  kneelIdle: 'Sit_Floor_Idle',
  backOff: 'Walking_Backwards',
} as const;

export interface EnemyAttackClip {
  clip: string;
  activeStart: number;
  activeEnd: number;
}

/**
 * Attack clips used by defs.ts, windows MEASURED from Knight.glb by measureEnemyClips.measure.test.ts
 * (1/60 s ticks; the run of ticks around the peak where the channel tip moves at >= 45% of its peak speed,
 * widened by 0.01). Tip used: the claw tip for the wraith, the sword tip for the chop, the shield's far edge
 * for the bash. Measured peak tip speeds: claw 16.1, sweep 12.8, grab 13.6, chop 37.6, bash (shield) 4.1 m/s.
 *   wraithClaw  1H_Melee_Attack_Slice_Diagonal  1.000 s  [0.36, 0.44]  (an earlier arm-raise flick at 0.07 is the wind-up)
 *   wraithSweep 2H_Melee_Attack_Spin            2.400 s  [0.24, 0.55]  (one long spin)
 *   wraithGrab  Unarmed_Melee_Attack_Punch_B    1.667 s  [0.21, 0.31]
 *   soldierChop 1H_Melee_Attack_Chop            1.067 s  [0.49, 0.57]  (the player's wider 0.45..0.62 was measured differently)
 *   soldierBash Block_Attack (left, shield)     1.067 s  [0.27, 0.60]  (a slow push; the sword also flicks at 0.37..0.45)
 */
export const ENEMY_ATTACKS = {
  wraithClaw: { clip: '1H_Melee_Attack_Slice_Diagonal', activeStart: 0.36, activeEnd: 0.44 },
  wraithSweep: { clip: '2H_Melee_Attack_Spin', activeStart: 0.24, activeEnd: 0.55 },
  wraithGrab: { clip: 'Unarmed_Melee_Attack_Punch_B', activeStart: 0.21, activeEnd: 0.31 },
  soldierChop: { clip: '1H_Melee_Attack_Chop', activeStart: 0.49, activeEnd: 0.57 },
  soldierBash: { clip: 'Block_Attack', activeStart: 0.27, activeEnd: 0.6 },
} as const satisfies Record<string, EnemyAttackClip>;
