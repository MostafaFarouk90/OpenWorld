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

/** Attack clips used by defs.ts. Placeholder windows until measured. */
export const ENEMY_ATTACKS = {
  wraithClaw: { clip: '1H_Melee_Attack_Slice_Diagonal', activeStart: 0.33, activeEnd: 0.48 },
  wraithSweep: { clip: '2H_Melee_Attack_Spin', activeStart: 0.3, activeEnd: 0.6 },
  wraithGrab: { clip: 'Unarmed_Melee_Attack_Punch_B', activeStart: 0.3, activeEnd: 0.45 },
  soldierChop: { clip: '1H_Melee_Attack_Chop', activeStart: 0.45, activeEnd: 0.62 },
  soldierBash: { clip: 'Block_Attack', activeStart: 0.3, activeEnd: 0.5 },
} as const satisfies Record<string, EnemyAttackClip>;
