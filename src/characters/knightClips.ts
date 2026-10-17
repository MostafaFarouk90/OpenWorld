// Clip names, attack windows, footstep phases and bone names of the KayKit Knight (Knight.glb).
// Timings were measured from the asset: foot plants from the lowest foot height per cycle, attack
// windows from the sword tip's speed. The combat contract (contracts/animation-events.md) mirrors this.

export type LocomotionState = 'idle' | 'walk' | 'run' | 'jumpStart' | 'airborne' | 'land' | 'attack';

/** States that play a looping clip; the rest play once. */
export const LOOPING_STATES: ReadonlySet<LocomotionState> = new Set(['idle', 'walk', 'run', 'airborne']);

/** States the player is standing in; attacks can only start from these. */
export const GROUNDED_STATES: ReadonlySet<LocomotionState> = new Set(['idle', 'walk', 'run', 'land']);

export type ClipMap = Record<Exclude<LocomotionState, 'attack'>, string>;

export const KNIGHT_CLIPS: ClipMap = {
  idle: 'Idle',
  walk: 'Walking_A',
  run: 'Running_A',
  jumpStart: 'Jump_Start',
  airborne: 'Jump_Idle',
  land: 'Jump_Land',
};

/** Where a state borrows its clip from when the Knight file lacks it. `idle` is required. */
export const CLIP_FALLBACKS: Record<Exclude<LocomotionState, 'attack' | 'idle'>, Exclude<LocomotionState, 'attack'>> = {
  walk: 'idle',
  run: 'walk',
  jumpStart: 'airborne',
  airborne: 'idle',
  land: 'idle',
};

export interface AttackClipDef {
  clip: string;
  /** Normalised clip time (0-1) at which the weapon starts to count as dangerous, inclusive. */
  activeStart: number;
  /** Normalised clip time at which it stops, inclusive. */
  activeEnd: number;
}

export const KNIGHT_ATTACKS: readonly AttackClipDef[] = [
  { clip: '1H_Melee_Attack_Slice_Horizontal', activeStart: 0.15, activeEnd: 0.36 },
  { clip: '1H_Melee_Attack_Slice_Diagonal', activeStart: 0.33, activeEnd: 0.48 },
  { clip: '1H_Melee_Attack_Chop', activeStart: 0.45, activeEnd: 0.62 },
  { clip: '1H_Melee_Attack_Stab', activeStart: 0.2, activeEnd: 0.3 },
];

export type Foot = 'left' | 'right';

/** Normalised times at which each foot plants, per looping clip. */
export const KNIGHT_FOOTSTEPS: Readonly<Record<string, ReadonlyArray<{ phase: number; foot: Foot }>>> = {
  Walking_A: [
    { phase: 0.47, foot: 'right' },
    { phase: 0.97, foot: 'left' },
  ],
  Running_A: [
    { phase: 0.15, foot: 'left' },
    { phase: 0.65, foot: 'right' },
  ],
};

/** Hand slot bones the weapons mount on (Three.js strips the dots from glTF names). */
export const RIGHT_HAND_SLOT = 'handslotr';
export const LEFT_HAND_SLOT = 'handslotl';

/** Deforming bones of the Knight, as Three.js names them. */
export const KNIGHT_BONES = [
  'root',
  'hips',
  'spine',
  'chest',
  'head',
  'upperarml',
  'lowerarml',
  'wristl',
  'handl',
  'handslotl',
  'upperarmr',
  'lowerarmr',
  'wristr',
  'handr',
  'handslotr',
  'upperlegl',
  'lowerlegl',
  'footl',
  'toesl',
  'upperlegr',
  'lowerlegr',
  'footr',
  'toesr',
] as const;

/** Weapons embedded in Knight.glb on the hand slots; hidden in favour of the separate weapon files. */
export const EMBEDDED_WEAPONS = [
  '1H_Sword',
  '2H_Sword',
  '1H_Sword_Offhand',
  'Badge_Shield',
  'Rectangle_Shield',
  'Round_Shield',
  'Spike_Shield',
] as const;
export const EMBEDDED_SWORD = '1H_Sword';
export const EMBEDDED_SHIELD = 'Round_Shield';
