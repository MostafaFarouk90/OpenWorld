import type { AttackClipDef } from '../../characters/knightClips';
import type { AttackSet } from '../../player/attackSets';
import { WARDEN_CLIPS } from './tuning';

/**
 * Attacks 1 to 4 of the Warden (keys 1 to 4): wide slice, quick spinning sweep, heavy chop, slow stab. The chop is the
 * heavy attack (index 2) like the Knight's. Windows are estimates from the clip lengths; retune in `?scene=combat`.
 */
export const WARDEN_ATTACKS: readonly AttackClipDef[] = [
  { clip: WARDEN_CLIPS.slice, activeStart: 0.3, activeEnd: 0.52 },
  { clip: WARDEN_CLIPS.spinning, activeStart: 0.3, activeEnd: 0.7 },
  { clip: WARDEN_CLIPS.chop, activeStart: 0.5, activeEnd: 0.66 },
  { clip: WARDEN_CLIPS.stab, activeStart: 0.35, activeEnd: 0.5 },
];

export const WARDEN_ATTACK_SET: AttackSet = { attacks: WARDEN_ATTACKS, heavyIndex: 2 };
