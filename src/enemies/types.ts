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

export type EnemyKind = 'ash-wraith' | 'blighted-soldier';

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
  onHit?: 'slow';
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
  verb: 'release' | 'spare';
  tier: 'normal' | 'elite';
  track: FavourTrack | null;
  /** Release opens on a stagger (undead); Spare on a yield (humans). */
  when: 'staggered' | 'yielding';
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
  material: 'ash' | 'metal';
  /** Wraiths rise from an ash pile when spawned (Lie_StandUp). */
  rises: boolean;
}

export interface LevelBand {
  min: number;
  max: number;
}

export interface SpawnerDef {
  id: string;
  enemy: EnemyKind;
  count: number;
  /** Spawn anchor id (world-layout-and-npcs.md section 2). */
  anchor: string;
  /** Waypoint anchor ids, or every anchor carrying a tag. */
  patrol?: readonly string[] | { tag: string };
  /** A band, or a region id from REGION_BANDS. */
  band: LevelBand | string;
  /** auto: at setup and after `rest`; manual: the enemies service; quest: on `quest.started` with this id. */
  activation: 'auto' | 'manual' | { quest: string };
  respawn: 'never' | 'onRest';
  leash?: boolean;
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
}

export interface EnemyView {
  readonly actorId: ActorId;
  readonly kind: EnemyKind;
  readonly state: AiState;
  readonly spawnerId: string | null;
  readonly level: number;
}
