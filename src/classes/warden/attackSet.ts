import type { AttackClipDef } from '../../characters/knightClips';
import type { AttackSet } from '../../player/attackSets';
import { WARDEN_CLIPS } from './tuning';

/**
 * Attacks 1 to 4 of the Warden (keys 1 to 4): wide slice, quick spinning sweep, heavy chop, slow stab. The chop is the
 * heavy attack (index 2) like the Knight's. Windows come from the axe head's speed through each clip (sampled at 60 steps per
 * clip, as the Knight's were): the slice is hot at 0.32..0.43, the chop at 0.40..0.55, the stab's thrust at 0.22..0.27, and the
 * spin is a steady ~15 m/s throughout. Each window adds a margin around the hot part like the Knight's do.
 */
export const WARDEN_ATTACKS: readonly AttackClipDef[] = [
  { clip: WARDEN_CLIPS.slice, activeStart: 0.31, activeEnd: 0.46 },
  { clip: WARDEN_CLIPS.spinning, activeStart: 0.25, activeEnd: 0.75 },
  { clip: WARDEN_CLIPS.chop, activeStart: 0.42, activeEnd: 0.58 },
  { clip: WARDEN_CLIPS.stab, activeStart: 0.2, activeEnd: 0.3 },
];

export const WARDEN_ATTACK_SET: AttackSet = { attacks: WARDEN_ATTACKS, heavyIndex: 2 };
