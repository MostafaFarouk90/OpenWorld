import type { FoeKind } from './foes/types';
import type { ActorId, FavourTrack } from './ports';

export type AiState =
  | 'spawn'
  | 'idle'
  | 'patrol'
  | 'notice'
  | 'chase'
  | 'telegraph'
  | 'attack'
  | 'recover'
  | 'stagger'
  | 'flee'
  | 'return'
  | 'yield'
  | 'released'
  | 'spared'
  | 'dead';

export type EnemyKind = 'ash-wraith' | 'blighted-soldier' | 'alley-cutpurse' | 'ember-hound';

/** The impact-sound materials of `actor.data.audio.material` ('straw' and 'wood' are the foes'). */
export type EnemyMaterial = 'ash' | 'metal' | 'straw' | 'wood';

/** Which hand's tracer a move swings: the right weapon (sword or claw) or the left (shield). */
export type WeaponChannel = 'right' | 'left';

export interface MoveDef {
  /** Stable id, e.g. 'wraith.claw'. The telegraph's `moveId`. */
  id: string;
  /** Knight clip; this is `attack.window.attackId` and the telegraph's `attackId`. */
  clip: string;
  /** Normalised active window within the clip (clips.ts, measured from Knight.glb). */
  activeStart: number;
  activeEnd: number;
  /** Seconds from the telegraph to the window opening (design 11.6 wind-up); the pre-window part is time-scaled to fit. */
  windup: number;
  /** Yellow (blockable) or red (dodge only, sent as `unblockable`). */
  telegraph: 'block' | 'dodge';
  weapon: WeaponChannel;
  /** At level 1, before the bone multiplier. */
  damage: number;
  poise: number;
  /** Distance band (metres, feet to feet) in which the move may start. */
  range: readonly [number, number];
  cooldown: number;
  /** Punishable pause after the clip ends. */
  recover: number;
  /** Selection weight; 0 means only when a spawn's move filter names it (the T10 red sweep). */
  weight: number;
  onHit?: 'slow' | 'steal' | 'ignite';
  /** A forward leap while the window is open (the hound's pounce): up to `maxMetres` in a straight line, stopping short of the target. */
  leap?: { maxMetres: number };
}

export interface ModelRecipe {
  /** Asset ids tried in order (the first the loader has); 'knight' is always the fallback. */
  prefer: readonly string[];
  /** Multiplied into every material's colour. */
  tint: number;
  emissive?: number;
  weapons: 'none' | 'sword-shield';
}

export interface MercyDef {
  verb: 'release' | 'spare' | 'calm';
  tier: 'normal' | 'elite';
  track: FavourTrack | null;
  /** Release opens on a stagger (undead); Spare on a yield (humans); Calm before the first attack (beasts). */
  when: 'staggered' | 'yielding' | 'calming';
  /** Calm: item ids that open it (thread 1 reads them; data only here). */
  offerings?: readonly { itemId: string; count: number }[];
  /** A staggered (knocked down) beast accepts the Warm Hand (thread 1's Calm). */
  warmHand?: boolean;
}

export interface EnemyDef {
  kind: EnemyKind;
  nameKey: string;
  model: ModelRecipe;
  maxHealth: number;
  maxPoise: number;
  walkSpeed: number;
  chaseSpeed: number;
  moves: readonly MoveDef[];
  /** Flee below this health fraction (design: pack animals at 0.15); undefined never flees. */
  fleeAtHealth?: number;
  mercy: MercyDef;
  material: EnemyMaterial;
  /** Raises a shield about half the time; see ai/guard.ts. */
  guard?: boolean;
  /** Advances beside a living packmate and staggers swing starts (ai/pair.ts). */
  pairAdvance?: boolean;
  /** Wraiths rise from an ash pile when spawned (Lie_StandUp). */
  rises: boolean;
  /** Alley Cutpurse behaviour (cutpurse/): steals on a grab, flees with the gold, can be caught and spared. */
  thief?: boolean;
  /** Which body the enemy gets: the Knight rig (default) or the procedural quadruped. */
  body?: 'humanoid' | 'quadruped';
  /** `circle-rush`: circle the target while a packmate is near, then rush (ai/Brain, hound/circleRush.ts). */
  behaviour?: 'circle-rush';
  /** Overrides `AI.attackersPerTarget` (the largest limit among the holders and the requester applies). */
  attackersPerTarget?: number;
  /** Seconds between two members of one spawner taking an attack token (default: the pair stagger for `pairAdvance`, else none). */
  attackStagger?: number;
  /** A player hit shortly after dodging this enemy's attack knocks it down (the hound). */
  dodgeCounterKnockdown?: boolean;
}

export interface LevelBand {
  min: number;
  max: number;
}

export interface SpawnerDef {
  id: string;
  /** Written to `actor.spawnTag` (default: the spawner id); thread 3's M01 kill objective matches 'm01'. */
  tag?: string;
  enemy: EnemyKind | FoeKind;
  count: number;
  /** Spawn anchor id (world-layout-and-npcs.md section 2). */
  anchor: string;
  /** Per-member spawn anchors (slot i at entry i); a missing one falls back to the ring around `anchor`. */
  memberAnchors?: readonly string[];
  /** Waypoint anchor ids, or every anchor carrying a tag. */
  patrol?: readonly string[] | { tag: string };
  /** Ash-pile anchor ids a Blightbloom raises wraiths from. */
  piles?: readonly string[];
  /** A band, or a region id from REGION_BANDS. */
  band: LevelBand | string;
  /**
   * auto: at setup and after `rest`; manual: the enemies service; quest: on `quest.started` with this id,
   * and with `flag` only while that quest is active and the flag is true (checked on start, flag change and save load).
   * gate: like auto, but present only while `flag` is on (when given) and `until` is off (when given); re-derived
   * through `ctx.gates`, so a load and a later flag change both add or remove the group.
   * interior: on `interior.entered` with this interior id (and on a load inside it).
   */
  activation:
    | 'auto'
    | 'manual'
    | { quest: string; flag?: string }
    | { flag?: string; until?: string }
    | { interior: string };
  /** The pack leader's slot (one per group): a calmed leader calms its pack (thread 1). */
  leaderSlot?: number;
  /** Never saved: no spent slots and no cleared mark (the Prior's summons, which thread 3b resets per wave). */
  ephemeral?: boolean;
  respawn: 'never' | 'onRest';
  leash?: boolean;
  /** `false` turns off the Footman's guard for this group (the slice 1 tutorial soldiers fight without it). */
  guard?: boolean;
}

export interface SpawnOptions {
  /** Only these move ids may be chosen (T09 chop only, T10 red sweep only). */
  moves?: readonly string[];
  healthScale?: number;
  damageScale?: number;
  /** Notice the player at once. */
  aggro?: boolean;
  tierOffset?: number;
  /** Default: the spawner's `leash`, else true. */
  leash?: boolean;
  /** Default: the spawner's `guard`, else the def's. */
  guard?: boolean;
}

export interface EnemyView {
  readonly actorId: ActorId;
  readonly kind: EnemyKind | FoeKind;
  readonly state: AiState;
  readonly spawnerId: string | null;
  readonly level: number;
}
