// Small structural views of the game core that thread 7's pure classes depend on (so they test without a Game), plus
// re-exports of the real core types for the plugins. The plugins use the real GameContext, GamePlugin and GraphicsService.
import type * as THREE from 'three';

export type Vec3 = { x: number; y: number; z: number };
export type ActorId = string;

export type { GameSystem, FixedPhase, RenderPhase } from '../core/systems';
export type { GamePlugin } from '../core/plugins';
export type { GameContext as PluginContext } from '../core/Game';
export type { GraphicsService, PostPass } from '../core/graphics';

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
  kind: 'melee' | 'spell' | 'fall' | 'script' | 'status';
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

import type { GameEventMap } from '../core/events';
import type { Action } from '../input/actions';

export type VfxEventMap = GameEventMap;
export type VfxEventType = keyof GameEventMap;

export interface EventsLike {
  on<K extends VfxEventType>(type: K, listener: (payload: VfxEventMap[K]) => void): () => void;
  emit<K extends VfxEventType>(type: K, payload: VfxEventMap[K]): void;
}

export interface ClockLike {
  readonly tick: number;
  readonly seconds: number;
  /** Requested from thread 0: true while a hit-stop or pause is skipping simulated ticks. */
  readonly frozen?: boolean;
  /** True while the game is paused (not merely in hit-stop). */
  readonly paused?: boolean;
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
    mod: { speedScale?: number; lockMove?: boolean; lockFacing?: boolean; lockActions?: readonly Action[] },
  ): () => void;
}

export interface AvatarLike {
  readonly root: THREE.Object3D;
  readonly weaponHilt: THREE.Object3D;
  readonly weaponTip: THREE.Object3D;
  readonly controller: ControllerLike;
}

export interface ControllerLike {
  activeAttack(): { clip: string; activeStart: number; activeEnd: number; normalizedTime: number; active: boolean; swingId: number; noTrace?: true } | null;
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
    point?: THREE.Vector3;
    direction?: THREE.Vector3;
  }): DamageResultLike | null;
  stagger(id: ActorId, byId: ActorId, poise: number): boolean;
  heal(id: ActorId, amount: number): number;
}

export type ServicesLike = import('../core/Services').Services;

/** Services of threads that have not merged yet; read through `looseService` so a missing one is just undefined. */
export interface LooseServices {
  progression: {
    addMaxHealthModifier(id: string, fn: () => number): () => void;
    learned(skillId: string): boolean;
    refreshMaxHealth?(): void;
    /** The chosen class id; null when none (plays as the Knight). */
    readonly classId?: string | null;
  };
  abilities: {
    registerHandler(
      skillId: string,
      handler: (args: { skillId: string; slot: number; caster: { readonly id: string } | null; ctx?: unknown }) => { ok: true } | { ok: false; reason: string },
    ): { ok: true; dispose(): void } | { ok: false; reason: string };
  };
}
export function looseService<K extends keyof LooseServices>(services: { get(name: never): unknown }, name: K): LooseServices[K] | undefined {
  return (services as { get(name: string): unknown }).get(name) as LooseServices[K] | undefined;
}
