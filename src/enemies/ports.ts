import type * as THREE from 'three';
import type { DamageBus } from '../combat/DamageBus';
import type { HurtboxSet } from '../combat/HurtboxSet';
import type { AttackWindowSource } from '../combat/types';
import type { WeaponTracer } from '../combat/WeaponTracer';
import type { PhysicsWorld, Vec3 } from '../physics/PhysicsWorld';

/**
 * The slice of the game core (contracts/actors-and-damage.md, game-events-and-flags.md,
 * world-layout-and-npcs.md, input-and-hud.md) this thread uses, as narrow structural interfaces.
 * `enemies.plugin.ts` adapts the real GameContext to `EnemyHost`; tests pass fakes.
 */

export type ActorId = string;
export type Team = 'player' | 'ally' | 'neutral' | 'hostile';
export type FavourTrack = 'halvard' | 'oswin' | 'grisel' | 'dragons' | 'ashwalkers';
export type MercyVerb = 'spare' | 'calm' | 'release' | 'warmHand';
export type MercyTier = 'normal' | 'elite' | 'boss';

export interface ActorLike {
  readonly id: ActorId;
  readonly kind: string;
  team: Team;
  level: number;
  health: number;
  maxHealth: number;
  poise: number;
  maxPoise: number;
  readonly dead: boolean;
  hittable: boolean;
  invulnerable: boolean;
  root: THREE.Object3D | null;
  readonly spawnTag?: string;
  data: Record<string, unknown>;
  worldPosition(out: THREE.Vector3): THREE.Vector3;
  restorePoise(n?: number): void;
}

export interface ActorInitLike {
  kind: string;
  team: Team;
  level?: number;
  maxHealth: number;
  maxPoise?: number;
  root?: THREE.Object3D;
  owner?: unknown;
  /** Set once at spawn from the spawner's tag (coordinator ruling for thread 3's kill filter). */
  spawnTag?: string;
}

export interface ActorsPort {
  spawn(init: ActorInitLike): ActorLike;
  despawn(id: ActorId): void;
  get(id: ActorId): ActorLike | undefined;
  /** Maps another object (a second weapon's tracer attacker) to the actor; returns unbind. */
  bindOwner(actor: ActorLike, owner: unknown): () => void;
  readonly player: ActorLike;
}

export type DamageOutcome = 'hit' | 'blocked' | 'parried' | 'immune';
export interface DamageRequestLike {
  attackerId: ActorId | null;
  targetId: ActorId;
  amount: number;
  poise: number;
  kind: 'melee' | 'spell' | 'fall' | 'script' | 'status';
  bone?: string;
  attackId?: string;
  swingId?: number;
  direction?: THREE.Vector3;
  /** Requested from thread 0 (requests-round-1 item 4): red, dodge-only attacks. */
  unblockable?: boolean;
}
export interface DamageResultLike extends DamageRequestLike {
  outcome: DamageOutcome;
  dealt: number;
  poiseDealt: number;
  healthAfter: number;
  killed: boolean;
  saved: boolean;
  staggered: boolean;
}
export type DamageModifierLike = (
  req: DamageRequestLike & { outcome: DamageOutcome },
  target: ActorLike,
  attacker: ActorLike | null,
) => void;

export interface DamagePort {
  addModifier(id: string, modifier: DamageModifierLike, order?: number): () => void;
  heal(id: ActorId, amount: number): number;
  /** Scripted death (the real DamageResolver has it); foes that fire or a torch destroys use it, so `actor.died` still fires. */
  kill?(id: ActorId, killerId?: ActorId | null): void;
}

export interface CombatPort {
  /** The hit bus the core's DamageBridge listens to (world.combat.combat.bus); enemy tracers emit on it. */
  readonly bus: DamageBus;
  /** Returns a remove function (requests-round-1 item 5); removing an open window emits attack.window close. */
  addAttacker(actorId: ActorId, tracer: WeaponTracer, window: AttackWindowSource): () => void;
  addTarget(hurtboxes: HurtboxSet, actorId?: ActorId): () => void;
}

export interface MercyEventLike {
  verb: MercyVerb;
  tier: MercyTier;
  track: FavourTrack | null;
  creature: string;
  actorId?: ActorId;
  amount?: number;
  pulseId?: string;
}

/** The shared events this thread emits or listens to (payloads from game-events-and-flags.md section 4). */
export interface EnemyEvents {
  'damage.dealt': DamageResultLike;
  'actor.staggered': { actorId: ActorId; byId: ActorId | null };
  'actor.died': { actorId: ActorId; killerId: ActorId | null; kind: string; team: Team; level: number };
  'actor.despawned': { actorId: ActorId };
  'actor.revived': { actorId: ActorId; reason: string; health: number };
  'ai.aggro': { actorId: ActorId; targetId: ActorId };
  'ai.calm': { actorId: ActorId };
  telegraph: {
    actorId: ActorId;
    kind: 'block' | 'dodge';
    attackId: string;
    moveId: string;
    swingId: number;
    leadSeconds: number;
  };
  'telegraph.cancelled': { actorId: ActorId; swingId: number };
  mercy: MercyEventLike;
  'mercy.revoked': { actorId: ActorId; track: FavourTrack | null; removed: number };
  rest: { waystoneId?: string; placeId?: string };
  'save.loaded': { slot: string };
  'interior.entered': { interiorId: string; doorId: string };
  'interior.exited': { interiorId: string; doorId: string };
  'quest.started': { questId: string };
  'flag.changed': { key: string; value: boolean | number | string | undefined; previous: boolean | number | string | undefined };
  'enemies.groupCleared': { spawnerId: string };
  'enemies.state': { actorId: ActorId; from: string; to: string };
  'enemies.yield': { actorId: ActorId; seconds: number };
  /** R01: once per ash scarecrow (`scarecrowId` is its spawner slot's anchor id, e.g. 'r01.scarecrow.3'). */
  'scarecrow.cleared': { actorId: ActorId; scarecrowId: string; method: 'torch' | 'surge' | 'strike' };
  /** Core boss registry (actors-and-damage.md section 7); thread 1 listens to open the boss's mercy hold. */
  'boss.releaseWindow': { bossId: string; open: boolean };
  'boss.released': { bossId: string; actorId: ActorId };
  'boss.ended': { bossId: string; actorId: ActorId; reason: 'despawned' | 'unregistered' };
}
export type EnemyEventName = keyof EnemyEvents;

export interface EventsPort {
  on<K extends EnemyEventName>(type: K, listener: (payload: EnemyEvents[K]) => void): () => void;
  emit<K extends EnemyEventName>(type: K, payload: EnemyEvents[K]): void;
}

export interface AnchorLike {
  id: string;
  position: Vec3;
  yaw: number;
  tags?: string[];
}
export interface AnchorsPort {
  find(id: string): AnchorLike | undefined;
  withTag(tag: string): AnchorLike[];
}

/** world-layout-and-npcs.md section 1 plus requests-round-1 item 8 (action, coneDegrees, score). */
export interface InteractableLike {
  id: string;
  kind: 'release';
  action?: 'interact' | 'mercy';
  position(out: THREE.Vector3): THREE.Vector3;
  radius?: number;
  /** Half-angle of the facing cone (core default 75). */
  coneDegrees?: number;
  promptKey?: string;
  name?: string;
  holdSeconds?: number;
  priority?: number;
  score?(feet: THREE.Vector3Like): number;
  enabled?(): boolean;
  onInteract(actor: ActorLike): void;
}
export interface InteractionPort {
  register(i: InteractableLike): () => void;
}

export interface StatePort {
  getBool(key: string, fallback?: boolean): boolean;
  setFlag(key: string, value: boolean | number | string): void;
}

/** Thread 3a's `nav` service (contracts/interiors-and-nav.md section 2). */
export interface NavPort {
  hasGrid(at: Vec3): boolean;
  /** Waypoints including `to`; null means no grid covers this (steer locally). */
  path(from: Vec3, to: Vec3): Vec3[] | null;
}

/** `ctx.gates` (state/FlagGates.ts): flag-derived state that is re-derived on `save.loaded`. */
export interface GatesPort {
  /** `listener(open, cause)` at once, then when `test`'s result changes. `get(key)` reads a flag as a boolean. */
  watch(
    test: (get: (key: string) => boolean) => boolean,
    listener: (open: boolean, cause: 'init' | 'flag' | 'load' | 'recheck') => void,
    keys: readonly string[],
  ): () => void;
}

export interface PersistableLike {
  key: string;
  version: number;
  serialize(): unknown;
  load(data: unknown, version: number): void;
}

export interface PlayerPort {
  readonly actor: ActorLike;
  readonly feet: THREE.Vector3;
  /** The player's capsule collider, so line-of-sight rays can tell "hit the player" from "hit a wall". */
  readonly collider: unknown;
  /** Sprinting or attacking this tick (heard at AI.hearingLoud). */
  loud(): boolean;
  addMoveModifier(source: string, mod: { speedScale?: number }): () => void;
}

export interface VfxLike {
  spawnEffect?(id: string, transform: { position: { x: number; y: number; z: number } }, params?: Record<string, number | string | boolean>): { stop(): void } | unknown;
  pulseScreen?(strength: number, seconds: number, color?: number): void;
  dissolve(root: THREE.Object3D, seconds: number): Promise<void>;
  attachTrail?(
    id: string,
    hilt: THREE.Object3D,
    tip: THREE.Object3D,
    opts?: { lifetime?: number; color?: number },
  ): { setEmitting(on: boolean): void; dispose(): void };
}

/**
 * The torch the player carries in R01 (plans/slice-2-quests.md: "the quests service exposes the carried torch,
 * no event"). Not on this branch's quests service yet, so this is the shape agreed from the plan text: the
 * quests service gains an optional `carriedTorch()`.
 */
export interface TorchState {
  /** Only a lit torch ignites anything. */
  readonly lit: boolean;
  /** World position of the flame. */
  position(out: { x: number; y: number; z: number }): { x: number; y: number; z: number };
  /** Contact radius around the flame, metres. */
  readonly radius: number;
}
export interface TorchPort {
  /** The carried torch, or null when the player carries none. */
  carried(): TorchState | null;
}

/** Thread 3's quests service as far as enemies use it. */
export interface QuestsPortLike {
  active(): string[];
  carriedTorch?(): TorchState | null;
}

export interface ServicesPort {
  get(name: 'vfx'): VfxLike | undefined;
  get(name: 'lockOn'): { readonly targetId: ActorId | null } | undefined;
  /** Thread 3's quests service: the started, unfinished quest ids. */
  get(name: 'quests'): QuestsPortLike | undefined;
  /** Thread 3a's interiors service: the interior id the player is in, or null outdoors. */
  get(name: 'interiors'): { readonly current: string | null } | undefined;
  get(name: 'nav'): NavPort | undefined;
  /**
   * Thread 2's spells service. `useShard` charges Burn and adds the Scar at Burn 75 or more; until it
   * merges, `addBurn` charges the Burn alone.
   */
  get(name: 'spells'): ShardSpells | undefined;
}

export interface ShardSpells {
  useShard?(gain: number, source: string): void;
  addBurn?(n: number, source: string): void;
}

/** The slice of the core BossRegistry the mercy hold uses. */
export interface BossesPort {
  state(bossId: string): { actorId: ActorId; releaseOpen: boolean; outcome: 'defeated' | 'released' | null } | null;
  release(bossId: string): boolean;
}

/** The parts of the AssetLoader the enemy models need (requests-round-1 item 6). */
export interface AssetsPort {
  load(id: string): Promise<unknown>;
  instantiate(id: string): THREE.Object3D;
  animations(id: string): THREE.AnimationClip[];
  has(id: string): boolean;
}

export interface EnemyHost {
  scene: THREE.Object3D;
  /** Null in pure tests: enemies then use the heightfield mover and line of sight is always clear. */
  physics: PhysicsWorld | null;
  actors: ActorsPort;
  damage: DamagePort;
  combat: CombatPort;
  events: EventsPort;
  anchors: AnchorsPort;
  interaction: InteractionPort;
  state: StatePort;
  gates: GatesPort;
  services: ServicesPort;
  /** The core boss registry; absent in tests that do not need bosses. */
  bosses?: BossesPort;
  player: PlayerPort;
  /** The carried torch (read through the quests service); absent in hosts that have none. */
  torch?: TorchPort;
  heightAt(x: number, z: number): number;
  warn(message: string): void;
}
