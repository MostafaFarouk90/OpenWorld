// Clip names, attack windows, footstep phases and bone names of the KayKit Knight (Knight.glb).
// Timings were measured from the asset: foot plants from the lowest foot height per cycle, attack
// windows from the sword tip's speed. The combat contract (contracts/animation-events.md) mirrors this.

/** Reactive and defensive states entered by `AnimationController.enterAction`, never by `nextState`. */
export type ActionKind = 'block' | 'blockHit' | 'dodge' | 'flinch' | 'stagger' | 'dying' | 'dead';

/** Movement states picked by `nextState` from what the character controller did, plus `attack`. */
export type MovementState = 'idle' | 'walk' | 'run' | 'jumpStart' | 'airborne' | 'land' | 'attack';

/** State of a clip played once by `AnimationController.playOneShot` (emotes, interactions). */
export type OneShotState = 'oneShot';

/** Every state the animation controller can be in (the `stateChange` event carries these). */
export type LocomotionState = MovementState | ActionKind | OneShotState;

export const ACTION_KINDS: readonly ActionKind[] = ['block', 'blockHit', 'dodge', 'flinch', 'stagger', 'dying', 'dead'];

export function isActionKind(state: string): state is ActionKind {
  return (ACTION_KINDS as readonly string[]).includes(state);
}

/** States that play a looping clip; the rest play once. */
export const LOOPING_STATES: ReadonlySet<LocomotionState> = new Set(['idle', 'walk', 'run', 'airborne']);

/** States the player is standing in; attacks can only start from these. */
export const GROUNDED_STATES: ReadonlySet<LocomotionState> = new Set(['idle', 'walk', 'run', 'land']);

export type ClipMap = Record<Exclude<MovementState, 'attack'>, string>;

export const KNIGHT_CLIPS: ClipMap = {
  idle: 'Idle',
  walk: 'Walking_A',
  run: 'Running_A',
  jumpStart: 'Jump_Start',
  airborne: 'Jump_Idle',
  land: 'Jump_Land',
};

/** Where a state borrows its clip from when the Knight file lacks it. `idle` is required. */
export const CLIP_FALLBACKS: Record<Exclude<MovementState, 'attack' | 'idle'>, Exclude<MovementState, 'attack'>> = {
  walk: 'idle',
  run: 'walk',
  jumpStart: 'airborne',
  airborne: 'idle',
  land: 'idle',
};

/** Default clip of each action (`dodge` takes its clip from the caller; this is used when none is given). */
export type ActionClipMap = Record<ActionKind, string>;

export const KNIGHT_ACTION_CLIPS: ActionClipMap = {
  block: 'Blocking', // loops, 1.067 s
  blockHit: 'Block_Hit', // 1.067 s
  dodge: 'Dodge_Forward', // 0.4 s
  flinch: 'Hit_A', // 0.667 s
  stagger: 'Hit_B', // 0.867 s
  dying: 'Death_A', // 0.8 s, then holds its last pose
  dead: 'Death_A', // held on its last frame
};

/** The four directional dodge clips (0.4 s each). */
export const KNIGHT_DODGE_CLIPS = {
  forward: 'Dodge_Forward',
  backward: 'Dodge_Backward',
  left: 'Dodge_Left',
  right: 'Dodge_Right',
} as const;

/** Actions whose clip loops until `exitAction`. */
export const LOOPING_ACTIONS: ReadonlySet<ActionKind> = new Set(['block']);

/** Actions that can only start while standing on the ground (the rest can start in any state). */
export const GROUNDED_ACTIONS: ReadonlySet<ActionKind> = new Set(['block', 'blockHit', 'dodge']);

/** Actions during which the player must not move or jump by input (flinch leaves movement free). */
export const MOVEMENT_LOCKING_ACTIONS: ReadonlySet<ActionKind> = new Set([
  'block',
  'blockHit',
  'dodge',
  'stagger',
  'dying',
  'dead',
]);

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
