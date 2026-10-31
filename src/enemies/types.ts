import type { DamageTag } from '../actors/DamageResolver';
import type { FoeKind } from './foes/types';
import type { ActorId, FavourTrack } from './ports';
import type { Act3BlockId } from './level';
import type { AreaId } from '../region/areas';

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
  | 'calmed'
  | 'dead';

export type EnemyKind =
  | 'ash-wraith'
  | 'blighted-soldier'
  | 'alley-cutpurse'
  | 'ember-hound'
  | 'watch-guard'
  | 'guildhall-thug'
  | 'toll-sergeant'
  | 'yard-veteran'
  | 'hrolf-trial'
  // Act 2 (A6a): the procedural wyrms.
  | 'ember-wyrm'
  | 'wyrmling'
  // Act 2 ground enemies (A6b)
  | 'slag-crawler'
  | 'cinder-golem'
  | 'kindling-fox'
  | 'hunter-spearman'
  | 'hunter-harpooner'
  // Act 2 (A4): House Grisel's steward guard (Deepgate's hall, M20's stewards).
  | 'steward-guard'
  // Act 3 (K6b PR 1): the Greyfen's own kinds.
  | 'fen-leech'
  | 'peat-shambler'
  // Act 3 (K6b PR 2): the Dragonspine's own kinds.
  | 'rime-hawk'
  | 'crag-ogre';

/**
 * Act 2 kind ids (v0.6 item 14), reserved here so no other thread takes them. A6a and A6b move each id into
 * `EnemyKind` in the same change that adds its `ENEMY_DEFS` and `TELEGRAPH_STYLE` rows (both are full records).
 */
export type Act2EnemyKind = 'ember-wyrm' | 'wyrmling';
export const ACT2_ENEMY_KINDS: readonly Act2EnemyKind[] = ['ember-wyrm', 'wyrmling'];

/**
 * Act 3 kind ids (v0.7 item 13), reserved the same way: K6a and K6b move each id into `EnemyKind` in the same change
 * that adds its `ENEMY_DEFS` and `TELEGRAPH_STYLE` rows.
 */
export type Act3EnemyKind = 'fen-leech' | 'peat-shambler' | 'rime-hawk' | 'crag-ogre' | 'skarl-drake';
export const ACT3_ENEMY_KINDS: readonly Act3EnemyKind[] = ['fen-leech', 'peat-shambler', 'rime-hawk', 'crag-ogre', 'skarl-drake'];

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
  /** K6b: `drain` takes `FEN_TUNING.leech.drainStamina` stamina from the player on a landed hit (the Fen Leech's bite). */
  onHit?: 'slow' | 'steal' | 'ignite' | 'drain';
  /** A6b: fires a projectile when the window opens (rock, slag glob, net, harpoon); see ranged/. */
  ranged?: RangedSpec;
  /** A8: a blockable ranged hit sent with `parryable: false` (a script boss's net: a timed block is a plain block, never a free break). */
  parryable?: false;
  /** A6b: when the window opens, hits every valid actor inside the circle once (stomp, slam, landing); see ranged/area.ts. */
  area?: AreaSpec;
  /** A forward leap while the window is open (the hound's pounce): up to `maxMetres` in a straight line, stopping short of the target. */
  leap?: { maxMetres: number };
  /** A flier's moves (the Ember Wyrm): offered only in the air or only on the ground; unset offers it in both. */
  flight?: 'air' | 'ground';
  /**
   * The hit is fire (a flame jet, a burning bite, a slag glob): carried into the damage request as `element` so fire
   * resistance (the Bellows Blessing) reduces the hit itself, not only the ignite ticks after it (review-b M2).
   */
  element?: 'fire';
}

/** What a ranged move fires. `root` (seconds) and `pull` (metres) are applied only on an outcome `hit`. */
export interface RangedSpec {
  shape: 'rock' | 'glob' | 'net' | 'harpoon';
  /** Metres per second. */
  speed: number;
  /** The projectile stops after this many metres. */
  maxRange: number;
  /** Hit radius, metres. */
  radius: number;
  /** Aim height above the shooter's feet (hand or mouth). */
  originHeight: number;
  root?: number;
  pull?: number;
  /** Seconds of burning on a hit (the slag glob). */
  ignite?: number;
}

/** A circle on the ground, in front of the attacker or on the target, hit once per swing. */
export interface AreaSpec {
  radius: number;
  /** `self`: centred on the attacker; `front`: `offset` metres ahead of it. */
  centre: 'self' | 'front';
  offset?: number;
}

export interface ModelRecipe {
  /** Asset ids tried in order (the first the loader has); 'knight' is always the fallback. */
  prefer: readonly string[];
  /** Multiplied into every material's colour. */
  tint: number;
  emissive?: number;
  weapons: 'none' | 'sword-shield';
  /** Look only (never behaviour): uniform scale on top of `KNIGHT.modelScale` (default 1). */
  scale?: number;
  /** Named nodes of the model to hide, e.g. the Knight's helmet. */
  hide?: readonly string[];
  /** Held items built into the model to show for looks (`1H_Axe`, `Rectangle_Shield`); they take no part in tracers. */
  show?: readonly string[];
  /** Pack models worn on a bone (a pot helm on the head); skipped when the pack is not loaded. */
  props?: readonly ModelProp[];
}

/** A pack model attached to a bone for looks. Offsets are in the bone's space (metres at the bone's world scale). */
export interface ModelProp {
  /** Swap model id, e.g. `hex/bucket_empty`. */
  id: string;
  /** Three.js bone name (dots stripped): `head`, `handslotr`. */
  bone: string;
  position?: readonly [number, number, number];
  /** Euler angles, radians. */
  rotation?: readonly [number, number, number];
  /** Uniform scale in metres per model unit (the bone's own scale is divided out). */
  scale?: number;
  /** A `proc/` prop shown while `id` is not loaded (or never loads), so a body is never empty-handed. */
  fallback?: string;
  /** Offset and Euler rotation of the `fallback` prop (its own frame, not `id`'s): none by default, so a fallback built along the bone is not turned by the model's rotation. */
  fallbackPosition?: readonly [number, number, number];
  fallbackRotation?: readonly [number, number, number];
}

/** The verbs a quest can unlock (flags `enemies.mercy.<verb>`). The Warm Hand rides on Calm. */
export type UnlockVerb = 'release' | 'spare' | 'calm';

export interface MercyDef {
  verb: UnlockVerb;
  tier: 'normal' | 'elite';
  track: FavourTrack | null;
  /** Release opens on a stagger (undead); Spare on a yield (humans); Calm before the first attack (beasts). */
  when: 'staggered' | 'yielding' | 'calming' | 'exposed';
  /** Calm: item ids that open it (thread 1 reads them; data only here). */
  offerings?: readonly { itemId: string; count: number }[];
  /** How offerings reach the beast: held out in hand (default) or thrown. */
  delivery?: 'held' | 'thrown';
  /** A staggered (knocked down) beast accepts the Warm Hand (thread 1's Calm). */
  warmHand?: boolean;
  /**
   * A Calm that costs nothing (A6b): `always` while the window is open (the golem's Still on its exposed core), or `cooled`
   * only while a cooling hit has it staggered (the crawler). It shows as its own option in the prompt.
   */
  freeCalm?: 'always' | 'cooled';
  /** v0.7 item 14: which Calm the prompt reads: 'calm' (default) or 'layToRest' (the Peat Shambler; its strings key differs). */
  calmForm?: 'calm' | 'layToRest';
  /**
   * v0.7 item 14: Calm offers nothing until the context says so: `pulledOut` (the Shambler is out of the peat) or `grounded`
   * (a flyer is down). See `CalmContext` in calm.ts.
   */
  precondition?: 'pulledOut' | 'grounded';
}

/** The offering delivery of a mercy def; `held` when unset. */
export function offeringDelivery(def: Pick<MercyDef, 'delivery'>): 'held' | 'thrown' {
  return def.delivery ?? 'held';
}

export interface EnemyDef {
  kind: EnemyKind;
  nameKey: string;
  /** v0.7: damage tags of this kind as a target (`dragonkin`); a hit builder copies them onto `DamageRequest.tags`. */
  tags?: readonly DamageTag[];
  model: ModelRecipe;
  maxHealth: number;
  maxPoise: number;
  walkSpeed: number;
  chaseSpeed: number;
  moves: readonly MoveDef[];
  /**
   * Whether a registered taunter (the Iron Familiar) can draw this kind. Default: true for plain enemies, false for a registered
   * boss; a boss def sets `true` to opt in, any def sets `false` to opt out.
   */
  tauntable?: boolean;
  /** Flee below this health fraction (design: pack animals at 0.15); undefined never flees. */
  fleeAtHealth?: number;
  /** None for kinds that cannot be spared, released or calmed (the watch guard). */
  mercy?: MercyDef;
  material: EnemyMaterial;
  /** Raises a shield about half the time; see ai/guard.ts. */
  guard?: boolean;
  /** Advances beside a living packmate and staggers swing starts (ai/pair.ts). */
  pairAdvance?: boolean;
  /** Wraiths rise from an ash pile when spawned (Lie_StandUp). */
  rises: boolean;
  /** Alley Cutpurse behaviour (cutpurse/): steals on a grab, flees with the gold, can be caught and spared. */
  thief?: boolean;
  /** Which body the enemy gets: the Knight rig (default), the procedural quadruped, the wyrm (wyrm/), or A6b's golem and crawler. */
  body?: 'humanoid' | 'quadruped' | 'wyrm' | 'golem' | 'crawler' | 'leech' | 'bird';
  /**
   * `circle-rush`: circle the target while a packmate is near, then rush (ai/Brain, hound/circleRush.ts). `wyrm-flight` (the Ember Wyrm) and
   * `skittish` (the wyrmling) are behaviour overlays (behaviours.ts). A6b: `ceiling` (crawler drop), `back-core` (golem), `guide` (fox, sheep: harmless).
   */
  behaviour?: 'circle-rush' | 'wyrm-flight' | 'skittish' | 'ceiling' | 'back-core' | 'guide' | 'lurk' | 'peat' | 'hawk' | 'ogre';
  /** Seconds a poise break holds the stagger (and its mercy window); default `AI.breakStaggerSeconds` (1.2). */
  breakStaggerSeconds?: number;
  /** Hurtboxes on which a player-team or ally hit breaks poise at once (the Ember Wyrm's wings). */
  poiseBreakBones?: readonly string[];
  /** Spare opens when rooted or staggered under `AI.yieldBelowHealth` (the hunters), not only at a poise break. */
  yieldWhenRooted?: boolean;
  /**
   * An accepted Calm leaves a static form where it stands (a cairn, a curled crawler) instead of walking off; kept across saves
   * by the ground persistable (ground/settled.ts).
   */
  settles?: 'cairn' | 'curled';
  /** Overrides `AI.attackersPerTarget` (the largest limit among the holders and the requester applies). */
  attackersPerTarget?: number;
  /** Seconds between two members of one spawner taking an attack token (default: the pair stagger for `pairAdvance`, else none). */
  attackStagger?: number;
  /** A player hit shortly after dodging this enemy's attack knocks it down (the hound). */
  dodgeCounterKnockdown?: boolean;
  /** Watches only: raises `ai.spotted`, never `ai.aggro`, never chases or attacks (still hurtable). See Enemy.damaged. */
  observerOnly?: boolean;
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
  /** A6b: the kind of slot i (a mixed pack, e.g. spearmen with one harpooner); a missing entry uses `enemy`. */
  memberKinds?: readonly EnemyKind[];
  count: number;
  /** Spawn anchor id (world-layout-and-npcs.md section 2). */
  anchor: string;
  /** Per-member spawn anchors (slot i at entry i); a missing one falls back to the ring around `anchor`. */
  memberAnchors?: readonly string[];
  /** Waypoint anchor ids, or every anchor carrying a tag. */
  patrol?: readonly string[] | { tag: string };
  /** Waypoints between the start nodes of consecutive patrol slots (default 1): slot k starts at waypoint k * stride, so a loop's guards spread out instead of walking as a convoy. */
  patrolStride?: number;
  /** Ash-pile anchor ids a Blightbloom raises wraiths from. */
  piles?: readonly string[];
  /** A band, or a region id from REGION_BANDS. */
  band: LevelBand | string;
  /**
   * v0.7: an Act 3 approach block. Members roll L + round(roll x span) (ACT3_BLOCKS), where L is the block's saved lock,
   * or before the lock the live preview (design 5.9 at the current Warmth Tier and player level). The band is unused.
   */
  block?: Act3BlockId;
  /**
   * v0.7 (K6b): this spawner's own roll on top of L, a whole number from 0 to the block's span (first-arrival Greyfen
   * groups roll at most L + 1, design 6.1). Out of range warns once and uses the block span. Read only with `block`.
   */
  blockSpan?: number;
  /**
   * v0.7: the sub-area band (areas.ts). `dragonspine-summit` rolls 26 to 28 and is capped at the player's level + 3
   * (Q9). A spawner whose band is a region with areas and that names no area takes the area of its anchor.
   */
  area?: AreaId;
  /**
   * auto: at setup and after `rest`; manual: the enemies service; quest: on `quest.started` with this id,
   * and with `flag` only while that quest is active and the flag is true (checked on start, flag change and save load).
   * gate: like auto, but present only while `flag` is on (when given) and `until` is off (when given); re-derived
   * through `ctx.gates`, so a load and a later flag change both add or remove the group.
   * interior: on `interior.entered` with this interior id (and on a load inside it).
   * A6b: a gate may carry `unlessChoice`: present unless the string flag `flag` equals `equals` (R07's hound groups); an unset
   * or any other value counts as present.
   */
  activation:
    | 'auto'
    | 'manual'
    | { quest: string; flag?: string }
    | { flag?: string; until?: string; unlessChoice?: { flag: string; equals: string } }
    | { interior: string };
  /** The pack leader's slot (one per group): a calmed leader calms its pack (thread 1). */
  leaderSlot?: number;
  /** Never saved: no spent slots and no cleared mark (the Prior's summons, which thread 3b resets per wave). */
  ephemeral?: boolean;
  respawn: 'never' | 'onRest';
  leash?: boolean;
  /** `false` turns off the Footman's guard for this group (the slice 1 tutorial soldiers fight without it). */
  guard?: boolean;
  /** Members spawn peaceful (`SpawnOptions.peaceful`) unless the spawn call says otherwise: the resting den wyrm. */
  peaceful?: boolean;
  /** Members ignore taunts (the Iron Familiar): the R10 duel's second must keep fighting Cael. */
  untauntable?: boolean;
  /** A quest-activated group that goes away when its quest completes (and on a load where that quest is not active): the M21 hall watch. */
  despawnOnQuestEnd?: boolean;
  /**
   * K6b PR 2: spawn options every member of this group gets, under the spawn call's own (the call wins field by field). The
   * R18 parents carry their tuning here (`healthScale`, `nest`, `nestGuard`), so the quest that spawns them needs no numbers.
   */
  options?: Readonly<Partial<SpawnOptions>>;
}

export interface SpawnOptions {
  /**
   * `spawnGroup` only: fill at most this many free slots, lowest slot index first (clamped to the free slots; live
   * and spent slots are skipped, so a later call continues with the next free slots). A non-integer or <= 0 count
   * spawns nothing (one warning). Slot indices, and so `leaderSlot`, are unchanged. Not remembered for refills.
   */
  count?: number;
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
  /** Watch only (default: the def's `observerOnly`); see EnemyDef.observerOnly. */
  observerOnly?: boolean;
  /** Asleep in place (the resting den wyrm): never notices the player until it is hit. */
  peaceful?: boolean;
  /** A `ceiling` kind (the Slag Crawler) spawns hanging (default true); `false` puts it on the floor, awake. */
  hanging?: boolean;
  /** K6b PR 2, the Rime Hawk: the anchor id of its nest (it perches there, and flies there when calmed). */
  nest?: string;
  /** K6b PR 2, the R18 parents: circle the nest, stoop only near it, break off after a stoop once the target backs away. */
  nestGuard?: boolean;
}

export interface EnemyView {
  readonly actorId: ActorId;
  readonly kind: EnemyKind | FoeKind;
  readonly state: AiState;
  readonly spawnerId: string | null;
  readonly level: number;
  /**
   * True while this enemy occupies its spawner's `leaderSlot` and is alive (thread 1's pack Calm reads it).
   * A dead leader is not replaced: nobody reads true afterwards. Foes and groups without a leader slot read false.
   */
  readonly packLeader: boolean;
  /** v0.7: a flyer is grounded after a bolt hit or on its nest; undefined means grounded (every walker). */
  readonly grounded?: boolean;
}
