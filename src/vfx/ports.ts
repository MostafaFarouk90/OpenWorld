// Structural stand-ins for the slice-1 game core (contracts/game-events-and-flags.md and
// actors-and-damage.md). Thread 0's core was not on main when thread 7 was written, so threads 7's
// code depends only on these small interfaces; the plugins satisfy `GamePlugin` structurally.
// Once core lands, replace each interface here with a re-export of the real type (names match).
import type * as THREE from 'three';

export type Vec3 = { x: number; y: number; z: number };
export type ActorId = string;
export type FixedPhase = 'input' | 'intent' | 'animation' | 'afterCombat' | 'rules' | 'late';
export type RenderPhase = 'world' | 'afterCamera' | 'hud';

export interface GameSystem {
  id: string;
  fixedPhase?: FixedPhase;
  renderPhase?: RenderPhase;
  order?: number;
  fixedUpdate?(dt: number, ctx: PluginContext): void;
  render?(alpha: number, frameTime: number, ctx: PluginContext): void;
  dispose?(): void;
}

export interface ActorLike {
  readonly id: ActorId;
  kind: string;
  team: 'player' | 'ally' | 'neutral' | 'hostile';
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  readonly dead: boolean;
  hittable: boolean;
  root: THREE.Object3D | null;
  worldPosition(out: THREE.Vector3): THREE.Vector3;
  restoreStamina(n: number): void;
}

export interface DamageResultLike {
  attackerId: ActorId | null;
  targetId: ActorId;
  amount: number;
  poise: number;
  kind: 'melee' | 'spell' | 'fall' | 'script';
  attackId?: string;
  swingId?: number;
  point?: Vec3;
  normal?: Vec3;
  outcome: 'hit' | 'blocked' | 'parried' | 'immune';
  dealt: number;
  poiseDealt: number;
  healthAfter: number;
  killed: boolean;
  saved: boolean;
  staggered: boolean;
}

/** Events thread 7 listens to or emits. Real payloads are in the contracts. */
export interface VfxEventMap {
  'damage.dealt': DamageResultLike;
  'attack.window': { actorId: ActorId; attackId: string; swingId: number; phase: 'open' | 'close' };
  telegraph: { actorId: ActorId; kind: 'block' | 'dodge'; attackId: string; leadSeconds: number };
  'actor.died': { actorId: ActorId; killerId: ActorId | null };
  'actor.despawned': { actorId: ActorId };
  'telegraph.cancelled': { actorId: ActorId; swingId?: number };
  'actor.staggered': { actorId: ActorId; byId: ActorId | null };
  'waystone.rekindled': { waystoneId: string; cause?: 'player' | 'load' | 'script' };
  rest: { waystoneId: string };
  'ai.aggro': { actorId: ActorId; targetId: ActorId };
  'ai.calm': { actorId: ActorId };
  'burn.changed': { value: number; previous: number };
  'ember.changed': { value: number; previous: number };
  'spell.cast': { casterId: ActorId; spellId: string };
  'spell.released': { casterId: ActorId; spellId: string };
  'spell.cancelled': { casterId: ActorId; spellId: string; reason: string };
  'dialogue.started': { dialogueId: string; npcId: string };
  'dialogue.ended': { dialogueId: string; npcId: string };
  'cutscene.started': { cutsceneId: string };
  'cutscene.ended': { cutsceneId: string };
  'save.loaded': { slot: string };
}
export type VfxEventType = keyof VfxEventMap;

export interface EventsLike {
  on<K extends VfxEventType>(type: K, listener: (payload: VfxEventMap[K]) => void): () => void;
  emit<K extends VfxEventType>(type: K, payload: VfxEventMap[K]): void;
}

export interface ClockLike {
  readonly tick: number;
  readonly seconds: number;
  /** Requested from thread 0: true while a hit-stop or pause is skipping simulated ticks. */
  readonly frozen?: boolean;
  readonly hitStopRemaining?: number;
  hitStop(seconds: number): void;
}

export interface PlayerLike {
  readonly actor: ActorLike;
  readonly feet: THREE.Vector3;
  readonly facingYaw: number;
  readonly avatar: AvatarLike | null;
  addMoveModifier(
    source: string,
    mod: { speedScale?: number; lockMove?: boolean; lockFacing?: boolean; lockActions?: string[] },
  ): () => void;
}

export interface AvatarLike {
  readonly root: THREE.Object3D;
  readonly weaponHilt: THREE.Object3D;
  readonly weaponTip: THREE.Object3D;
  readonly shield: THREE.Object3D;
  readonly controller: ControllerLike;
}

export interface ControllerLike {
  activeAttack(): { clip: string; activeStart: number; activeEnd: number; normalizedTime: number; active: boolean; swingId: number } | null;
  /** Requested from thread 1: plays a non-looping clip, false when busy or unknown. */
  playOneShot?(clip: string, opts?: { lockMove?: boolean }): boolean;
  /** Requested from thread 1. */
  readonly busy?: boolean;
  readonly events?: { subscribe(fn: (e: { type: string; clip?: string; interrupted?: boolean }) => void): () => void };
}

export interface ActorsLike {
  get(id: ActorId): ActorLike | undefined;
  all(): Iterable<ActorLike>;
  readonly player: ActorLike;
}

export interface DamageLike {
  apply(req: {
    attackerId: ActorId | null;
    targetId: ActorId;
    amount: number;
    poise: number;
    kind: 'melee' | 'spell' | 'fall' | 'script';
    attackId?: string;
    point?: Vec3;
    direction?: Vec3;
  }): DamageResultLike | null;
  stagger(id: ActorId, byId: ActorId, poise: number): boolean;
  heal(id: ActorId, amount: number): number;
}

export interface ServicesLike {
  provide<K extends keyof ServiceMap>(name: K, impl: ServiceMap[K]): () => void;
  get<K extends keyof ServiceMap>(name: K): ServiceMap[K] | undefined;
}
/** Filled by `declare module` in vfx/spells/quality, plus the other threads' services we only read. */
export interface ServiceMap {
  audio?: { play(key: string, opts?: { position?: Vec3 }): void };
  progression?: {
    addMaxHealthModifier(id: string, fn: (base: number) => number): () => void;
    learned(skillId: string): boolean;
  };
  abilities?: {
    registerHandler(skillId: string, handler: (ctx: { casterId: ActorId }) => boolean): () => void;
    reportTrigger(skillId: string): void;
  };
  graphics?: GraphicsService;
}

/** Requested from thread 0 (coordinator routed): the renderer knobs the quality steps drive. */
export interface GraphicsService {
  setRenderScale(scale: number): void;
  setShadows(mode: 'off' | 'half' | 'full', distanceM?: number): void;
  setViewDistanceOffset(levels: number): void;
  setPostPass(pass: PostPass | null): void;
  /** Requested from thread 0 (not in the v0.3 contract): the composer needs the renderer. */
  readonly renderer?: THREE.WebGLRenderer;
}
/** `render` replaces `renderer.render(scene, camera)` for the frame. */
export interface PostPass {
  render(): void;
  setSize?(width: number, height: number): void;
  dispose?(): void;
}

export interface PluginContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera | null;
  events: EventsLike;
  clock: ClockLike;
  player: PlayerLike;
  actors: ActorsLike;
  damage: DamageLike;
  services: ServicesLike;
  systems: { add(system: GameSystem): () => void };
  input?: { actions: { pressed(a: string): boolean } };
  persist: { register(p: { key: string; version: number; serialize(): unknown; load(data: unknown, version: number): void }): () => void };
  hud: { mount(slot: string, widget: { id: string; element: HTMLElement; order?: number; dispose?(): void }): () => void };
  /** Height of the terrain at x, z (the world heightfield). */
  heightAt?(x: number, z: number): number;
}

export interface GamePlugin {
  id: string;
  dependsOn?: string[];
  setup(ctx: PluginContext): void | Promise<void>;
  dispose?(): void;
}
